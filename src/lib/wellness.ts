/**
 * Daten aus Intervals.icu (Garmin, Polar, Suunto, Whoop ...) als eigene Ansicht.
 *
 * Was Intervals.icu aus den Quellen durchreicht (am echten Konto geprueft):
 *   Schlaf (sleepSecs, sleepScore, sleepQuality), Schritte, Etagen, HRV,
 *   Ruhepuls, Fitness/Form (CTL/ATL/TSB), Rampenrate, VO2max (sporadisch).
 *
 * Was NICHT kommt (Garmin gibt es nicht frei): Stress, Body Battery, SpO2, Readiness, Atemfrequenz -
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
  hrvStatus?: string | null;
  minHr?: number | null;
  maxHr?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  sleepQuality?: number | null;
  deepSecs?: number | null;
  lightSecs?: number | null;
  remSecs?: number | null;
  awakeSecs?: number | null;
  steps?: number | null;
  floors?: number | null;
  distanceMeters?: number | null;
  activeCalories?: number | null;
  totalCalories?: number | null;
  stress?: number | null;
  stressMax?: number | null;
  bodyBatteryMin?: number | null;
  bodyBatteryMax?: number | null;
  spo2?: number | null;
  respiration?: number | null;
  vo2max?: number | null;
  fitnessAge?: number | null;
  weight?: number | null;
  bodyFat?: number | null;
};

export type WellnessAktivitaet = {
  id: string;
  name?: string | null;
  type?: string | null;
  start_date_local?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  calories?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  average_speed?: number | null;
  total_elevation_gain?: number | null;
  icu_average_watts?: number | null;
  /* Zusatzfelder aus Garmin/Polar/Suunto ueber Intervals */
  average_cadence?: number | null;
  average_stride?: number | null;
  average_stance_time_percent?: number | null;
  gap?: number | null;
  trimp?: number | null;
  polarization_index?: number | null;
  icu_hr_zone_times?: number[] | null;
  icu_hr_zones?: number[] | null;
  icu_rpe?: number | null;
  feel?: number | null;
  average_temp?: number | null;
  icu_warmup_time?: number | null;
  icu_cooldown_time?: number | null;
  icu_efficiency_factor?: number | null;
  hr_load_type?: string | null;
  description?: string | null;
};

export type GarminDaten = {
  fetchedAt: string;
  tage: WellnessTag[];
  aktivitaeten: WellnessAktivitaet[];
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

/**
 * Wert von HEUTE — ohne Rückfall auf ältere Tage.
 *
 * `letzter()` sucht rückwärts den letzten vorhandenen Wert. Für die Tageslage ist
 * das falsch: fehlt der Wert heute, zeigt die Kachel sonst einen Tage alten Stand
 * und wirkt aktuell. Hier gibt es bewusst `null`, damit die Oberfläche „—" zeigt.
 */
export function heuteWert<T extends keyof WellnessTag>(tage: WellnessTag[], feld: T): number | null {
  if (!tage.length) return null;
  const heute = tage[tage.length - 1];
  const v = heute[feld];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Datum des jüngsten Tages im Bestand (YYYY-MM-DD). */
export function juengsterTag(tage: WellnessTag[]): string | null {
  return tage.length ? tage[tage.length - 1].date : null;
}

/**
 * Farbstufe einer Schlafbewertung: 3 = sehr gut (grün), 2 = gut, 1 = mäßig,
 * 0 = schlecht (rot), -1 = keine Daten. Damit lassen sich Tagesboxen einfärben,
 * ohne die Grenzen an mehreren Stellen zu pflegen.
 */
export function schlafStufe(score?: number | null): -1 | 0 | 1 | 2 | 3 {
  if (score == null || !Number.isFinite(score)) return -1;
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  if (score >= 40) return 1;
  return 0;
}

/** Tailwind-Klassen für eine Schlafstufe (Hintergrund + Text). */
export function schlafFarben(stufe: -1 | 0 | 1 | 2 | 3): { bg: string; text: string; rand: string } {
  switch (stufe) {
    case 3:
      return { bg: 'bg-[#15803d]/15', text: 'text-[#15803d]', rand: 'border-[#15803d]/40' };
    case 2:
      return { bg: 'bg-[#4d9f6b]/15', text: 'text-[#2f7d5a]', rand: 'border-[#4d9f6b]/40' };
    case 1:
      return { bg: 'bg-[#d98a2b]/15', text: 'text-[#a16207]', rand: 'border-[#d98a2b]/40' };
    case 0:
      return { bg: 'bg-[#dc5a4a]/15', text: 'text-[#b4453a]', rand: 'border-[#dc5a4a]/40' };
    default:
      return { bg: 'bg-[var(--border-muted)]/30', text: 'text-[var(--text-muted)]', rand: 'border-[var(--border-muted)]' };
  }
}

