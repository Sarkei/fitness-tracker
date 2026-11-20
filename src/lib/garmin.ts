/**
 * Garmin-/Intervals-Daten als eigene Ansicht.
 *
 * Was Intervals.icu aus Garmin durchreicht (am echten Konto geprueft):
 *   Schlaf (sleepSecs, sleepScore, sleepQuality), Schritte, Etagen, HRV,
 *   Ruhepuls, Fitness/Form (CTL/ATL/TSB), Rampenrate, VO2max (sporadisch).
 *
 * Was NICHT kommt: Stress, Body Battery, SpO2, Readiness, Atemfrequenz -
 * diese Felder sind in Intervals.icu dauerhaft leer. Das wird hier offen
 * benannt, statt eine leere Kachel zu zeigen.
 */

export type WellnessTag = {
  date: string;
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  rampRate?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  sleepQuality?: number | null;
  steps?: number | null;
  floors?: number | null;
  vo2max?: number | null;
  weight?: number | null;
};

export type GarminAktivitaet = {
  id: string;
  name?: string | null;
  type?: string | null;
  start_date_local?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  calories?: number | null;
  icu_training_load?: number | null;
  average_speed?: number | null;
  total_elevation_gain?: number | null;
};

export type GarminDaten = {
  fetchedAt: string;
  tage: WellnessTag[];
  aktivitaeten: GarminAktivitaet[];
  verfuegbar: {
    schlaf: boolean;
    schritte: boolean;
    etagen: boolean;
    hrv: boolean;
    ruhepuls: boolean;
    fitness: boolean;
  };
  nichtVerfuegbar: string[];
};

/** Nachtzeit in Stunden, auf eine Dezimale. */
export function schlafStunden(sekunden?: number | null): number | null {
  if (!sekunden || sekunden <= 0) return null;
  return Math.round((sekunden / 3600) * 10) / 10;
}

/** Form-Bewertung aus TSB (Trainingsstress-Bilanz). */
export function formLabel(tsb?: number | null): { text: string; tone: 'gut' | 'mittel' | 'schlecht' | 'leer' } {
  if (tsb == null || !Number.isFinite(tsb)) return { text: '—', tone: 'leer' };
  if (tsb >= 5) return { text: 'frisch', tone: 'gut' };
  if (tsb >= -10) return { text: 'ausgeglichen', tone: 'gut' };
  if (tsb >= -30) return { text: 'belastet', tone: 'mittel' };
  return { text: 'überlastet', tone: 'schlecht' };
}

/** Schlafscore in Klartext. */
export function schlafBewertung(score?: number | null): string {
  if (score == null) return '—';
  if (score >= 80) return 'sehr gut';
  if (score >= 60) return 'gut';
  if (score >= 40) return 'mäßig';
  return 'schlecht';
}

/** Durchschnitt ueber die nicht-leeren Werte einer Spalte. */
export function mittel(werte: Array<number | null | undefined>): number | null {
  const echte = werte.filter((w): w is number => typeof w === 'number' && Number.isFinite(w));
  if (echte.length === 0) return null;
  return echte.reduce((a, b) => a + b, 0) / echte.length;
}

/** Summe, aber nur wenn mindestens ein Wert existiert. */
export function summe(werte: Array<number | null | undefined>): number | null {
  const echte = werte.filter((w): w is number => typeof w === 'number' && Number.isFinite(w));
  if (echte.length === 0) return null;
  return echte.reduce((a, b) => a + b, 0);
}

/** Letzter nicht-leerer Wert einer Spalte (Tage aufsteigend sortiert). */
export function letzter<T extends keyof WellnessTag>(tage: WellnessTag[], feld: T): number | null {
  for (let i = tage.length - 1; i >= 0; i -= 1) {
    const v = tage[i][feld];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}
