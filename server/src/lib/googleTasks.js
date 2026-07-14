import { google } from 'googleapis';
import { getAuthorizedClient } from './googleAuth.js';
import { AppError } from './errors.js';

function wrapGoogleError(err) {
  const status = err?.response?.status || err?.code;
  if (status === 401) return new AppError('GOOGLE_REAUTH_REQUIRED', 'Your Google connection expired — reconnect to continue.', 401);
  if (status === 403) return new AppError('GOOGLE_SCOPE_MISSING', 'Google Tasks access was not granted.', 403);
  return new AppError('UPSTREAM_ERROR', 'Google Tasks request failed.', 502);
}

/** Lists incomplete items on the user's default Google Tasks list. */
export async function listTasks(userId) {
  const auth = await getAuthorizedClient(userId);
  const tasks = google.tasks({ version: 'v1', auth });
  try {
    const res = await tasks.tasks.list({
      tasklist: '@default',
      showCompleted: false,
      showHidden: false,
      maxResults: 50,
    });
    return (res.data.items || [])
      .filter((t) => t.status !== 'completed')
      .map((t) => ({ googleTaskId: t.id, title: t.title, due: t.due || null }));
  } catch (err) {
    throw wrapGoogleError(err);
  }
}
