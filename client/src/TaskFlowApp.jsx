import { useEffect, useRef, useCallback, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceCapture } from './features/voice/useVoiceCapture.js';
import { chunkTranscript } from './features/chunking/chunkClient.js';
import { scheduleChunks, addChunkToCalendar } from './features/scheduling/scheduleClient.js';
import { importGoogleItems } from './features/googleImport/importClient.js';

/* Parses a CSS-text string ("prop:val;prop2:val2") into a React style object. */
function css(str) {
  if (!str) return undefined;
  const out = {};
  str.split(';').forEach((rule) => {
    const idx = rule.indexOf(':');
    if (idx === -1) return;
    const prop = rule.slice(0, idx).trim();
    const val = rule.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = val;
  });
  return out;
}

/* Mimics a class component's `this.state` / `this.setState`, so timer
   callbacks always read the latest state (no stale-closure issues). */
function useClassState(initial) {
  const [, rerender] = useReducer((x) => x + 1, 0);
  const ref = useRef(initial);
  const setState = useCallback((patch) => {
    const next = typeof patch === 'function' ? patch(ref.current) : patch;
    if (next == null) return;
    ref.current = { ...ref.current, ...next };
    rerender();
  }, []);
  return [ref, setState];
}

const EXAMPLE_PROMPTS = [
  'Try: “Break down my history essay due Monday”',
  'Try: “I need to pack for the trip and call the dentist”',
  'Try: “Plan my afternoon before soccer practice”',
];

const REWARD_LINES = ['Nice — one down.', 'One less thing.', 'Good work.'];

/* Resets transient UI flags (removed/editing) on a list of chunks in
   internal shape — used both for the initial empty state and to give the
   proposal screen a clean slate over whatever chunks came back from /api/chunk. */
function freshChunks(source = []) {
  return source.map((c) => ({ ...c, removed: false, editingTitle: false, editingSlot: false, draftTitle: c.title, draftSlot: c.slot }));
}

function formatMinutes(mins) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m ? ` ${m}m` : ''}`;
  }
  return `${mins} min`;
}

function formatSlotLabel(startIso, endIso) {
  if (!startIso || !endIso) return 'Not scheduled yet';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayLabel = start.toDateString() === new Date().toDateString() ? 'Today' : start.toLocaleDateString(undefined, { weekday: 'short' });
  const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dayLabel} · ${fmtTime(start)}–${fmtTime(end)}`;
}

/* Maps the server's /api/chunk or /api/schedule response (title/
   estimatedMinutes/energyLevel/priority/rationale, optionally scheduledStart/
   scheduledEnd once /api/schedule has run) into the shape the proposal/home
   UI already renders. */
function mapApiChunksToUi(apiChunks) {
  return apiChunks.map((c) => ({
    id: c.id,
    title: c.title,
    duration: `${c.estimatedMinutes} min`,
    slot: formatSlotLabel(c.scheduledStart, c.scheduledEnd),
    why: c.rationale,
  }));
}

function freshCaptureState() {
  return {
    phase: 'idle',
    typedMode: false,
    typedText: '',
    exampleIdx: 0,
    waveHeights: Array.from({ length: 18 }, () => 10),
    revealedPhrases: [],
    activePhraseIdx: 0,
    editingPhraseIdx: -1,
    showSilenceNudge: false,
  };
}

const initialState = {
  screen: 'capture',
  focusMode: false,
  ...freshCaptureState(),
  chunks: freshChunks(),
  proposalConfirmed: false,
  todayChunks: [
    { id: 'h0', title: 'Email teacher about project sign-up', duration: '10 min', slot: 'Yesterday', status: 'rescheduled' },
    { id: 'h1', title: 'Sketch science project outline', duration: '25 min', slot: '4:00–4:25 PM', status: 'done' },
    { id: 'h2', title: 'Tidy your room', duration: '15 min', slot: '5:30–5:45 PM', status: 'current' },
    { id: 'h3', title: 'Read 10 pages for English', duration: '20 min', slot: '7:00–7:20 PM', status: 'upcoming' },
  ],
  toastVisible: false,
  toastMessage: '',
  toastShowUndo: false,
  canInstall: false,
  installBannerDismissed: false,
  importingGoogle: false,
};

const topBarRadiusPx = 20;
const bottomNavRadiusPx = 20;

const ICONS = {
  mic: (
    <svg width="34%" height="34%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  ),
  checkBig: (
    <svg width="30%" height="30%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  check30: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  chevronRight: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  back: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  close: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  closeSmall: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  clock: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  clockSmall: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  typeInstead: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10.01" />
      <line x1="10" y1="10" x2="10" y2="10.01" />
      <line x1="14" y1="10" x2="14" y2="10.01" />
      <line x1="18" y1="10" x2="18" y2="10.01" />
      <line x1="6" y1="14" x2="18" y2="14" />
    </svg>
  ),
  install: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <polyline points="7 11 12 16 17 11" />
      <path d="M5 21h14" />
    </svg>
  ),
  redo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  capture: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  ),
  settings: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export default function TaskFlowApp({ scrollRef }) {
  const [stateRef, setState] = useClassState(initialState);
  const navigate = useNavigate();

  const exampleTimerRef = useRef(null);
  const deferredPromptRef = useRef(null);
  const preConfirmChunksRef = useRef(null);
  const preConfirmTodayRef = useRef(null);
  const toastTimerRef = useRef(null);
  const rewardTimerRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const processTimeoutRef = useRef(null);
  const rerecordTargetIdxRef = useRef(null);

  const clearCaptureTimers = () => {
    clearTimeout(silenceTimeoutRef.current);
    clearTimeout(processTimeoutRef.current);
  };

  // ---- real mic capture: silence-segmented, transcribed via the backend
  // Groq-Whisper proxy (see client/src/features/voice) ----
  const onVoiceLevel = (rms) => {
    const amplitude = Math.min(1, rms * 6);
    setState({
      waveHeights: Array.from({ length: 18 }, (_, i) => 8 + amplitude * (18 + 14 * Math.abs(Math.sin(i * 1.7 + Date.now() / 120)))),
    });
  };

  const onVoiceSegment = ({ text, segmentIdx }) => {
    clearTimeout(silenceTimeoutRef.current);
    setState((s) => {
      const targetIdx = rerecordTargetIdxRef.current !== null ? rerecordTargetIdxRef.current : segmentIdx;
      const revealed = s.revealedPhrases.slice();
      revealed[targetIdx] = text;
      const wasRerecord = rerecordTargetIdxRef.current !== null;
      rerecordTargetIdxRef.current = null;
      return {
        revealedPhrases: revealed,
        activePhraseIdx: revealed.length,
        showSilenceNudge: false,
        editingPhraseIdx: wasRerecord ? -1 : s.editingPhraseIdx,
      };
    });
  };

  const onVoiceError = (err) => {
    clearCaptureTimers();
    rerecordTargetIdxRef.current = null;
    voiceCapture.stop();
    setState({ phase: 'idle', showSilenceNudge: false, editingPhraseIdx: -1 });
    showToast(err.message, false, 3200);
  };

  const voiceCapture = useVoiceCapture({
    onLevel: onVoiceLevel,
    onSegmentTranscribed: onVoiceSegment,
    onError: onVoiceError,
  });

  useEffect(() => {
    exampleTimerRef.current = setInterval(() => {
      const s = stateRef.current;
      if (s.phase === 'idle' && !s.typedMode) {
        setState((s2) => ({ exampleIdx: (s2.exampleIdx + 1) % EXAMPLE_PROMPTS.length }));
      }
    }, 3400);

    const onBeforeInstall = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setState({ canInstall: true });
    };
    const onInstalled = () => {
      deferredPromptRef.current = null;
      setState({ canInstall: false, installBannerDismissed: true });
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      clearCaptureTimers();
      clearInterval(exampleTimerRef.current);
      clearTimeout(toastTimerRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- timer id ref, not a DOM node; reading .current at cleanup time is intentional
      clearTimeout(rewardTimerRef.current);
      voiceCapture.stop();
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onInstallClick = async () => {
    if (!deferredPromptRef.current) return;
    deferredPromptRef.current.prompt();
    try { await deferredPromptRef.current.userChoice; } catch { /* user dismissed the native install prompt */ }
    deferredPromptRef.current = null;
    setState({ canInstall: false });
  };

  const onDismissInstall = () => setState({ installBannerDismissed: true });
  const onBackFromProposal = () => setState({ screen: 'capture' });

  // ---- navigation ----
  const goCapture = () => setState({ screen: 'capture' });
  const goHome = () => setState({ screen: 'home' });
  const toggleFocus = () => setState((s) => ({ focusMode: !s.focusMode }));

  // ---- capture: mic / typed ----
  const onToggleTyped = () => {
    clearCaptureTimers();
    voiceCapture.stop();
    setState((s) => ({ ...freshCaptureState(), typedMode: !s.typedMode }));
  };

  const onTypedChange = (e) => setState({ typedText: e.target.value });

  const onTypedSend = () => {
    const text = stateRef.current.typedText.trim();
    if (!text) return;
    setState({ typedMode: false, revealedPhrases: [text] });
    startProcessing();
  };

  const onMicTap = () => {
    const phase = stateRef.current.phase;
    if (phase === 'idle') startListening();
    else if (phase === 'listening') finishListeningEarly();
  };

  const startListening = async () => {
    clearCaptureTimers();
    rerecordTargetIdxRef.current = null;
    setState({
      phase: 'listening',
      revealedPhrases: [],
      activePhraseIdx: 0,
      editingPhraseIdx: -1,
      showSilenceNudge: false,
    });
    // if nothing's been transcribed after a while, nudge the user rather than sit silently
    silenceTimeoutRef.current = setTimeout(() => {
      if (stateRef.current.phase === 'listening' && stateRef.current.revealedPhrases.length === 0) {
        setState({ showSilenceNudge: true });
      }
    }, 8000);
    await voiceCapture.start();
  };

  const finishListeningEarly = () => {
    clearCaptureTimers();
    voiceCapture.stop();
    setState({ showSilenceNudge: false });
    startProcessing();
  };

  const startProcessing = async () => {
    const transcript = stateRef.current.revealedPhrases.filter(Boolean).join(' ').trim();
    if (!transcript) {
      setState({ phase: 'idle' });
      return;
    }
    setState({ phase: 'processing' });
    try {
      const result = await chunkTranscript(transcript);
      let chunks = result.chunks;
      try {
        // Best-effort: place chunks into real free calendar slots before the
        // user reviews them. If this fails (e.g. Google not connected yet),
        // fall back to showing chunks without a fixed time rather than
        // blocking the review — /api/schedule can be retried at confirm time.
        const scheduled = await scheduleChunks(chunks.map((c) => c.id));
        chunks = scheduled.chunks;
      } catch {
        /* leave chunks unscheduled */
      }
      setState({ chunks: freshChunks(mapApiChunksToUi(chunks)), phase: 'proposing' });
    } catch (err) {
      setState({ phase: 'idle' });
      showToast(err.message || "Couldn't process that — try again.", false, 3200);
    }
  };

  const onReviewPlan = () => {
    clearCaptureTimers();
    voiceCapture.stop();
    setState((s) => ({
      screen: 'proposal',
      chunks: freshChunks(s.chunks),
      proposalConfirmed: false,
      ...freshCaptureState(),
    }));
  };

  // ---- phrase re-record: while still listening, tap a captured phrase and
  // say it again — the next transcribed segment replaces that phrase instead
  // of appending a new one ----
  const onPhraseClick = (idx) => {
    const s = stateRef.current;
    if (s.phase !== 'listening' || idx >= s.revealedPhrases.length) return;
    rerecordTargetIdxRef.current = idx;
    const revealed = s.revealedPhrases.slice();
    revealed[idx] = '';
    setState({ editingPhraseIdx: idx, revealedPhrases: revealed });
  };

  // ---- proposal chunk editing ----
  const removeChunk = (id) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, removed: true } : c)) }));
  const startEditTitle = (id) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, editingTitle: true, draftTitle: c.title } : c)) }));
  const changeTitleDraft = (id, val) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, draftTitle: val } : c)) }));
  const commitTitle = (id) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, title: (c.draftTitle || '').trim() || c.title, editingTitle: false } : c)) }));
  const startEditSlot = (id) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, editingSlot: true, draftSlot: c.slot } : c)) }));
  const changeSlotDraft = (id, val) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, draftSlot: val } : c)) }));
  const commitSlot = (id) => setState((s) => ({ chunks: s.chunks.map((c) => (c.id === id ? { ...c, slot: (c.draftSlot || '').trim() || c.slot, editingSlot: false } : c)) }));

  const showToast = (message, showUndo, duration) => {
    clearTimeout(toastTimerRef.current);
    setState({ toastVisible: true, toastMessage: message, toastShowUndo: showUndo });
    toastTimerRef.current = setTimeout(() => setState({ toastVisible: false }), duration);
  };

  const onConfirm = async () => {
    const s = stateRef.current;
    const visible = s.chunks.filter((c) => !c.removed);
    if (visible.length === 0) return;
    preConfirmChunksRef.current = s.chunks.map((c) => ({ ...c }));
    preConfirmTodayRef.current = s.todayChunks.map((c) => ({ ...c }));

    // Create a real Google Calendar event per confirmed chunk. Chunks with no
    // scheduled_start yet (couldn't find a free slot, or Google isn't
    // connected) will fail server-side — surfaced as a partial-sync toast
    // rather than blocking the user from keeping their plan locally.
    const results = await Promise.allSettled(visible.map((c) => addChunkToCalendar(c.id)));
    const reauthNeeded = results.some((r) => r.status === 'rejected' && r.reason?.code === 'GOOGLE_REAUTH_REQUIRED');
    const anyFailed = results.some((r) => r.status === 'rejected');

    const rescheduled = s.todayChunks.filter((c) => c.status === 'rescheduled');
    const newToday = visible.map((c, i) => ({
      id: 't_' + c.id, title: c.title, duration: c.duration, slot: c.slot,
      status: i === 0 ? 'current' : 'upcoming',
    }));
    setState({ todayChunks: [...rescheduled, ...newToday], proposalConfirmed: true });

    if (reauthNeeded) {
      showToast('Connect Google Calendar in Settings to sync your plan.', false, 4200);
    } else if (anyFailed) {
      showToast('Added, but some events could not sync to Google Calendar.', true, 6000);
    } else {
      showToast('Added ✓', true, 10000);
    }
  };

  const onGoHomeFromProposal = () => setState({ screen: 'home' });

  const newBrainDump = () => {
    clearCaptureTimers();
    voiceCapture.stop();
    setState({ screen: 'capture', ...freshCaptureState(), proposalConfirmed: false });
  };

  const onUndo = () => {
    if (!preConfirmChunksRef.current) return;
    setState({ chunks: preConfirmChunksRef.current, todayChunks: preConfirmTodayRef.current, proposalConfirmed: false, toastVisible: false });
    clearTimeout(toastTimerRef.current);
    preConfirmChunksRef.current = null;
  };

  // ---- home ----
  const onMarkCurrentDone = () => {
    setState((s) => {
      const items = s.todayChunks.map((c) => ({ ...c }));
      const idx = items.findIndex((c) => c.status === 'current');
      if (idx === -1) return null;
      items[idx].status = 'done';
      const nextIdx = items.findIndex((c, i) => i > idx && c.status === 'upcoming');
      if (nextIdx !== -1) items[nextIdx].status = 'current';
      return { todayChunks: items };
    });
    clearTimeout(rewardTimerRef.current);
    const msg = REWARD_LINES[Math.floor(Math.random() * REWARD_LINES.length)];
    showToast(msg, false, 2400);
  };

  const onDoNow = () => {
    setState((s) => {
      const items = s.todayChunks.map((c) => ({ ...c }));
      const rIdx = items.findIndex((c) => c.status === 'rescheduled');
      if (rIdx === -1) return null;
      const curIdx = items.findIndex((c) => c.status === 'current');
      if (curIdx !== -1) items[curIdx].status = 'upcoming';
      items[rIdx].status = 'current';
      return { todayChunks: items };
    });
  };

  // Pulls in incomplete Google Tasks + near-due Classroom coursework
  // (deduped server-side), schedules them into real free slots, and appends
  // them to today's list as upcoming items alongside brain-dump chunks.
  const onImportFromGoogle = async () => {
    setState({ importingGoogle: true });
    try {
      const { chunks: imported, errors } = await importGoogleItems();
      if (imported.length === 0) {
        const failedBoth = errors.tasks && errors.classroom;
        showToast(failedBoth ? "Couldn't reach Google Tasks or Classroom." : 'Nothing new to import.', false, 3200);
        return;
      }

      const scheduled = await scheduleChunks(imported.map((c) => c.id)).catch(() => ({ chunks: imported }));
      const newItems = scheduled.chunks.map((c) => ({
        id: c.id,
        title: c.title,
        duration: `${c.estimatedMinutes} min`,
        slot: formatSlotLabel(c.scheduledStart, c.scheduledEnd),
        status: 'upcoming',
      }));

      setState((s) => ({ todayChunks: [...s.todayChunks, ...newItems] }));
      showToast(`Imported ${newItems.length} item${newItems.length === 1 ? '' : 's'} from Google`, false, 3200);
    } catch (err) {
      showToast(err.message || 'Could not import from Google.', false, 3200);
    } finally {
      setState({ importingGoogle: false });
    }
  };

  // ================= render =================
  const s = stateRef.current;
  const focusMode = s.focusMode;

  useEffect(() => {
    scrollRef?.current?.scrollTo({ top: 0 });
  }, [s.screen, focusMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const phase = s.phase;
  const isIdle = phase === 'idle';
  const isListening = phase === 'listening';
  const isProcessing = phase === 'processing';
  const isProposing = phase === 'proposing';

  let micBg = '#3D7A68', micAnim = '';
  if (isListening) { micBg = '#2C5A4C'; micAnim = 'tf-pulseGlow 1.8s ease-in-out infinite'; }
  else if (isProcessing) { micBg = '#E3A72E'; micAnim = 'tf-pulseAmber 1.6s ease-in-out infinite'; }
  else if (isProposing) { micBg = '#3D7A68'; }

  const micButtonStyle = `width:180px;height:180px;border-radius:999px;background:${micBg};border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(42,51,48,0.18);animation:${micAnim};flex:none`;

  const phaseLabel = isIdle ? 'Tap to talk' : isListening ? 'Listening…' : isProcessing ? 'Understanding your day…' : 'Got it — plan ready';
  const micAriaLabel = isIdle ? 'Start talking' : isListening ? 'Stop and process' : 'Mic';

  const waveBars = s.waveHeights.map((h) => Math.round(h));

  const phrases = s.revealedPhrases.map((revealedText, i) => {
    const isEditing = s.editingPhraseIdx === i;
    const hasContent = revealedText && revealedText.length > 0;
    return {
      text: hasContent ? revealedText : ' ',
      isEditing,
      onClick: () => onPhraseClick(i),
      style: `cursor:pointer;border-radius:4px;padding:1px 3px;${isEditing ? 'text-decoration:underline;text-decoration-color:#E3A72E;text-decoration-thickness:2px' : ''}`,
    };
  });

  const focusBtnStyle = `display:flex;align-items:center;gap:7px;border-radius:999px;padding:8px 14px;font-weight:600;font-size:12.5px;cursor:pointer;min-height:44px;border:1px solid ${focusMode ? '#3D7A68' : '#D7E2DC'};background:${focusMode ? '#DCEBE3' : '#FFFFFF'};color:${focusMode ? '#2C5A4C' : '#7C8C85'}`;
  const focusDotStyle = `width:8px;height:8px;border-radius:999px;background:${focusMode ? '#E3A72E' : '#D7E2DC'};flex:none`;

  const isCaptureScreen = s.screen === 'capture';
  const isProposalScreen = s.screen === 'proposal';
  const isHomeScreen = s.screen === 'home';
  const showBottomNav = !focusMode && s.screen !== 'proposal';
  const homeTabStyle = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;cursor:pointer;padding:8px 4px;min-height:52px;border-radius:${Math.max(bottomNavRadiusPx - 8, 8)}px;margin:0 4px;transition:background 0.15s,color 0.15s;background:${s.screen === 'home' ? '#DCEBE3' : 'transparent'};color:${s.screen === 'home' ? '#2C5A4C' : '#7C8C85'}`;
  const captureTabStyle = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;cursor:pointer;padding:8px 4px;min-height:52px;border-radius:${Math.max(bottomNavRadiusPx - 8, 8)}px;margin:0 4px;transition:background 0.15s,color 0.15s;background:${s.screen === 'capture' ? '#DCEBE3' : 'transparent'};color:${s.screen === 'capture' ? '#2C5A4C' : '#7C8C85'}`;

  const showCaptureHeader = !focusMode && isIdle && !s.typedMode;
  const showTypeFallbackLink = !s.typedMode && (isIdle || isListening);
  const showExamplePrompt = !focusMode && isIdle && !s.typedMode;

  // ---- proposal ----
  const notFocusMode = !focusMode;
  const visibleChunksBase = s.chunks.filter((c) => !c.removed);
  const chunkCountLabel = `${visibleChunksBase.length} tasks`;
  const totalDurationLabel = formatMinutes(visibleChunksBase.reduce((sum, c) => sum + (parseInt(c.duration, 10) || 0), 0));
  const showNoChunks = visibleChunksBase.length === 0;
  const visibleChunks = visibleChunksBase.map((c) => ({
    ...c,
    onRemove: () => removeChunk(c.id),
    onTitleClick: () => startEditTitle(c.id),
    onTitleChange: (e) => changeTitleDraft(c.id, e.target.value),
    onTitleCommit: () => commitTitle(c.id),
    onSlotClick: () => startEditSlot(c.id),
    onSlotChange: (e) => changeSlotDraft(c.id, e.target.value),
    onSlotCommit: () => commitSlot(c.id),
  }));

  // ---- home ----
  const doneCount = s.todayChunks.filter((c) => c.status === 'done').length;
  const totalCount = s.todayChunks.filter((c) => c.status !== 'rescheduled').length;
  const minutesLeftLabel = (() => {
    const mins = s.todayChunks.filter((c) => c.status === 'current' || c.status === 'upcoming')
      .reduce((sum, c) => sum + (parseInt(c.duration, 10) || 0), 0);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60 ? (mins % 60) + 'm' : ''}`.trim() : `${mins} min`;
  })();
  const segmentBars = s.todayChunks.filter((c) => c.status !== 'rescheduled').map((c) => {
    const total = s.todayChunks.filter((x) => x.status !== 'rescheduled').reduce((sum, x) => sum + (parseInt(x.duration, 10) || 0), 0) || 1;
    const mins = parseInt(c.duration, 10) || 0;
    const color = c.status === 'done' ? '#3D7A68' : c.status === 'current' ? '#E3A72E' : '#D7E2DC';
    return { widthPercent: Math.round((mins / total) * 1000) / 10, color };
  });
  const showFullHome = !focusMode;
  const hasRescheduled = !focusMode && s.todayChunks.some((c) => c.status === 'rescheduled');
  const rescheduledItem = s.todayChunks.find((c) => c.status === 'rescheduled') || { title: '' };
  const todayItems = (() => {
    const items = s.todayChunks.filter((c) => c.status !== 'rescheduled');
    let stepCounter = 0;
    return items.map((c) => {
      const isDone = c.status === 'done', isCurrent = c.status === 'current', isUpcoming = c.status === 'upcoming';
      if (isUpcoming) stepCounter++;
      const stoneBg = isDone ? '#3D7A68' : isCurrent ? '#E3A72E' : '#D7E2DC';
      return {
        ...c, isDone, isCurrent, isUpcoming,
        stepNumber: stepCounter,
        stoneStyle: `width:34px;height:34px;border-radius:999px;background:${stoneBg};color:#fff;display:flex;align-items:center;justify-content:center;${isCurrent ? 'box-shadow:0 0 0 5px #FBF0D8' : ''}`,
        titleStyle: `font-size:14.5px;font-weight:600;color:${isDone ? '#7C8C85' : '#2A3330'};${isDone ? 'text-decoration:line-through;text-decoration-color:#D7E2DC' : ''}`,
        cardStyle: `background:#FFFFFF;border-radius:18px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:16px 18px;display:flex;align-items:center;gap:12px;${isCurrent ? 'border:2px solid #E3A72E' : 'border:2px solid transparent'};${isDone ? 'opacity:0.7' : ''}`,
      };
    });
  })();
  const hasCurrentItem = !!s.todayChunks.find((c) => c.status === 'current');
  const noCurrentItem = !hasCurrentItem;
  const focusEyebrow = hasCurrentItem ? 'Right now' : 'All caught up';
  const focusCurrentTitle = (s.todayChunks.find((c) => c.status === 'current') || { title: 'Nothing on deck' }).title;
  const focusCurrentDuration = (s.todayChunks.find((c) => c.status === 'current') || { duration: '' }).duration;

  const showInstallBanner = s.canInstall && !s.installBannerDismissed;

  return (
    <div style={css("min-height:100%;width:100%;background:#EFF3F0;display:flex;justify-content:center;font-family:'Inter',sans-serif;color:#2A3330")}>
      <div className="tf-shell" style={css('width:100%;max-width:560px;min-height:100%;background:#EFF3F0;display:flex;flex-direction:column;position:relative')}>

        <header style={css(`position:sticky;top:max(10px, env(safe-area-inset-top));z-index:20;margin:max(10px, env(safe-area-inset-top)) 14px 0;display:flex;align-items:center;justify-content:space-between;padding:13px 18px;background:#FFFFFF;border-radius:${topBarRadiusPx}px;box-shadow:0 6px 18px rgba(42,51,48,0.08), 0 1px 3px rgba(42,51,48,0.05)`)}>
          <div style={css('display:flex;align-items:center;gap:9px')}>
            <div aria-hidden="true" style={css("width:30px;height:30px;border-radius:999px;background:#3D7A68;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Baloo 2',sans-serif;font-weight:700;font-size:15px;flex:none")}>T</div>
            <span style={css("font-family:'Baloo 2',sans-serif;font-weight:600;font-size:17px;color:#2A3330")}>TaskFlow</span>
          </div>
          <div style={css('display:flex;align-items:center;gap:8px')}>
            <button type="button" className="tf-focus-teal" onClick={toggleFocus} aria-pressed={focusMode} style={css(focusBtnStyle)}>
              <span aria-hidden="true" style={css(focusDotStyle)} />
              Focus Mode
            </button>
            {!focusMode && (
              <button
                type="button"
                onClick={() => navigate('/settings')}
                aria-label="Settings"
                className="tf-focus-teal"
                style={css('width:36px;height:36px;border-radius:999px;border:1px solid #D7E2DC;background:#FFFFFF;color:#7C8C85;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none')}
              >
                {ICONS.settings}
              </button>
            )}
          </div>
        </header>

        {isCaptureScreen && (
          <main aria-label="Voice capture" style={css('flex:1;display:flex;flex-direction:column;align-items:center;padding:22px 24px 40px;gap:22px')}>

            {showCaptureHeader && (
              <div style={css('text-align:center;max-width:420px')}>
                <div style={css("font-family:'Baloo 2',sans-serif;font-weight:700;font-size:24px;color:#2A3330;margin-bottom:6px")}>What's on your mind?</div>
                <div style={css('font-size:14.5px;line-height:1.5;color:#7C8C85')}>Say it messy — I'll sort it out.</div>
              </div>
            )}

            {s.typedMode && (
              <div style={css('width:100%;max-width:400px;display:flex;flex-direction:column;gap:12px;background:#FFFFFF;border-radius:18px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:20px')}>
                <label htmlFor="tf-typed" style={css('font-size:13px;font-weight:600;color:#7C8C85')}>Type your brain-dump</label>
                <textarea
                  id="tf-typed"
                  rows={4}
                  value={s.typedText}
                  onChange={onTypedChange}
                  placeholder="I have to... and also... and I should..."
                  className="tf-focus-teal"
                  style={css('width:100%;border:1px solid #D7E2DC;border-radius:12px;padding:12px 14px;font-size:14.5px;line-height:1.5;color:#2A3330;resize:none')}
                />
                <div style={css('display:flex;gap:10px')}>
                  <button type="button" onClick={onTypedSend} className="tf-hover-dark tf-focus-dark" style={css('flex:1;background:#3D7A68;color:#fff;border:none;border-radius:12px;padding:12px;font-weight:600;font-size:14.5px;cursor:pointer;min-height:44px')}>Send</button>
                  <button type="button" onClick={onToggleTyped} className="tf-hover-mint tf-focus-teal" style={css('background:transparent;color:#7C8C85;border:1px solid #D7E2DC;border-radius:12px;padding:12px 16px;font-weight:600;font-size:14px;cursor:pointer;min-height:44px')}>Use voice</button>
                </div>
              </div>
            )}

            {!s.typedMode && (
              <div style={css('display:flex;flex-direction:column;align-items:center;gap:14px;width:100%')}>
                <button type="button" onClick={onMicTap} aria-label={micAriaLabel} className="tf-focus-mic" style={css(micButtonStyle)}>
                  {isIdle && ICONS.mic}
                  {isProposing && ICONS.checkBig}
                  {isListening && (
                    <div style={css('display:flex;align-items:center;justify-content:center;gap:3px;height:34%;width:70%')}>
                      {waveBars.map((h, i) => (
                        <div key={i} style={css(`width:3px;border-radius:2px;background:#FFFFFF;height:${h}px;flex:none`)} />
                      ))}
                    </div>
                  )}
                  {isProcessing && (
                    <div style={css('width:16px;height:16px;border-radius:999px;background:#FFFFFF;animation:tf-dot 1.1s ease-in-out infinite')} />
                  )}
                </button>
                <div style={css("font-family:'Inter',sans-serif;font-weight:600;font-size:13px;color:#7C8C85;letter-spacing:0.03em;text-transform:uppercase;min-height:18px")}>{phaseLabel}</div>

                {showExamplePrompt && (
                  <div style={css('background:#DCEBE3;color:#2C5A4C;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:500;text-align:center;max-width:340px;animation:tf-fadeIn 0.4s ease')}>{EXAMPLE_PROMPTS[s.exampleIdx]}</div>
                )}

                {isListening && phrases.length > 0 && (
                  <div style={css('width:100%;max-width:400px;min-height:96px;background:#FFFFFF;border-radius:18px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:18px 20px;font-size:15px;line-height:1.7;color:#2A3330')}>
                    {phrases.map((phrase, i) => (
                      <span key={i}>
                        <span onClick={phrase.onClick} style={css(phrase.style)} role="button" tabIndex={0}>{phrase.text}</span>
                        {phrase.isEditing && (
                          <span style={css('font-size:11px;font-weight:600;color:#E3A72E;margin:0 4px')}>re-recording…</span>
                        )}
                        {' '}
                      </span>
                    ))}
                  </div>
                )}

                {isListening && phrases.length === 0 && !s.showSilenceNudge && (
                  <div style={css('font-size:13.5px;color:#7C8C85;text-align:center')}>Go ahead — say what's on your mind.</div>
                )}

                {s.showSilenceNudge && (
                  <div style={css('background:#FBF0D8;color:#2A3330;border-radius:12px;padding:9px 16px;font-size:13.5px;font-weight:500;animation:tf-fadeIn 0.3s ease')}>Take your time — still listening.</div>
                )}

                {isProcessing && (
                  <div style={css('font-size:13.5px;color:#7C8C85;text-align:center')}>Breaking that down into small steps…</div>
                )}

                {isProposing && (
                  <div style={css('width:100%;max-width:400px;display:flex;flex-direction:column;gap:14px;align-items:center')}>
                    <div style={css('font-size:14.5px;color:#7C8C85;text-align:center')}>
                      {chunkCountLabel} · about <span style={css("font-family:'JetBrains Mono',monospace;color:#2A3330;font-weight:500")}>{totalDurationLabel}</span>
                    </div>
                    <button type="button" onClick={onReviewPlan} className="tf-hover-dark tf-focus-dark" style={css('width:100%;background:#3D7A68;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:600;font-size:15px;cursor:pointer;min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px')}>
                      Review plan
                      {ICONS.chevronRight}
                    </button>
                  </div>
                )}
              </div>
            )}

            {showTypeFallbackLink && (
              <button type="button" onClick={onToggleTyped} className="tf-hover-underline tf-focus-teal" style={css('background:transparent;border:none;color:#3D7A68;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:10px 14px;min-height:44px')}>
                {ICONS.typeInstead}
                Type instead
              </button>
            )}
          </main>
        )}

        {isProposalScreen && (
          <main aria-label="Review your plan" style={css('flex:1;display:flex;flex-direction:column;padding:18px 20px 20px;gap:14px')}>

            {!s.proposalConfirmed && (
              <>
                <button type="button" onClick={onBackFromProposal} className="tf-hover-dark-text tf-focus-teal" style={css('align-self:flex-start;display:flex;align-items:center;gap:6px;background:transparent;border:none;color:#7C8C85;font-size:13.5px;font-weight:600;cursor:pointer;padding:6px 4px;margin-bottom:-6px;min-height:44px;display:flex')}>
                  {ICONS.back}
                  Back
                </button>
                <div>
                  <div style={css("font-family:'Baloo 2',sans-serif;font-weight:700;font-size:22px;color:#2A3330;margin-bottom:3px")}>Here's your plan</div>
                  {notFocusMode && (
                    <div style={css('font-size:13.5px;color:#7C8C85')}>{chunkCountLabel} · about <span style={css("font-family:'JetBrains Mono',monospace;font-weight:500;color:#3D7A68")}>{totalDurationLabel}</span> total</div>
                  )}
                </div>

                <div style={css('display:flex;flex-direction:column;gap:10px')}>
                  {visibleChunks.map((chunk) => (
                    <div key={chunk.id} style={css('background:#FFFFFF;border-radius:18px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:16px 16px 14px;display:flex;flex-direction:column;gap:8px;animation:tf-fadeIn 0.3s ease')}>
                      <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                        {chunk.editingTitle ? (
                          <input
                            type="text"
                            value={chunk.draftTitle}
                            onChange={chunk.onTitleChange}
                            onBlur={chunk.onTitleCommit}
                            autoFocus
                            style={css("flex:1;font-size:15.5px;font-weight:600;color:#2A3330;font-family:'Inter',sans-serif;border:1px solid #3D7A68;border-radius:8px;padding:4px 8px")}
                          />
                        ) : (
                          <span onClick={chunk.onTitleClick} role="button" tabIndex={0} className="tf-hover-ghost tf-focus-teal-1" style={css('flex:1;font-size:15.5px;font-weight:600;color:#2A3330;cursor:text;padding:4px 8px;border-radius:8px')}>{chunk.title}</span>
                        )}
                        <button type="button" onClick={chunk.onRemove} aria-label="Remove task" className="tf-hover-ghost-text tf-focus-teal-1" style={css('flex:none;width:44px;height:44px;border-radius:999px;background:transparent;border:none;color:#7C8C85;cursor:pointer;display:flex;align-items:center;justify-content:center')}>
                          {ICONS.close}
                        </button>
                      </div>
                      <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                        <span style={css("display:flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;color:#3D7A68;background:#DCEBE3;border-radius:999px;padding:4px 10px 4px 8px;flex:none")}>
                          {ICONS.clock}
                          {chunk.duration}
                        </span>
                        {chunk.editingSlot ? (
                          <input
                            type="text"
                            value={chunk.draftSlot}
                            onChange={chunk.onSlotChange}
                            onBlur={chunk.onSlotCommit}
                            style={css("font-size:13px;color:#2A3330;font-family:'Inter',sans-serif;border:1px solid #3D7A68;border-radius:8px;padding:3px 8px;flex:1;min-width:120px")}
                          />
                        ) : (
                          <span onClick={chunk.onSlotClick} role="button" tabIndex={0} className="tf-hover-ghost tf-focus-teal-1" style={css('font-size:13px;color:#2A3330;cursor:text;padding:3px 8px;border-radius:8px')}>{chunk.slot}</span>
                        )}
                      </div>
                      {notFocusMode && (
                        <div style={css('font-size:12.5px;color:#7C8C85')}>{chunk.why}</div>
                      )}
                    </div>
                  ))}
                </div>

                {showNoChunks && (
                  <div style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:#7C8C85;font-size:14px;padding:30px 20px')}>Nothing queued. Start a new brain-dump from Capture.</div>
                )}

                <div style={css('margin-top:auto;display:flex;flex-direction:column;gap:8px;align-items:center;padding-top:6px')}>
                  <button type="button" onClick={onConfirm} className="tf-hover-dark tf-focus-dark" style={css('width:100%;background:#3D7A68;color:#fff;border:none;border-radius:12px;padding:15px;font-weight:600;font-size:15.5px;cursor:pointer;min-height:48px')}>Add to calendar</button>
                  <button type="button" onClick={onConfirm} className="tf-hover-teal-text tf-focus-teal" style={css('background:transparent;border:none;color:#7C8C85;font-size:13px;cursor:pointer;padding:6px;min-height:44px;display:flex;align-items:center;justify-content:center')}>or say "yes"</button>
                </div>
              </>
            )}

            {s.proposalConfirmed && (
              <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:20px')}>
                <div style={css('width:64px;height:64px;border-radius:999px;background:#DCEBE3;display:flex;align-items:center;justify-content:center;color:#3D7A68')}>
                  {ICONS.check30}
                </div>
                <div style={css("font-family:'Baloo 2',sans-serif;font-weight:700;font-size:20px;color:#2A3330")}>Added to your calendar</div>
                <div style={css('font-size:14px;color:#7C8C85;max-width:320px')}>Your plan is on Home, ready to go.</div>
                <div style={css('display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px')}>
                  <button type="button" onClick={onGoHomeFromProposal} className="tf-hover-dark tf-focus-dark" style={css('width:100%;background:#3D7A68;color:#fff;border:none;border-radius:12px;padding:13px;font-weight:600;font-size:14.5px;cursor:pointer;min-height:46px')}>Go to Home</button>
                  <button type="button" onClick={newBrainDump} className="tf-hover-mint tf-focus-teal" style={css('width:100%;background:transparent;color:#3D7A68;border:1px solid #DCEBE3;border-radius:12px;padding:13px;font-weight:600;font-size:14px;cursor:pointer;min-height:46px')}>Start a new brain-dump</button>
                </div>
              </div>
            )}
          </main>
        )}

        {isHomeScreen && (
          <main aria-label="Today's schedule" style={css('flex:1;display:flex;flex-direction:column;padding:18px 20px 24px;gap:18px')}>

            {showInstallBanner && (
              <div style={css('background:#FFFFFF;border-radius:14px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:12px 14px;display:flex;align-items:center;gap:10px')}>
                <div style={css('flex:none;width:32px;height:32px;border-radius:9px;background:#3D7A68;display:flex;align-items:center;justify-content:center')}>
                  {ICONS.install}
                </div>
                <div style={css('flex:1')}>
                  <div style={css('font-size:13.5px;font-weight:600;color:#2A3330')}>Install TaskFlow</div>
                  <div style={css('font-size:12px;color:#7C8C85')}>One tap from your home screen, works offline</div>
                </div>
                <button type="button" onClick={onInstallClick} className="tf-hover-dark tf-focus-dark" style={css('flex:none;background:#3D7A68;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:600;font-size:12.5px;cursor:pointer;min-height:44px')}>Install</button>
                <button type="button" onClick={onDismissInstall} aria-label="Dismiss" className="tf-hover-dark-text tf-focus-teal" style={css('flex:none;background:transparent;border:none;color:#7C8C85;cursor:pointer;padding:4px;display:flex;min-height:44px;min-width:44px;align-items:center;justify-content:center')}>
                  {ICONS.closeSmall}
                </button>
              </div>
            )}

            <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
              <div>
                <div style={css("font-family:'Baloo 2',sans-serif;font-weight:700;font-size:22px;color:#2A3330;margin-bottom:2px")}>Today</div>
                <div style={css('font-size:13.5px;color:#7C8C85')}>{doneCount} of {totalCount} done · <span style={css("font-family:'JetBrains Mono',monospace;font-weight:500;color:#3D7A68")}>{minutesLeftLabel}</span> left today</div>
              </div>
              {!focusMode && (
                <button
                  type="button"
                  onClick={onImportFromGoogle}
                  disabled={s.importingGoogle}
                  className="tf-hover-mint tf-focus-teal"
                  style={css('flex:none;background:transparent;border:1px solid #D7E2DC;color:#3D7A68;border-radius:10px;padding:8px 12px;font-weight:600;font-size:12px;cursor:pointer;min-height:44px')}
                >
                  {s.importingGoogle ? 'Importing…' : 'Import from Google'}
                </button>
              )}
            </div>

            <div style={css('width:100%;height:10px;border-radius:999px;overflow:hidden;display:flex;gap:2px;background:#D7E2DC')}>
              {segmentBars.map((seg, i) => (
                <div key={i} style={css(`height:100%;width:${seg.widthPercent}%;background:${seg.color};flex:none`)} />
              ))}
            </div>

            {showFullHome && (
              <>
                {hasRescheduled && (
                  <div style={css('background:#FFFFFF;border-radius:18px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:16px 18px;display:flex;align-items:center;gap:12px')}>
                    <div style={css('flex:none;width:34px;height:34px;border-radius:999px;background:#EFF3F0;color:#7C8C85;display:flex;align-items:center;justify-content:center')}>
                      {ICONS.redo}
                    </div>
                    <div style={css('flex:1')}>
                      <div style={css('font-size:14px;font-weight:600;color:#2A3330')}>Let's pick this back up</div>
                      <div style={css('font-size:12.5px;color:#7C8C85')}>{rescheduledItem.title}</div>
                    </div>
                    <button type="button" onClick={onDoNow} className="tf-hover-mint tf-focus-teal" style={css('flex:none;background:transparent;border:1px solid #D7E2DC;color:#3D7A68;border-radius:10px;padding:8px 12px;font-weight:600;font-size:12.5px;cursor:pointer;min-height:44px')}>Do now</button>
                  </div>
                )}

                <div style={css('position:relative;display:flex;justify-content:space-between;align-items:center;padding:6px 16px')}>
                  <div style={css('position:absolute;top:50%;left:36px;right:36px;height:3px;background:#D7E2DC;transform:translateY(-50%);z-index:0')} />
                  {todayItems.map((stone) => (
                    <div key={stone.id} style={css('position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:5px')}>
                      <div style={css(stone.stoneStyle)}>
                        {stone.isDone && ICONS.checkBig}
                        {stone.isCurrent && <div style={css('width:10px;height:10px;border-radius:999px;background:#FFFFFF')} />}
                        {stone.isUpcoming && <span style={css("font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;color:#7C8C85")}>{stone.stepNumber}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={css('display:flex;flex-direction:column;gap:10px')}>
                  {todayItems.map((item) => (
                    <div key={item.id} style={css(item.cardStyle)}>
                      <div style={css('flex:1')}>
                        <div style={css(item.titleStyle)}>{item.title}</div>
                        <div style={css('display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap')}>
                          <span style={css("display:flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:500;color:#3D7A68;background:#DCEBE3;border-radius:999px;padding:3px 9px 3px 7px;flex:none")}>
                            {ICONS.clockSmall}
                            {item.duration}
                          </span>
                          <span style={css('font-size:12.5px;color:#7C8C85')}>{item.slot}</span>
                        </div>
                      </div>
                      {item.isCurrent && (
                        <button type="button" onClick={onMarkCurrentDone} aria-label="Mark done" className="tf-hover-cream tf-focus-amber" style={css('flex:none;width:44px;height:44px;border-radius:999px;background:#FFFFFF;border:2px solid #E3A72E;color:#E3A72E;cursor:pointer;display:flex;align-items:center;justify-content:center')}>
                          {ICONS.check30}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {focusMode && (
              <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center')}>
                <div style={css('font-size:12px;font-weight:600;color:#7C8C85;text-transform:uppercase;letter-spacing:0.04em')}>{focusEyebrow}</div>
                <div style={css('background:#FFFFFF;border-radius:18px;box-shadow:0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04);padding:26px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px;align-items:center;border:2px solid #E3A72E')}>
                  <div style={css("font-family:'Baloo 2',sans-serif;font-weight:700;font-size:19px;color:#2A3330")}>{focusCurrentTitle}</div>
                  {hasCurrentItem && (
                    <>
                      <span style={css("display:flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:500;color:#3D7A68;background:#DCEBE3;border-radius:999px;padding:4px 10px 4px 8px")}>
                        {ICONS.clock}
                        {focusCurrentDuration}
                      </span>
                      <button type="button" onClick={onMarkCurrentDone} className="tf-hover-dark tf-focus-dark" style={css('width:100%;background:#3D7A68;color:#fff;border:none;border-radius:12px;padding:13px;font-weight:600;font-size:14.5px;cursor:pointer;min-height:46px')}>Mark done</button>
                    </>
                  )}
                  {noCurrentItem && (
                    <>
                      <div style={css('font-size:13.5px;color:#7C8C85')}>Everything's scheduled and done for now.</div>
                      <button type="button" onClick={newBrainDump} className="tf-hover-dark tf-focus-dark" style={css('width:100%;background:#3D7A68;color:#fff;border:none;border-radius:12px;padding:13px;font-weight:600;font-size:14.5px;cursor:pointer;min-height:46px')}>New brain-dump</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </main>
        )}

        {showBottomNav && (
          <nav aria-label="Primary" style={css(`position:sticky;bottom:max(12px, env(safe-area-inset-bottom));z-index:20;margin:0 14px;display:flex;align-items:stretch;justify-content:space-around;background:#FFFFFF;border-radius:${bottomNavRadiusPx}px;box-shadow:0 10px 26px rgba(42,51,48,0.14), 0 2px 6px rgba(42,51,48,0.06);padding:8px`)}>
            <button type="button" onClick={goHome} aria-current={isHomeScreen ? 'page' : undefined} className="tf-focus-teal-neg" style={css(homeTabStyle)}>
              {ICONS.home}
              <span style={css('font-size:11px;font-weight:600')}>Home</span>
            </button>
            <button type="button" onClick={goCapture} aria-current={isCaptureScreen ? 'page' : undefined} className="tf-focus-teal-neg" style={css(captureTabStyle)}>
              {ICONS.capture}
              <span style={css('font-size:11px;font-weight:600')}>Capture</span>
            </button>
          </nav>
        )}
      </div>

      {s.toastVisible && (
        <div role="status" aria-live="polite" style={css('position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#2A3330;color:#FFFFFF;border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 6px 20px rgba(42,51,48,0.25);z-index:50;animation:tf-slideUp 0.3s ease;max-width:90vw')}>
          <span style={css('font-size:14px;font-weight:600;white-space:nowrap')}>{s.toastMessage}</span>
          {s.toastShowUndo && (
            <button type="button" onClick={onUndo} className="tf-focus-cream" style={css('background:transparent;border:none;color:#FBF0D8;font-weight:700;font-size:13.5px;cursor:pointer;padding:4px;text-decoration:underline')}>Undo</button>
          )}
        </div>
      )}
    </div>
  );
}
