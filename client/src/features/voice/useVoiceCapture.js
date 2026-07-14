import { useCallback, useRef, useState } from 'react';
import { watchVoiceActivity } from './vad.js';
import { transcribeSegment, TranscribeError } from './transcribeClient.js';

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return undefined; // let the browser choose
}

/**
 * Captures microphone audio, segments it on speech pauses (VAD), and
 * transcribes each segment via the backend Groq-Whisper proxy.
 *
 * @param {{
 *   onLevel: (rms: number) => void,
 *   onSegmentTranscribed: (segment: { text: string, segmentIdx: number }) => void,
 *   onError: (error: { code: string, message: string }) => void,
 * }} handlers
 */
export function useVoiceCapture({ onLevel, onSegmentTranscribed, onError }) {
  const [isListening, setIsListening] = useState(false);

  const streamRef = useRef(null);
  const stopVadRef = useRef(null);
  const recorderRef = useRef(null);
  const segmentIdxRef = useRef(0);
  const listeningRef = useRef(false);
  const mimeTypeRef = useRef(undefined);

  const emitTranscript = useCallback(
    async (blob, segmentIdx) => {
      if (!blob || blob.size < 512) return; // near-empty segment, skip the round trip
      try {
        const { text } = await transcribeSegment(blob);
        if (text && text.trim()) {
          onSegmentTranscribed({ text: text.trim(), segmentIdx });
        }
      } catch (err) {
        if (err instanceof TranscribeError) {
          onError({ code: err.code, message: err.message });
        } else {
          onError({ code: 'UPSTREAM_ERROR', message: 'Unexpected transcription error.' });
        }
      }
    },
    [onSegmentTranscribed, onError]
  );

  const startNewRecorder = useCallback(() => {
    if (!listeningRef.current || !streamRef.current) return;
    const chunks = [];
    const recorder = new MediaRecorder(streamRef.current, mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined);
    const segmentIdx = segmentIdxRef.current++;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeTypeRef.current || 'audio/webm' });
      emitTranscript(blob, segmentIdx);
      if (listeningRef.current) startNewRecorder();
    };
    recorder.start();
    recorderRef.current = recorder;
  }, [emitTranscript]);

  const start = useCallback(async () => {
    if (!window.isSecureContext) {
      onError({ code: 'INSECURE_CONTEXT', message: 'Microphone access requires HTTPS or localhost.' });
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError({ code: 'MIC_DENIED', message: 'Microphone permission was denied.' });
      return;
    }

    streamRef.current = stream;
    mimeTypeRef.current = pickMimeType();
    segmentIdxRef.current = 0;
    listeningRef.current = true;
    setIsListening(true);

    stopVadRef.current = watchVoiceActivity(
      stream,
      onLevel,
      () => {
        // silence boundary: close current segment, a fresh one starts in recorder.onstop
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      }
    );

    startNewRecorder();
  }, [onLevel, onError, startNewRecorder]);

  const stop = useCallback(() => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setIsListening(false);

    stopVadRef.current?.();
    stopVadRef.current = null;

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  return { start, stop, isListening };
}
