import { supabase } from './supabaseClient.js';

/** fetch() wrapper that attaches the current Supabase session's bearer token. */
export async function authFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message || `Request failed with ${res.status}`;
    const error = new Error(message);
    error.code = body?.error?.code;
    error.status = res.status;
    throw error;
  }

  return res.json();
}
