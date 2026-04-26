import { useEffect, useState } from 'react';
import { BriefingItem, BriefingResponse, Tone } from '../types';
import { Translations } from '../translations';

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
// Modal
// ---------------------------------------------------------------------------

function ArticleModal({ item, t, onClose }: { item: BriefingItem; t: Translations; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-meta">
          <span className="category">{item.category}</span>
          <span className={`tone-badge ${TONE_CLASS[item.tone]}`}>{t.toneLabels[item.tone]}</span>
          <span className="published-at">{formatPublishedAt(item.published_at, t)}</span>
        </div>
        <h2 className="modal-headline">{item.headline}</h2>
        <p className="modal-summary">{item.summary}</p>
        {item.why_it_matters && (
          <p className="why-it-matters">
            <strong>{t.whyItMatters}:</strong> {item.why_it_matters}
          </p>
        )}
        {item.excerpt && (
          <div className="modal-excerpt">
            <p className="modal-excerpt-label">{t.fromTheSource}</p>
            <p className="modal-excerpt-text">{item.excerpt}</p>
          </div>
        )}
        <div className="modal-footer">
          {item.source && <span className="modal-source">{item.source}</span>}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="modal-read-original">
              {t.readOriginal}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function FeedItem({ item, t, onClick }: { item: BriefingItem; t: Translations; onClick: () => void }) {
  return (
    <article
      className={`feed-item feed-item--${item.tone}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
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
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="card-read-original"
          onClick={(e) => e.stopPropagation()}
        >
          {t.readOriginal}
        </a>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

interface Props {
  response: BriefingResponse;
  t: Translations;
  generationSeconds?: number | null;
}

const INITIAL_VISIBLE = 2;

export function BriefingFeed({ response, t, generationSeconds }: Props) {
  const [selected, setSelected] = useState<BriefingItem | null>(null);
  const [expanded, setExpanded] = useState(false);

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
          <span className="feed-count">{t.stories(response.items.length)}</span>
          <span className="feed-time">{t.generatedAt(time)}{generationSeconds != null ? ` (${generationSeconds}s)` : ''}</span>
        </div>

        <div className="feed-grid">
          {visibleItems.map((item, i) => (
            <FeedItem key={i} item={item} t={t} onClick={() => setSelected(item)} />
          ))}
        </div>

        {hasMore && (
          <div className="feed-see-more">
            <button className="feed-see-more-btn" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `See more news (${response.items.length - INITIAL_VISIBLE} more)`}
            </button>
          </div>
        )}

        {response.overall_summary && (
          <div className="overall-summary">
            <p className="overall-summary-label">{t.overallSummaryLabel}</p>
            <p className="overall-summary-text">{response.overall_summary}</p>
          </div>
        )}
      </section>

      {selected && <ArticleModal item={selected} t={t} onClose={() => setSelected(null)} />}
    </>
  );
}
