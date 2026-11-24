/**
 * Auswertungen für die Heute-Seite: Fasten-Serie, Trainings-Serie und kcal-Bilanz.
 *
 * Bewusst hier statt in `analytics.ts`: diese drei hängen an der Heute-Ansicht
 * (Fastenplan, Tagesziele) und werden nur dort gebraucht.
 */
import { DAY_LABELS, type FoodEntry, type PlanWeek, type WorkoutEntry } from './simpleApi';
import { daysBetween, shiftYmdLocal, toYmd, workoutStreak } from './analytics';

export type Ymd = string;

const WOCHENTAG_KEYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Lokale Datumsarithmetik — kein Zeitzonen-Versatz über UTC. */
export function verschiebeTage(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Wochentagsschlüssel (Monday … Sunday) eines Datums — ohne UTC-Verschiebung. */
export function wochentagKey(ymd: Ymd): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return WOCHENTAG_KEYS[dt.getDay()];
}

export function wochentagKurz(ymd: Ymd): string {
  const key = wochentagKey(ymd) as keyof typeof DAY_LABELS;
  return String(DAY_LABELS[key] ?? '').slice(0, 2);
}

/** Ist für diesen Tag im Plan überhaupt eine Einheit vorgesehen? */
export function trainingGeplant(ymd: Ymd, planWochen: PlanWeek[]): boolean {
  if (!planWochen.length) return false;
  const woche = planWochen.find((w) => {
    if (!w.start_date) return false;
    return ymd >= w.start_date && ymd <= shiftYmdLocal(w.start_date, 6);
  });
  if (!woche) return false;
  const key = wochentagKey(ymd);
  const tag = (woche.schedule?.schedule ?? []).find((d) => d.day === key);
  return Boolean(tag && !tag.isRest);
}

/**
 * Trainings-Serie: an wie vielen Tagen in Folge wurde kein geplantes Training ausgelassen.
 *
 * Gezählt werden nur Tage, an denen der Plan eine Einheit vorsieht. Ruhetage und Tage
 * außerhalb des Plans unterbrechen die Serie nicht. Fehlt ein Plan, wird jeder Tag mit
 * Training gezählt (wie `workoutStreak`).
 */
export function trainingsSerie(
  workouts: WorkoutEntry[],
  planWochen: PlanWeek[],
  heute: Ymd = new Date().toISOString().slice(0, 10),
  /** Zeitraum der Gesamt-Auswertung in Tagen (Anzeige „absolviert/geplant"). */
  zeitraumTage = 30,
): { aktuell: number; laengste: number; geplant: number; absolviert: number } {
  const hatTraining = new Set(workouts.map((w) => toYmd(w.date)).filter(Boolean));

  /*
   * Ohne Plan gibt es keine "geplanten" Tage. Dann zaehlen nur die Trainingstage
   * im Anzeigezeitraum — vorher wurden ALLE Trainingstage aller Zeiten gezaehlt,
   * was zu "38/38 in 30 Tagen" fuehrte, obwohl 30 Tage hoechstens 30 Tage hat.
   */
  if (!planWochen.length) {
    const s = workoutStreak(workouts);
    const zeitraumStart = shiftYmdLocal(heute, -(zeitraumTage - 1));
    const imZeitraum = [...hatTraining].filter((tag) => tag >= zeitraumStart && tag <= heute).length;
    return {
      aktuell: s.aktuell,
      laengste: s.laengste,
      geplant: imZeitraum,
      absolviert: imZeitraum,
    };
  }

  const fruehesteWoche = [...planWochen]
    .map((w) => w.start_date)
    .filter(Boolean)
    .sort()[0];
  if (!fruehesteWoche) {
    return { aktuell: 0, laengste: 0, geplant: 0, absolviert: 0 };
  }

  // Rückwärts ab heute: nur geplante Tage zählen. Heute darf noch offen sein (offener
  // Tag bricht die Serie nicht ab), jeder vergangene geplante Tag ohne Training schon.
  let aktuell = 0;
  for (let i = 0; i < 400; i += 1) {
    const tag = shiftYmdLocal(heute, -i);
    if (tag < fruehesteWoche) break;
    if (!trainingGeplant(tag, planWochen)) continue;
    const absolviert = hatTraining.has(tag);
    if (absolviert) {
      aktuell += 1;
      continue;
    }
    if (tag === heute) continue; // heute steht noch aus
    break;
  }

  // Gesamtzahlen über den Anzeigezeitraum (nicht über den ganzen Plan — sonst steht
  // dort bei einem 18-Wochen-Plan „0/86", was nichts über den Alltag aussagt).
  const zeitraumStart = shiftYmdLocal(heute, -(zeitraumTage - 1));
  let geplantGesamt = 0;
  let absolviertGesamt = 0;
  for (let tag = fruehesteWoche; tag <= heute; tag = shiftYmdLocal(tag, 1)) {
    if (tag < zeitraumStart) continue;
    if (!trainingGeplant(tag, planWochen)) continue;
    geplantGesamt += 1;
    if (hatTraining.has(tag)) absolviertGesamt += 1;
  }

  // Längste Serie über den ganzen Planzeitraum.
  let laengste = 0;
  let lauf = 0;
  for (let tag = fruehesteWoche; tag <= heute; tag = shiftYmdLocal(tag, 1)) {
    if (!trainingGeplant(tag, planWochen)) continue;
    if (hatTraining.has(tag)) {
      lauf += 1;
      laengste = Math.max(laengste, lauf);
    } else if (tag !== heute) {
      lauf = 0;
    }
  }

  return { aktuell, laengste, geplant: geplantGesamt, absolviert: absolviertGesamt };
}

/**
 * Fasten-Serie: an wie vielen Tagen in Folge gefastet wurde.
 *
 * Der Fastenplan ist ein Tagesrhythmus — jeder Tag gilt als gefastet, solange ein Plan
 * aktiv ist. Die Serie beginnt an dem Tag, an dem der Plan zuletzt gesetzt wurde
 * (`profile.goals.fastingSince`), sonst ab dem Beginn des Zeitraums.
 */
export function fastenSerie(
  fastingSince: string | null | undefined,
  heute: Ymd = new Date().toISOString().slice(0, 10),
): { tage: number; seit: Ymd | null } {
  const seit = String(fastingSince ?? '').slice(0, 10);
  /*
   * Fehlt das Startdatum, ist die Serie unbekannt — nicht null.
   *
   * Tims Fall: Das Fasten war im Profil aktiviert (label 20:4, startTime 20:00),
   * aber `fastingSince` wurde nie geschrieben, weil die Karte zum Aktivieren
   * einen anderen Weg nimmt. Die Serie stand deshalb dauerhaft auf 0 Tagen.
   * Ohne Datum wird jetzt ab dem Beginn der Fastenzeit gerechnet (siehe Aufrufer)
   * — hier bleibt es bei 0, damit die Funktion ehrlich bleibt.
   */
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seit)) return { tage: 0, seit: null };
  const diff = daysBetween(seit, heute);
  if (diff < 0) return { tage: 0, seit };
  // Der Starttag zählt als Tag 1.
  return { tage: diff + 1, seit };
}

export type BilanzTag = {
  ymd: Ymd;
  /** Kalorien aus dem Essen. */
  kcal: number;
  /** Ziel des Tages (aus dem aktuellen Tagesziel). */
  ziel: number;
  /** Training geschätzt verbrannt (aus Dauer). */
  verbrannt: number;
  /** kcal − (Ziel + verbrannt): negativ = Defizit. */
  bilanz: number;
  /** Überhaupt etwas erfasst. */
  hatDaten: boolean;
  /**
   * Plausibel vollständig erfasst (mind. die Hälfte des Ziels).
   * Ein Tag mit einer einzelnen Mahlzeit ist kein Defizit von 1500 kcal, sondern
   * schlicht unvollständig — solche Tage dürfen den Durchschnitt nicht verzerren.
   */
  vollstaendig: boolean;
};

/** Kalorienbilanz je Tag: Gegessen gegen Ziel plus geschätzten Trainingsverbrauch. */
export function kcalBilanz(
  entries: FoodEntry[],
  workouts: WorkoutEntry[],
  ziel: number,
  tage = 14,
  heute: Ymd = new Date().toISOString().slice(0, 10),
  koerpergewichtKg?: number,
  /**
   * Zusätzlich verbrauchte Kalorien je Tag (z. B. Läufe von der Uhr).
   * Zählt nur für den heutigen Tag — Vergangenes wird nicht nachträglich aufgefüllt.
   */
  aktivKcalHeute = 0,
  /**
   * Garmin-Gesamtverbrauch je Tag (Grundumsatz + Aktivitaet) als ymd->kcal.
   *
   * Tims Vorgabe: Die Bilanz soll den echten Verbrauch der Uhr nutzen, nicht die
   * Schaetzung aus Trainingsminuten. Liegt ein Wert vor, gewinnt er.
   */
  garminKcalProTag?: Map<Ymd, number>,
): BilanzTag[] {
  // Grobe Schätzung: 7 kcal pro Minute Krafttraining bei ~80 kg, proportional zum Gewicht.
  const gewicht = koerpergewichtKg && koerpergewichtKg > 0 ? koerpergewichtKg : 80;
  const kcalProMinute = (7 * gewicht) / 80;

  const kcalMap = new Map<Ymd, number>();
  for (const e of entries) {
    const ymd = toYmd(e.date);
    if (!ymd) continue;
    kcalMap.set(ymd, (kcalMap.get(ymd) ?? 0) + (Number(e.calories) || 0));
  }

  const verbrauchtMap = new Map<Ymd, number>();
  for (const w of workouts) {
    const ymd = toYmd(w.date);
    if (!ymd) continue;
    const minuten = Number(w.duration) || 0;
    verbrauchtMap.set(ymd, (verbrauchtMap.get(ymd) ?? 0) + Math.round(minuten * kcalProMinute));
  }

  return Array.from({ length: tage }, (_, i) => {
    const ymd = shiftYmdLocal(heute, -(tage - 1 - i));
    const kcal = Math.round(kcalMap.get(ymd) ?? 0);
    // Aktivitäten von der Uhr zählen nur heute. Vergangene Tage bleiben so, wie sie
    // erfasst wurden — sonst würde die Historie rückwirkend aufgefüllt.
    const istHeute = ymd === heute;
    /*
     * Vorrang fuer den Garmin-Wert: Er enthaelt Grundumsatz und Aktivitaet und
     * waechst heute ueber den Tag mit. Nur wenn kein Garmin-Wert vorliegt, wird
     * wie bisher aus Trainingsminuten geschaetzt.
     */
    const garminWert = garminKcalProTag?.get(ymd);
    const verbrannt =
      garminWert != null && garminWert > 0
        ? Math.round(garminWert)
        : (verbrauchtMap.get(ymd) ?? 0) + (istHeute ? Math.round(aktivKcalHeute) : 0);
    return {
      ymd,
      kcal,
      ziel,
      verbrannt,
      bilanz: kcal - ziel - verbrannt,
      hatDaten: kcal > 0,
      vollstaendig: ziel > 0 && kcal >= ziel * 0.5,
    };
  });
}

/** Durchschnittliche Bilanz über die plausibel vollständig erfassten Tage. */
export function bilanzDurchschnitt(reihe: BilanzTag[]): number | null {
  const brauchbar = reihe.filter((t) => t.vollstaendig);
  if (!brauchbar.length) return null;
  return Math.round(brauchbar.reduce((s, t) => s + t.bilanz, 0) / brauchbar.length);
}

/** Zielrichtung aus dem Profil; bestimmt, welche Bilanz zielführend ist. */
export type ZielTyp = 'lose' | 'maintain' | 'gain';

/** Toleranz um die Nulllinie beim Halten. */
export const HALTEN_TOLERANZ_KCAL = 500;

/** Zieltyp aus den Profilzielen lesen — unbekannt heißt „halten". */
export function zielTypAusProfil(raw: unknown): ZielTyp {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'lose' || s === 'abnehmen') return 'lose';
  if (s === 'gain' || s === 'zunehmen') return 'gain';
  return 'maintain';
}

/**
 * Ist diese Bilanz zielführend?
 * abnehmen: negativ (Defizit) · halten: ±500 kcal · zunehmen: positiv (Überschuss).
 */
export function bilanzImZiel(bilanz: number, typ: ZielTyp): boolean {
  if (typ === 'lose') return bilanz < 0;
  if (typ === 'gain') return bilanz > 0;
  return Math.abs(bilanz) <= HALTEN_TOLERANZ_KCAL;
}

/**
 * Grenzen der grünen Zone in kcal (untere, obere), passend zum Zieltyp.
 * `null` heißt „nach unten offen".
 */
export function zielZone(typ: ZielTyp): { von: number | null; bis: number | null } {
  if (typ === 'lose') return { von: null, bis: 0 };
  if (typ === 'gain') return { von: 0, bis: null };
  return { von: -HALTEN_TOLERANZ_KCAL, bis: HALTEN_TOLERANZ_KCAL };
}
