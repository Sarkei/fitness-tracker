/**
 * Dauer-Eingabe HH:MM — max. 4 Ziffern, Doppelpunkt nach den Stunden automatisch.
 * Beispiel: "01" → "01:", "0130" → "01:30"
 */

const MAX_DIGITS = 4;

export function digitsFromHhMm(value: string): string {
  return value.replace(/\D/g, '').slice(0, MAX_DIGITS);
}

export function formatHhMmFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (d.length === 0) return '';
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Normalisiert Roh-Eingabe (inkl. Paste) auf HH:MM mit höchstens 4 Ziffern. */
export function normalizeHhMmInput(raw: string): string {
  return formatHhMmFromDigits(digitsFromHhMm(raw));
}
