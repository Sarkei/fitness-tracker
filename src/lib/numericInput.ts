/** Nur Ziffern (z. B. Wiederholungen, Watt). */
export function normalizeIntegerInput(raw: string, maxLen = 6): string {
  return raw.replace(/\D/g, '').slice(0, maxLen);
}

/** Ziffern mit höchstens einem Dezimaltrenner (Komma oder Punkt). */
export function normalizeDecimalInput(raw: string, maxLen = 8): string {
  let s = raw.replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const dot = s.indexOf('.');
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  }
  return s.slice(0, maxLen);
}
