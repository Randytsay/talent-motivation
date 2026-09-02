import { describe, expect, it } from 'vitest';
import { CLAIM_TOKEN_BYTES, createClaimToken, hashClaimToken, isClaimExpired } from './claimToken';

describe('guest claim token security', () => {
  it('creates an opaque URL-safe token and persists only a deterministic hash', () => {
    const entropy = Buffer.alloc(CLAIM_TOKEN_BYTES, 0xab);
    const material = createClaimToken(new Date('2026-09-02T00:00:00.000Z'), 7 * 24 * 60 * 60 * 1000, entropy);

    expect(material.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(material.token.length).toBeGreaterThanOrEqual(40);
    expect(material.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(material.tokenHash).toBe(hashClaimToken(material.token));
    expect(material.tokenHash).not.toContain(material.token);
    expect(material.expiresAt).toBe('2026-09-09T00:00:00.000Z');
  });

  it('rejects weak entropy and invalid TTLs', () => {
    expect(() => createClaimToken(new Date(), 1000, Buffer.alloc(CLAIM_TOKEN_BYTES - 1))).toThrow(/at least 32 bytes/i);
    expect(() => createClaimToken(new Date(), 0, Buffer.alloc(CLAIM_TOKEN_BYTES))).toThrow(/TTL must be positive/i);
  });

  it('treats expiry as inclusive and malformed timestamps as expired', () => {
    const expiresAt = '2026-09-09T00:00:00.000Z';
    expect(isClaimExpired(expiresAt, new Date('2026-09-08T23:59:59.999Z'))).toBe(false);
    expect(isClaimExpired(expiresAt, new Date('2026-09-09T00:00:00.000Z'))).toBe(true);
    expect(isClaimExpired('not-a-date', new Date('2026-09-02T00:00:00.000Z'))).toBe(true);
  });

  it('never accepts an empty token for hashing', () => {
    expect(() => hashClaimToken('')).toThrow(/required/i);
    expect(() => hashClaimToken('   ')).toThrow(/required/i);
  });
});
