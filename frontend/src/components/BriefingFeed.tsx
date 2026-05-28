import { useState } from 'react';
import { BriefingItem, BriefingResponse, Mode, Tone } from '../types';
import { Translations } from '../translations';
import { useTTS } from '../hooks/useTTS';
import { stripMarkdown } from '../utils/markdown';
import { PauseIcon, PlayIcon } from './icons';
import { TTSPlayerBar } from './TTSPlayerBar';

const MODE_COLORS: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

const TONE_CLASS: Record<Tone, string> = {
  positive: 'tone-positive',
  neutral: 'tone-neutral',
  concerning: 'tone-concerning',
};

function formatPublishedAt(iso: string, t: Translations): string {
  const date = new Date(iso);
  const diffH = Math.floor((Date.now() - date.getTime()) / 3600000);
  if (diffH < 1) return t.timeJustNow;
  if (diffH < 24) return t.timeHoursAgo(diffH);
  return t.timeYesterday(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function FeedItem({ item, t }: { item: BriefingItem; t: Translations }) {
  const inner = (
    <>
      <div className="feed-item-meta">
        <span className="category">{item.category}</span>
        <span className={`tone-badge ${TONE_CLASS[item.tone]}`}>{t.toneLabels[item.tone]}</span>
        <span className="published-at">{formatPublishedAt(item.published_at, t)}</span>
      </div>
      <h2 className="feed-item-headline">{item.headline}</h2>
      <p className="feed-item-summary">{item.summary}</p>
      {item.why_it_matters && (
        <p className="why-it-matters">
          <strong>{t.whyItMatters}:</strong> {item.why_it_matters}
        </p>
      )}
      <div className="feed-item-footer">
        {item.source && <span className="card-source">{item.source}</span>}
        {item.url && <span className="feed-item-read-link">↗ Read original</span>}
      </div>
    </>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className={`feed-item feed-item--${item.tone}`}>
        {inner}
      </a>
    );
  }
  return <article className={`feed-item feed-item--${item.tone}`}>{inner}</article>;
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

interface Props {
  response: BriefingResponse;
  t: Translations;
  mode: Mode;
  generationSeconds?: number | null;
  showKeywords?: boolean;
  relatedCoverage?: boolean;
  apiUrl?: string;
}

const MODE_COLORS_HEX: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

function buildBriefText(response: BriefingResponse): string {
  const parts: string[] = [];
  if (response.overall_summary) parts.push(response.overall_summary);
  for (const item of response.items) {
    parts.push(`${item.headline}. ${item.summary}`);
    if (item.why_it_matters) parts.push(item.why_it_matters);
  }
  return parts.join(' ');
}

const INITIAL_VISIBLE = 2;

export function BriefingFeed({ response, t, mode, generationSeconds, showKeywords = true, relatedCoverage = false, apiUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
  const tts = useTTS(apiUrl ?? '');

  const time = new Date(response.generated_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const visibleItems = expanded ? response.items : response.items.slice(0, INITIAL_VISIBLE);
  const hasMore = response.items.length > INITIAL_VISIBLE;

  return (
    <>
      <section className="briefing-feed">
        <div className="feed-header">
          <div className="feed-header-left">
            {relatedCoverage
              ? <span className="feed-related-label">Related coverage</span>
              : <>
                  <span className="feed-mode-badge" style={{ background: MODE_COLORS[mode] }}>
                    {t.modeLabels[mode]}
                  </span>
                  <span className="feed-count">{t.stories(response.items.length)}</span>
                  {apiUrl && response.items.length > 0 && (
                    <button
                      className="tts-btn"
                      style={{ color: MODE_COLORS_HEX[mode] }}
                      onClick={() => {
                        if (tts.state === 'idle' || tts.state === 'failed') tts.play(stripMarkdown(buildBriefText(response)));
                        else if (tts.state === 'playing') tts.togglePause();
                        else if (tts.state === 'paused') tts.togglePause();
                        else tts.stop();
                      }}
                      title={tts.state === 'playing' ? 'Pause' : tts.state === 'paused' ? 'Resume' : 'Listen'}
                    >
                      {tts.state === 'loading' && <span className="tts-spinner" />}
                      {(tts.state === 'idle' || tts.state === 'paused' || tts.state === 'failed') && <PlayIcon />}
                      {tts.state === 'playing' && <PauseIcon />}
                    </button>
                  )}
                </>
            }
          </div>
          {!relatedCoverage && (
            <span className="feed-time">{t.generatedAt(time)}{generationSeconds != null ? ` (${generationSeconds}s)` : ''}</span>
          )}
        </div>

        {response.overall_summary && (
          <div className="overall-summary">
            <p className="overall-summary-label">{t.overallSummaryLabel}</p>
            <p className="overall-summary-text">{response.overall_summary}</p>
          </div>
        )}

        <div className="feed-grid">
          {visibleItems.map((item, i) => (
            <FeedItem key={i} item={item} t={t} />
          ))}
        </div>

        {hasMore && (
          <div className="feed-see-more">
            <button className="feed-see-more-btn" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `See more news (${response.items.length - INITIAL_VISIBLE} more)`}
            </button>
          </div>
        )}

        {showKeywords && response.topics && response.topics.length > 0 && (
          <div className="feed-trimmed-notice">
            <p className="feed-missing-topics">Searched for:</p>
            <div className="feed-topic-tags">
              {response.topics.map((topic, i) => (
                <span key={i} className="feed-topic-tag">{topic}</span>
              ))}
            </div>
          </div>
        )}
        {response.missing_topics.length > 0 && (
          <p className="feed-missing-topics">
            No articles found for: {response.missing_topics.join(', ')}
          </p>
        )}
      </section>
      <TTSPlayerBar
        state={tts.state}
        chunkIdx={tts.chunkIdx}
        totalChunks={tts.totalChunks}
        onPrev={() => tts.skipChunk(-1)}
        onNext={() => tts.skipChunk(1)}
        onPlayPause={tts.togglePause}
        onStop={tts.stop}
        mode={mode}
      />
    </>
  );
}
