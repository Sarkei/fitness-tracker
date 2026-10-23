/** Anzeigename: erstes Zeichen groß (deutsch). */
export function capitalizeFoodDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return t;
  return t.charAt(0).toLocaleUpperCase('de-DE') + t.slice(1);
}

const NON_FOOD_UTENSIL_RE =
  /^(ofenblech|backblech|backform|auflaufform|pfanne|bratpfanne|backpapier|alufolie|grillrost|dörrgitter)$/i;

/** Kein Lebensmittel — Küchenutensil / Hilfsmittel. */
export function isNonFoodUtensilName(name: string): boolean {
  return NON_FOOD_UTENSIL_RE.test(name.trim());
}
