import { createHash } from 'node:crypto';

/**
 * Hashes a high-entropy token (e.g. crypto.randomBytes output) for
 * at-rest storage. Uses SHA-256 to keep findUnique lookups O(1).
 *
 * WARNING: Do NOT use for user passwords — low-entropy inputs require
 * a slow KDF (bcrypt or Argon2id).
 */
export function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}
