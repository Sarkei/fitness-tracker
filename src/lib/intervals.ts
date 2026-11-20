/**
 * Intervals.icu-Anbindung: Garmin-Daten fuer den Coach.
 *
 * Auth: HTTP-Basic mit Benutzername "API_KEY" und dem persoenlichen API-Key
 * (https://intervals.icu/settings, Abschnitt "Developer Settings").
 * Athleten-ID darf "0" sein - dann nimmt die API den Athleten des Keys.
 *
 * Wichtig (Stand Intervals.icu-Doku): Strava-Daten sind ueber die API nicht
 * verfuegbar, Garmin-Daten sind es aktuell. Faellt der Garmin-Zugang weg, meldet
 * die API das ueber einen Fehler - das wird hier als Hinweis weitergereicht.
 *
 * Alles laeuft ueber einen kleinen Cache in profile_extras, damit der Coach
 * nicht bei jeder Frage 5 API-Aufrufe macht (Intervals hat Rate-Limits).
 */

export type IntervalsSettings = {
  /** API-Key im Klartext - liegt nur in profile_extras des Nutzers. */
  apiKey?: string;
  /** Athleten-ID, z. B. "i12345" oder "0" fuer "der eigene Athlet". */
  athleteId?: string;
  /** Zuletzt erfolgreich verbunden. */
  connectedAt?: string;
  /** Anzeigename des Athleten bei Intervals.icu. */
  athleteName?: string;
  /** Letzter Fehler beim Verbinden/Syncen. */
  lastError?: string;
  /** Cache der zuletzt geholten Daten. */
  cache?: IntervalsCache;
};

export type IntervalsActivity = {
  id: string;
  name?: string;
  type?: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  avg_hr?: number;
  max_hr?: number;
  total_elevation_gain?: number;
  icu_training_load?: number;
  icu_intensity?: number;
  calories?: number;
  average_speed?: number;
  icu_average_watts?: number;
};

export type IntervalsWellnessDay = {
  date: string;
  ctl?: number;
  atl?: number;
  tsb?: number;
  restingHr?: number;
  hrv?: number;
  weight?: number;
  sleepSecs?: number;
  rampRate?: number;
};

export type IntervalsCache = {
  fetchedAt: string;
  athlete?: {
    name?: string;
    weight?: number;
    max_hr?: number;
    resting_hr?: number;
    lthr?: number;
    ftp?: number;
    sex?: string;
    birthday?: string;
  };
  activities: IntervalsActivity[];
  wellness: IntervalsWellnessDay[];
};

const BASE = 'https://intervals.icu/api/v1';

function authHeader(apiKey: string): string {
  // Basic Auth: Benutzername ist immer "API_KEY", Passwort der Key.
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString('base64')}`;
}

async function call<T>(path: string, apiKey: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: authHeader(apiKey), Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error('API-Key wurde von Intervals.icu abgelehnt (401).');
    if (res.status === 403) throw new Error('Zugriff verweigert (403) - Key pruefen oder neu erzeugen.');
    if (res.status === 404) throw new Error('Athlet nicht gefunden (404) - Athleten-ID pruefen.');
    if (res.status === 429) throw new Error('Intervals.icu begrenzt die Anfragen (429). Spaeter erneut versuchen.');
    if (!res.ok) throw new Error(`Intervals.icu antwortete mit HTTP ${res.status}.`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Prueft den Key und liefert den Athleten-Stammdatensatz. */
export async function fetchAthlete(
  apiKey: string,
  athleteId: string,
): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>(`/athlete/${encodeURIComponent(athleteId || '0')}`, apiKey);
}

/** Holt Aktivitaeten, Wellness/Fitness und Stammdaten und verdichtet sie fuer den Coach. */
export async function syncIntervals(
  apiKey: string,
  athleteId: string,
  days = 30,
): Promise<IntervalsCache> {
  const newest = new Date();
  const oldest = new Date();
  oldest.setDate(newest.getDate() - days);
  const range = `oldest=${ymd(oldest)}&newest=${ymd(newest)}`;
  const athletePath = encodeURIComponent(athleteId || '0');

  const [athleteRaw, activitiesRaw, wellnessRaw] = await Promise.all([
    call<Record<string, unknown>>(`/athlete/${athletePath}`, apiKey),
    call<IntervalsActivity[]>(`/athlete/${athletePath}/activities?${range}`, apiKey),
    call<Array<Record<string, unknown>>>(`/athlete/${athletePath}/wellness.json?${range}`, apiKey).catch(
      () => [] as Array<Record<string, unknown>>,
    ),
  ]);

  const activities = (Array.isArray(activitiesRaw) ? activitiesRaw : [])
    .map((a) => ({
      id: String(a.id ?? ''),
      name: a.name,
      type: a.type,
      start_date_local: a.start_date_local,
      distance: a.distance,
      moving_time: a.moving_time,
      elapsed_time: a.elapsed_time,
      avg_hr: a.avg_hr,
      max_hr: a.max_hr,
      total_elevation_gain: a.total_elevation_gain,
      icu_training_load: a.icu_training_load,
      icu_intensity: a.icu_intensity,
      calories: a.calories,
      average_speed: a.average_speed,
      icu_average_watts: a.icu_average_watts,
    }))
    .sort((a, b) => String(b.start_date_local ?? '').localeCompare(String(a.start_date_local ?? '')));

  const wellness = (Array.isArray(wellnessRaw) ? wellnessRaw : [])
    .map((w) => ({
      date: String(w.id ?? ''),
      ctl: numOrUndef(w.ctl),
      atl: numOrUndef(w.atl),
      tsb: numOrUndef(w.ctl) != null && numOrUndef(w.atl) != null
        ? Number((Number(w.ctl) - Number(w.atl)).toFixed(1))
        : undefined,
      restingHr: numOrUndef(w.restingHR),
      hrv: numOrUndef(w.hrv),
      weight: numOrUndef(w.weight),
      sleepSecs: numOrUndef(w.sleepSecs),
      rampRate: numOrUndef(w.rampRate),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    fetchedAt: new Date().toISOString(),
    athlete: {
      name: typeof athleteRaw.name === 'string' ? athleteRaw.name : undefined,
      weight: numOrUndef(athleteRaw.weight),
      max_hr: numOrUndef(athleteRaw.max_hr),
      resting_hr: numOrUndef(athleteRaw.resting_hr),
      lthr: numOrUndef(athleteRaw.lthr),
      ftp: numOrUndef(athleteRaw.ftp),
      sex: typeof athleteRaw.sex === 'string' ? athleteRaw.sex : undefined,
      birthday:
        typeof athleteRaw.birthday === 'string'
          ? athleteRaw.birthday
          : athleteRaw.birthday
            ? String(athleteRaw.birthday).slice(0, 10)
            : undefined,
    },
    activities: activities.slice(0, 60),
    wellness: wellness.slice(-60),
  };
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Kurzer Textblock fuer den Coach-Prompt. Leerer String, wenn nichts verbunden ist. */
export function buildIntervalsContext(settings: IntervalsSettings | undefined): string {
  if (!settings?.apiKey || !settings.cache) return '';
  const { cache } = settings;
  const a = cache.athlete ?? {};

  const dauer = (s?: number) => (s ? `${Math.round(s / 60)} min` : '-');
  const km = (m?: number) => (m ? `${(m / 1000).toFixed(1)} km` : '-');

  const akt = cache.activities.slice(0, 20).map((x) => {
    const tag = String(x.start_date_local ?? '').slice(0, 10);
    const teile = [
      `${tag}: ${x.type ?? 'Aktivitaet'}${x.name ? ` "${x.name}"` : ''}`,
      `Dauer ${dauer(x.moving_time)}`,
      `Distanz ${km(x.distance)}`,
      x.avg_hr ? `HF Ø ${Math.round(x.avg_hr)}` : null,
      x.icu_training_load ? `Load ${Math.round(x.icu_training_load)}` : null,
      x.calories ? `${Math.round(x.calories)} kcal` : null,
    ].filter(Boolean);
    return `- ${teile.join(', ')}`;
  });

  const letzte = cache.wellness.slice(-14).map(
    (w) =>
      `- ${w.date}: CTL ${w.ctl ?? '-'}, ATL ${w.atl ?? '-'}, TSB ${w.tsb ?? '-'}` +
      (w.restingHr ? `, Ruhepuls ${Math.round(w.restingHr)}` : '') +
      (w.hrv ? `, HRV ${Math.round(w.hrv)}` : '') +
      (w.weight ? `, Gewicht ${w.weight}` : ''),
  );

  return [
    '=== GARMIN / INTERVALS.ICU (automatisch synchronisiert) ===',
    `Athlet: ${a.name ?? '-'} | Gewicht ${a.weight ?? '-'} kg | Max-HF ${a.max_hr ?? '-'} | Ruhe-HF ${a.resting_hr ?? '-'} | FTP ${a.ftp ?? '-'}`,
    `Stand: ${cache.fetchedAt.slice(0, 16).replace('T', ' ')}`,
    '',
    'Aktivitaeten (neueste zuerst):',
    akt.length ? akt.join('\n') : 'keine',
    '',
    'Fitness/Form (CTL = Fitness, ATL = Ermuedung, TSB = Form):',
    letzte.length ? letzte.join('\n') : 'keine',
  ].join('\n');
}
