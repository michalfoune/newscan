import { useRef, useState } from 'react';

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

interface UseVoiceInputOptions {
  apiUrl: string;
  onTranscript: (text: string, autoSubmit: boolean) => void;
}

const isMobile = () => navigator.maxTouchPoints > 0;

export function useVoiceInput({ apiUrl, onTranscript }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        recorderRef.current = null;

        const duration = (Date.now() - startTimeRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setState('processing');

        try {
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');
          const res = await fetch(`${apiUrl}/api/transcribe`, { method: 'POST', body: form });
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
            onTranscript(text, isMobile());
          }
        } catch {
          setErrorMsg('Transcription failed. Please try again.');
          setState('error');
          setTimeout(() => { setState('idle'); setErrorMsg(null); }, 4000);
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

  return { state, errorMsg, startRecording, stopRecording, cancel };
}
