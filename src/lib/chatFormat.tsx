/**
 * Minimaler Text-Formatter fuer Chat-Nachrichten (WhatsApp-Stil).
 *
 * Warum eigener Parser statt Markdown-Bibliothek: Der Chat braucht nur Fett,
 * Kursiv, Durchgestrichen und Code. Eine Abhaengigkeit (react-markdown + remark)
 * waere dafuer zu schwer, und rohes HTML wird bewusst nie interpretiert.
 *
 * Unterstuetzte Syntax:
 *   *fett*        oder **fett**
 *   _kursiv_      oder __kursiv__
 *   ~durchgestrichen~
 *   `code`
 *   Zeilen mit "- ", "* " oder "• " werden zur Aufzaehlung
 *   Leerzeilen trennen Absaetze
 */

import type { ReactNode } from 'react';

type Token =
  | { kind: 'bold' | 'italic' | 'strike' | 'code'; children: ReactNode[] }
  | { kind: 'text'; value: string };

const INLINE_PATTERNS: Array<{
  kind: 'bold' | 'italic' | 'strike' | 'code';
  re: RegExp;
}> = [
  // Code zuerst, damit Inhalt in Backticks nicht weiter formatiert wird.
  { kind: 'code', re: /`([^`\n]+)`/ },
  { kind: 'bold', re: /\*\*([^*\n]+)\*\*/ },
  { kind: 'bold', re: /\*([^*\n]+)\*/ },
  { kind: 'italic', re: /__([^_\n]+)__/ },
  { kind: 'italic', re: /_([^_\n]+)_/ },
  { kind: 'strike', re: /~([^~\n]+)~/ },
];

/** Zerlegt einen Textabschnitt in formatierte und unformatierte Stuecke. */
function parseInline(text: string, keyPrefix: string, depth = 0): ReactNode[] {
  if (depth > 6 || !text) return [text];

  let earliest: { index: number; length: number; kind: Token['kind']; inner: string } | null = null;
  for (const pattern of INLINE_PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    const index = match.index;
    if (earliest === null || index < earliest.index) {
      earliest = { index, length: match[0].length, kind: pattern.kind, inner: match[1] };
    }
  }

  if (!earliest) return [text];

  const before = text.slice(0, earliest.index);
  const after = text.slice(earliest.index + earliest.length);
  const children = parseInline(earliest.inner, `${keyPrefix}-${earliest.index}`, depth + 1);

  const nodes: ReactNode[] = [];
  if (before) nodes.push(before);
  nodes.push(renderToken(earliest.kind, children, `${keyPrefix}-${earliest.index}-${earliest.kind}`));
  nodes.push(...parseInline(after, `${keyPrefix}-after-${earliest.index}`, depth + 1));
  return nodes;
}

function renderToken(kind: Token['kind'], children: ReactNode[], key: string): ReactNode {
  switch (kind) {
    case 'bold':
      return (
        <strong key={key} className="font-semibold">
          {children}
        </strong>
      );
    case 'italic':
      return (
        <em key={key} className="italic">
          {children}
        </em>
      );
    case 'strike':
      return (
        <s key={key} className="line-through opacity-80">
          {children}
        </s>
      );
    case 'code':
      return (
        <code
          key={key}
          className="rounded bg-black/20 px-1 py-0.5 font-mono text-[0.92em] text-current"
        >
          {children}
        </code>
      );
    default:
      return <span key={key}>{children}</span>;
  }
}

const LIST_RE = /^\s*[-*•]\s+(.*)$/;

/**
 * Rendert eine Chat-Nachricht: Absaetze, Aufzaehlungen und Inline-Formatierung.
 * Gibt nie HTML aus, sondern nur React-Elemente.
 */
export function formatChatText(raw: string): ReactNode {
  const text = String(raw ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return null;

  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];
  let blockKey = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const content = paragraph.join('\n');
    blocks.push(
      <p key={`p-${blockKey++}`} className="whitespace-pre-wrap break-words">
        {parseInline(content, `p${blockKey}`)}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blockKey++}`} className="ml-4 list-disc space-y-1">
        {listItems.map((item, index) => (
          <li key={`li-${blockKey}-${index}`} className="break-words">
            {parseInline(item, `li${blockKey}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const listMatch = LIST_RE.exec(line);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}
