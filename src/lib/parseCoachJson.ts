/** Entfernt übliche Markdown-Fences aus Modell-Antworten. */
export function stripMarkdownCodeFences(raw: string): string {
  let t = (raw || '').trim();
  if (!t.startsWith('```')) return t;
  t = t.replace(/^```[a-zA-Z0-9_-]*\s*/m, '');
  t = t.replace(/\s*```\s*$/m, '').trim();
  return t;
}

export function parseJsonLoose(raw: string): unknown {
  const stripped = stripMarkdownCodeFences(raw);
  return JSON.parse(stripped);
}
