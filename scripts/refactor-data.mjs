import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { createJiti } from 'jiti';

const BATCH_SIZE = 100;
const CONFIG_SECRET_KEYS = [
    'smtp_pass',
    'turnstile_secret_key',
    'codeforces_client_secret',
    'github_client_secret',
    'google_client_secret',
    'clist_client_secret'
];
const COMMON_COLUMNS = {
    users: ['id', 'username', 'email', 'role', 'totp_secret'],
    system_config: ['key', 'value'],
    linked_accounts: ['id', 'oauth_access_token', 'oauth_refresh_token', 'oauth_id_token'],
    oauth_clients: ['id', 'redirect_uris'],
    showcase_items: ['id', 'url', 'icon_url']
};
const LEGACY_COLUMNS = {
    users: ['public_linked_platforms_configured'],
    oauth_authorization_codes: ['code', 'code_challenge'],
    oauth_access_tokens: ['token'],
    oauth_refresh_tokens: ['token']
};
const CURRENT_COLUMNS = {
    users: [
        'auth_version',
        'email_verify_expires_at',
        'pending_email',
        'pending_email_token_hash',
        'pending_email_expires_at'
    ],
    oauth_authorization_codes: ['code_hash', 'code_challenge_hash'],
    oauth_access_tokens: ['token_hash', 'client_auth_required'],
    oauth_refresh_tokens: ['token_hash', 'client_auth_required']
};
const SECRET_FIELDS = [
    {
        table: 'system_config',
        primaryKey: 'key',
        column: 'value',
        label: 'SystemConfig',
        keys: CONFIG_SECRET_KEYS,
        context: id => `SystemConfig:${id}`
    },
    {
        table: 'users',
        primaryKey: 'id',
        column: 'totp_secret',
        label: 'User:totpSecret',
        context: id => `User:totpSecret:${id}`
    },
    ...[
        ['oauth_access_token', 'oauthAccessToken'],
        ['oauth_refresh_token', 'oauthRefreshToken'],
        ['oauth_id_token', 'oauthIdToken']
    ].map(([column, field]) => ({
        table: 'linked_accounts',
        primaryKey: 'id',
        column,
        label: `LinkedAccount:${field}`,
        context: id => `LinkedAccount:${field}:${id}`
    }))
];

class MigrationError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function emit(event, data) {
    console.log(JSON.stringify({ event, ...data }));
}

async function discoverSchema(db) {
    const rows = await db.$queryRawUnsafe(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
    `);
    const columns = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
    const hasAll = required =>
        Object.entries(required).every(([table, names]) =>
            names.every(column => columns.has(`${table}.${column}`))
        );
    const hasAny = required =>
        Object.entries(required).some(([table, names]) =>
            names.some(column => columns.has(`${table}.${column}`))
        );
    const missingCommonColumnCount = Object.entries(COMMON_COLUMNS).reduce(
        (count, [table, names]) =>
            count + names.filter(column => !columns.has(`${table}.${column}`)).length,
        0
    );
    const version =
        !missingCommonColumnCount && hasAll(LEGACY_COLUMNS) && !hasAny(CURRENT_COLUMNS)
            ? 'legacy'
            : !missingCommonColumnCount && hasAll(CURRENT_COLUMNS) && !hasAny(LEGACY_COLUMNS)
              ? 'current'
              : 'unsupported';
    return { version, missingCommonColumnCount };
}

async function normalizedConflicts(db, column) {
    // The column is selected only from the two fixed call sites, never CLI input.
    const groups = await db.$queryRawUnsafe(`
        SELECT array_agg(id ORDER BY id) AS ids, count(*)::int AS count
        FROM users GROUP BY lower(btrim("${column}")) HAVING count(*) > 1
        ORDER BY min(id)
    `);
    const [normalization] = await db.$queryRawUnsafe(`
        SELECT count(*)::int AS count FROM users WHERE "${column}" <> lower(btrim("${column}"))
    `);
    return {
        groupCount: groups.length,
        userCount: groups.reduce((count, group) => count + group.count, 0),
        ids: groups.map(group => group.ids),
        needsNormalizationCount: normalization.count
    };
}

async function scanUnsafeUrls(db, isSafeOAuthRedirectUri, httpUrlSchema) {
    const oauth = { count: 0, ids: [] };
    const showcase = { count: 0, urlCount: 0, iconUrlCount: 0, ids: [] };
    let cursor = null;
    while (true) {
        const rows = await db.$queryRawUnsafe(
            `
            SELECT id, redirect_uris FROM oauth_clients
            WHERE ($1::text IS NULL OR id > $1) ORDER BY id LIMIT ${BATCH_SIZE}
        `,
            cursor
        );
        if (!rows.length) break;
        for (const row of rows) {
            const invalid = !row.redirect_uris?.length
                ? 1
                : row.redirect_uris.filter(
                      uri => typeof uri !== 'string' || !isSafeOAuthRedirectUri(uri)
                  ).length;
            if (invalid) {
                oauth.count += invalid;
                oauth.ids.push(row.id);
            }
        }
        cursor = rows.at(-1).id;
    }
    cursor = null;
    while (true) {
        const rows = await db.$queryRawUnsafe(
            `
            SELECT id, url, icon_url FROM showcase_items
            WHERE ($1::text IS NULL OR id > $1) ORDER BY id LIMIT ${BATCH_SIZE}
        `,
            cursor
        );
        if (!rows.length) break;
        for (const row of rows) {
            const invalidUrl = !httpUrlSchema.safeParse(row.url).success;
            const invalidIcon = !!row.icon_url && !httpUrlSchema.safeParse(row.icon_url).success;
            if (invalidUrl || invalidIcon) {
                showcase.count++;
                showcase.urlCount += Number(invalidUrl);
                showcase.iconUrlCount += Number(invalidIcon);
                showcase.ids.push(row.id);
            }
        }
        cursor = rows.at(-1).id;
    }
    return { unsafeOAuthRedirects: oauth, unsafeShowcaseUrls: showcase };
}

async function secretBatch(db, field, cursor, lock = false) {
    const parameters = field.keys ? [...field.keys, cursor] : [cursor];
    const cursorParameter = `$${parameters.length}`;
    const keyFilter = field.keys
        ? `AND "${field.primaryKey}" IN (${field.keys.map((_, i) => `$${i + 1}`).join(', ')})`
        : '';
    return db.$queryRawUnsafe(
        `
        SELECT "${field.primaryKey}" AS id, "${field.column}" AS value FROM "${field.table}"
        WHERE "${field.column}" IS NOT NULL AND "${field.column}" <> '' ${keyFilter}
            AND (${cursorParameter}::text IS NULL OR "${field.primaryKey}" > ${cursorParameter})
        ORDER BY "${field.primaryKey}" LIMIT ${BATCH_SIZE} ${lock ? 'FOR UPDATE' : ''}
    `,
        ...parameters
    );
}

async function inspectSecrets(db, key, crypto) {
    const fields = {};
    let plaintextCount = 0;
    let envelopeCount = 0;
    let invalidEnvelopeCount = 0;
    for (const field of SECRET_FIELDS) {
        const counts = {
            plaintextCount: 0,
            envelopeCount: 0,
            invalidEnvelopeCount: 0,
            invalidIds: []
        };
        let cursor = null;
        while (true) {
            const rows = await secretBatch(db, field, cursor);
            if (!rows.length) break;
            for (const row of rows) {
                if (!row.value.startsWith('enc:')) {
                    counts.plaintextCount++;
                    continue;
                }
                counts.envelopeCount++;
                if (key) {
                    try {
                        crypto.decryptSecret(row.value, field.context(row.id), key);
                    } catch {
                        counts.invalidEnvelopeCount++;
                        counts.invalidIds.push(row.id);
                    }
                }
            }
            cursor = rows.at(-1).id;
        }
        fields[field.label] = counts;
        plaintextCount += counts.plaintextCount;
        envelopeCount += counts.envelopeCount;
        invalidEnvelopeCount += counts.invalidEnvelopeCount;
    }
    const canaries = await db.$queryRawUnsafe(
        'SELECT value FROM system_config WHERE key = $1',
        crypto.DATA_KEY_CHECK_KEY
    );
    let canaryVerified = false;
    if (canaries.length && key) {
        try {
            canaryVerified =
                crypto.decryptSecret(canaries[0].value, crypto.DATA_KEY_CHECK_CONTEXT, key) ===
                crypto.DATA_KEY_CHECK_VALUE;
        } catch {
            // Do not expose ciphertext, database errors, or key material.
        }
        if (!canaryVerified) invalidEnvelopeCount++;
    }
    return {
        plaintextCount,
        envelopeCount,
        invalidEnvelopeCount,
        fields,
        keyValidation: key ? 'performed' : 'not_requested',
        canaryPresent: !!canaries.length,
        canaryVerified
    };
}

async function readOnly(db, callback) {
    return db.$transaction(
        async tx => {
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
            return callback(tx);
        },
        { isolationLevel: 'RepeatableRead', timeout: 120000 }
    );
}

async function preflight(db, key, crypto, validators) {
    return readOnly(db, async tx => {
        const schema = await discoverSchema(tx);
        if (schema.version === 'unsupported') {
            return {
                schemaVersion: schema.version,
                missingCommonColumnCount: schema.missingCommonColumnCount,
                blockers: ['UNSUPPORTED_SCHEMA']
            };
        }
        const usernameConflicts = await normalizedConflicts(tx, 'username');
        const emailConflicts = await normalizedConflicts(tx, 'email');
        const illegal = await tx.$queryRawUnsafe(`
            SELECT id FROM users WHERE role NOT IN ('user', 'admin') OR role IS NULL ORDER BY id
        `);
        const [users] = await tx.$queryRawUnsafe(`
            SELECT count(*)::int AS count, count(*) FILTER (WHERE role = 'admin')::int AS admins FROM users
        `);
        const urls = await scanUnsafeUrls(
            tx,
            validators.isSafeOAuthRedirectUri,
            validators.httpUrlSchema
        );
        const secrets = await inspectSecrets(tx, key, crypto);
        const noAdmin = users.count > 0 && users.admins === 0;
        const blockers = [
            usernameConflicts.groupCount && 'USERNAME_OWNERSHIP_CONFLICT',
            emailConflicts.groupCount && 'EMAIL_OWNERSHIP_CONFLICT',
            illegal.length && 'ILLEGAL_ROLE',
            noAdmin && 'NO_ADMIN',
            urls.unsafeOAuthRedirects.count && 'UNSAFE_OAUTH_REDIRECT',
            secrets.invalidEnvelopeCount && 'KEY_VALIDATION_FAILED'
        ].filter(Boolean);
        return {
            schemaVersion: schema.version,
            userCount: users.count,
            usernameConflicts,
            emailConflicts,
            illegalRoles: { count: illegal.length, ids: illegal.map(row => row.id) },
            noAdmin,
            ...urls,
            secrets,
            blockers
        };
    });
}

async function initializeCanary(db, key, crypto) {
    await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(
            `
            INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING
        `,
            crypto.DATA_KEY_CHECK_KEY,
            crypto.encryptSecret(crypto.DATA_KEY_CHECK_VALUE, crypto.DATA_KEY_CHECK_CONTEXT, key)
        );
        const [row] = await tx.$queryRawUnsafe(
            'SELECT value FROM system_config WHERE key = $1',
            crypto.DATA_KEY_CHECK_KEY
        );
        let valid = false;
        try {
            valid =
                crypto.decryptSecret(row.value, crypto.DATA_KEY_CHECK_CONTEXT, key) ===
                crypto.DATA_KEY_CHECK_VALUE;
        } catch {
            // A concurrently initialized different key must roll back, not overwrite the canary.
        }
        if (!valid)
            throw new MigrationError(
                'KEY_VALIDATION_FAILED',
                'Stored encryption key check failed; keep writes stopped and use the original data key.'
            );
    });
}

async function encryptFields(db, key, crypto) {
    let encryptedCount = 0;
    for (const field of SECRET_FIELDS) {
        let cursor = null;
        while (true) {
            const batch = await db.$transaction(
                async tx => {
                    const rows = await secretBatch(tx, field, cursor, true);
                    let count = 0;
                    for (const row of rows) {
                        if (row.value.startsWith('enc:')) {
                            try {
                                crypto.decryptSecret(row.value, field.context(row.id), key);
                            } catch {
                                throw new MigrationError(
                                    'KEY_VALIDATION_FAILED',
                                    'Stored encrypted data failed validation; keep writes stopped and use the original data key.'
                                );
                            }
                            continue;
                        }
                        const value = crypto.encryptSecret(row.value, field.context(row.id), key);
                        const changed = await tx.$executeRawUnsafe(
                            `
                        UPDATE "${field.table}" SET "${field.column}" = $1
                        WHERE "${field.primaryKey}" = $2 AND "${field.column}" = $3
                    `,
                            value,
                            row.id,
                            row.value
                        );
                        if (changed !== 1)
                            throw new MigrationError(
                                'CONCURRENT_WRITE',
                                'Data changed during encryption; stop application writes before resuming.'
                            );
                        count++;
                    }
                    return { cursor: rows.at(-1)?.id, count };
                },
                { timeout: 30000 }
            );
            if (batch.cursor === undefined) break;
            cursor = batch.cursor;
            encryptedCount += batch.count;
            if (batch.count) emit('encrypted_batch', { field: field.label, count: batch.count });
        }
    }
    return encryptedCount;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
        console.log('Usage: node scripts/refactor-data.mjs [--check | --encrypt]');
        console.log(
            '--check (default): read-only preflight; ownership, role, unsafe OAuth redirect, schema, and key-validation blockers exit 1. Unsafe showcase IDs are warnings for manual repair.'
        );
        console.log(
            '--encrypt: after the security migration with all application writes stopped, validate the supplied key against every stored envelope before initializing the canary or encrypting 100-row transactional batches. Same-key reruns resume safely.'
        );
        console.log(
            'Environment: DATABASE_URL; NUXT_DATA_ENCRYPTION_KEY is required for --encrypt and optional for --check decryption validation. No .env file is loaded.'
        );
        return;
    }
    if (args.length > 1 || (args.length && !['--check', '--encrypt'].includes(args[0]))) {
        throw new MigrationError(
            'INVALID_ARGUMENTS',
            'Use --check (default), --encrypt, or --help; arguments cannot be combined.'
        );
    }
    const mode = args[0] || '--check';
    let database;
    try {
        database = new URL(process.env.DATABASE_URL || '');
        if (
            !['postgresql:', 'postgres:'].includes(database.protocol) ||
            !database.hostname ||
            !database.pathname.slice(1)
        )
            throw new Error();
    } catch {
        throw new MigrationError(
            'DATABASE_URL_REQUIRED',
            'Set an explicit PostgreSQL DATABASE_URL in the process environment.'
        );
    }
    const jiti = createJiti(import.meta.url, { fsCache: false });
    const crypto = await jiti.import('../server/utils/secrets.ts');
    const { isSafeOAuthRedirectUri } = await jiti.import('../utils/oauth-redirect.ts');
    const { httpUrlSchema } = await jiti.import('../utils/validation.ts');
    let key;
    if (mode === '--encrypt' || process.env.NUXT_DATA_ENCRYPTION_KEY) {
        try {
            key = crypto.decodeDataEncryptionKey(process.env.NUXT_DATA_ENCRYPTION_KEY || '');
        } catch {
            throw new MigrationError(
                'INVALID_DATA_KEY',
                'NUXT_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte data key.'
            );
        }
    }
    const db = new PrismaClient({ datasources: { db: { url: database.toString() } }, log: [] });
    try {
        const report = await preflight(db, key, crypto, { isSafeOAuthRedirectUri, httpUrlSchema });
        emit('preflight', report);
        if (report.blockers.length) {
            throw new MigrationError(
                'PREFLIGHT_BLOCKED',
                'Resolve the reported primary-key ownership, role, OAuth redirect, schema, or encryption-key blockers before migration; no data was written.'
            );
        }
        if (mode === '--check') return;
        if (report.schemaVersion !== 'current') {
            throw new MigrationError(
                'CURRENT_SCHEMA_REQUIRED',
                'Apply the tracked security migration after a clean --check, then run --encrypt with application writes stopped; no data was written.'
            );
        }
        // This happens only after a read-only pass over ALL existing envelopes, even if no canary exists.
        await initializeCanary(db, key, crypto);
        const encryptedCount = await encryptFields(db, key, crypto);
        const final = await readOnly(db, tx => inspectSecrets(tx, key, crypto));
        emit('encryption_complete', { encryptedCount, secrets: final });
        if (final.plaintextCount || final.invalidEnvelopeCount || !final.canaryVerified) {
            throw new MigrationError(
                'ENCRYPTION_INCOMPLETE',
                'Encrypted data is not fully validated; keep application writes stopped and resume with the original key.'
            );
        }
    } finally {
        await db.$disconnect();
    }
}

main().catch(error => {
    const known = error instanceof MigrationError;
    console.error(
        JSON.stringify({
            event: 'error',
            code: known ? error.code : 'DATABASE_OPERATION_FAILED',
            message: known
                ? error.message
                : 'Data operation failed; keep writes stopped and inspect connectivity or schema in a restricted console. No database error details are logged.'
        })
    );
    process.exitCode = 1;
});
