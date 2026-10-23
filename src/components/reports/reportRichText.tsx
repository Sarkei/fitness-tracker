import { Fragment, type ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

const NUMBER_UNIT =
  /\d[\d.,]*(?:\s*(?:kg|kcal|g|min|h|%|\/100|Tage|tage|days|Sessions?|Schritte|steps|Wochen|weeks))?/gi;

function highlightNumbers(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  NUMBER_UNIT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMBER_UNIT.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<Fragment key={`${keyPrefix}-t-${i++}`}>{text.slice(last, m.index)}</Fragment>);
    }
    nodes.push(
      <span key={`${keyPrefix}-n-${i++}`} className="font-black text-brand tabular-nums">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-${i++}`}>{text.slice(last)}</Fragment>);
  }
  return nodes.length ? nodes : [text];
}

/** Rendert **fett**-Markdown und hebt Zahlen mit Einheiten hervor. */
export function ReportRichText({ text, className }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  const boldRe = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIdx = 0;

  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        ...highlightNumbers(text.slice(lastIndex, match.index), `p${partIdx++}`).map((n, j) => (
          <Fragment key={`pre-${partIdx}-${j}`}>{n}</Fragment>
        )),
      );
    }
    parts.push(
      <strong key={`b-${partIdx++}`} className="font-black text-[var(--text-primary)]">
        {highlightNumbers(match[1], `bold-${partIdx}`)}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      ...highlightNumbers(text.slice(lastIndex), `tail-${partIdx}`).map((n, j) => (
        <Fragment key={`tail-${partIdx}-${j}`}>{n}</Fragment>
      )),
    );
  }

  if (parts.length === 0) {
    return <span className={className}>{highlightNumbers(text, 'only')}</span>;
  }

  return <span className={className}>{parts}</span>;
}

export function ReportBullet({ children, accent = 'brand' }: { children: ReactNode; accent?: 'brand' | 'green' }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug text-[var(--text-primary)]">
      <span
        className={cn(
          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
          accent === 'green' ? 'bg-green-500' : 'bg-brand',
        )}
      />
      <span className="font-medium min-w-0">{children}</span>
    </li>
  );
}
