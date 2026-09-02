import liff from '@line/liff';

/**
 * Returns only an ID token for server verification. The browser must never
 * promote decoded profile data or a client-side user ID into app identity.
 */
export async function getLiffIdToken(): Promise<string | null> {
  const liffId = import.meta.env.VITE_LIFF_ID;
  if (!liffId) return null;

  await liff.init({ liffId });
  // Desktop keeps the normal LINE Login redirect flow. LIFF token exchange is
  // reserved for the LINE in-app browser where LIFF is the identity source.
  if (!liff.isInClient()) return null;
  if (!liff.isLoggedIn()) {
    liff.login();
    return null;
  }

  const idToken = liff.getIDToken();
  if (!idToken) throw new Error('LIFF did not provide an ID token.');
  return idToken;
}
