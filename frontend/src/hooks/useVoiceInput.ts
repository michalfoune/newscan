import { useRef, useState } from 'react';

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

interface UseVoiceInputOptions {
  apiUrl: string;
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ apiUrl, onTranscript }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const teardownAudio = () => {
    analyserRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        teardownAudio();
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        recorderRef.current = null;

        const duration = (Date.now() - startTimeRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setState('processing');

        fetchAbortRef.current = new AbortController();
        try {
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');
          const res = await fetch(`${apiUrl}/api/transcribe`, {
            method: 'POST',
            body: form,
            signal: fetchAbortRef.current.signal,
          });
          if (!res.ok) throw new Error('Transcription failed');
          const data = await res.json();
          const text: string = (data.text ?? '').trim();

          if (!text) {
            if (duration >= 5) {
              setErrorMsg("Rizma didn't quite catch that. Please try again.");
              setState('error');
              setTimeout(() => { setState('idle'); setErrorMsg(null); }, 4000);
            } else {
              setState('idle');
            }
          } else {
            setState('idle');
            onTranscript(text);
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          setErrorMsg('Transcription failed. Please try again.');
          setState('error');
          setTimeout(() => { setState('idle'); setErrorMsg(null); }, 4000);
        } finally {
          fetchAbortRef.current = null;
        }
      };

      recorder.start();
      setState('recording');
    } catch {
      setErrorMsg('Microphone access denied.');
      setState('error');
      setTimeout(() => { setState('idle'); setErrorMsg(null); }, 3000);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const cancel = () => {
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
    teardownAudio();
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try {
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch {}
      recorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setState('idle');
    setErrorMsg(null);
  };

  return { state, errorMsg, startRecording, stopRecording, cancel, analyserRef };
}
