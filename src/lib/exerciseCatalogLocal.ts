/**
 * Lokaler Übungskatalog mit Videos, Schritten und Formhinweisen.
 *
 * Quelle: `harshvishu/free-exercise-db-with-videos` (MIT, 317 Übungen). Jede Übung
 * bringt Demo-Videos (männlich/weiblich), Poster, Schrittfolge, Formhinweise,
 * typische Fehler und Atmung mit. Die Datei liegt unter `src/data/exercises-de.json`.
 *
 * Zweck: Der Coach braucht keinen RapidAPI-Key mehr, um Übungen mit Erklärung und
 * Video zu liefern. Fehlt ExerciseDB, greift dieser Katalog; ist ExerciseDB
 * konfiguriert, bleibt es bei dessen größerem Bestand.
 */
import roh from '../data/exercises-de.json';

export type LokaleUebung = {
  id: string;
  name: string;
  aliases: string[];
  bodyPart: string;
  target: string;
  secondaryMuscles: string[];
  equipment: string;
  muscleGroup: string;
  difficulty: 'beginner' | 'intermediate' | 'expert' | string;
  compound: boolean;
  unilateral: boolean;
  shortDescription: string;
  instructions: string;
  steps: string[];
  formCues: string[];
  commonMistakes: string[];
  breathing: string;
  videos: { male?: string; female?: string };
  thumbnails: { male?: string; female?: string };
};

const ALLE: LokaleUebung[] = (Array.isArray(roh) ? roh : (roh as { exercises?: LokaleUebung[] }).exercises) ?? [];

/** Kleinschreibung ohne Akzente — für die Suche. */
function normal(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INDEX = ALLE.map((e) => ({
  eintrag: e,
  haystack: normal([e.name, ...(e.aliases ?? []), e.bodyPart, e.target, e.equipment].join(' ')),
}));

export const LOKALE_UEBUNGEN = ALLE;

/** Übung anhand ihres Namens (oder Alias) finden — tolerant bei Schreibweisen. */
export function findeLokaleUebung(name: string): LokaleUebung | null {
  const q = normal(name);
  if (!q) return null;
  const exakt = ALLE.find((e) => normal(e.name) === q);
  if (exakt) return exakt;
  const alias = ALLE.find((e) => (e.aliases ?? []).some((a) => normal(a) === q));
  if (alias) return alias;
  const teil = INDEX.find((i) => i.haystack.includes(q));
  return teil ? teil.eintrag : null;
}

/** Volltextsuche über Name, Alias, Körperregion, Zielmuskel und Gerät. */
export function sucheLokaleUebungen(query: string, limit = 20): LokaleUebung[] {
  const q = normal(query);
  if (!q) return ALLE.slice(0, limit);
  const woerter = q.split(' ').filter(Boolean);
  return INDEX.filter((i) => woerter.every((w) => i.haystack.includes(w)))
    .slice(0, limit)
    .map((i) => i.eintrag);
}

/** Deutsche Anzeigenamen für Körperregionen und Geräte (Katalog ist englisch). */
const BODY_DE: Record<string, string> = {
  back: 'Rücken',
  cardio: 'Ausdauer',
  chest: 'Brust',
  hips: 'Hüfte',
  'lower arms': 'Unterarme',
  'lower legs': 'Unterschenkel',
  neck: 'Nacken',
  shoulders: 'Schultern',
  'upper arms': 'Oberarme',
  'upper legs': 'Oberschenkel',
  waist: 'Rumpf',
};

const EQUIP_DE: Record<string, string> = {
  'body weight': 'Körpergewicht',
  barbell: 'Langhantel',
  'ez barbell': 'SZ-Stange',
  dumbbell: 'Kurzhantel',
  cable: 'Kabelzug',
  machine: 'Maschine',
  'leverage machine': 'Maschine',
  'smith machine': 'Smith-Maschine',
  band: 'Band',
  'resistance band': 'Band',
  kettlebell: 'Kettlebell',
  'stability ball': 'Gymnastikball',
  'medicine ball': 'Medizinball',
  rope: 'Seil',
  'body weight ': 'Körpergewicht',
  assisted: 'Unterstützt',
  weighted: 'Mit Zusatzgewicht',
};

export function bodyPartDeutsch(teil: string): string {
  return BODY_DE[String(teil || '').toLowerCase()] ?? teil;
}

export function equipmentDeutsch(equipment: string): string {
  return EQUIP_DE[String(equipment || '').toLowerCase()] ?? equipment;
}

/** Übung als Coach-Zeile: das, was das Modell im Prompt braucht. */
export function alsPromptZeile(e: LokaleUebung): string {
  const muskeln = [e.target, ...(e.secondaryMuscles ?? [])].filter(Boolean).slice(0, 4).join('/');
  return `- ${e.name} (${bodyPartDeutsch(e.bodyPart)} · ${equipmentDeutsch(e.equipment)} · ${e.difficulty})${
    muskeln ? ` → ${muskeln}` : ''
  }`;
}

/** Kurzer Katalog-Auszug für den Coach-Prompt (nach Körperregion gruppiert). */
export function katalogFuerPrompt(limitProBereich = 6): string {
  const nachBereich = new Map<string, LokaleUebung[]>();
  for (const e of ALLE) {
    const k = e.bodyPart || 'other';
    const liste = nachBereich.get(k) ?? [];
    if (liste.length < limitProBereich) liste.push(e);
    nachBereich.set(k, liste);
  }
  const zeilen: string[] = [];
  for (const [bereich, liste] of nachBereich) {
    zeilen.push(`${bodyPartDeutsch(bereich)}:`);
    for (const e of liste) zeilen.push(`  ${alsPromptZeile(e)}`);
  }
  return zeilen.join('\n');
}
