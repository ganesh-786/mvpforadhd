import { authFetch } from '../../lib/apiClient.js';

/** Finds real free-calendar slots for the given chunk ids; returns chunks with scheduledStart/End (or null if unscheduled). */
export async function scheduleChunks(chunkIds) {
  return authFetch('/api/schedule', {
    method: 'POST',
    body: JSON.stringify({ chunkIds }),
  });
}

/** Creates the Google Calendar event for one already-scheduled chunk. */
export async function addChunkToCalendar(chunkId) {
  return authFetch('/api/google/calendar/events', {
    method: 'POST',
    body: JSON.stringify({ chunkId }),
  });
}
