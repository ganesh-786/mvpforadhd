import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function validateSupabaseUrl(value) {
  if (!value) return 'VITE_SUPABASE_URL is not set.';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return `VITE_SUPABASE_URL ("${value}") is not a valid URL.`;
  }
  // supabase-js appends its own /auth/v1, /rest/v1, etc. paths — this must be
  // the bare project URL (e.g. https://<ref>.supabase.co), not the REST API
  // URL some Supabase dashboard pages show (which already ends in /rest/v1).
  // A path suffix here silently produces double-prefixed request URLs (a
  // 404 that's easy to misdiagnose as a code bug rather than config).
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return `VITE_SUPABASE_URL ("${value}") includes a path ("${parsed.pathname}") — use the bare project URL only, e.g. "https://<project-ref>.supabase.co", not the REST/API URL.`;
  }
  return null;
}

const urlError = validateSupabaseUrl(url);
if (urlError) {
  // Fail loud in dev, but don't throw — a broken auth config shouldn't take
  // down the entire app shell (e.g. static marketing content on '/').
  console.error(`[supabaseClient] ${urlError}`);
}
if (!anonKey) {
  console.error('[supabaseClient] VITE_SUPABASE_ANON_KEY is not set — auth and preferences will not work.');
}

export const supabase = createClient(url || '', anonKey || '');
