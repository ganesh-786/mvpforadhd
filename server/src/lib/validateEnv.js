// Every requireAuth-gated route (i.e. almost the entire API surface) depends
// on these to verify sessions at all — missing either one means every
// authenticated request would fail with a confusing 500 from deep inside
// Supabase's client rather than an obvious startup error. Fail loudly and
// immediately instead.
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

// Missing these only degrades a specific feature (Groq calls, or Google
// Calendar/Tasks/Classroom) rather than breaking the whole app, so warn
// instead of refusing to boot — useful when deploying Phase 1/2 only,
// before Google integration is configured.
const RECOMMENDED = [
  'GROQ_API_KEY',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_TOKEN_ENC_KEY',
];

// Supabase's client appends its own /auth/v1, /rest/v1, etc. paths onto
// whatever base URL it's given. Pasting the "REST API URL" shown on some
// Supabase dashboard pages (which already ends in /rest/v1) instead of the
// bare project URL silently double-prefixes every request — every
// requireAuth check then fails as "invalid session" even for a genuinely
// valid token, which is exactly as confusing to debug as it sounds from a
// generic 401. Catch the shape at boot instead.
function validateSupabaseUrlShape(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return `SUPABASE_URL ("${value}") is not a valid URL.`;
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return `SUPABASE_URL ("${value}") includes a path ("${parsed.pathname}") — use the bare project URL only, e.g. "https://<project-ref>.supabase.co", not the REST/API URL.`;
  }
  return null;
}

/**
 * Called once at app creation (both local `node src/index.js` and Vercel's
 * serverless cold start go through createApp()). Throws on missing or
 * malformed hard-required vars so misconfiguration is caught at boot, not
 * discovered later as every authenticated request mysteriously failing.
 */
export function validateEnv() {
  const missingRequired = REQUIRED.filter((key) => !process.env[key]);
  if (missingRequired.length > 0) {
    throw new Error(
      `[taskflow-server] Missing required environment variable(s): ${missingRequired.join(', ')}. ` +
      'The app cannot verify user sessions without these — set them in server/.env locally or in your Vercel project\'s Environment Variables.',
    );
  }

  const urlError = process.env.SUPABASE_URL && validateSupabaseUrlShape(process.env.SUPABASE_URL);
  if (urlError) {
    throw new Error(`[taskflow-server] ${urlError}`);
  }

  const missingRecommended = RECOMMENDED.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(
      `[taskflow-server] Missing environment variable(s): ${missingRecommended.join(', ')}. ` +
      'The app will boot, but any feature depending on these will fail at request time.',
    );
  }
}
