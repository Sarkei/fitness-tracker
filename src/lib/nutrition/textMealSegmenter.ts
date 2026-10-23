const SIDE_WITH_MAIN =
  /\b(kroketten|pommes|reis|salat|nudeln|kartoffeln|gemüse|brot|beilage)\b/i;
const CONDIMENT_SIDE =
  /\b(senf|suesser?\s+senf|süße?m?\s+senf|ketchup|mayo|mayonnaise|sauce|sosse|soße|dressing|dip)\b/i;

const SPLIT_RE = /\s*(?:,| und | dazu | plus | sowie )\s*/i;

export function segmentMealText(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const parts = raw.split(SPLIT_RE).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const mit = part.match(/^(.+?)\s+mit\s+(.+)$/i);
    if (mit && (SIDE_WITH_MAIN.test(mit[2]) || CONDIMENT_SIDE.test(mit[2]))) {
      out.push(mit[1].trim(), mit[2].trim());
    } else {
      out.push(part);
    }
  }
  return out;
}
