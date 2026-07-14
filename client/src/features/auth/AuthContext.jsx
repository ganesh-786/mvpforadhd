import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { ALL_GOOGLE_SCOPES } from '../google/constants.js';

const AuthContext = createContext(null);

/* Best-effort, fire-and-forget: hands the transient provider_refresh_token
   (only ever present on the session right after an OAuth redirect) to the
   server so it can be stored encrypted for background Calendar access.
   Supabase itself does not persist or refresh this token. */
async function persistGoogleRefreshToken(session) {
  if (!session?.provider_refresh_token) return;
  try {
    await fetch('/api/auth/store-google-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ refreshToken: session.provider_refresh_token, scope: ALL_GOOGLE_SCOPES }),
    });
  } catch (err) {
    console.error('Could not store Google refresh token', err);
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_IN') persistGoogleRefreshToken(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Without an explicit emailRedirectTo, Supabase falls back to whatever
  // "Site URL" is configured in its dashboard — which defaults to
  // http://localhost:3000 on a fresh project and silently sends every
  // magic-link click there regardless of where the app is actually
  // running. Pointing this at the current origin makes it correct in dev,
  // preview, and production automatically, with no dashboard-drift risk.
  const signInWithEmail = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  /* Also usable by an already-signed-in (email) user to link + grant Calendar
     + Tasks + Classroom access — Supabase links accounts sharing the same
     verified email. Tasks/Classroom are restricted scopes and will show an
     "unverified app" warning until Google's verification review completes;
     test users can proceed past it. */
  const connectGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: ALL_GOOGLE_SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signOut = () => supabase.auth.signOut();

  const value = {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    signInWithEmail,
    connectGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
