const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME_OF_DAY_BUCKETS = [
  { key: 'morning', startHour: 5, endHour: 12 },
  { key: 'afternoon', startHour: 12, endHour: 17 },
  { key: 'evening', startHour: 17, endHour: 22 },
];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const SEARCH_HORIZON_DAYS = 7;

function timeStrToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketForHour(hour) {
  return TIME_OF_DAY_BUCKETS.find((b) => hour >= b.startHour && hour < b.endHour)?.key || 'evening';
}

/** Builds the list of free [start,end] Date intervals for the next N days from working_hours minus Google busy intervals. */
function computeFreeIntervals(workingHours, busyIntervals, horizonDays) {
  const busy = busyIntervals.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  const freeByDay = [];

  for (let i = 0; i < horizonDays; i += 1) {
    const day = dayStart(new Date(Date.now() + i * 24 * 60 * 60 * 1000));
    const dayKey = DAY_KEYS[day.getDay()];
    const ranges = workingHours?.[dayKey] || [];

    for (const [startStr, endStr] of ranges) {
      let windowStart = new Date(day.getTime() + timeStrToMinutes(startStr) * 60000);
      const windowEnd = new Date(day.getTime() + timeStrToMinutes(endStr) * 60000);
      if (windowEnd <= new Date()) continue; // whole window already in the past

      const overlapping = busy
        .filter((b) => b.start < windowEnd && b.end > windowStart)
        .sort((a, b) => a.start - b.start);

      let cursor = windowStart < new Date() ? new Date() : windowStart;
      for (const b of overlapping) {
        if (b.start > cursor) freeByDay.push({ start: new Date(cursor), end: new Date(b.start) });
        if (b.end > cursor) cursor = new Date(b.end);
      }
      if (cursor < windowEnd) freeByDay.push({ start: cursor, end: windowEnd });
    }
  }

  return freeByDay.filter((f) => f.end > f.start).sort((a, b) => a.start - b.start);
}

/**
 * Greedily places chunks into free calendar slots. Deterministic — no LLM
 * involved. Chunks that don't fit anywhere in the search horizon (or can't
 * fit before their deadline, if one is set) come back with scheduled:false
 * rather than being silently dropped.
 * @param {Array} chunks - [{ id, estimatedMinutes, energyLevel, priority, dueBy? }]
 * @param {{ busyIntervals: Array, workingHours: object, energyPattern: object }} context
 */
export function findSlotsForChunks(chunks, { busyIntervals, workingHours, energyPattern }) {
  const freeIntervals = computeFreeIntervals(workingHours, busyIntervals, SEARCH_HORIZON_DAYS);

  const sorted = [...chunks].sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (rankDiff !== 0) return rankDiff;
    // Among equal priority, whichever has the nearer (or only) deadline goes first.
    if (a.dueBy && b.dueBy) return new Date(a.dueBy) - new Date(b.dueBy);
    if (a.dueBy) return -1;
    if (b.dueBy) return 1;
    return 0;
  });

  const results = [];

  for (const chunk of sorted) {
    const durationMs = chunk.estimatedMinutes * 60000;
    const deadline = chunk.dueBy ? new Date(chunk.dueBy) : null;
    const fitsDeadline = (f) => !deadline || f.start.getTime() + durationMs <= deadline.getTime();

    // Prefer a free interval whose time-of-day bucket matches the chunk's
    // energy level against the user's stated energy pattern; fall back to
    // the earliest interval that simply fits (still respecting the deadline).
    let placedIdx = freeIntervals.findIndex((f) => {
      if (f.end - f.start < durationMs || !fitsDeadline(f)) return false;
      const bucket = bucketForHour(f.start.getHours());
      return energyPattern?.[bucket] === chunk.energyLevel;
    });
    if (placedIdx === -1) {
      placedIdx = freeIntervals.findIndex((f) => f.end - f.start >= durationMs && fitsDeadline(f));
    }

    if (placedIdx === -1) {
      results.push({ id: chunk.id, scheduled: false });
      continue;
    }

    const slot = freeIntervals[placedIdx];
    const start = new Date(slot.start);
    const end = new Date(start.getTime() + durationMs);
    results.push({ id: chunk.id, scheduled: true, startIso: start.toISOString(), endIso: end.toISOString() });

    // Shrink or remove the interval we just consumed from the front.
    if (end < slot.end) {
      freeIntervals[placedIdx] = { start: end, end: slot.end };
    } else {
      freeIntervals.splice(placedIdx, 1);
    }
  }

  return results;
}
