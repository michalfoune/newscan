import { BriefingItem, BriefingResponse, Tone } from '../types';

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
}

export function BriefingFeed({ response }: Props) {
  const time = new Date(response.generated_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="briefing-feed">
      <div className="feed-header">
        <span className="feed-count">
          {response.items.length} {response.items.length === 1 ? 'story' : 'stories'}
        </span>
        <span className="feed-time">Generated at {time}</span>
      </div>
      {response.items.map((item, i) => (
        <FeedItem key={i} item={item} />
      ))}
    </section>
  );
}
