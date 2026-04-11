import process from 'node:process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const conflicts = await prisma.$queryRawUnsafe(`
        SELECT
            LOWER(username) AS normalized_username,
            ARRAY_AGG(username ORDER BY username) AS variants,
            COUNT(*)::int AS count
        FROM users
        GROUP BY LOWER(username)
        HAVING COUNT(*) > 1
        ORDER BY LOWER(username)
    `);

    if (conflicts.length > 0) {
        console.error('[username-migration] Found case-insensitive conflicts:');
        for (const conflict of conflicts) {
            console.error(
                `- ${conflict.normalized_username}: ${conflict.variants.join(', ')} (${conflict.count})`
            );
        }
        throw new Error('Resolve username conflicts before running the lowercase migration');
    }

    const updatedCount = await prisma.$executeRawUnsafe(`
        UPDATE users
        SET username = LOWER(username)
        WHERE username <> LOWER(username)
    `);

    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
        ON users (LOWER(username))
    `);

    console.log(`[username-migration] Updated ${updatedCount} usernames to lowercase.`);
    console.log('[username-migration] Ensured case-insensitive unique index on LOWER(username).');
}

main()
    .catch(error => {
        console.error(
            '[username-migration] Failed:',
            error instanceof Error ? error.message : error
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
