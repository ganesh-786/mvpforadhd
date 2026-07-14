import { authFetch } from '../../lib/apiClient.js';

/**
 * Sends the full brain-dump transcript to the backend, which calls Groq to
 * split it into small ADHD-appropriately-sized task chunks and persists them.
 * @param {string} transcript
 * @returns {Promise<{ taskId: string, chunks: Array, durationMs: number }>}
 */
export async function chunkTranscript(transcript) {
  return authFetch('/api/chunk', {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  });
}
