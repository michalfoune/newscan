import { useEffect, useRef, useState } from 'react';
import { ArticleCounts, Mode, ThreadItem } from '../types';
import { Translations } from '../translations';
import { BriefingFeed } from './BriefingFeed';
import { renderMarkdown } from '../utils/markdown';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useTTS } from '../hooks/useTTS';
import { stripMarkdown } from '../utils/markdown';
import { CloseIcon, CopyIcon, MicIcon, PlayIcon, StopSquareIcon, SubmitArrowIcon } from './icons';
import { TTSPlayerBar } from './TTSPlayerBar';

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

const MODE_COLORS: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

interface Props {
  context: string;
  language: string;
  t: Translations;
  apiUrl: string;
  initialMode: Mode;
  thread: ThreadItem[];
  onThreadChange: (thread: ThreadItem[]) => void;
  onModeChange?: (mode: Mode) => void;
  systemPreferences?: string;
  modelQuality?: string;
  articleCounts?: ArticleCounts;
  newsSource?: string;
  location?: string;
}

export function ChatInterface({ context, language, t, apiUrl, initialMode, thread, onThreadChange, onModeChange, systemPreferences, modelQuality, articleCounts, newsSource, location }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatMode, setChatMode] = useState<Mode>(initialMode);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fetchElapsed, setFetchElapsed] = useState(0);

  const tts = useTTS(apiUrl);
  const [ttsIdx, setTtsIdx] = useState<number | null>(null);

  // Clear ttsIdx when playback finishes or is stopped (but not on failure — keep it set so bar stays)
  useEffect(() => {
    if (tts.state === 'idle') setTtsIdx(null);
  }, [tts.state]);

  const handleTTS = (content: string, idx: number) => {
    if (ttsIdx === idx && tts.state === 'loading') {
      tts.stop();
      setTtsIdx(null);
    } else if (ttsIdx === idx && (tts.state === 'playing' || tts.state === 'paused')) {
      tts.togglePause();
    } else {
      setTtsIdx(idx);
      tts.play(stripMarkdown(content));
    }
  };

  const { state: voiceState, errorMsg: voiceError, startRecording, stopRecording, cancel: cancelVoice } = useVoiceInput({
    apiUrl,
    onTranscript: (text, autoSubmit) => {
      setInput(text);
      if (autoSubmit) send(text);
    },
  });

  useEffect(() => {
    if (statusMsg === 'Thinking…') {
      setFetchElapsed(0);
      const id = setInterval(() => setFetchElapsed(s => s + 1), 1000);
      return () => clearInterval(id);
    } else {
      setFetchElapsed(0);
    }
  }, [statusMsg]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickyScroll = useRef(true);

  useEffect(() => {
    const onScroll = () => {
      const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stickyScroll.current = distFromBottom < 150;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (sending) {
      stickyScroll.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sending]);

  useEffect(() => {
    if (stickyScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' } as ScrollIntoViewOptions);
    }
  }, [pendingText]);

  useEffect(() => {
    if (stickyScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread.length]);

  const copyMsg = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    const userItem: ThreadItem = { type: 'message', role: 'user', content: text };
    const threadWithUser = [...thread, userItem];
    onThreadChange(threadWithUser);

    setInput('');
    setSending(true);
    setStatusMsg(null);
    setPendingText('');

    abortRef.current = new AbortController();

    const messages = thread
      .filter((item): item is Extract<ThreadItem, { type: 'message' }> => item.type === 'message')
      .map(item => ({ role: item.role, content: item.content }));

    try {
      const res = await fetch(`${apiUrl}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          new_message: text,
          context,
          language,
          mode: chatMode,
          system_preferences: systemPreferences?.trim() || undefined,
          model_quality: modelQuality,
          article_counts: articleCounts,
          news_source: newsSource,
          location,
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      let dataLine = '';
      let accText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6);
          } else if (line === '') {
            if (eventType === 'status' && dataLine) {
              const data = JSON.parse(dataLine);
              if (data.stage === 'fetching_articles') {
                setStatusMsg('Thinking…');
              } else {
                setStatusMsg(null);
              }
            } else if (eventType === 'reply_chunk' && dataLine) {
              const data = JSON.parse(dataLine);
              accText += data.chunk;
              setPendingText(accText);
              setStatusMsg(null);
            } else if (eventType === 'reply_done') {
              const assistantItem: ThreadItem = { type: 'message', role: 'assistant', content: accText };
              onThreadChange([...threadWithUser, assistantItem]);
              setPendingText('');
              accText = '';
            } else if (eventType === 'done') {
              setSending(false);
              setStatusMsg(null);
            }

            eventType = '';
            dataLine = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        const errorItem: ThreadItem = {
          type: 'message',
          role: 'assistant',
          content: '⚠ Something went wrong. Please try again.',
        };
        onThreadChange([...threadWithUser, errorItem]);
      }
    } finally {
      setSending(false);
      setStatusMsg(null);
      setPendingText('');
      abortRef.current = null;
    }
  };

  const cancelSend = () => abortRef.current?.abort();

  const showTypingDots = sending && pendingText === '';

  const lastAssistantIdx = thread.reduce<number>(
    (last, item, i) => (item.type === 'message' && item.role === 'assistant' ? i : last),
    -1
  );

  return (
    <div className="chat">
      {(thread.length > 0 || sending) && (
        <div className="chat-thread">
          {thread.map((item, i) => {
            if (item.type === 'message') {
              const isThisTTS = ttsIdx === i;
              const isLastAssistant = i === lastAssistantIdx && !sending;
              return (
                <div key={i} className={`chat-msg-wrap chat-msg-wrap--${item.role}`}>
                  <div className={`chat-msg chat-msg--${item.role}`}>
                    {renderMarkdown(item.content)}
                  </div>
                  <div className={`hover-actions${isLastAssistant ? ' hover-actions--visible' : ''}`}>
                    <button
                      type="button"
                      className="hover-action-btn"
                      data-tooltip={copiedIdx === i ? 'Copied!' : 'Copy'}
                      onClick={() => copyMsg(item.content, i)}
                    >
                      <CopyIcon size={21} />
                    </button>
                    {item.role === 'assistant' && (!isThisTTS || tts.state === 'idle') && (
                      <button
                        type="button"
                        className="hover-action-btn tts-btn tts-btn--sm"
                        data-tooltip="Listen"
                        onClick={() => handleTTS(item.content, i)}
                      >
                        <PlayIcon />
                      </button>
                    )}
                  </div>
                </div>
              );
            } else {
              // type === 'briefing' — kept for backward compat with saved conversations
              return (
                <div key={i} className="thread-brief-wrap">
                  <BriefingFeed response={item.response} t={t} mode={item.mode} generationSeconds={item.generationSeconds ?? null} />
                </div>
              );
            }
          })}

          {showTypingDots && (
            <div className="chat-msg-wrap chat-msg-wrap--assistant">
              <div className="chat-msg chat-msg--assistant chat-msg--typing">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
              {statusMsg && <span className="chat-status-msg">{statusMsg}{fetchElapsed > 0 ? ` ${fetchElapsed}s` : ''}</span>}
            </div>
          )}

          {pendingText !== '' && (
            <div className="chat-msg-wrap chat-msg-wrap--assistant">
              <div className="chat-msg chat-msg--assistant">
                {renderMarkdown(pendingText)}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      <div className="query-box" style={{ '--voice-color': MODE_COLORS[chatMode] } as React.CSSProperties}>
        <textarea
          className="chat-query-input"
          value={input}
          onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={t.chatPlaceholder}
          disabled={sending}
          rows={1}
        />
        {voiceState !== 'idle' ? (
          <div className="query-box-footer query-box-footer--voice">
            <button type="button" className="voice-cancel-btn" onClick={cancelVoice} title="Cancel">
              <CloseIcon />
            </button>
            <div className="voice-indicator">
              {voiceState === 'recording' && (
                <>
                  <div className="voice-bars"><span/><span/><span/><span/></div>
                  <span className="voice-label">Listening…</span>
                </>
              )}
              {voiceState === 'processing' && (
                <>
                  <div className="voice-spinner" />
                  <span className="voice-label">Processing…</span>
                </>
              )}
              {voiceState === 'error' && (
                <span className="voice-error-inline">{voiceError}</span>
              )}
            </div>
            <button
              type="button"
              className="query-submit-btn"
              onClick={voiceState === 'recording' ? stopRecording : undefined}
              disabled={voiceState !== 'recording'}
            >
              <SubmitArrowIcon />
            </button>
          </div>
        ) : (
          <div className="query-box-footer">
            <button
              type="button"
              className="mic-btn"
              onClick={startRecording}
              disabled={sending}
              title="Voice input"
            >
              <MicIcon />
            </button>
            <div className="query-box-actions">
              <div className="mode-buttons">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`mode-btn${chatMode === m ? ' mode-btn--active' : ''}`}
                    style={{ background: MODE_COLORS[m] }}
                    onClick={() => { setChatMode(m); onModeChange?.(m); }}
                    disabled={sending}
                  >
                    {t.modeLabels[m]}
                  </button>
                ))}
              </div>
              <button
                className="query-submit-btn"
                onClick={sending ? cancelSend : () => send()}
                disabled={!sending && !input.trim()}
              >
                {sending ? <StopSquareIcon /> : <SubmitArrowIcon />}
              </button>
            </div>
          </div>
        )}
      </div>
      <TTSPlayerBar
        state={tts.state}
        chunkIdx={tts.chunkIdx}
        totalChunks={tts.totalChunks}
        onPrev={() => tts.skipChunk(-1)}
        onNext={() => tts.skipChunk(1)}
        onPlayPause={tts.togglePause}
        onStop={() => { tts.stop(); setTtsIdx(null); }}
        mode={chatMode}
      />
    </div>
  );
}
