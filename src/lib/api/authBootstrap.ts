import { useEffect, useState } from 'react';
import { getLiffIdToken } from '../line/liffClient';
import { exchangeLiffIdToken, getSession, type SessionResponse } from './client';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; identity: NonNullable<SessionResponse['identity']> }
  | { status: 'mock'; identity: NonNullable<SessionResponse['identity']> }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

async function bootstrapAuth(): Promise<AuthState> {
  try {
    const idToken = await getLiffIdToken();
    const session = idToken ? await exchangeLiffIdToken(idToken) : await getSession();
    if (!session.authenticated || !session.identity) return { status: 'unauthenticated' };
    return session.mock ? { status: 'mock', identity: session.identity } : { status: 'authenticated', identity: session.identity };
  } catch {
    // The assessment remains usable as a local draft when a development server
    // does not run Functions. A deployed app shows a retriable save fallback.
    return { status: 'unavailable' };
  }
}

export function useAuthBootstrap(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => { void bootstrapAuth().then(setState); }, []);
  return state;
}
