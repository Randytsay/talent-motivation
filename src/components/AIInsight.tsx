import type { ReactNode } from 'react';

/**
 * AI text stays a plain string on the wire. The model may mark a short phrase
 * with our private delimiter, while the renderer keeps all content in React
 * text nodes so a response can never inject HTML into the report.
 */
export function AIHighlightedText({ text }: { text: string }) {
  const markerPattern = /【重點】([\s\S]*?)【\/重點】/g;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let markerCount = 0;
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(text)) !== null) {
    parts.push(text.slice(cursor, match.index));
    const highlighted = match[1]?.trim();
    if (highlighted) {
      parts.push(<strong className="ai-highlight" key={`ai-highlight-${markerCount}`}>{highlighted}</strong>);
      markerCount += 1;
    }
    cursor = match.index + match[0].length;
  }
  if (markerCount > 0) {
    parts.push(text.slice(cursor));
    return <>{parts}</>;
  }

  // Existing reports predate the marker instruction. Give their opening
  // clause a light lead treatment so old and new reports share the hierarchy.
  const value = text.replace(/【\/?重點】/g, '').trim();
  const sentenceEnd = value.search(/[。！？；]/);
  const clauseEnd = value.search(/[，：]/);
  const leadEnd = sentenceEnd >= 18 && sentenceEnd <= 54
    ? sentenceEnd + 1
    : clauseEnd >= 14 && clauseEnd <= 32
      ? clauseEnd + 1
      : 0;
  if (leadEnd > 0 && leadEnd < value.length) {
    return <><strong className="ai-highlight">{value.slice(0, leadEnd)}</strong>{value.slice(leadEnd)}</>;
  }
  return value;
}

export function AIInsightBlock({ label, value, tone }: { label: string; value: string | string[]; tone: string }) {
  const items = Array.isArray(value) ? value : null;
  return (
    <article className={`ai-insight ai-insight--${tone}`}>
      <h3>{label}</h3>
      {items ? (
        <ul className="ai-insight__list">
          {items.map((item, index) => <li key={`${label}-${index}`}><AIHighlightedText text={item} /></li>)}
        </ul>
      ) : (
        <p><AIHighlightedText text={typeof value === 'string' ? value : ''} /></p>
      )}
    </article>
  );
}
