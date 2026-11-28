/**
 * Garmin-Login: Zugang über die Anmeldedaten (inoffiziell).
 *
 * Warum zusätzlich zur Personal API?
 *
 * Die offizielle Personal API ist auf 100 Anfragen pro Tag begrenzt und liefert
 * bestimmte Werte gar nicht (SpO₂ über Nacht, Atemfrequenz, Body-Battery-Extreme,
 * Schlafphasen, Training Readiness). Über den mobilen SSO-Ablauf — denselben, den
 * die Garmin-App nutzt — kommen diese Werte mit, und es gibt kein Tageslimit.
 *
 * Der offizielle Weg bleibt als Rückfallebene bestehen: Schlägt dieser Login fehl
 * (Passwort geändert, Garmin ändert den Ablauf, Rate-Limit), nutzt die App weiter
 * die Personal API.
 *
 * Sicherheit:
 *  - E-Mail und Passwort werden mit AES-256-GCM verschlüsselt gespeichert,
 *    Schlüssel aus JWT_SECRET abgeleitet. Klartext liegt nur im Speicher.
 *  - Die Tokens (nach dem Login) liegen ebenfalls verschlüsselt in der DB.
 *  - Ohne gültige Tokens wird nie automatisch neu angemeldet — sonst käme bei
 *    jedem Takt ein Login-Versuch und Garmin sperrt die IP.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { GarminClient, Garmin } from 'garminconnect-js';

/* ------------------------------------------------------------------ Krypto */

/** 32-Byte-Schlüssel aus JWT_SECRET ableiten (SHA-256). */
function schluessel(): Buffer {
  const geheim = String(process.env.JWT_SECRET ?? '');
  if (!geheim || geheim === 'vrtx-dev-secret-change-me') {
    throw new Error('JWT_SECRET fehlt — Zugangsdaten können nicht verschlüsselt werden.');
  }
  return createHash('sha256').update(`garmin-credentials:${geheim}`).digest();
}

/** Klartext verschlüsseln: iv:tag:inhalt (Base64). */
export function verschluesseln(klartext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', schluessel(), iv);
  const daten = Buffer.concat([c.update(klartext, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), daten.toString('base64')].join(':');
}

/** Entschlüsseln. Wirft bei falschem Schlüssel oder beschädigten Daten. */
export function entschluesseln(geheim: string): string {
  const [ivB, tagB, datenB] = String(geheim).split(':');
  if (!ivB || !tagB || !datenB) throw new Error('Verschlüsselte Daten unlesbar.');
  const d = createDecipheriv('aes-256-gcm', schluessel(), Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datenB, 'base64')), d.final()]).toString('utf8');
}

/* --------------------------------------------------------------- Zustand */

/**
 * Zwischenstand während einer 2FA-Anmeldung.
 *
 * Garmin verlangt bei aktiver Zwei-Faktor-Anmeldung einen Code. Der Ablauf wird
 * deshalb zweistufig: `login` liefert `mfa_required` plus einen Zustand, den
 * `resumeLogin` mit dem Code abschließt. Der Zustand lebt nur im Speicher und
 * verfällt nach zehn Minuten — er enthält keine Tokens, nur den offenen Vorgang.
 */
type OffeneMfa = { zustand: unknown; seit: number };
const mfaOffen = new Map<string, OffeneMfa>();
const MFA_GUELTIG_MS = 10 * 60_000;

function schluesselFuerMfa(userId: string | number): string {
  return String(userId);
}

/** Abgelaufene 2FA-Vorgänge aufräumen. */
function mfaAufraeumen() {
  const jetzt = Date.now();
  for (const [k, v] of mfaOffen) {
    if (jetzt - v.seit > MFA_GUELTIG_MS) mfaOffen.delete(k);
  }
}

export type LoginErgebnis =
  | { status: 'ok'; tokens: string }
  | { status: 'mfa'; hinweis: string }
  | { status: 'fehler'; meldung: string };

/**
 * Erster Schritt: mit E-Mail und Passwort anmelden.
 *
 * Gibt bei aktiver 2FA `mfa` zurück — dann muss `bestaetigeMfa` mit dem Code
 * folgen. Sonst kommen die Tokens, die verschlüsselt gespeichert werden.
 */
export async function anmelden(
  userId: string | number,
  email: string,
  passwort: string,
): Promise<LoginErgebnis> {
  mfaAufraeumen();
  const client = new GarminClient();

  try {
    const ergebnis = await client.login(email, passwort);

    // 2FA nötig: Zustand merken, Code vom Nutzer anfordern.
    if (ergebnis && typeof ergebnis === 'object' && 'state' in ergebnis && ergebnis.state === 'mfa_required') {
      mfaOffen.set(schluesselFuerMfa(userId), {
        zustand: (ergebnis as { mfaState: unknown }).mfaState as never,
        seit: Date.now(),
      });
      return {
        status: 'mfa',
        hinweis: 'Garmin verlangt einen Bestätigungscode. Code eingeben — er kommt per SMS oder aus der Authenticator-App.',
      };
    }

    const tokens = client.getTokens();
    if (!tokens) return { status: 'fehler', meldung: 'Garmin lieferte keine Tokens.' };
    return { status: 'ok', tokens: JSON.stringify(tokens) };
  } catch (e) {
    return { status: 'fehler', meldung: loginFehlerText(e) };
  }
}

/** Zweiter Schritt: 2FA-Code einsenden und Tokens holen. */
export async function bestaetigeMfa(
  userId: string | number,
  code: string,
): Promise<LoginErgebnis> {
  mfaAufraeumen();
  const offen = mfaOffen.get(schluesselFuerMfa(userId));
  if (!offen) {
    return {
      status: 'fehler',
      meldung: 'Der Anmeldevorgang ist abgelaufen. Bitte E-Mail und Passwort erneut eingeben.',
    };
  }

  const client = new GarminClient();
  try {
    await client.resumeLogin(offen.zustand as never, code.trim());
    mfaOffen.delete(schluesselFuerMfa(userId));
    const tokens = client.getTokens();
    if (!tokens) return { status: 'fehler', meldung: 'Garmin lieferte keine Tokens.' };
    return { status: 'ok', tokens: JSON.stringify(tokens) };
  } catch (e) {
    return { status: 'fehler', meldung: loginFehlerText(e) };
  }
}

/** Ob für diesen Nutzer gerade ein 2FA-Vorgang offen ist. */
export function mfaOffen_(userId: string | number): boolean {
  mfaAufraeumen();
  return mfaOffen.has(schluesselFuerMfa(userId));
}

/** Fehler in verständlichen Text übersetzen. */
function loginFehlerText(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  const text = e instanceof Error ? e.message : String(e);

  if (/rate.?limit/i.test(name) || /429/.test(text)) {
    return 'Garmin bremst die Anmeldung (zu viele Versuche). Bitte 15 Minuten warten und erneut versuchen.';
  }
  if (/auth/i.test(name) || /401|unauthor/i.test(text)) {
    return 'E-Mail oder Passwort stimmt nicht.';
  }
  return text.slice(0, 300) || 'Anmeldung fehlgeschlagen.';
}

/* ------------------------------------------------------------------ Daten */

/** Garmin-Client aus gespeicherten Tokens bauen. */
function clientAusTokens(tokensJson: string): GarminClient {
  const client = new GarminClient();
  client.setTokens(JSON.parse(tokensJson));
  return client;
}

/**
 * Pruefen, ob die Tokens noch gelten.
 *
 * Leichter Aufruf (Profil) — damit der Takt nicht bei abgelaufenen Tokens
 * endlos fehlschlaegt, ohne dass es jemand merkt.
 */
export async function tokensGueltig(tokensJson: string): Promise<boolean> {
  try {
    await clientAusTokens(tokensJson).connectapi('/userprofile-service/socialProfile');
    return true;
  } catch {
    return false;
  }
}

const zahl = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const sek = (v: unknown): number | undefined => {
  const n = zahl(v);
  return n != null && n > 0 ? Math.round(n) : undefined;
};

/** Alle Werte eines Tages. */
export type LoginTag = {
  date: string;
  /**
   * Bis wann Garmin für diesen Tag Daten hat (ISO-Zeitstempel aus
   * `wellnessEndTimeLocal`).
   *
   * Tims Beobachtung: „meine kcal werden seit heute früh nicht aktualisiert …
   * es steht noch auf 800 kcal aber ich bin mittlerweile bei 1450".
   * Die App zeigte als „Stand" den Abrufzeitpunkt — also wann WIR gefragt
   * haben, nicht wann Garmin zuletzt Daten hatte. Wenn die Uhr seit Stunden
   * nichts hochlädt, sieht das aus wie ein Fehler in der App, obwohl der
   * Abruf tadellos funktioniert.
   */
  datenBis?: string;
  sleepSecs?: number;
  sleepScore?: number;
  sleepQuality?: string;
  deepSecs?: number;
  lightSecs?: number;
  remSecs?: number;
  awakeSecs?: number;
  sleepStress?: number;
  sleepHr?: number;
  spo2Night?: number;
  respirationNight?: number;
  /** Tageswerte — SpO2 und Atemfrequenz ausserhalb des Schlafs. */
  spo2Avg?: number;
  respiration?: number;
  hrv?: number;
  hrvStatus?: string;
  restingHr?: number;
  minHr?: number;
  maxHr?: number;
  steps?: number;
  floors?: number;
  distanceMeters?: number;
  activeCalories?: number;
  totalCalories?: number;
  stressAvg?: number;
  stressMax?: number;
  bodyBatteryMin?: number;
  bodyBatteryMax?: number;
  vo2max?: number;
  fitnessAge?: number;
  weightKg?: number;
  bodyFat?: number;
  /** Garmin "Training Readiness" (0-100) und Einordnung. */
  readiness?: number;
  readinessLevel?: string;
  /** Trainingsstatus, z. B. PRODUCTIVE, MAINTAINING, STRAINED. */
  trainingStatus?: string;
  /** Fitnesstrend: 1 = steigend, 0 = gleichbleibend, -1 = sinkend. */
  fitnessTrend?: number;
};

/**
 * Alle Werte eines Tages holen.
 *
 * Vier Aufrufe, die sich ergaenzen:
 *  1. Tageszusammenfassung - Schritte, Kalorien, Puls, Stress, Body Battery, HRV
 *  2. Schlaf - Phasen, Schlaf-Stress, Schlaf-Herzfrequenz, naechtlicher SpO2
 *  3. Training Readiness - Score und Einordnung
 *  4. Trainingsstatus
 *
 * `leicht` spart die beiden teureren Abrufe. Sie aendern sich hoechstens
 * stuendlich, waehrend Schritte und Kalorien laufend wachsen.
 */
export async function tagVoll(
  tokensJson: string,
  datum: string,
  opts: { leicht?: boolean } = {},
): Promise<LoginTag> {
  const client = clientAusTokens(tokensJson);
  const garmin = new Garmin(client);
  const tag: LoginTag = { date: datum };

  /* 1 - Tageszusammenfassung */
  const roh = (await client
    .connectapi(`/usersummary-service/usersummary/daily?calendarDate=${datum}`)
    .catch(() => null)) as Record<string, unknown> | null;

  if (roh) {
    /*
     * Bis wann hat Garmin Daten? `wellnessEndTimeLocal` endet beim letzten
     * Sync der Uhr. Steht dort 07:03 und es ist 12:15, hat die Uhr seit fünf
     * Stunden nichts hochgeladen — dann sind Schritte und Kalorien
     * zwangsläufig veraltet, egal wie oft wir abfragen.
     */
    const bisRoh = roh.wellnessEndTimeLocal;
    if (typeof bisRoh === 'string' && bisRoh.length >= 16) tag.datenBis = bisRoh;

    const schrittBlock = roh.steps as Record<string, unknown> | undefined;
    const schritte = zahl(schrittBlock?.value) ?? zahl(roh.totalSteps);
    if (schritte) tag.steps = schritte;

    const dist = zahl(schrittBlock?.distanceInMeters) ?? zahl(roh.totalDistanceMeters);
    if (dist) tag.distanceMeters = Math.round(dist);

    /*
     * Etagen stehen NICHT in der Tageszusammenfassung (dort ist der
     * `steps`-Block meist gar nicht vorhanden). Sie haben einen eigenen
     * Endpunkt: /usersummary-service/stats/floors/daily/<von>/<bis>,
     * Antwort ein Array mit values.wellnessFloorsAscended.
     */

    /*
     * Kalorien stehen je nach Alter des Tages an verschiedenen Stellen:
     * aktuelle Tage haben einen `calories`-Block, aeltere nur die Felder
     * `totalKilocalories` / `activeKilocalories` auf oberster Ebene.
     * Beides muss gelesen werden, sonst bleiben alte Tage ohne Kalorien.
     */
    const kcalBlock = roh.calories as Record<string, unknown> | undefined;
    const aktiv =
      zahl(kcalBlock?.burnedActive) ??
      zahl(kcalBlock?.activeKilocalories) ??
      zahl(roh.activeKilocalories);
    const gesamt =
      zahl(kcalBlock?.burnedTotal) ?? zahl(roh.totalKilocalories) ?? zahl(roh.burnedKilocalories);
    const ruhe = zahl(kcalBlock?.burnedResting) ?? zahl(roh.bmrKilocalories);
    if (aktiv) tag.activeCalories = Math.round(aktiv);
    if (gesamt) tag.totalCalories = Math.round(gesamt);
    else if (aktiv && ruhe) tag.totalCalories = Math.round(aktiv + ruhe);

    /*
     * Puls, Stress, Body Battery und SpO2 kommen FLACH in der Antwort
     * (restingHeartRate, averageStressLevel, averageSpo2 …), nicht in
     * Unterobjekten. Wer nur `roh.heartRate` liest, bekommt stumm NULL —
     * genau deshalb waren diese Kacheln in der App leer, obwohl Garmin
     * die Werte liefert. Beide Wege lesen, flach zuerst.
     */
    const rest =
      zahl(roh.restingHeartRate) ??
      zahl((roh.heartRate as Record<string, unknown> | undefined)?.restingValue) ??
      zahl((roh.heartRate as Record<string, unknown> | undefined)?.restingHeartRate);
    if (rest) tag.restingHr = Math.round(rest);

    const minHr =
      zahl(roh.minHeartRate) ?? zahl((roh.heartRate as Record<string, unknown> | undefined)?.minValue);
    const maxHr =
      zahl(roh.maxHeartRate) ?? zahl((roh.heartRate as Record<string, unknown> | undefined)?.maxValue);
    if (minHr) tag.minHr = Math.round(minHr);
    if (maxHr) tag.maxHr = Math.round(maxHr);

    const stressBlock = roh.stress as Record<string, unknown> | undefined;
    const stressAvg =
      zahl(roh.averageStressLevel) ??
      zahl(stressBlock?.avgStressLevel) ??
      zahl(stressBlock?.averageStressLevel);
    const stressMax = zahl(roh.maxStressLevel) ?? zahl(stressBlock?.maxStressLevel);
    if (stressAvg != null) tag.stressAvg = Math.round(stressAvg);
    if (stressMax != null) tag.stressMax = Math.round(stressMax);

    const bbBlock = roh.bodyBattery as Record<string, unknown> | undefined;
    const bbMax = zahl(roh.bodyBatteryMostRecentValue) ?? zahl(bbBlock?.highestValue);
    const bbMin = zahl(roh.bodyBatteryLowestValue) ?? zahl(bbBlock?.lowestValue);
    if (bbMax != null) tag.bodyBatteryMax = Math.round(bbMax);
    if (bbMin != null) tag.bodyBatteryMin = Math.round(bbMin);

    /* SpO2 und Atmung am Tag — nachts kommen sie aus dem Schlaf-Endpunkt. */
    const spo2Tag = zahl(roh.averageSpo2);
    if (spo2Tag) tag.spo2Avg = Math.round(spo2Tag * 10) / 10;
    const atemTag = zahl(roh.avgWakingRespirationValue);
    if (atemTag) tag.respiration = Math.round(atemTag * 10) / 10;

    /*
     * HRV steht NICHT in der Tageszusammenfassung. Eigener Endpunkt:
     * /hrv-service/hrv/<datum> -> hrvSummary.lastNightAvg / weeklyAvg.
     */
    const hrvBlock = roh.hrv as Record<string, unknown> | undefined;
    const hrvWert = zahl(hrvBlock?.lastNightAvg) ?? zahl(hrvBlock?.weeklyAvg) ?? zahl(roh.hrvValue);
    if (hrvWert) tag.hrv = Math.round(hrvWert);
    const hrvStatus =
      (typeof hrvBlock?.status === 'string' ? hrvBlock.status : null) ??
      (typeof roh.hrvStatus === 'string' ? roh.hrvStatus : null);
    if (hrvStatus) tag.hrvStatus = hrvStatus;
  }

  /* 2 - Schlaf mit Phasen */
  const schlaf = (await client
    .connectapi(`/wellness-service/wellness/dailySleepData?date=${datum}&nonSleepBufferMinutes=60`)
    .catch(() => null)) as Record<string, unknown> | null;

  if (schlaf) {
    const dto = (schlaf.dailySleepDTO ?? {}) as Record<string, unknown>;
    const gesamt = sek(dto.sleepTimeSeconds);
    if (gesamt) tag.sleepSecs = gesamt;

    const tief = sek(dto.deepSleepSeconds);
    if (tief) tag.deepSecs = tief;
    const rem = sek(dto.remSleepSeconds);
    if (rem) tag.remSecs = rem;
    const leicht = sek(dto.lightSleepSeconds);
    if (leicht) tag.lightSecs = leicht;
    const wach = sek(dto.awakeSleepSeconds);
    if (wach) tag.awakeSecs = wach;

    /* Garmin liefert den Score als Objekt: { value: 70, qualifierKey: 'FAIR' }. */
    const score = dto.sleepScores as Record<string, unknown> | undefined;
    const block = score?.overall as { value?: number; qualifierKey?: string } | undefined;
    if (typeof block?.value === 'number') tag.sleepScore = Math.round(block.value);
    /*
     * `sleep_quality` in der Datenbank ist INTEGER. Garmin liefert Text
     * ("FAIR", "GOOD"). Deshalb hier auf eine Stufe abbilden — sonst bricht
     * die Speicherung mit "invalid input syntax for type integer".
     */
    if (typeof block?.qualifierKey === 'string') tag.sleepQuality = block.qualifierKey;

    const stressWert = zahl(dto.avgSleepStress);
    if (stressWert) tag.sleepStress = Math.round(stressWert);

    const schlafHr = zahl(dto.sleepingHeartRate) ?? zahl(dto.avgHeartRate);
    if (schlafHr) tag.sleepHr = Math.round(schlafHr);

    /* Naechtlicher SpO2 und Atmung stecken in eigenen Bloecken. */
    const spo2Block = schlaf.wellnessSpO2SleepSummaryDTO as Record<string, unknown> | undefined;
    const spo2Nacht = zahl(spo2Block?.averageValue) ?? zahl(spo2Block?.averageSPO2);
    if (spo2Nacht) tag.spo2Night = Math.round(spo2Nacht * 10) / 10;

    const respBlock = schlaf.wellnessRespirationSummaryDTO as Record<string, unknown> | undefined;
    const atemNacht = zahl(respBlock?.averageValue);
    if (atemNacht) tag.respirationNight = Math.round(atemNacht * 10) / 10;
  }

  /* 2a - HRV (eigener Endpunkt, nicht in der Tageszusammenfassung) */
  if (tag.hrv == null) {
    const hrvRoh = (await client
      .connectapi(`/hrv-service/hrv/${datum}`)
      .catch(() => null)) as Record<string, unknown> | null;
    const hrvSummary = hrvRoh?.hrvSummary as Record<string, unknown> | undefined;
    const hrvWert2 = zahl(hrvSummary?.lastNightAvg) ?? zahl(hrvSummary?.weeklyAvg);
    if (hrvWert2) tag.hrv = Math.round(hrvWert2);
  }

  /* 2b - Etagen (eigener Endpunkt, nicht Teil der Tageszusammenfassung) */
  const etagenRoh = (await client
    .connectapi(`/usersummary-service/stats/floors/daily/${datum}/${datum}`)
    .catch(() => null)) as Array<Record<string, unknown>> | null;
  if (Array.isArray(etagenRoh) && etagenRoh.length) {
    const werte = etagenRoh[0]?.values as Record<string, unknown> | undefined;
    const hoch = zahl(werte?.wellnessFloorsAscended);
    if (hoch != null) tag.floors = Math.round(hoch);
  }

  /*
   * 3 - Training Readiness
   *
   * Der leichte Lauf ueberspringt nur diesen Punkt: Readiness wird einmal pro
   * Tag berechnet und aendert sich nicht stuendlich. Trainingsstatus und
   * VO2max dagegen kommen gleich mit — sie standen frueher hinter einem
   * fruehen `return` und fehlten deshalb im 10-Minuten-Lauf komplett.
   */
  if (!opts.leicht) {
    const ready = (await garmin.getTrainingReadiness(datum).catch(() => null)) as
      | Array<Record<string, unknown>>
      | null;
    if (Array.isArray(ready) && ready.length) {
      const letzte = ready[ready.length - 1];
      const score = zahl(letzte.score);
      if (score != null) tag.readiness = Math.round(score);
      if (typeof letzte.level === 'string') tag.readinessLevel = letzte.level;
    }
  }

  /*
   * 4 - Trainingsstatus und VO2max
   *
   * Beide stecken in derselben Antwort. Der Trainingsstatus liegt NICHT als
   * `trainingStatus.trainingStatusKey` vor, sondern als Zahl plus Klartext:
   * `trainingStatus: 8` und `trainingStatusFeedbackPhrase: "STRAINED_4"`.
   * Der frueher gelesene Pfad existiert nicht — deshalb blieb die Kachel leer.
   */
  const status = (await client
    .connectapi(`/metrics-service/metrics/trainingstatus/aggregated/${datum}`)
    .catch(() => null)) as Record<string, unknown> | null;

  if (status) {
    /* --- Trainingsstatus --- */
    const kopf = status.mostRecentTrainingStatus as Record<string, unknown> | undefined;
    const jeGeraet = kopf?.latestTrainingStatusData as Record<string, Record<string, unknown>> | undefined;
    if (jeGeraet) {
      /* Neuester Eintrag ueber alle Geraete — meist gibt es nur einen. */
      const eintraege = Object.values(jeGeraet).filter((e) => e && typeof e === 'object');
      eintraege.sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
      const neuester = eintraege[0];
      if (neuester) {
        const phrase = neuester.trainingStatusFeedbackPhrase;
        if (typeof phrase === 'string' && phrase) {
          /* "STRAINED_4" -> "STRAINED": die Ziffer ist nur die Stufe. */
          tag.trainingStatus = phrase.replace(/_\d+$/, '');
        }
        const trend = neuester.fitnessTrend;
        if (typeof trend === 'number') tag.fitnessTrend = trend;
      }
    }

    /*
     * --- VO2max ---
     * Garmin berechnet VO2max nur bei Laeufen und schreibt den Wert dann fort.
     * `mostRecentVO2Max.generic` ist der letzte gueltige Wert — auch wenn er
     * von einem Tag vor dem gefragten stammt. Das ist genau richtig fuer die
     * Anzeige: der Wert gilt bis zur naechsten Messung.
     */
    const vo2Block = status.mostRecentVO2Max as Record<string, unknown> | undefined;
    const generisch = vo2Block?.generic as Record<string, unknown> | undefined;
    const vo2 = zahl(generisch?.vo2MaxPreciseValue) ?? zahl(generisch?.vo2MaxValue);
    if (vo2 != null) tag.vo2max = vo2;
    const alter = zahl(generisch?.fitnessAge);
    if (alter != null) tag.fitnessAge = Math.round(alter);
  }

  return tag;
}

/**
 * Volle Historie holen.
 *
 * Tage einzeln und abgesichert: Ein Fehler an einem Tag darf die Historie nicht
 * kosten. Garmin hat kein Tageslimit, wir bleiben aber hoeflich.
 */
export async function historieVoll(
  tokensJson: string,
  tage: number,
  onFortschritt?: (erledigt: number, gesamt: number) => void,
): Promise<LoginTag[]> {
  const anzahl = Math.max(1, Math.min(730, tage));
  const ergebnis: LoginTag[] = [];

  for (let i = 0; i < anzahl; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const datum = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    try {
      const tag = await tagVoll(tokensJson, datum, { leicht: false });
      if (Object.keys(tag).some((k) => k !== 'date')) ergebnis.push(tag);
    } catch {
      /* einzelner Tag darf ausfallen */
    }
    onFortschritt?.(i + 1, anzahl);
  }

  return ergebnis;
}

/**
 * Gewicht und Koerperfett eines Tages.
 *
 * Eigener Aufruf, weil Wiegungen nicht taeglich vorkommen - Garmin liefert eine
 * Liste mit Datum, Gewicht und Koerperfett.
 */
export async function koerperWerte(
  tokensJson: string,
  datum: string,
): Promise<{ weightKg?: number; bodyFat?: number } | null> {
  try {
    const roh = (await clientAusTokens(tokensJson).connectapi(
      `/weight-service/weight/dateRange?startDate=${datum}&endDate=${datum}`,
    )) as Record<string, unknown> | null;
    if (!roh) return null;
    const liste = (roh.dateWeightList ?? []) as Array<Record<string, unknown>>;
    if (!liste.length) return null;
    const letzte = liste[liste.length - 1];
    const ergebnis: { weightKg?: number; bodyFat?: number } = {};
    const kg = zahl(letzte.weight) ?? zahl(letzte.weightInGrams);
    if (kg) ergebnis.weightKg = kg > 1000 ? Math.round((kg / 1000) * 10) / 10 : Math.round(kg * 10) / 10;
    const fett = zahl(letzte.bodyFat);
    if (fett) ergebnis.bodyFat = Math.round(fett * 10) / 10;
    return Object.keys(ergebnis).length ? ergebnis : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- Zurueckschreiben */

/**
 * Gewicht in Garmin eintragen.
 *
 * Nur aufrufen, wenn sich der Wert wirklich geaendert hat - sonst entsteht bei
 * jedem Takt ein neuer Eintrag und die Garmin-Historie wird unbrauchbar.
 * Der Merker liegt in `garmin_schreibstand` (server.ts).
 */
export async function schreibeGewicht(tokensJson: string, datum: string, kg: number): Promise<boolean> {
  try {
    /*
     * Route und Körper aus der Bibliothek uebernommen (addWeighIn):
     * `/weight-service/user-weight` mit value/unitKey/sourceType und beiden
     * Zeitstempeln. Die frueher geratene Route `.../dateWeight` antwortet mit
     * HTTP 405 — der Eintrag kam nie an.
     */
    const lokal = `${datum}T12:00:00.000`;
    await clientAusTokens(tokensJson).connectapi('/weight-service/user-weight', {
      method: 'POST',
      json: {
        dateTimestamp: lokal,
        gmtTimestamp: lokal.replace('T12:00:00.000', 'T10:00:00.000'),
        unitKey: 'kg',
        sourceType: 'MANUAL',
        value: Math.round(kg * 100) / 100,
      },
    });
    return true;
  } catch (e) {
    /* Nicht stumm verschlucken: ohne Meldung ist nicht zu erkennen, ob die
       Route falsch ist oder Garmin den Aufruf ablehnt. */
    console.warn('[garmin] Gewicht schreiben fehlgeschlagen:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Wasser in Garmin eintragen (Milliliter, Tageswert). */
export async function schreibeWasser(tokensJson: string, datum: string, ml: number): Promise<boolean> {
  try {
    /*
     * Wie `addHydration` in der Bibliothek: `timestampLocal` gehoert dazu,
     * ohne das Feld lehnt Garmin den Aufruf ab.
     */
    await clientAusTokens(tokensJson).connectapi('/usersummary-service/usersummary/hydration/log', {
      method: 'PUT',
      json: {
        calendarDate: datum,
        timestampLocal: `${datum}T12:00:00.000`,
        valueInML: Math.round(ml),
      },
    });
    return true;
  } catch (e) {
    console.warn('[garmin] Wasser schreiben fehlgeschlagen:', e instanceof Error ? e.message : e);
    return false;
  }
}

/* ------------------------------------------------------------------ Daten */

/** Aktivitaeten einer Zeitspanne. */
export async function aktivitaeten(
  tokensJson: string,
  tage = 90,
): Promise<Array<Record<string, unknown>>> {
  try {
    const garmin = new Garmin(clientAusTokens(tokensJson));
    const limit = Math.min(300, Math.max(20, tage * 3));
    const roh = (await garmin.getActivities(0, limit)) as Array<Record<string, unknown>>;
    if (!Array.isArray(roh)) return [];
    const grenze = new Date();
    grenze.setDate(grenze.getDate() - tage);
    const grenzeYmd = grenze.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    return roh.filter((a) => {
      const datum = String(a.startTimeLocal ?? a.startTimeGMT ?? '').slice(0, 10);
      return datum >= grenzeYmd;
    });
  } catch (e) {
    /*
     * Nicht still verschlucken: ein leerer Rueckgabewert sieht sonst genauso aus
     * wie "es gibt keine Aktivitaeten" — genau daran blieb unbemerkt, dass der
     * Abruf scheiterte.
     */
    console.warn('[garmin-login] Aktivitaeten abrufen:', e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Zeitreihe einer Einheit über den Login-Zugang (Puls, Pace, Höhe, Kadenz).
 *
 * Warum über den Login und nicht die Personal API: Tim nutzt ausschließlich den
 * Login. Die Personal-API-Variante (`ladeEinheitZeitreihen`) braucht einen
 * API-Key, den es hier nicht gibt — die Detailseite blieb deshalb leer.
 *
 * Garmin liefert die Werte als zwei getrennte Listen: eine Beschreibung der
 * Spalten (`metricDescriptors`, mit `metricsIndex`) und die Zeilen
 * (`activityDetailMetrics`). Die Reihenfolge der Spalten ist nicht stabil,
 * deshalb wird über den Namen gesucht und nicht über die Position.
 */
export async function garminZeitreiheLogin(
  tokensJson: string,
  activityId: number,
): Promise<Array<{ t: number; hr?: number; speed?: number; elevation?: number; cadence?: number; power?: number }>> {
  try {
    const client = clientAusTokens(tokensJson);
    const roh = (await client.connectapi(
      `/activity-service/activity/${activityId}/details?maxChartSize=2000&maxPolylineSize=5000`,
    )) as {
      metricDescriptors?: Array<{ key: string; metricsIndex: number }>;
      activityDetailMetrics?: Array<{ metrics: Array<number | null> }>;
    } | null;

    if (!roh?.metricDescriptors || !roh.activityDetailMetrics) return [];

    const idx = new Map<string, number>();
    for (const d of roh.metricDescriptors) idx.set(d.key, d.metricsIndex);

    /** Ersten passenden Wert aus mehreren möglichen Feldnamen holen. */
    const wert = (zeile: Array<number | null>, ...keys: string[]): number | undefined => {
      for (const k of keys) {
        const i = idx.get(k);
        if (i == null) continue;
        const v = zeile[i];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      return undefined;
    };

    const punkte: Array<{ t: number; hr?: number; speed?: number; elevation?: number; cadence?: number; power?: number }> = [];

    for (const zeile of roh.activityDetailMetrics) {
      const m = zeile.metrics;
      if (!Array.isArray(m)) continue;

      /* `sumElapsedDuration` ist die Sekunde seit Start — der Anker der Reihe. */
      const sekunden = wert(m, 'sumElapsedDuration', 'sumDuration');
      if (sekunden == null) continue;

      const punkt: {
        t: number; hr?: number; speed?: number; elevation?: number; cadence?: number; power?: number;
      } = { t: Math.round(sekunden) };

      const hr = wert(m, 'directHeartRate', 'heartRate');
      if (hr != null && hr > 0) punkt.hr = Math.round(hr);

      const speed = wert(m, 'directSpeed', 'speed');
      if (speed != null && speed >= 0) punkt.speed = Math.round(speed * 100) / 100;

      const elev = wert(m, 'directElevation', 'elevation');
      if (elev != null) punkt.elevation = Math.round(elev * 10) / 10;

      const cad = wert(m, 'directDoubleCadence', 'directCadence', 'cadence');
      if (cad != null && cad > 0) punkt.cadence = Math.round(cad);

      const pw = wert(m, 'directPower', 'power');
      if (pw != null && pw > 0) punkt.power = Math.round(pw);

      punkte.push(punkt);
    }

    /*
     * Auf 400 Punkte ausdünnen: Mehr zeigt kein Diagramm sinnvoll, und die
     * JSONB-Spalte soll klein bleiben. Die Form bleibt erhalten, weil
     * gleichmäßig ausgewählt wird und der letzte Punkt immer dabei ist.
     */
    if (punkte.length > 400) {
      const schritt = punkte.length / 400;
      const duenn = punkte.filter((_, i) => i % Math.ceil(schritt) === 0);
      if (duenn[duenn.length - 1] !== punkte[punkte.length - 1]) {
        duenn.push(punkte[punkte.length - 1]);
      }
      return duenn;
    }

    return punkte;
  } catch (e) {
    console.warn('[garmin] Zeitreihe:', e instanceof Error ? e.message : e);
    return [];
  }
}
