import { Fragment } from 'react';

export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
      })}
    </>
  );
}

type LineKind = 'empty' | 'hr' | 'heading' | 'bullet' | 'numbered' | 'text';

function lineKind(line: string): LineKind {
  const t = line.trim();
  if (!t) return 'empty';
  if (/^-{3,}$/.test(t)) return 'hr';
  if (/^#{1,6}\s/.test(t)) return 'heading';
  if (/^[-*]\s/.test(t)) return 'bullet';
  if (/^\d+\.\s/.test(t)) return 'numbered';
  return 'text';
}

export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0, k = 0;

  while (i < lines.length) {
    const kind = lineKind(lines[i]);

    if (kind === 'empty') { i++; continue; }

    if (kind === 'hr') {
      blocks.push(<hr key={k++} className="chat-md-hr" />);
      i++; continue;
    }

    if (kind === 'heading') {
      const t = lines[i].trim();
      const level = t.match(/^(#{1,6})\s/)?.[1].length ?? 2;
      const text = t.replace(/^#{1,6}\s+/, '');
      const cls = level <= 2 ? 'chat-md-h2' : 'chat-md-h3';
      blocks.push(level <= 2
        ? <h2 key={k++} className={cls}>{renderInline(text)}</h2>
        : <h3 key={k++} className={cls}>{renderInline(text)}</h3>
      );
      i++; continue;
    }

    if (kind === 'bullet') {
      const items: string[] = [];
      while (i < lines.length && (lineKind(lines[i]) === 'bullet' || lineKind(lines[i]) === 'empty')) {
        if (lineKind(lines[i]) === 'bullet') items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push(<ul key={k++} className="chat-md-list">{items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>);
      continue;
    }

    if (kind === 'numbered') {
      const items: string[] = [];
      while (i < lines.length && (lineKind(lines[i]) === 'numbered' || lineKind(lines[i]) === 'empty')) {
        if (lineKind(lines[i]) === 'numbered') items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(<ol key={k++} className="chat-md-list">{items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>);
      continue;
    }

    const textLines: string[] = [];
    while (i < lines.length && lineKind(lines[i]) === 'text') { textLines.push(lines[i]); i++; }
    blocks.push(
      <p key={k++} className="chat-md-para">
        {textLines.map((ln, j) => (
          <Fragment key={j}>{j > 0 && <br />}{renderInline(ln)}</Fragment>
        ))}
      </p>
    );
  }

  return <>{blocks}</>;
}
