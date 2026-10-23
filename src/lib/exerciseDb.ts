/**
 * ExerciseDB (RapidAPI) — Normalisierung & Medien-URLs.
 * @see https://docs.ascendapi.com/api-reference/introduction
 */

import type { LibraryExercise, LibraryExerciseCategory, LibraryMuscleFilterId } from './exerciseLibrary';

export const EXERCISEDB_KEY_PREFIX = 'edb_';
export const EXERCISEDB_MEDIA_BASE = 'https://static.exercisedb.dev/media/';

export class ExerciseDbFetchError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'rate_limited' | 'unavailable' | 'network',
  ) {
    super(message);
    this.name = 'ExerciseDbFetchError';
  }
}

/** AscendAPI ExerciseDB V2 (Videos + Bilder) — Standard für neue Abos */
export const EXERCISEDB_ASCEND_V2_HOST = 'edb-with-videos-and-images-by-ascendapi.p.rapidapi.com';

/** AscendAPI ExerciseDB V1 (GIFs) */
export const EXERCISEDB_ASCEND_V1_HOST = 'edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com';

/** Legacy RapidAPI (justin / alte Pfade /exercises/…) */
export const EXERCISEDB_LEGACY_HOST = 'exercisedb.p.rapidapi.com';

export type ExerciseDbRaw = {
  id?: string;
  exerciseId?: string;
  name?: string;
  bodyPart?: string;
  bodyParts?: string[];
  target?: string;
  targetMuscles?: string[];
  equipment?: string;
  equipments?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  description?: string;
  overview?: string;
  difficulty?: string;
  category?: string;
  exerciseType?: string;
  exerciseTypes?: string[];
  gifUrl?: string;
  imageUrl?: string;
  imageUrls?: Record<string, string>;
  videoUrl?: string;
  videoUrls?: Record<string, string>;
  exerciseTips?: string[];
  variations?: string[];
  keywords?: string[];
  gender?: string;
};

const ENV_KEY_CANDIDATES = [
  "EXERCISEDB_RAPIDAPI_KEY",
  "EXERCISEDB_API_KEY",
  "EXERCISE_DB_RAPIDAPI_KEY",
  "RAPIDAPI_KEY",
  "RAPIDAPI_EXERCISEDB_KEY",
  "VITE_EXERCISEDB_RAPIDAPI_KEY",
] as const;

/** Wert aus process.env / .env bereinigen (Anführungszeichen, BOM, Leerzeichen). */
export function sanitizeEnvSecret(raw: string | undefined): string {
  if (raw == null) return "";
  let k = String(raw).trim();
  if (k.charCodeAt(0) === 0xfeff) k = k.slice(1).trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

function isPlaceholderKey(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.length < 10) return true;
  const exact = new Set([
    "none",
    "null",
    "undefined",
    "changeme",
    "replace_me",
    "api_key_here",
    "your_exercisedb_rapidapi_key",
    "your_rapidapi_key_here",
    "<apikey>",
    "xxx",
  ]);
  if (exact.has(v)) return true;
  if (/^your[_-]/.test(v) && v.length < 36) return true;
  if ((v.endsWith("_here") || v.includes("api_key_here")) && v.length < 36) return true;
  return false;
}

function normalizeApiKey(raw: string | undefined): string | undefined {
  const k = sanitizeEnvSecret(raw);
  if (!k || isPlaceholderKey(k)) return undefined;
  return k;
}

export type ExerciseDbKeySource = (typeof ENV_KEY_CANDIDATES)[number];

export function resolveExerciseDbKeyFromEnv(): {
  key: string | undefined;
  source: ExerciseDbKeySource | null;
} {
  for (const name of ENV_KEY_CANDIDATES) {
    const k = normalizeApiKey(process.env[name]);
    if (k) return { key: k, source: name };
  }
  return { key: undefined, source: null };
}

export function exerciseDbApiKey(): string | undefined {
  return resolveExerciseDbKeyFromEnv().key;
}

export function exerciseDbKeySource(): ExerciseDbKeySource | null {
  return resolveExerciseDbKeyFromEnv().source;
}

export function isExerciseDbConfigured(): boolean {
  return Boolean(exerciseDbApiKey());
}

export function exerciseDbHost(): string {
  return process.env.EXERCISEDB_RAPIDAPI_HOST?.trim() || EXERCISEDB_ASCEND_V2_HOST;
}

export function isLegacyExerciseDbHost(host = exerciseDbHost()): boolean {
  const h = host.trim().toLowerCase();
  return h === EXERCISEDB_LEGACY_HOST || h === 'exercisedb.p.rapidapi.com';
}

export function isAscendExerciseDbHost(host = exerciseDbHost()): boolean {
  const h = host.trim().toLowerCase();
  if (isLegacyExerciseDbHost(h)) return false;
  return h.includes('ascendapi') || h.startsWith('edb-with-');
}

/** Legacy-Pfad-Segment → AscendAPI bodyParts-Query (z. B. „Chest“) */
export function legacyBodyPartToAscendLabel(bodyPart: string): string {
  const key = bodyPart.trim().toLowerCase();
  const map: Record<string, string> = {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    'upper arms': 'Upper Arms',
    'lower arms': 'Lower Arms',
    'upper legs': 'Upper Legs',
    'lower legs': 'Lower Legs',
    legs: 'Legs',
    waist: 'Waist',
    cardio: 'Cardio',
    'full body': 'Full Body',
    neck: 'Neck',
  };
  if (map[key]) return map[key];
  return bodyPart
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** AscendAPI { success, data } → Rohdaten für mapExerciseDbToCatalog */
export function normalizeExerciseDbRaw(raw: ExerciseDbRaw): ExerciseDbRaw {
  const bodyPart =
    raw.bodyPart ||
    (Array.isArray(raw.bodyParts) && raw.bodyParts[0] ? raw.bodyParts[0] : undefined);
  const target =
    raw.target ||
    (Array.isArray(raw.targetMuscles) && raw.targetMuscles[0] ? raw.targetMuscles[0] : undefined);
  const equipment =
    raw.equipment ||
    (Array.isArray(raw.equipments) && raw.equipments.length
      ? raw.equipments.join(', ')
      : undefined);
  const exerciseType =
    raw.exerciseType ||
    (Array.isArray(raw.exerciseTypes) && raw.exerciseTypes[0] ? raw.exerciseTypes[0] : undefined);

  return {
    ...raw,
    id: raw.exerciseId || raw.id,
    bodyPart,
    target,
    equipment,
    exerciseType,
    category: raw.category || exerciseType,
    secondaryMuscles: raw.secondaryMuscles,
  };
}

function exerciseDbTestUrl(host: string): string {
  if (isLegacyExerciseDbHost(host)) {
    return `https://${host}/exercises/bodyPart/chest`;
  }
  return `https://${host}/api/v1/exercises/search?search=bench&limit=1`;
}

function authRejectedMessage(host: string): string {
  if (isLegacyExerciseDbHost(host)) {
    return (
      'Key von RapidAPI abgelehnt (401/403). Dein Abo ist vermutlich AscendAPI — setze in .env: ' +
      `EXERCISEDB_RAPIDAPI_HOST=${EXERCISEDB_ASCEND_V2_HOST}`
    );
  }
  return (
    'Key von RapidAPI abgelehnt (401/403). Prüfe im RapidAPI-Playground den exakten Wert von ' +
    'X-RapidAPI-Host und ob du dieses API-Produkt abonniert hast (AscendAPI ExerciseDB V2).'
  );
}

/** RapidAPI-Key testen (ohne gespeicherten Key aus .env). */
export async function testExerciseDbApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const k = normalizeApiKey(apiKey);
  if (!k) return { ok: false, error: "Ungültiger oder leerer Key" };
  const host = exerciseDbHost();
  try {
    const r = await fetch(exerciseDbTestUrl(host), {
      headers: {
        "X-RapidAPI-Key": k,
        "X-RapidAPI-Host": host,
        Accept: "application/json",
      },
    });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: authRejectedMessage(host) };
    }
    const text = await r.text();
    return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function toExerciseDbKey(id: string): string {
  const raw = id.replace(/^edb_/, '').trim();
  return `${EXERCISEDB_KEY_PREFIX}${raw}`;
}

export function parseExerciseDbKey(key: string): string | null {
  if (!key.startsWith(EXERCISEDB_KEY_PREFIX)) return null;
  const id = key.slice(EXERCISEDB_KEY_PREFIX.length).trim();
  return id.length >= 3 ? id : null;
}

export function isExerciseDbCatalogKey(key: string): boolean {
  return key.startsWith(EXERCISEDB_KEY_PREFIX);
}

function resolveMediaUrl(path?: string | null): string | undefined {
  if (!path || !String(path).trim()) return undefined;
  const p = String(path).trim();
  if (p === 'null' || p === 'undefined') return undefined;
  if (/^https?:\/\//i.test(p)) return p;
  const clean = p.replace(/^\//, '');
  return `${EXERCISEDB_MEDIA_BASE}${clean}`;
}

/** AscendAPI: `imageUrls` / `videoUrls` mit Auflösungs-Keys (360p–1080p). */
function pickBestResolutionUrl(
  urls?: Record<string, string | undefined> | null,
  order: string[] = ['720p', '1080p', '480p', '360p'],
): string | undefined {
  if (!urls || typeof urls !== 'object') return undefined;
  for (const key of order) {
    const hit = resolveMediaUrl(urls[key]);
    if (hit) return hit;
  }
  for (const v of Object.values(urls)) {
    const hit = resolveMediaUrl(v);
    if (hit) return hit;
  }
  return undefined;
}

/** Map RapidAPI bodyPart → App muscle filter ids */
const BODY_PART_TO_TAGS: Record<string, LibraryMuscleFilterId[]> = {
  chest: ['brust'],
  back: ['rücken'],
  shoulders: ['schulter'],
  'upper arms': ['arme'],
  'lower arms': ['arme'],
  'upper legs': ['beine'],
  'lower legs': ['beine'],
  legs: ['beine'],
  waist: ['core'],
  cardio: ['cardio_art'],
  'full body': ['ganzkörper'],
};

function categoryFromRaw(raw: ExerciseDbRaw): LibraryExerciseCategory {
  const cat = `${raw.category || ''} ${raw.exerciseType || ''}`.toLowerCase();
  if (cat.includes('cardio') || cat.includes('plyometric') && raw.bodyPart?.toLowerCase() === 'cardio') {
    return 'cardio';
  }
  if (/\b(run|bike|swim|row|cardio|endurance|aerobic)\b/i.test(`${raw.name} ${raw.target}`)) {
    return 'cardio';
  }
  return 'strength';
}

function tagsFromRaw(raw: ExerciseDbRaw): string[] {
  const tags = new Set<string>();
  const partNames: string[] = [];
  if (Array.isArray(raw.bodyParts)) {
    for (const p of raw.bodyParts) {
      const s = String(p || '').toLowerCase().trim();
      if (s) partNames.push(s);
    }
  }
  const bpSingle = (raw.bodyPart || '').toLowerCase().trim();
  if (bpSingle) partNames.push(bpSingle);
  for (const bp of partNames) {
    for (const t of BODY_PART_TO_TAGS[bp] || []) tags.add(t);
  }
  const target = (raw.target || '').toLowerCase();
  if (/quad|glute|hamstring|calve|leg|hip/.test(target)) tags.add('beine');
  if (/pectoral|chest/.test(target)) tags.add('brust');
  if (/lat|trap|back|rhomb/.test(target)) tags.add('rücken');
  if (/delt|shoulder/.test(target)) tags.add('schulter');
  if (/bicep|tricep|forearm|arm/.test(target)) tags.add('arme');
  if (/ab|oblique|core|waist/.test(target)) tags.add('core');
  if (categoryFromRaw(raw) === 'cardio') tags.add('cardio_art');
  return [...tags];
}

export function mapExerciseDbToCatalog(raw: ExerciseDbRaw): LibraryExercise | null {
  const norm = normalizeExerciseDbRaw(raw);
  const id = String(norm.exerciseId || norm.id || '').trim();
  const name = String(norm.name || '').trim();
  if (!id || !name) return null;

  const imageUrl =
    resolveMediaUrl(norm.imageUrl) || pickBestResolutionUrl(norm.imageUrls);
  const videoUrl =
    resolveMediaUrl(norm.videoUrl) || pickBestResolutionUrl(norm.videoUrls);
  const gifUrl = resolveMediaUrl(norm.gifUrl) || imageUrl;

  return {
    key: toExerciseDbKey(id),
    exerciseId: id,
    name,
    category: categoryFromRaw(norm),
    tags: tagsFromRaw(norm),
    gifUrl,
    imageUrl,
    videoUrl,
    bodyPart: norm.bodyPart,
    targetMuscle: norm.target,
    equipment: norm.equipment,
    secondaryMuscles: norm.secondaryMuscles,
    instructions: norm.instructions,
    overview: norm.overview || norm.description,
    exerciseTips: norm.exerciseTips,
    variations: norm.variations,
    difficulty: norm.difficulty,
    source: 'exercisedb',
  };
}

/**
 * App-Muskelchip → eine oder mehrere ExerciseDB/Ascend-Körperregionen.
 * Beine/Arme sind bei AscendAPI in Ober-/Unterbereiche getrennt.
 */
export function muscleFilterToBodyParts(muscle: LibraryMuscleFilterId): string[] {
  switch (muscle) {
    case 'brust':
      return ['chest'];
    case 'rücken':
      return ['back'];
    case 'schulter':
      return ['shoulders'];
    case 'beine':
      return ['upper legs', 'lower legs'];
    case 'arme':
      return ['upper arms', 'lower arms'];
    case 'core':
      return ['waist'];
    case 'ganzkörper':
      return ['full body'];
    case 'cardio_art':
      return ['cardio'];
    default:
      return [];
  }
}

/** Erstes Segment — Legacy-Einzelabruf */
export function muscleFilterToBodyPart(muscle: LibraryMuscleFilterId): string | null {
  const parts = muscleFilterToBodyParts(muscle);
  return parts[0] ?? null;
}

export function pickGenderMedia(
  item: LibraryExercise,
  gender?: 'male' | 'female' | 'other',
): { gifUrl?: string; imageUrl?: string; videoUrl?: string } {
  void gender;
  return {
    gifUrl: item.gifUrl,
    imageUrl: item.imageUrl,
    videoUrl: item.videoUrl,
  };
}
