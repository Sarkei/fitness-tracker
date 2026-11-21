/**
 * Trainingsplan <-> Garmin über Intervals.icu.
 *
 * Zwei Richtungen:
 *
 * 1. **Hin (Plan auf die Uhr):** Jede geplante Einheit wird als Workout im
 *    Intervals-Kalender angelegt. Intervals schiebt es zu Garmin Connect weiter,
 *    von dort auf die Uhr — dort lässt sich die Einheit starten.
 *    Voraussetzung: `icu_garmin_upload_workouts` muss true sein (siehe
 *    `aktiviereWorkoutUpload`).
 *
 * 2. **Zurück (Uhr nach Plan):** Eine hochgeladene Aktivität wird der passenden
 *    geplanten Einheit zugeordnet (`paired_event_id`). Dadurch erkennt die App,
 *    welche Einheit erledigt ist, statt nur "irgendein Lauf am Tag".
 *
 * Die Zuordnung passiert über Datum + Sportart, nicht über die Uhrzeit: Tim kann
 * die Einheit morgens oder abends machen, sie gehört trotzdem zum selben Tag.
 */

export type PlanEinheit = {
  /** Datum im Format YYYY-MM-DD (lokaler Tag). */
  datum: string;
  titel: string;
  /** Intervals-Sportart: Run, Ride, Swim, WeightTraining, Workout ... */
  sportart: string;
  /** Dauer in Sekunden. */
  sekunden?: number;
  /** Struktur als Text (wird im Kalender und auf der Uhr angezeigt). */
  beschreibung?: string;
  /** Strukturierte Schritte, falls vorhanden (Zirkel, Intervalle). */
  schritte?: Array<Record<string, unknown>>;
};

export type GeplantesEvent = {
  id: number;
  name?: string;
  type?: string;
  start_date_local?: string;
  category?: string;
  paired_activity_id?: number | null;
};

/** Bildet eine VRTX-Sportart auf die Intervals-Bezeichnung ab. */
export function intervalsSportart(sport: string | undefined | null): string {
  const s = String(sport ?? "").toLowerCase();
  if (s.includes("lauf") || s.includes("run") || s.includes("jog")) return "Run";
  if (s.includes("rad") || s.includes("bike") || s.includes("ride")) return "Ride";
  if (s.includes("schwimm") || s.includes("swim")) return "Swim";
  if (s.includes("kraft") || s.includes("weight") || s.includes("gym") || s.includes("zirkel")) {
    return "WeightTraining";
  }
  if (s.includes("hiit") || s.includes("intervall")) return "Workout";
  if (s.includes("gehen") || s.includes("walk")) return "Walk";
  return "Workout";
}

/**
 * Baut aus einer geplanten Einheit das JSON, das die Intervals-API erwartet.
 * Zirkel und HIIT bekommen strukturierte Schritte, damit die Uhr sie führt.
 */
export function alsIntervalsEvent(einheit: PlanEinheit): Record<string, unknown> {
  const start = `${einheit.datum}T00:00:00`;

  const steps: Array<Record<string, unknown>> = [];
  if (Array.isArray(einheit.schritte) && einheit.schritte.length > 0) {
    steps.push(...einheit.schritte);
  } else if (einheit.sekunden) {
    steps.push({ text: einheit.titel, duration: Math.round(einheit.sekunden) });
  }

  return {
    category: "WORKOUT",
    type: einheit.sportart,
    name: einheit.titel.slice(0, 120),
    start_date_local: start,
    ...(einheit.sekunden ? { moving_time: Math.round(einheit.sekunden) } : {}),
    ...(einheit.beschreibung ? { description: einheit.beschreibung } : {}),
    ...(steps.length > 0 ? { workout_doc: { steps } } : {}),
  };
}

/**
 * Ordnet eine Aktivität der passenden geplanten Einheit zu.
 *
 * Regeln, bewusst streng, damit nichts falsch zugeordnet wird:
 *  - gleicher Kalendertag
 *  - kompatible Sportart (Lauf zu Lauf, Rad zu Rad; Kraft deckt Zirkel/HIIT mit ab)
 *  - die Einheit ist noch nicht vergeben
 *
 * Liefert die Event-ID oder null.
 */
export function findePassendeEinheit(
  aktivitaet: { datum: string; sportart: string },
  events: GeplantesEvent[],
): number | null {
  const tag = aktivitaet.datum.slice(0, 10);
  const sport = intervalsSportart(aktivitaet.sportart);

  const kandidaten = events.filter((e) => {
    if (!e.start_date_local || String(e.start_date_local).slice(0, 10) !== tag) return false;
    if (e.category && e.category !== "WORKOUT") return false;
    if (e.paired_activity_id) return false; // schon vergeben
    return intervalsSportart(e.type) === sport;
  });

  if (kandidaten.length === 0) return null;
  // Bei mehreren: die erste (Kalender ist chronologisch sortiert)
  return kandidaten[0]?.id ?? null;
}

/** Aufgabe für die Seite, damit sie den Zustand anzeigen kann. */
export type SyncBericht = {
  angelegt: number;
  aktualisiert: number;
  geloescht: number;
  zugeordnet: number;
  fehler: string[];
};
