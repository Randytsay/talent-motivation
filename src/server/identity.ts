import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Identity } from './contracts';
import { HttpError } from './http';
import type { RuntimeConfig } from './env';

const SESSION_COOKIE = 'tm_session';
const OAUTH_STATE_COOKIE = 'tm_oauth_state';
const PENDING_CLAIM_COOKIE = 'tm_pending_claim';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const STATE_MAX_AGE_SECONDS = 60 * 10;

interface SignedPayload {
  lineUserId?: string;
  displayName?: string;
  pictureUrl?: string;
  nonce?: string;
  exp: number;
}

export interface IdentityProvider {
  authorizationUrl(state: string): URL;
  exchangeCode(code: string): Promise<Identity>;
}

export interface LiffIdentityVerifier {
  verifyIdToken(idToken: string): Promise<Identity>;
}

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createSigned(payload: SignedPayload, secret: string): string {
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

function verifySigned(token: string | undefined, secret: string): SignedPayload | null {
  if (!token) return null;
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length || !safeEqual(signature, sign(encoded, secret))) return null;
  try {
    const payload = JSON.parse(decode(encoded)) as SignedPayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : undefined;
}

function serializeCookie(name: string, value: string, config: RuntimeConfig, maxAge: number): string {
  const attributes = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (config.isProduction) attributes.push('Secure');
  return attributes.join('; ');
}

export function createSessionCookie(identity: Identity, config: RuntimeConfig): string {
  const token = createSigned(
    { ...identity, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS },
    config.sessionSecret,
  );
  return serializeCookie(SESSION_COOKIE, token, config, SESSION_MAX_AGE_SECONDS);
}

export function readSession(request: Request, config: RuntimeConfig): Identity | null {
  const payload = verifySigned(cookieValue(request, SESSION_COOKIE), config.sessionSecret);
  if (!payload || !payload.lineUserId || !payload.displayName) return null;
  return { lineUserId: payload.lineUserId, displayName: payload.displayName, pictureUrl: payload.pictureUrl };
}

export function createOAuthState(config: RuntimeConfig): { state: string; cookie: string } {
  const state = createSigned(
    { nonce: randomBytes(20).toString('base64url'), exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE_SECONDS },
    config.sessionSecret,
  );
  return { state, cookie: serializeCookie(OAUTH_STATE_COOKIE, state, config, STATE_MAX_AGE_SECONDS) };
}

export function clearOAuthStateCookie(config: RuntimeConfig): string {
  return serializeCookie(OAUTH_STATE_COOKIE, '', config, 0);
}

/** Keeps a private claim token across LINE OAuth redirects without exposing it in logs. */
export function createPendingClaimCookie(token: string, config: RuntimeConfig): string {
  return serializeCookie(PENDING_CLAIM_COOKIE, token, config, STATE_MAX_AGE_SECONDS);
}

export function clearPendingClaimCookie(config: RuntimeConfig): string {
  return serializeCookie(PENDING_CLAIM_COOKIE, '', config, 0);
}

export function readPendingClaim(request: Request): string | undefined {
  return cookieValue(request, PENDING_CLAIM_COOKIE);
}

export function verifyOAuthState(request: Request, state: string | null, config: RuntimeConfig): void {
  const storedState = cookieValue(request, OAUTH_STATE_COOKIE);
  const isValid = state && storedState && safeEqual(state, storedState) && verifySigned(state, config.sessionSecret);
  if (!isValid) throw new HttpError(400, 'invalid_oauth_state', 'LINE 登入狀態驗證失敗，請重新開始。');
}

export class MockIdentityProvider implements IdentityProvider {
  constructor(private readonly appBaseUrl = 'http://localhost:5173') {}

  authorizationUrl(state: string): URL {
    const callback = new URL('/api/auth/line/callback', this.appBaseUrl);
    callback.searchParams.set('state', state);
    callback.searchParams.set('code', 'mock-authorized');
    return callback;
  }

  async exchangeCode(code: string): Promise<Identity> {
    if (code !== 'mock-authorized') throw new HttpError(401, 'invalid_authorization_code', 'Mock LINE authorization failed.');
    return { lineUserId: 'mock-line-user-001', displayName: 'Mock LINE User' };
  }
}

export class LineLoginIdentityProvider implements IdentityProvider {
  constructor(
    private readonly config: Required<RuntimeConfig>['line'],
    private readonly appBaseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  authorizationUrl(state: string): URL {
    const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.channelId);
    url.searchParams.set('redirect_uri', new URL('/api/auth/line/callback', this.appBaseUrl).toString());
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'profile openid');
    url.searchParams.set('bot_prompt', 'normal');
    return url;
  }

  async exchangeCode(code: string): Promise<Identity> {
    const redirectUri = new URL('/api/auth/line/callback', this.appBaseUrl).toString();
    const tokenResponse = await this.fetcher('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.config.channelId,
        client_secret: this.config.channelSecret,
      }),
    });
    if (!tokenResponse.ok) throw new HttpError(401, 'line_token_exchange_failed', 'LINE 登入驗證失敗。');
    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenBody.access_token) throw new HttpError(401, 'line_token_exchange_failed', 'LINE 登入驗證失敗。');

    const profileResponse = await this.fetcher('https://api.line.me/v2/profile', {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
    });
    if (!profileResponse.ok) throw new HttpError(401, 'line_profile_failed', 'LINE 個人資料讀取失敗。');
    const profile = (await profileResponse.json()) as { userId?: string; displayName?: string; pictureUrl?: string };
    if (!profile.userId || !profile.displayName) throw new HttpError(401, 'line_profile_invalid', 'LINE 個人資料格式無效。');
    return { lineUserId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  }
}

/**
 * The browser supplies only a LIFF-issued ID token. LINE verifies signature,
 * audience, expiration, and issuer; this adapter still validates its required
 * claims before mapping `sub` to the canonical line_user_id.
 */
export class LineLiffIdentityVerifier implements LiffIdentityVerifier {
  constructor(
    private readonly config: NonNullable<RuntimeConfig['line']>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async verifyIdToken(idToken: string): Promise<Identity> {
    const response = await this.fetcher('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: this.config.channelId }),
    });
    if (!response.ok) throw new HttpError(401, 'liff_token_invalid', 'LINE 身分驗證失敗，請重新登入。');
    const payload = (await response.json()) as {
      iss?: string; aud?: string; sub?: string; exp?: number; name?: string; picture?: string;
    };
    const isValid = payload.iss === 'https://access.line.me'
      && payload.aud === this.config.channelId
      && typeof payload.sub === 'string' && payload.sub.length > 0
      && typeof payload.exp === 'number' && payload.exp > Date.now() / 1000;
    if (!isValid) throw new HttpError(401, 'liff_token_invalid', 'LINE 身分驗證失敗，請重新登入。');
    return {
      lineUserId: payload.sub!,
      // Name is LINE-verified profile metadata; `sub` remains the sole identity key.
      displayName: payload.name?.trim() || 'LINE 使用者',
      pictureUrl: payload.picture,
    };
  }
}

export function identityProviderFor(config: RuntimeConfig): IdentityProvider {
  if (config.identityMode === 'mock') return new MockIdentityProvider(config.appBaseUrl);
  if (!config.line) throw new HttpError(503, 'configuration_required', 'LINE Login 尚未完成安全設定。');
  return new LineLoginIdentityProvider(config.line, config.appBaseUrl);
}

export function liffIdentityVerifierFor(config: RuntimeConfig): LiffIdentityVerifier {
  if (config.identityMode !== 'line' || !config.line) {
    throw new HttpError(503, 'configuration_required', 'LIFF 身分驗證尚未完成安全設定。');
  }
  return new LineLiffIdentityVerifier(config.line);
}

/** Local mock mode has an explicit stable LINE identity so refreshes map to one participant. */
export function currentIdentity(request: Request, config: RuntimeConfig): Identity {
  const session = readSession(request, config);
  if (session) return session;
  if (config.identityMode === 'mock') return { lineUserId: 'mock-line-user-001', displayName: 'Mock LINE User' };
  throw new HttpError(401, 'authentication_required', '請先使用 LINE 登入。');
}
