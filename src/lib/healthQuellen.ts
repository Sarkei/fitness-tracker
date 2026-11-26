/**
 * Handy-Health als zweite Datenquelle neben Garmin.
 *
 * Tims Vorgabe: Wenn beide verbunden sind, soll von jedem Feld immer der
 * AKTUELLERE Wert gelten — nicht pauschal Garmin und nicht pauschal das Handy.
 * Auf dem Handy heißt das Health Connect (Android) oder Apple Health (iOS);
 * beide liefern über eine Exporter-App JSON per Webhook.
 *
 * Dieses Modul ist absichtlich frei von Datenbank und Netz: Es liest nur eine
 * Nutzlast und gibt je Kalendertag (Europe/Berlin) die Felder aus, die darin
 * enthalten sind — jedes mit dem Zeitpunkt, bis zu dem es reicht. Der Vergleich
 * „wer ist neuer" passiert im Server, weil dort der gespeicherte Stand liegt.
 *
 * Zwei Formate werden verstanden:
 *
 *   1. Health Connect (Android, z. B. „HC Webhook"): snake_case-Arrays,
 *      z. B. `steps: [{count, start_time, end_time}]`.
 *   2. Apple Health (iOS, z. B. „Health Auto Export"): `data.metrics[]` mit
 *      `{name, units, data: [{qty, date}]}`.
 *
 * Der Parser ist tolerant: fehlende Felder, englische und deutsche Namen,
 * Zeitstempel als ISO-String oder Zahl. Was er nicht kennt, ignoriert er —
 * aber er meldet es zurück, damit man sieht, ob die Quelle überhaupt etwas
 * liefert.
 */

export type HealthQuelle = "healthconnect" | "applehealth" | "garmin";

/** Ein Tageswert, wie ihn eine Handy-Quelle liefert. */
export type TagesWerte = {
  /** Kalendertag in Europe/Berlin, `YYYY-MM-DD`. */
  date: string;
  /** Bis zu welchem Zeitpunkt (UTC) die Werte dieses Tages reichen. */
  stand: Date;
  /** Nur die Felder, die in der Nutzlast wirklich vorkamen. */
  werte: Partial<Record<HealthFeld, number>>;
};

/**
 * Felder, die sowohl Garmin als auch ein Handy liefern können.
 *
 * Genau diese Felder laufen durch den Frische-Vergleich. Alles andere
 * (Body Battery, Stress, Readiness, HRV-Status) bleibt Garmin-exklusiv — das
 * gibt Health Connect und Apple Health nicht heraus.
 */
export type HealthFeld =
  | "steps"
  | "distanceMeters"
  | "activeCalories"
  | "totalCalories"
  | "restingHr"
  | "minHr"
  | "maxHr"
  | "sleepSecs"
  | "deepSecs"
  | "lightSecs"
  | "remSecs"
  | "awakeSecs"
  | "spo2Avg"
  | "vo2max"
  | "weightKg"
  | "bodyFat";

export const HEALTH_FELDER: HealthFeld[] = [
  "steps",
  "distanceMeters",
  "activeCalories",
  "totalCalories",
  "restingHr",
  "minHr",
  "maxHr",
  "sleepSecs",
  "deepSecs",
  "lightSecs",
  "remSecs",
  "awakeSecs",
  "spo2Avg",
  "vo2max",
  "weightKg",
  "bodyFat",
];

/** Deutsche Anzeigenamen — die Oberfläche und der Bericht nutzen sie. */
export const HEALTH_FELD_LABEL: Record<HealthFeld, string> = {
  steps: "Schritte",
  distanceMeters: "Distanz",
  activeCalories: "Aktive Kalorien",
  totalCalories: "Gesamtkalorien",
  restingHr: "Ruhepuls",
  minHr: "Puls min",
  maxHr: "Puls max",
  sleepSecs: "Schlaf",
  deepSecs: "Tiefschlaf",
  lightSecs: "Leichtschlaf",
  remSecs: "REM-Schlaf",
  awakeSecs: "Wach im Bett",
  spo2Avg: "SpO₂",
  vo2max: "VO₂max",
  weightKg: "Gewicht",
  bodyFat: "Körperfett",
};

/**
 * Ab welchem Feld ein Wert als „vom Handy" gilt.
 *
 * Für Schritte und Kalorien ist der Handy-Wert wertvoll, weil er sofort da ist.
 * Für Schlafphasen ist Garmin deutlich besser (das Handy kennt oft nur Dauer).
 * Der Frische-Vergleich entscheidet das nicht — deshalb bleibt es hier bei
 * „wer neuer ist, gewinnt": Tim will genau das, ohne Sonderfälle.
 */

const TZ = "Europe/Berlin";

/** `YYYY-MM-DD` in Europe/Berlin. */
export function tagVon(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** Toleranter Zeitstempel-Parser: ISO, `YYYY-MM-DD HH:MM:SS`, Unix-Sekunden/-Millisekunden. */
export function zeit(wert: unknown): Date | null {
  if (wert == null) return null;
  if (wert instanceof Date) return Number.isNaN(wert.getTime()) ? null : wert;
  if (typeof wert === "number") {
    // Alles unter 1e11 sind Sekunden, darüber Millisekunden.
    const ms = wert < 1e11 ? wert * 1000 : wert;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof wert !== "string") return null;
  const s = wert.trim();
  if (!s) return null;
  /*
   * Health Connect schickt `2026-11-26T06:29:00Z`, Apple `2026-11-26 06:29:00 +0100`.
   * Beides versteht `Date` direkt — nur das Leerzeichen statt `T` braucht Hilfe.
   */
  const direkt = new Date(s);
  if (!Number.isNaN(direkt.getTime())) return direkt;
  const mitT = new Date(s.replace(" ", "T").replace(/\s+([+-]\d{2}:?\d{2})$/, "$1"));
  return Number.isNaN(mitT.getTime()) ? null : mitT;
}

function zahl(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert)) return wert;
  if (typeof wert === "string") {
    const n = Number(wert.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function objekt(wert: unknown): Record<string, unknown> | null {
  if (wert && typeof wert === "object" && !Array.isArray(wert)) {
    return wert as Record<string, unknown>;
  }
  return null;
}

function liste(wert: unknown): Record<string, unknown>[] {
  if (!Array.isArray(wert)) return [];
  return wert.map(objekt).filter((x): x is Record<string, unknown> => x !== null);
}

/** Sammelt Werte je Tag und Feld, inklusive des spätesten Zeitpunkts. */
class Sammler {
  private tage = new Map<string, { stand: Date; werte: Map<HealthFeld, number> }>();

  /**
   * Einen Messwert einsortieren.
   *
   * `modus` entscheidet, wie mehrere Werte desselben Tages zusammenlaufen:
   * Schritte addieren sich, Gewicht ist der letzte Stand, Puls minimum/maximum.
   */
  add(
    zeitpunkt: Date,
    feld: HealthFeld,
    wert: number,
    modus: "summe" | "letzter" | "min" | "max" | "mittel",
  ): void {
    if (!Number.isFinite(wert)) return;
    const tag = tagVon(zeitpunkt);
    let eintrag = this.tage.get(tag);
    if (!eintrag) {
      eintrag = { stand: zeitpunkt, werte: new Map() };
      this.tage.set(tag, eintrag);
    }
    if (zeitpunkt > eintrag.stand) eintrag.stand = zeitpunkt;

    const alt = eintrag.werte.get(feld);
    if (alt == null) {
      eintrag.werte.set(feld, wert);
      return;
    }
    switch (modus) {
      case "summe":
        eintrag.werte.set(feld, alt + wert);
        break;
      case "letzter":
        eintrag.werte.set(feld, wert);
        break;
      case "min":
        eintrag.werte.set(feld, Math.min(alt, wert));
        break;
      case "max":
        eintrag.werte.set(feld, Math.max(alt, wert));
        break;
      case "mittel":
        /* Ungewichtetes Mittel reicht hier: Herzfrequenz-Aggregate kommen
           ohnehin schon als Mittelwert an, nicht als Einzelmessungen. */
        eintrag.werte.set(feld, (alt + wert) / 2);
        break;
    }
  }

  ergebnis(): TagesWerte[] {
    return [...this.tage.entries()]
      .map(([date, e]) => ({
        date,
        stand: e.stand,
        werte: Object.fromEntries(e.werte) as Partial<Record<HealthFeld, number>>,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Einen kompletten Tag setzen — für Quellen, die Tageswerte schon fertig
   * liefern (`daily_totals` von Health Connect).
   *
   * Hier wird **nicht** summiert, sondern ersetzt: Der Wert gilt für den ganzen
   * Tag. Zuvor gesammelte Roh-Records desselben Tages werden verworfen, sonst
   * käme der Wert doppelt heraus.
   */
  setzeTag(date: string, stand: Date, werte: Partial<Record<HealthFeld, number | undefined>>): void {
    let eintrag = this.tage.get(date);
    if (!eintrag) {
      eintrag = { stand, werte: new Map() };
      this.tage.set(date, eintrag);
    }
    if (stand > eintrag.stand) eintrag.stand = stand;
    for (const [feld, wert] of Object.entries(werte) as [HealthFeld, number | undefined][]) {
      if (wert == null || !Number.isFinite(wert)) continue;
      eintrag.werte.set(feld, wert);
    }
  }
}

export type ParseErgebnis = {
  quelle: HealthQuelle;
  tage: TagesWerte[];
  /** Welche Felder in dieser Nutzlast überhaupt vorkamen. */
  felder: HealthFeld[];
  /** Schlüssel der Nutzlast, die nicht zugeordnet werden konnten (Diagnose). */
  unbekannt: string[];
  /**
   * Bekannte Health-Connect-Typen, für die die App keine Spalte hat
   * (Wasser, Blutdruck, Zyklus …). Kein Fehler — aber sichtbar.
   */
  nichtGespeichert?: string[];
  /**
   * Test-Ping der Exporter-App: prüft nur Adresse und Schlüssel, enthält keine
   * Daten. Der Empfänger antwortet „ok", speichert aber nichts.
   */
  test?: boolean;
};

/**
 * Alle Datentypen, die Health Connect kennt (Stand Android 14/15).
 *
 * Dient nur der Unterscheidung „bekannter Typ, den wir nicht speichern" von
 * „unbekannter Schlüssel, also anderes Format". Wird nicht geparst.
 */
const HEALTH_CONNECT_TYPEN = new Set([
  "steps", "distance", "speed", "active_calories", "total_calories",
  "floors_climbed", "elevation_gained", "exercise", "wheelchair_pushes",
  "power", "cadence", "activity_intensity",
  "heart_rate", "resting_heart_rate", "heart_rate_variability",
  "oxygen_saturation", "respiratory_rate", "body_temperature", "skin_temperature",
  "basal_body_temperature", "blood_pressure", "blood_glucose",
  "weight", "height", "body_fat", "lean_body_mass", "bone_mass",
  "body_water_mass", "basal_metabolic_rate", "vo2_max",
  "sleep", "hydration", "nutrition", "mindfulness",
  "menstruation_period", "menstruation_flow", "intermenstrual_bleeding",
  "ovulation_test", "cervical_mucus", "sexual_activity",
  "systolic", "diastolic",
]);

/**
 * Health Connect (Android).
 *
 * Aufbau laut „HC Webhook"-Schema: ein Objekt mit `timestamp` und je Datentyp
 * ein snake_case-Array. Zeitintervalle haben `start_time`/`end_time`,
 * Einzelwerte einen Zeitpunkt. Wir mitteln/summieren auf den Kalendertag.
 */
/**
 * Health Connect (Android).
 *
 * Versteht zwei Erzeuger-Formate:
 *
 * 1. „HC Webhook" (mcnaveen): snake_case-Arrays mit `count`/`calories`/`meters`,
 *    Schlaf mit `duration` in Sekunden.
 * 2. „Life Dashboard Companion" (owen282000, MIT, kostenlos über F-Droid):
 *    gleiche Arrays, aber Schlaf mit `duration_seconds`, VO₂max als
 *    `vo2_ml_per_min_per_kg`, dazu Aggregate mit `bucket_start`/`total` bzw.
 *    `avg`/`min`/`max` — und **`daily_totals`**, die Health Connect selbst
 *    dedupliziert hat.
 *
 * `daily_totals` hat Vorrang für Schritte, Distanz und Kalorien: Health Connect
 * rechnet dort überlappende Quellen zusammen, sodass ein Spaziergang, den
 * Telefon und Uhr beide aufgezeichnet haben, nur einmal zählt. Würde man
 * zusätzlich die Roh-Records summieren, käme der doppelte Wert heraus.
 */
export function parseHealthConnect(json: unknown): ParseErgebnis {
  const root = objekt(json);
  const s = new Sammler();
  const unbekannt: string[] = [];
  const gesehen = new Set<HealthFeld>();

  if (!root) return { quelle: "healthconnect", tage: [], felder: [], unbekannt: ["(kein Objekt)"] };

  /** Zeitintervall eines Datensatzes: Ende ist der maßgebliche Zeitpunkt. */
  const intervall = (e: Record<string, unknown>): { start: Date; ende: Date } | null => {
    const ende =
      zeit(e.end_time) ?? zeit(e.endTime) ?? zeit(e.bucket_end) ??
      zeit(e.time) ?? zeit(e.date) ?? null;
    const start = zeit(e.start_time) ?? zeit(e.startTime) ?? zeit(e.bucket_start) ?? ende;
    if (!ende) return null;
    return { start: start ?? ende, ende };
  };

  const markiere = (feld: HealthFeld) => gesehen.add(feld);

  /*
   * ── Tageswerte aus Health Connect (dedupliziert) ──
   *
   * Vorrang vor den Roh-Records. Der Stand ist der Zeitpunkt der Nutzlast:
   * `daily_totals` ist für den heutigen Tag ein laufender Gesamtwert, für
   * vergangene Tage ein abgeschlossener.
   */
  const nutzlastZeit = zeit(root.timestamp) ?? new Date();
  const tagesWerte = liste(root.daily_totals);
  for (const t of tagesWerte) {
    const tag = typeof t.date === "string" ? t.date.slice(0, 10) : null;
    if (!tag) continue;
    s.setzeTag(tag, nutzlastZeit, {
      steps: zahl(t.steps) ?? undefined,
      distanceMeters: zahl(t.distance_meters) ?? undefined,
      activeCalories: zahl(t.active_calories) ?? undefined,
      totalCalories: zahl(t.total_calories) ?? undefined,
    });
    if (zahl(t.steps) != null) markiere("steps");
    if (zahl(t.distance_meters) != null) markiere("distanceMeters");
    if (zahl(t.active_calories) != null) markiere("activeCalories");
    if (zahl(t.total_calories) != null) markiere("totalCalories");
  }
  const hatTagesWerte = tagesWerte.length > 0;

  /* ── Aktivität ── */
  if (!hatTagesWerte) {
    for (const e of liste(root.steps)) {
      const t = intervall(e);
      const n = zahl(e.count) ?? zahl(e.total) ?? zahl(e.steps);
      if (t && n != null) {
        s.add(t.ende, "steps", n, "summe");
        markiere("steps");
      }
    }
    for (const e of liste(root.distance)) {
      const t = intervall(e);
      const n = zahl(e.meters) ?? zahl(e.total) ?? zahl(e.distance_meters);
      if (t && n != null) {
        s.add(t.ende, "distanceMeters", n, "summe");
        markiere("distanceMeters");
      }
    }
    for (const e of liste(root.active_calories)) {
      const t = intervall(e);
      const n = zahl(e.calories) ?? zahl(e.total) ?? zahl(e.kcal);
      if (t && n != null) {
        s.add(t.ende, "activeCalories", n, "summe");
        markiere("activeCalories");
      }
    }
    for (const e of liste(root.total_calories)) {
      const t = intervall(e);
      const n = zahl(e.calories) ?? zahl(e.total) ?? zahl(e.kcal);
      if (t && n != null) {
        s.add(t.ende, "totalCalories", n, "summe");
        markiere("totalCalories");
      }
    }
  }

  /* ── Herz ── */
  for (const e of liste(root.resting_heart_rate)) {
    const t = zeit(e.time) ?? zeit(e.date) ?? zeit(e.bucket_end);
    const n = zahl(e.bpm) ?? zahl(e.avg);
    if (t && n != null) {
      s.add(t, "restingHr", n, "letzter");
      markiere("restingHr");
    }
  }
  for (const e of liste(root.heart_rate)) {
    const t = zeit(e.time) ?? zeit(e.date) ?? zeit(e.bucket_end);
    const agg = objekt(e.aggregate);
    if (!t) continue;
    /*
     * Allgemeine Herzfrequenz liefert NUR min/max. Der Ruhepuls hat einen
     * eigenen Datentyp (`resting_heart_rate`); ihn hier mit dem Tagesmittel zu
     * überschreiben wäre falsch — genau das hat der Selbsttest aufgedeckt
     * (64 → 70). Ruhepuls bleibt deshalb dem eigenen Typ vorbehalten.
     *
     * Life Dashboard schickt Aggregate direkt mit `min`/`max` auf der obersten
     * Ebene (`bucket_start` + `avg`/`min`/`max`), HC Webhook verschachtelt sie
     * unter `aggregate`. Beides wird gelesen.
     */
    const min = zahl(agg?.min) ?? zahl(e.min);
    const max = zahl(agg?.max) ?? zahl(e.max);
    if (min != null) {
      s.add(t, "minHr", min, "min");
      markiere("minHr");
    }
    if (max != null) {
      s.add(t, "maxHr", max, "max");
      markiere("maxHr");
    }
    if (min != null || max != null) continue;

    const probe = objekt(e.sample);
    const bpm = zahl(probe?.bpm) ?? zahl(e.bpm);
    if (bpm != null) {
      s.add(t, "minHr", bpm, "min");
      s.add(t, "maxHr", bpm, "max");
      markiere("minHr");
      markiere("maxHr");
    }
  }

  /* ── Schlaf ── */
  for (const e of liste(root.sleep)) {
    const ende = zeit(e.session_end_time) ?? zeit(e.end_time) ?? zeit(e.date);
    if (!ende) continue;
    /* `duration` (HC Webhook) und `duration_seconds` (Life Dashboard) — beide lesen. */
    const dauer = zahl(e.duration_seconds) ?? zahl(e.duration) ?? zahl(e.duration_secs);
    const phasen = liste(e.stages);
    if (dauer != null && dauer > 0) {
      s.add(ende, "sleepSecs", dauer, "summe");
      markiere("sleepSecs");
    }
    for (const p of phasen) {
      const name = String(p.stage ?? "").toLowerCase();
      const d = zahl(p.duration_seconds) ?? zahl(p.duration) ?? (() => {
        const a = zeit(p.start_time);
        const b = zeit(p.end_time);
        return a && b ? (b.getTime() - a.getTime()) / 1000 : null;
      })();
      if (d == null || d <= 0) continue;
      /* Health Connect benennt die Phasen: deep, light, rem, awake, asleep.
         Manche Apps schreiben deutsch (tief, leicht, traum, wach). */
      if (name.includes("deep") || name.includes("tief")) {
        s.add(ende, "deepSecs", d, "summe");
        markiere("deepSecs");
      } else if (name.includes("light") || name.includes("leicht")) {
        s.add(ende, "lightSecs", d, "summe");
        markiere("lightSecs");
      } else if (name.includes("rem") || name.includes("traum")) {
        s.add(ende, "remSecs", d, "summe");
        markiere("remSecs");
      } else if (name.includes("awake") || name.includes("wach")) {
        s.add(ende, "awakeSecs", d, "summe");
        markiere("awakeSecs");
      }
    }
  }

  /* ── Körper ── */
  for (const e of liste(root.weight)) {
    const t = zeit(e.time) ?? zeit(e.date);
    const n = zahl(e.kilograms) ?? zahl(e.kg);
    if (t && n != null) {
      s.add(t, "weightKg", n, "letzter");
      markiere("weightKg");
    }
  }
  for (const e of liste(root.body_fat)) {
    const t = zeit(e.time) ?? zeit(e.date);
    const n = zahl(e.percentage) ?? zahl(e.percent);
    if (t && n != null) {
      s.add(t, "bodyFat", n, "letzter");
      markiere("bodyFat");
    }
  }
  for (const e of liste(root.oxygen_saturation)) {
    const t = zeit(e.time) ?? zeit(e.date) ?? zeit(e.bucket_end);
    const agg = objekt(e.aggregate);
    const n =
      zahl(agg?.avg) ?? zahl(e.avg) ?? zahl(objekt(e.sample)?.percentage) ?? zahl(e.percentage);
    if (t && n != null) {
      s.add(t, "spo2Avg", n, "letzter");
      markiere("spo2Avg");
    }
  }
  for (const e of liste(root.vo2_max)) {
    const t = zeit(e.time) ?? zeit(e.date);
    const n =
      zahl(e.vo2_ml_per_min_per_kg) ?? zahl(e.ml_per_kg_per_min) ?? zahl(e.value) ?? zahl(e.avg);
    if (t && n != null) {
      s.add(t, "vo2max", n, "letzter");
      markiere("vo2max");
    }
  }

  /*
   * Zwei Arten von „kommt an, wird nicht gespeichert":
   *
   * - `nichtGespeichert`: bekannte Health-Connect-Typen, für die die App keine
   *   Spalte hat (Wasser, Blutdruck, Zyklus …). Kein Fehler, aber sichtbar —
   *   sonst wundert man sich, warum eine Größe nirgends auftaucht.
   * - `unbekannt`: Schlüssel, die zu keinem bekannten Typ gehören. Das ist der
   *   Hinweis auf ein neues App-Format.
   */
  const GESPEICHERT = new Set([
    "steps", "distance", "active_calories", "total_calories",
    "heart_rate", "resting_heart_rate", "sleep", "weight", "body_fat",
    "oxygen_saturation", "vo2_max", "daily_totals",
  ]);
  const RAHMEN = new Set([
    "timestamp", "timezone", "app_version", "source", "device", "sequence",
    "test", "message", "backfill", "window_start", "window_end", "window_complete",
    "deleted_records", "deletions_unavailable", "records_outside_window", "_diagnostics",
    "writeback", "_resolutions", "screen_time", "app_filter",
  ]);
  const nichtGespeichert: string[] = [];
  for (const schluessel of Object.keys(root)) {
    if (RAHMEN.has(schluessel) || GESPEICHERT.has(schluessel)) continue;
    if (!liste(root[schluessel]).length && !objekt(root[schluessel])) continue;
    /* Kennt die Health-Connect-Liste diesen Typ? Dann nur „nicht gespeichert". */
    if (HEALTH_CONNECT_TYPEN.has(schluessel)) nichtGespeichert.push(schluessel);
    else unbekannt.push(schluessel);
  }

  return {
    quelle: "healthconnect",
    tage: s.ergebnis(),
    felder: [...gesehen],
    unbekannt,
    nichtGespeichert,
    /* Test-Ping: Der Empfänger soll „ok" antworten, aber nichts speichern. */
    test: root.test === true,
  };
}

/**
 * Apple Health (iOS).
 *
 * Aufbau laut „Health Auto Export": `data.metrics[]`, je Eintrag `name`,
 * `units` und `data[]` mit `{qty, date}` (oder `Min`/`Avg`/`Max` für Puls).
 * Die Namen sind englisch und entsprechen Apples HealthKit-Bezeichnern.
 */
export function parseAppleHealth(json: unknown): ParseErgebnis {
  const root = objekt(json);
  const s = new Sammler();
  const unbekannt: string[] = [];
  const gesehen = new Set<HealthFeld>();

  const daten = objekt(root?.data) ?? root;
  const metriken = liste(daten?.metrics);
  if (!metriken.length) {
    return { quelle: "applehealth", tage: [], felder: [], unbekannt: ["(keine metrics)"] };
  }

  /** Metrikname → Feld und Rechenart. */
  const zuordnung = (name: string):
    | { feld: HealthFeld; modus: "summe" | "letzter" | "min" | "max" | "mittel" }
    | null => {
    const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (n.includes("stepcount") || n === "steps") return { feld: "steps", modus: "summe" };
    if (n.includes("walkingrunningdistance") || n.includes("distance")) {
      return { feld: "distanceMeters", modus: "summe" };
    }
    if (n.includes("activeenergy")) return { feld: "activeCalories", modus: "summe" };
    if (n.includes("basalenergy") || n.includes("totalenergy")) {
      return { feld: "totalCalories", modus: "summe" };
    }
    if (n.includes("restingheartrate")) return { feld: "restingHr", modus: "letzter" };
    if (n.includes("heartratevariability") || n === "hrv") return null;
    if (n.includes("heartrate")) return { feld: "restingHr", modus: "letzter" };
    if (n.includes("sleep")) return { feld: "sleepSecs", modus: "summe" };
    if (n.includes("oxygensaturation") || n.includes("spo2")) {
      return { feld: "spo2Avg", modus: "letzter" };
    }
    if (n.includes("vo2max")) return { feld: "vo2max", modus: "letzter" };
    if (n.includes("bodyweight") || n.includes("weight")) return { feld: "weightKg", modus: "letzter" };
    if (n.includes("bodyfat")) return { feld: "bodyFat", modus: "letzter" };
    if (n.includes("deep")) return { feld: "deepSecs", modus: "summe" };
    if (n.includes("rem")) return { feld: "remSecs", modus: "summe" };
    if (n.includes("core") || n.includes("light")) return { feld: "lightSecs", modus: "summe" };
    if (n.includes("awake")) return { feld: "awakeSecs", modus: "summe" };
    return null;
  };

  for (const m of metriken) {
    const name = String(m.name ?? "");
    const regel = zuordnung(name);
    const werte = liste(m.data);
    if (!regel) {
      if (werte.length) unbekannt.push(name);
      continue;
    }

    for (const w of werte) {
      const t = zeit(w.date) ?? zeit(w.startDate) ?? zeit(w.endDate);
      if (!t) continue;

      /*
       * Schlaf liefert Apple als eigene Metrik mit `inBed`/`asleep` oder als
       * Sekunden/Minuten. Bei `sleep`-Einträgen mit Phasennamen entscheidet
       * der Metrikname, sonst die Dauer.
       */
      if (regel.feld === "sleepSecs") {
        const dauer = zahl(w.qty) ?? zahl(w.value) ?? zahl(w.duration);
        if (dauer == null || dauer <= 0) continue;
        const einheit = String(m.units ?? w.units ?? "").toLowerCase();
        const sekunden =
          einheit.includes("min") ? dauer * 60 : einheit.includes("hr") || einheit.includes("hour")
            ? dauer * 3600
            : dauer;
        s.add(t, "sleepSecs", sekunden, "summe");
        gesehen.add("sleepSecs");
        continue;
      }

      /* Puls kommt als Min/Avg/Max-Objekt, alles andere als qty. */
      const min = zahl(w.Min);
      const max = zahl(w.Max);
      if (min != null && max != null) {
        s.add(t, "minHr", min, "min");
        s.add(t, "maxHr", max, "max");
        gesehen.add("minHr");
        gesehen.add("maxHr");
        /*
         * Kein Ruhepuls aus der allgemeinen Herzfrequenz: Der hat eine eigene
         * Metrik (`resting_heart_rate`). Das Tagesmittel hier einzutragen
         * würde ihn überschreiben — vom Selbsttest aufgedeckt (62 → 71).
         */
        continue;
      }

      const wert = zahl(w.qty) ?? zahl(w.value);
      if (wert == null) continue;
      s.add(t, regel.feld, wert, regel.modus);
      gesehen.add(regel.feld);
    }
  }

  return {
    quelle: "applehealth",
    tage: s.ergebnis(),
    felder: [...gesehen],
    unbekannt: [...new Set(unbekannt)],
  };
}

/**
 * Erkennt das Format und parst.
 *
 * Health Connect hat snake_case-Arrays direkt am Objekt (oder unter `data`),
 * Apple Health hat `metrics`. Beides wird geprüft, nicht geraten.
 */
export function parseHealthNutzlast(json: unknown): ParseErgebnis {
  const root = objekt(json);
  const daten = objekt(root?.data) ?? root;

  if (daten && Array.isArray(daten.metrics)) return parseAppleHealth(json);

  /*
   * Life Dashboard setzt `source: "health_connect"` und schickt `daily_totals`
   * auch dann, wenn sonst keine Reihe dabei ist. HC Webhook hat diesen Marker
   * nicht, dort erkennt man das Format an den Arrays.
   */
  if (typeof daten?.source === "string" && daten.source.toLowerCase().includes("health")) {
    return parseHealthConnect(json);
  }

  const hcSchluessel = [
    "steps", "sleep", "heart_rate", "resting_heart_rate", "weight",
    "active_calories", "total_calories", "distance", "oxygen_saturation",
    "daily_totals", "vo2_max", "body_fat",
  ];
  if (daten && hcSchluessel.some((k) => Array.isArray(daten[k]))) {
    return parseHealthConnect(json);
  }

  /* Auch ein reiner Test-Ping ist gültig und gehört zu Health Connect. */
  if (daten && daten.test === true) return parseHealthConnect(json);

  /* Unbekannt: beide Wege probieren und den ergiebigeren nehmen. */
  const a = parseAppleHealth(json);
  const b = parseHealthConnect(json);
  const nutzen = (e: ParseErgebnis) =>
    e.tage.reduce((n, t) => n + Object.keys(t.werte).length, 0);
  return nutzen(a) >= nutzen(b) ? a : b;
}
