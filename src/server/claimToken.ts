import { createHash, randomBytes } from 'node:crypto';

export const CLAIM_TOKEN_BYTES = 32;
export const DEFAULT_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ClaimTokenMaterial {
  /** Plaintext token. Return only to the intended client once; never persist or log it. */
  token: string;
  /** SHA-256 hash safe to persist. */
  tokenHash: string;
  expiresAt: string;
}

export function hashClaimToken(token: string): string {
  if (!token || !token.trim()) throw new Error('Claim token is required.');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Creates an opaque, URL-safe, single-use claim credential.
 * The caller must persist only tokenHash/expiresAt, never token itself.
 */
export function createClaimToken(
  now: Date = new Date(),
  ttlMs: number = DEFAULT_CLAIM_TTL_MS,
  entropy: Buffer = randomBytes(CLAIM_TOKEN_BYTES),
): ClaimTokenMaterial {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Claim TTL must be positive.');
  if (entropy.byteLength < CLAIM_TOKEN_BYTES) throw new Error(`Claim token requires at least ${CLAIM_TOKEN_BYTES} bytes of entropy.`);

  const token = entropy.toString('base64url');
  return {
    token,
    tokenHash: hashClaimToken(token),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export function isClaimExpired(expiresAt: string, now: Date = new Date()): boolean {
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return true;
  return timestamp <= now.getTime();
}
