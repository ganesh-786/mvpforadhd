import { google } from 'googleapis';
import { getAuthorizedClient } from './googleAuth.js';
import { AppError } from './errors.js';

function calendarClient(auth) {
  return google.calendar({ version: 'v3', auth });
}

function wrapGoogleError(err) {
  const status = err?.response?.status || err?.code;
  if (status === 401) {
    return new AppError('GOOGLE_REAUTH_REQUIRED', 'Your Google connection expired — reconnect to continue.', 401);
  }
  if (status === 403) {
    return new AppError('GOOGLE_SCOPE_MISSING', 'Google Calendar access was not granted.', 403);
  }
  return new AppError('UPSTREAM_ERROR', 'Google Calendar request failed.', 502);
}

/** Returns busy intervals (ISO start/end pairs) for the primary calendar between timeMin and timeMax. */
export async function getFreeBusy(userId, timeMin, timeMax) {
  const auth = await getAuthorizedClient(userId);
  try {
    const res = await calendarClient(auth).freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: 'primary' }] },
    });
    return res.data.calendars?.primary?.busy || [];
  } catch (err) {
    throw wrapGoogleError(err);
  }
}

/** Creates a Google Calendar event for a scheduled chunk; returns { id, htmlLink }. */
export async function createEvent(userId, { title, description, startIso, endIso }) {
  const auth = await getAuthorizedClient(userId);
  try {
    const res = await calendarClient(auth).events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
      },
    });
    return { id: res.data.id, htmlLink: res.data.htmlLink };
  } catch (err) {
    throw wrapGoogleError(err);
  }
}

export async function updateEvent(userId, googleEventId, patch) {
  const auth = await getAuthorizedClient(userId);
  const requestBody = {};
  if (patch.title) requestBody.summary = patch.title;
  if (patch.startIso) requestBody.start = { dateTime: patch.startIso };
  if (patch.endIso) requestBody.end = { dateTime: patch.endIso };
  try {
    const res = await calendarClient(auth).events.patch({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody,
    });
    return { id: res.data.id };
  } catch (err) {
    throw wrapGoogleError(err);
  }
}

export async function deleteEvent(userId, googleEventId) {
  const auth = await getAuthorizedClient(userId);
  try {
    await calendarClient(auth).events.delete({ calendarId: 'primary', eventId: googleEventId });
  } catch (err) {
    // Already gone is fine — the calling code is trying to reach a consistent state, not assert history.
    if (err?.response?.status === 410 || err?.response?.status === 404) return;
    throw wrapGoogleError(err);
  }
}
