export interface LiffClientIdentity {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
  mode: 'mock' | 'liff';
}

interface BrowserLiff {
  init(options: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
}

declare global {
  interface Window { liff?: BrowserLiff }
}

/**
 * The browser gets only a public LIFF id. In local development this produces
 * a deterministic identity so the same mock participant can be exercised.
 */
export async function getLiffClientIdentity(): Promise<LiffClientIdentity> {
  const liffId = import.meta.env.VITE_LIFF_ID;
  if (!liffId || !window.liff) {
    return { lineUserId: 'mock-line-user-001', displayName: 'Mock LINE User', mode: 'mock' };
  }

  await window.liff.init({ liffId });
  if (!window.liff.isLoggedIn()) {
    window.liff.login();
    throw new Error('Redirecting to LINE Login.');
  }
  const profile = await window.liff.getProfile();
  return { ...profile, lineUserId: profile.userId, mode: 'liff' };
}
