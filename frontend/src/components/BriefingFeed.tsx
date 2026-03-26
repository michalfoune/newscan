import { BriefingItem, BriefingResponse, Tone } from '../types';
import { Translations } from '../translations';

function formatPublishedAt(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const TONE_META: Record<Tone, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'tone-positive' },
  neutral: { label: 'Neutral', className: 'tone-neutral' },
  concerning: { label: 'Concerning', className: 'tone-concerning' },
};

function FeedItem({ item }: { item: BriefingItem }) {
  const tone = TONE_META[item.tone] ?? TONE_META.neutral;

  return (
    <article className={`feed-item feed-item--${item.tone}`}>
      <div className="feed-item-meta">
        <span className="category">{item.category}</span>
        <span className={`tone-badge ${tone.className}`}>{tone.label}</span>
        <span className="published-at">{formatPublishedAt(item.published_at)}</span>
      </div>
      <h2 className="feed-item-headline">{item.headline}</h2>
      <p className="feed-item-summary">{item.summary}</p>
      {item.why_it_matters && (
        <p className="why-it-matters">
          <strong>Why it matters:</strong> {item.why_it_matters}
        </p>
      )}
    </article>
  );
}

interface Props {
  response: BriefingResponse;
  t: Translations;
}

export function BriefingFeed({ response, t }: Props) {
  const time = new Date(response.generated_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="briefing-feed">
      <div className="feed-header">
        <span className="feed-count">{t.stories(response.items.length)}</span>
        <span className="feed-time">{t.generatedAt(time)}</span>
      </div>
      {response.items.map((item, i) => (
        <FeedItem key={i} item={item} />
      ))}
    </section>
  );
}
