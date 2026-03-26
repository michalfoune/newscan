import { BriefingItem, BriefingResponse, Tone } from '../types';
import { Translations } from '../translations';

const TONE_CLASS: Record<Tone, string> = {
  positive: 'tone-positive',
  neutral: 'tone-neutral',
  concerning: 'tone-concerning',
};

function FeedItem({ item, t }: { item: BriefingItem; t: Translations }) {
  const date = new Date(item.published_at);
  const diffH = Math.floor((Date.now() - date.getTime()) / 3600000);
  const timeStr =
    diffH < 1
      ? t.timeJustNow
      : diffH < 24
      ? t.timeHoursAgo(diffH)
      : t.timeYesterday(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  return (
    <article className={`feed-item feed-item--${item.tone}`}>
      <div className="feed-item-meta">
        <span className="category">{item.category}</span>
        <span className={`tone-badge ${TONE_CLASS[item.tone]}`}>
          {t.toneLabels[item.tone]}
        </span>
        <span className="published-at">{timeStr}</span>
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
        <FeedItem key={i} item={item} t={t} />
      ))}
    </section>
  );
}
