// Lightweight energy-threshold voice activity detection. Not robust to
// background noise (fan, TV) — RMS_THRESHOLD is the tunable knob if a
// deployment needs a different sensitivity.
const RMS_THRESHOLD = 0.02;
const SILENCE_MS_TO_CLOSE_SEGMENT = 600;

/**
 * Watches a MediaStream's audio energy and reports level + segment
 * boundaries (voiced audio followed by a sustained silence).
 * @param {MediaStream} stream
 * @param {(rms: number) => void} onLevel
 * @param {() => void} onSegmentBoundary - called once per silence-close after voiced audio
 * @returns {() => void} stop function
 */
export function watchVoiceActivity(stream, onLevel, onSegmentBoundary) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  let hasVoiced = false;
  let silenceStartedAt = null;
  let rafId = null;

  function tick() {
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    onLevel(rms);

    const voicedNow = rms >= RMS_THRESHOLD;
    if (voicedNow) {
      hasVoiced = true;
      silenceStartedAt = null;
    } else if (hasVoiced) {
      if (silenceStartedAt === null) silenceStartedAt = performance.now();
      else if (performance.now() - silenceStartedAt >= SILENCE_MS_TO_CLOSE_SEGMENT) {
        hasVoiced = false;
        silenceStartedAt = null;
        onSegmentBoundary();
      }
    }

    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  return function stop() {
    cancelAnimationFrame(rafId);
    source.disconnect();
    audioCtx.close().catch(() => {});
  };
}
