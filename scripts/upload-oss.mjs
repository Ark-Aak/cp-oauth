import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadDotenv } from 'dotenv';

const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8'
};

// Load .env values so direct script execution works the same as build workflow.
loadDotenv({ quiet: true });
loadDotenv({ path: '.env.local', override: true, quiet: true });

function parseBoolean(value) {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getEnv(primaryKey, legacyKey) {
    return process.env[primaryKey] || process.env[legacyKey] || '';
}

function normalizePrefix(prefix) {
    if (!prefix) return '';
    return prefix.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function toPosixPath(filePath) {
    return filePath.split(path.sep).join('/');
}

async function walkFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walkFiles(absolute)));
            continue;
        }
        if (entry.isFile()) {
            files.push(absolute);
        }
    }

    return files;
}

function getCacheControl(remoteKey) {
    const normalized = remoteKey.toLowerCase();
    if (normalized.includes('/_nuxt/') || normalized.startsWith('_nuxt/')) {
        return 'public, max-age=31536000, immutable';
    }
    if (normalized.endsWith('.html') || normalized.endsWith('.json')) {
        return 'public, max-age=60';
    }
    return 'public, max-age=3600';
}

function getContentType(remoteKey) {
    const extension = path.posix.extname(remoteKey.toLowerCase());
    return CONTENT_TYPES[extension] || 'application/octet-stream';
}

async function uploadWithConcurrency(items, limit, worker) {
    let index = 0;
    let completed = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const current = index;
            index += 1;
            if (current >= items.length) break;

            await worker(items[current]);
            completed += 1;
            if (completed % 50 === 0 || completed === items.length) {
                console.log(`[s3-upload] Uploaded ${completed}/${items.length}`);
            }
        }
    });

    await Promise.all(workers);
}

async function main() {
    const enabled = parseBoolean(getEnv('S3_UPLOAD_ENABLED', 'OSS_UPLOAD_ENABLED'));
    if (!enabled) {
        console.log('[s3-upload] Skipped (S3_UPLOAD_ENABLED/OSS_UPLOAD_ENABLED is not true).');
        return;
    }

    const config = {
        region: getEnv('S3_REGION', 'OSS_REGION'),
        bucket: getEnv('S3_BUCKET', 'OSS_BUCKET'),
        accessKeyId: getEnv('S3_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_ID'),
        secretAccessKey: getEnv('S3_SECRET_ACCESS_KEY', 'OSS_ACCESS_KEY_SECRET'),
        endpoint: getEnv('S3_ENDPOINT', 'OSS_ENDPOINT'),
        sessionToken: getEnv('S3_SESSION_TOKEN', 'OSS_STS_TOKEN'),
        prefix: normalizePrefix(getEnv('S3_PREFIX', 'OSS_PREFIX')),
        buildDir: getEnv('S3_BUILD_DIR', 'OSS_BUILD_DIR') || '.output/public',
        concurrency: Number.parseInt(
            getEnv('S3_UPLOAD_CONCURRENCY', 'OSS_UPLOAD_CONCURRENCY') || '8',
            10
        ),
        forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE || '')
    };

    const missing = [];
    if (!config.region) missing.push('S3_REGION');
    if (!config.bucket) missing.push('S3_BUCKET');
    if (!config.accessKeyId) missing.push('S3_ACCESS_KEY_ID');
    if (!config.secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');

    if (missing.length > 0) {
        throw new Error(`Missing required S3 env vars: ${missing.join(', ')}`);
    }

    const buildDir = path.resolve(config.buildDir);
    const buildStat = await fs.stat(buildDir).catch(() => null);
    if (!buildStat || !buildStat.isDirectory()) {
        throw new Error(`Build output directory not found: ${buildDir}`);
    }

    const filePaths = await walkFiles(buildDir);
    if (filePaths.length === 0) {
        console.log(`[s3-upload] No files found under ${buildDir}.`);
        return;
    }

    const concurrency = Number.isFinite(config.concurrency)
        ? Math.min(32, Math.max(1, config.concurrency))
        : 8;

    const clientConfig = {
        region: config.region,
        forcePathStyle: config.forcePathStyle || Boolean(config.endpoint),
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
        }
    };
    if (config.endpoint) clientConfig.endpoint = config.endpoint;
    if (config.sessionToken) clientConfig.credentials.sessionToken = config.sessionToken;

    const client = new S3Client(clientConfig);

    console.log(
        `[s3-upload] Uploading ${filePaths.length} files from ${buildDir} to s3://${config.bucket}/${config.prefix}`
    );

    await uploadWithConcurrency(filePaths, concurrency, async absolutePath => {
        const relative = toPosixPath(path.relative(buildDir, absolutePath));
        const remoteKey = config.prefix ? `${config.prefix}/${relative}` : relative;

        await client.send(
            new PutObjectCommand({
                Bucket: config.bucket,
                Key: remoteKey,
                Body: createReadStream(absolutePath),
                CacheControl: getCacheControl(remoteKey),
                ContentType: getContentType(remoteKey)
            })
        );
    });

    console.log('[s3-upload] Upload completed successfully.');
}

main().catch(error => {
    console.error('[s3-upload] Upload failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
