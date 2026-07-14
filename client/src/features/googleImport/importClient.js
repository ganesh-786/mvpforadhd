import { authFetch } from '../../lib/apiClient.js';

/**
 * Pulls in incomplete Google Tasks and near-due Classroom coursework as new
 * task_chunks (deduped server-side against previously imported items).
 * @returns {Promise<{ chunks: Array, errors: { tasks: string|null, classroom: string|null } }>}
 */
export async function importGoogleItems() {
  return authFetch('/api/google/ingest', { method: 'POST' });
}
