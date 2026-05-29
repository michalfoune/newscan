import { useEffect, useRef, useState } from 'react';
import { ArticleCounts, Mode, ThreadItem } from '../types';
import { Translations } from '../translations';
import { BriefingFeed } from './BriefingFeed';
import { renderMarkdown } from '../utils/markdown';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useTTSContext } from '../contexts/TTSContext';
import { stripMarkdown } from '../utils/markdown';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, CopyIcon, MicIcon, PlayIcon, StopSquareIcon, SubmitArrowIcon } from './icons';

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
  const [expandedMsgs, setExpandedMsgs] = useState<Set<number>>(new Set());
  const [overflowMsgs, setOverflowMsgs] = useState<Set<number>>(new Set());
  const overflowMeasuredRef = useRef<Set<number>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { state: ttsState, currentSource, play: ttsPlay, stop: ttsStop, togglePause: ttsTogglePause } = useTTSContext();

  const handleTTS = (content: string, idx: number) => {
    const source = `chat-${idx}`;
    if (currentSource === source && ttsState === 'loading') {
      ttsStop();
    } else if (currentSource === source && (ttsState === 'playing' || ttsState === 'paused')) {
      ttsTogglePause();
    } else {
      ttsPlay(stripMarkdown(content), source, chatMode);
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
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
              const isLastAssistant = i === lastAssistantIdx && !sending;
              const isOverflow = overflowMsgs.has(i);
              const isExpanded = expandedMsgs.has(i);
              const toggleExpanded = () => setExpandedMsgs(prev => {
                const next = new Set(prev);
                next.has(i) ? next.delete(i) : next.add(i);
                return next;
              });
              const clampRef = (el: HTMLDivElement | null) => {
                if (el && item.role === 'user' && !overflowMeasuredRef.current.has(i) && el.scrollHeight > el.clientHeight) {
                  overflowMeasuredRef.current.add(i);
                  setOverflowMsgs(prev => new Set(prev).add(i));
                }
              };
              return (
                <div key={i} className={`chat-msg-wrap chat-msg-wrap--${item.role}`}>
                  <div className={`chat-msg chat-msg--${item.role}`}>
                    <div ref={!isExpanded ? clampRef : undefined} className={item.role === 'user' && !isExpanded ? 'msg-text-clamped' : undefined}>
                      {renderMarkdown(item.content)}
                    </div>
                    {isOverflow && (
                      <button className="msg-chevron-btn" onClick={toggleExpanded} type="button">
                        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      </button>
                    )}
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
                    {item.role === 'assistant' && ttsState === 'idle' && (
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
          ref={textareaRef}
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
                  <span className="voice-label">Transcribing…</span>
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
    </div>
  );
}
