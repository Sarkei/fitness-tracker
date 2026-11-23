/**
 * Garmin Connect Personal API (seit Oktober 2026 offen).
 *
 * Tim erzeugt in Garmin Connect Web einen Personal API Key
 * (`connect.garmin.com/app/settings/personalApiToken`). Der Key wird gegen ein
 * 24-Stunden-Token getauscht, damit ruft der Server die Tagesdaten ab.
 *
 * WICHTIG — nur lesend: Alle 28 Endpunkte der Personal API sind GET. Trainings
 * lassen sich damit nicht auf die Uhr schreiben; das läuft weiter über
 * Intervals.icu (`icu_garmin_upload_workouts`). Die App liest also von Garmin,
 * schreibt aber nicht dorthin.
 */

const TOKEN_URL =
  'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token';
const BASE = 'https://personal.connectapi.garmin.com';

export type GarminToken = { token: string; expiresAt: number };

/** Garmins Textqualifier auf eine 0-100-Stufe abbilden (Schlafqualitaet). */
const QUALIFIER_STUFE: Record<string, number> = {
  EXCELLENT: 95,
  VERY_GOOD: 85,
  GOOD: 75,
  FAIR: 55,
  POOR: 35,
  VERY_POOR: 20,
};

export type GarminTag = {
  date: string; // YYYY-MM-DD
  /** Schlaf */
  sleepSecs?: number;
  sleepScore?: number;
  sleepQuality?: number;
  deepSecs?: number;
  lightSecs?: number;
  remSecs?: number;
  awakeSecs?: number;
  /** Herz */
  hrv?: number;
  hrvStatus?: string;
  restingHr?: number;
  minHr?: number;
  maxHr?: number;
  /** Aktivität */
  steps?: number;
  floorsClimbed?: number;
  distanceMeters?: number;
  activeCalories?: number;
  totalCalories?: number;
  /** Erholung */
  bodyBatteryMin?: number;
  bodyBatteryMax?: number;
  stressAvg?: number;
  stressMax?: number;
  /** Sauerstoff & Atmung */
  spo2Avg?: number;
  respirationAvg?: number;
  /** Körper */
  vo2max?: number;
  fitnessAge?: number;
  weightKg?: number;
  bodyFat?: number;
};

/**
 * Alle Felder, die die App aus Garmin lesen will. Grundlage fuer die Anzeige
 * „Erfolgreich: 24/24" im Profil — Tim will sehen, wie viele Werte wirklich
 * angekommen sind, statt einzelner Kacheln.
 */
export const GARMIN_FELDER = [
  'sleepSecs', 'sleepScore', 'sleepQuality', 'deepSecs', 'lightSecs', 'remSecs', 'awakeSecs',
  'hrv', 'hrvStatus', 'restingHr', 'minHr', 'maxHr',
  'steps', 'floorsClimbed', 'distanceMeters', 'activeCalories', 'totalCalories',
  'stressAvg', 'stressMax', 'bodyBatteryMin', 'bodyBatteryMax',
  'spo2Avg', 'respirationAvg',
  'vo2max', 'fitnessAge', 'weightKg', 'bodyFat',
] as const;

/**
 * Felder, die Garmin nur bei Gelegenheit misst: Gewicht beim Wiegen, VO2max beim
 * Laufen. Sie fehlen an einem normalen Tag zu Recht — dann zaehlt der letzte
 * bekannte Wert, sonst wirkt der Abgleich schlechter als er ist.
 */
const LANGSAME_FELDER = new Set(['vo2max', 'fitnessAge', 'weightKg', 'bodyFat']);

/** Wie viele Felder sind gefuellt? Schnelle Felder vom juengsten Tag, langsame vom letzten Messwert. */
export function felderStand(tage: GarminTag[]): { gesamt: number; erfolgreich: number; fehlend: string[] } {
  const gesamt = GARMIN_FELDER.length;
  if (!tage.length) return { gesamt, erfolgreich: 0, fehlend: [...GARMIN_FELDER] };
  const juengster = tage[tage.length - 1] as Record<string, unknown>;

  const hatWert = (feld: string): boolean => {
    if (juengster[feld] != null) return true;
    if (!LANGSAME_FELDER.has(feld)) return false;
    // Letzter bekannter Messwert, egal wie alt.
    return tage.some((t) => (t as Record<string, unknown>)[feld] != null);
  };

  const fehlend = GARMIN_FELDER.filter((f) => !hatWert(f));
  return { gesamt, erfolgreich: gesamt - fehlend.length, fehlend: [...fehlend] };
}

export type GarminCache = {
  fetchedAt: string;
  displayName?: string;
  tage: GarminTag[];
  nichtVerfuegbar: string[];
};

/** Key gegen ein Access-Token tauschen (24 h gültig). */
export async function garminToken(apiKey: string): Promise<GarminToken> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'Der Garmin-API-Key wurde abgelehnt. Bitte in Garmin Connect neu erzeugen (er wird nur einmal angezeigt).'
        : `Garmin-Token fehlgeschlagen (HTTP ${res.status}).`,
    );
  }

  // Garmin antwortet je nach Endpunkt-Stand entweder mit JSON
  // ({"access_token":"…"}) oder mit dem nackten JWT als Text ("eyJ…").
  // Beides muss funktionieren — sonst scheitert ein gültiger Key an JSON.parse.
  const roh = (await res.text()).trim();
  if (!roh) throw new Error('Garmin lieferte ein leeres Token.');

  let token = '';
  let expiresIn = 0;
  if (roh.startsWith('{')) {
    try {
      const j = JSON.parse(roh) as { access_token?: string; expires_in?: number };
      token = String(j.access_token ?? '');
      expiresIn = Number(j.expires_in) || 0;
    } catch {
      throw new Error('Garmin-Token war nicht lesbar (ungültige JSON-Antwort).');
    }
  } else {
    // Nackter JWT — oft in Anführungszeichen, die entfernt werden müssen.
    token = roh.replace(/^"|"$/g, '');
  }

  if (!token) throw new Error('Garmin lieferte kein Token.');

  return {
    token,
    expiresAt: Date.now() + (expiresIn || 86_400) * 1000,
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tageZurueck(tage: number): { von: string; bis: string } {
  const bis = new Date();
  const von = new Date();
  von.setDate(bis.getDate() - tage);
  return { von: ymd(von), bis: ymd(bis) };
}

/** Ein GET gegen die Personal API. */
async function hole<T>(token: string, pfad: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${pfad}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Zahl aus verschiedenen Feldformen lesen (Garmin liefert oft Objekte). */
function zahl(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['value', 'avg', 'average', 'total', 'seconds', 'score']) {
      const x = o[k];
      if (typeof x === 'number' && Number.isFinite(x)) return x;
    }
  }
  return undefined;
}

/**
 * Alle Tagesdaten holen und je Datum zusammenführen.
 *
 * Bewusst viele Einzelabrufe mit Fehlertoleranz: fehlt ein Endpunkt (z. B. weil
 * die Uhr kein SpO₂ misst), bleiben die anderen Bereiche nutzbar und der Grund
 * landet in `nichtVerfuegbar`.
 */
export type SyncFortschritt = (stand: { schritt: number; gesamt: number }) => void;

export async function syncGarmin(
  apiKey: string,
  tage = 30,
  onFortschritt?: SyncFortschritt,
): Promise<GarminCache> {
  const { token } = await garminToken(apiKey);
  const { von, bis } = tageZurueck(tage);
  const heute = ymd(new Date());
  const nichtVerfuegbar: string[] = [];
  const proTag = new Map<string, GarminTag>();

  const eintrag = (datum: string): GarminTag => {
    const key = String(datum ?? '').slice(0, 10);
    if (!proTag.has(key)) proTag.set(key, { date: key });
    return proTag.get(key)!;
  };

  // Fortschritt melden, waehrend die Abrufe durchlaufen — die App zeigt damit
  // „laeuft gerade" statt faelschlich „abgeschlossen".
  let erledigt = 0;
  const gesamtSchritte = 9 + Math.min(tage, 14) + Math.min(tage, 30) * 2;
  const tick = () => {
    erledigt += 1;
    onFortschritt?.({ schritt: erledigt, gesamt: gesamtSchritte });
  };

  /*
   * Endpunkte und Parameter — an der echten API verifiziert (23.11.2026):
   *  - Die Zeitreihen erwarten durchgaengig `startDate`/`endDate`, NICHT
   *    `fromDate`/`toDate`. Mit den falschen Namen antwortet Garmin mit HTTP 400
   *    und leerem Body, ohne Fehlermeldung.
   *  - steps und stress gibt es NUR mit Datum im Pfad und nur fuer kurze
   *    Zeitraeume; `?startDate=` endet dort in 404.
   *  - v2/dailysummaries buendelt Body Battery, Kalorien, Herzfrequenz, Stress,
   *    Atmung und Etagen in einem Aufruf — das spart die meisten Einzelabrufe.
   */
  const kurzVon = ymd(new Date(Date.now() - Math.min(tage, 7) * 86_400_000));

  const [profil, schlaf, hrv, steps, stress, spo2, herz, summary, gewicht] = await Promise.all([
    hole<{ displayName?: string; fullName?: string }>(token, '/userprofile-service/userprofile/settings').then((r) => (tick(), r)),
    hole<unknown>(token, `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${von}&endDate=${bis}`).then((r) => (tick(), r)),
    hole<unknown>(token, `/hrv-service/hrv/daily/${von}/${bis}`).then((r) => (tick(), r)),
    hole<unknown>(token, `/usersummary-service/stats/steps/daily/${kurzVon}/${bis}`).then((r) => (tick(), r)),
    hole<unknown>(token, `/usersummary-service/stats/stress/daily/${kurzVon}/${bis}`).then((r) => (tick(), r)),
    hole<unknown>(token, `/wellness-service/wellness/daily/spo2acclimation/${heute}`).then((r) => (tick(), r)),
    hole<unknown>(token, '/wellness-service/wellness/dailyHeartRate').then((r) => (tick(), r)),
    hole<unknown>(token, `/usersummary-service/v2/dailysummaries?startDate=${von}&endDate=${bis}`).then((r) => (tick(), r)),
    hole<unknown>(token, `/weight-service/weight/range/${von}/${bis}`).then((r) => (tick(), r)),
  ]);

  /*
   * Tages-Einzelabruf: `usersummary/daily?calendarDate=…` ist die vollstaendigste
   * Quelle — sie liefert Etagen, Schritte, Distanz, Stress, Body Battery, SpO2 und
   * Atmung in einem Objekt. Die Sammel-Endpunkte lassen genau diese Felder weg,
   * deshalb kam vorher fast nichts an. Begrenzt auf die letzten 14 Tage, damit der
   * Abgleich schnell bleibt.
   */
  const tagesEinzel = await Promise.all(
    Array.from({ length: Math.min(tage, 14) }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const datum = ymd(d);
      return hole<Record<string, unknown>>(
        token,
        `/usersummary-service/usersummary/daily?calendarDate=${datum}`,
      ).then((r) => (tick(), { datum, daten: r }));
    }),
  );

  // VO2max und Fitnessalter je Tag (eigene Endpunkte) — nur für die letzten 30 Tage,
  // damit der Abruf nicht ausufert.
  const koerper = await Promise.all(
    Array.from({ length: Math.min(tage, 30) }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ymd0 = ymd(d);
      return Promise.all([
        hole<unknown>(token, `/metrics-service/metrics/maxmet/daily/${ymd0}/${ymd0}`).then((r) => (tick(), r)),
        hole<unknown>(token, `/fitnessage-service/fitnessage/v2/${ymd0}`).then((r) => (tick(), r)),
      ]).then(([m, f]) => ({ datum: ymd0, maxmet: m, fitness: f }));
    }),
  );

  /** Liste aus verschiedenen Umschlagformen ziehen. */
  const liste = (roh: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(roh)) return roh as Array<Record<string, unknown>>;
    if (roh && typeof roh === 'object') {
      const o = roh as Record<string, unknown>;
      for (const k of ['dailySleepDTOs', 'sleepSummaries', 'summaries', 'hrvSummaries', 'values', 'items', 'data', 'days']) {
        if (Array.isArray(o[k])) return o[k] as Array<Record<string, unknown>>;
      }
      // Einzelobjekt mit Datum
      if (o.calendarDate || o.date || o.summaryDate) return [o];
    }
    return [];
  };

  // Schlaf
  if (schlaf == null) nichtVerfuegbar.push('Schlaf');
  for (const s of liste(schlaf)) {
    const d = String(s.calendarDate ?? s.sleepDate ?? s.date ?? '').slice(0, 10);
    if (!d) continue;
    const t = eintrag(d);
    const secs = zahl(s.sleepTimeSeconds) ?? zahl(s.sleepSeconds) ?? zahl(s.totalSleepSeconds);
    if (secs) t.sleepSecs = secs;
    // Score steckt in sleepScores.overall.value; die Qualifier sind Textlabels.
    const scores = s.sleepScores as Record<string, unknown> | undefined;
    const overall = scores?.overall as Record<string, unknown> | undefined;
    const score = zahl(s.sleepScore) ?? zahl(overall) ?? zahl(s.overallSleepScore);
    if (score) t.sleepScore = score;
    const q = zahl(s.sleepQuality);
    if (q) t.sleepQuality = q;
    // Garmin liefert statt einer Zahl nur einen Qualifier (EXCELLENT, FAIR, POOR).
    const qualifier = typeof overall?.qualifierKey === 'string' ? overall.qualifierKey : '';
    if (qualifier) {
      const stufe = QUALIFIER_STUFE[qualifier];
      if (stufe != null) t.sleepQuality = stufe;
    }
    // Schlafphasen (aus den Detailwerten, wenn vorhanden)
    const tief = zahl(s.deepSleepSeconds);
    const leicht = zahl(s.lightSleepSeconds);
    const rem = zahl(s.remSleepSeconds);
    const wach = zahl(s.awakeSleepSeconds) ?? zahl(s.awakeDuration);
    if (tief) t.deepSecs = tief;
    if (leicht) t.lightSecs = leicht;
    if (rem) t.remSecs = rem;
    if (wach) t.awakeSecs = wach;
  }

  /*
   * Gewicht: die Antwort heisst dailyWeightSummaries, die Werte stecken unter
   * latestWeight und kommen in GRAMM (112690 = 112,69 kg).
   */
  if (gewicht) {
    const rohG = gewicht as Record<string, unknown>;
    const gewichtsListe = Array.isArray(rohG.dailyWeightSummaries)
      ? (rohG.dailyWeightSummaries as Array<Record<string, unknown>>)
      : liste(gewicht);
    for (const w of gewichtsListe) {
      const detail = (w.latestWeight ?? w) as Record<string, unknown>;
      const d = String(
        w.summaryDate ?? detail.calendarDate ?? detail.date ?? '',
      ).slice(0, 10);
      if (!d) continue;
      const gramm = zahl(detail.weight) ?? zahl(detail.weightInGrams);
      const t = eintrag(d);
      if (gramm) {
        t.weightKg = gramm > 1000 ? Math.round((gramm / 1000) * 10) / 10 : Math.round(gramm * 10) / 10;
      }
      const fett = zahl(detail.bodyFat);
      if (fett) t.bodyFat = fett;
    }
  }

  // VO2max + Fitnessalter (Einzelabrufe je Tag)
  for (const k of koerper) {
    const t = eintrag(k.datum);
    // VO2max steckt in maxmet[i].generic.vo2MaxValue (nicht auf oberster Ebene).
    const eintragMaxmet = liste(k.maxmet)[0];
    if (eintragMaxmet) {
      const generic = (eintragMaxmet.generic ?? eintragMaxmet) as Record<string, unknown>;
      const vo2 = zahl(generic.vo2MaxPreciseValue) ?? zahl(generic.vo2MaxValue) ?? zahl(generic.vo2Max);
      if (vo2) t.vo2max = vo2;
    }
    if (k.fitness && typeof k.fitness === 'object') {
      const f = k.fitness as Record<string, unknown>;
      const alter = zahl(f.fitnessAge) ?? zahl(f.age) ?? zahl(f.fitnessAgeValue);
      if (alter) t.fitnessAge = alter;
      const vo2b = zahl(f.vo2Max) ?? zahl(f.vo2max);
      if (vo2b && !t.vo2max) t.vo2max = vo2b;
    }
  }

  // HRV
  if (hrv == null) nichtVerfuegbar.push('HRV');
  for (const h of liste(hrv)) {
    const d = String(h.calendarDate ?? h.date ?? '').slice(0, 10);
    if (!d) continue;
    const v =
      zahl(h.lastNightAvg) ??
      zahl(h.hrvValue) ??
      zahl(h.weeklyAvg) ??
      zahl(h.hrv) ??
      zahl(h.value);
    const t = eintrag(d);
    if (v) t.hrv = v;
    // Status kommt als Text: BALANCED, LOW, HIGH, UNBALANCED.
    if (typeof h.status === 'string' && h.status) t.hrvStatus = h.status;
  }

  // Schritte
  if (steps == null) nichtVerfuegbar.push('Schritte');
  for (const s of liste(steps)) {
    const d = String(s.calendarDate ?? s.date ?? '').slice(0, 10);
    if (!d) continue;
    const v = zahl(s.steps) ?? zahl(s.totalSteps) ?? zahl(s.value);
    if (v) eintrag(d).steps = v;
  }

  // Stress
  if (stress == null) nichtVerfuegbar.push('Stress');
  for (const s of liste(stress)) {
    const d = String(s.calendarDate ?? s.date ?? '').slice(0, 10);
    if (!d) continue;
    // Stress kommt verschachtelt: {"values":{"overallStressLevel":42,...}}
    const values = s.values as Record<string, unknown> | undefined;
    const avg =
      zahl(s.averageStressLevel) ?? zahl(values?.overallStressLevel) ?? zahl(s.avg) ?? zahl(s.value);
    const max = zahl(s.maxStressLevel) ?? zahl(values) ?? zahl(s.max);
    const t = eintrag(d);
    if (avg) t.stressAvg = avg;
    if (max) t.stressMax = max;
  }

  // Body Battery kommt aus der Dailysummary (siehe unten) — eigener Abruf entfaellt.

  // SpO2 (nur heute, Garmin liefert tagesaktuell)
  if (spo2 == null) nichtVerfuegbar.push('SpO₂');
  for (const s of liste(spo2)) {
    const d = String(s.calendarDate ?? s.date ?? heute).slice(0, 10);
    const v = zahl(s.averageSpO2) ?? zahl(s.avg) ?? zahl(s.value) ?? zahl(s.spo2);
    if (v) eintrag(d).spo2Avg = v;
  }

  // Herzfrequenz
  for (const h of liste(herz)) {
    const d = String(h.calendarDate ?? h.date ?? '').slice(0, 10);
    if (!d) continue;
    const t = eintrag(d);
    const rest = zahl(h.restingHeartRate) ?? zahl(h.restingHr);
    const min = zahl(h.minHeartRate) ?? zahl(h.minHr);
    const max = zahl(h.maxHeartRate) ?? zahl(h.maxHr);
    if (rest) t.restingHr = rest;
    if (min) t.minHr = min;
    if (max) t.maxHr = max;
  }

  /*
   * Tageszusammenfassung: das dichteste Paket der API. Liefert Schritte, Etagen,
   * Distanz, Kalorien, Ruhepuls, Stress, Body Battery, Atmung und SpO2 in einem
   * Aufruf. Die Werte stecken in verschachtelten Objekten:
   *   bodyBattery: {maxValue, minValue}   calories: {burnedActive, burnedResting}
   *   heartRate:   {restingValue, minValue, maxValue}
   *   stress:      {avgLevel, maxLevel}   respiration: {avgValue}
   */
  for (const s of liste(summary)) {
    const d = String(s.calendarDate ?? s.date ?? s.summaryDate ?? '').slice(0, 10);
    if (!d) continue;
    const t = eintrag(d);

    // Schritte stecken in movement.steps, nicht auf oberster Ebene.
    const bewegung = s.movement as Record<string, unknown> | undefined;
    const schrittBlock = bewegung?.steps as Record<string, unknown> | undefined;
    const schritte =
      zahl(schrittBlock?.value) ?? zahl(s.totalSteps) ?? zahl(s.steps);
    if (schritte && !t.steps) t.steps = schritte;
    const distRaw =
      zahl(schrittBlock?.distanceInMeters) ?? zahl(s.totalDistanceMeters) ?? zahl(s.distance);
    if (distRaw) t.distanceMeters = Math.round(distRaw);
    const etagen =
      zahl(schrittBlock?.floorsClimbed) ?? zahl(s.floorsClimbed) ?? zahl(s.floors);
    if (etagen) t.floorsClimbed = etagen;

    const kcal = s.calories as Record<string, unknown> | undefined;
    if (kcal) {
      const aktiv = zahl(kcal.burnedActive) ?? zahl(kcal.activeKilocalories);
      const gesamt = zahl(kcal.burnedTotal);
      const ruhe = zahl(kcal.burnedResting);
      if (aktiv) t.activeCalories = Math.round(aktiv);
      if (gesamt) t.totalCalories = Math.round(gesamt);
      else if (aktiv && ruhe) t.totalCalories = Math.round(aktiv + ruhe);
    }

    const hf = s.heartRate as Record<string, unknown> | undefined;
    if (hf) {
      const rest = zahl(hf.restingValue) ?? zahl(hf.restingHeartRate);
      const min = zahl(hf.minValue);
      const max = zahl(hf.maxValue);
      if (rest && !t.restingHr) t.restingHr = rest;
      if (min && !t.minHr) t.minHr = min;
      if (max && !t.maxHr) t.maxHr = max;
    }

    const stressBlock = s.stress as Record<string, unknown> | undefined;
    if (stressBlock) {
      const schnitt = zahl(stressBlock.avgLevel) ?? zahl(stressBlock.averageStressLevel);
      const max = zahl(stressBlock.maxLevel);
      if (schnitt && !t.stressAvg) t.stressAvg = schnitt;
      if (max && !t.stressMax) t.stressMax = max;
    }

    const akku = s.bodyBattery as Record<string, unknown> | undefined;
    if (akku) {
      const max = zahl(akku.maxValue) ?? zahl(akku.mostRecentValue);
      const min = zahl(akku.minValue) ?? zahl(akku.lowestValue);
      if (max != null && t.bodyBatteryMax == null) t.bodyBatteryMax = max;
      if (min != null && t.bodyBatteryMin == null) t.bodyBatteryMin = min;
    }

    const atem = s.respiration as Record<string, unknown> | undefined;
    if (atem) {
      const v = zahl(atem.avgValue) ?? zahl(atem.avgWakingRespirationValue);
      if (v) t.respirationAvg = v;
    }

    // SpO2 heisst in der Dailysummary pulsox.
    const sauerstoff = (s.pulseOx ?? s.spo2) as Record<string, unknown> | undefined;
    if (sauerstoff) {
      const v = zahl(sauerstoff.avgValue) ?? zahl(sauerstoff.averageValue);
      if (v) t.spo2Avg = v;
    }
  }

  /*
   * Einzelabrufe auswerten: sie fuellen die Felder, die in den Sammel-Endpunkten
   * fehlen (Etagen, Distanz, SpO2) oder dort anders heissen.
   */
  for (const { datum, daten } of tagesEinzel) {
    if (!daten) continue;
    const t = eintrag(datum);
    const schritte = zahl(daten.totalSteps);
    if (schritte && !t.steps) t.steps = schritte;
    const dist = zahl(daten.totalDistanceMeters) ?? zahl(daten.wellnessDistanceMeters);
    if (dist && !t.distanceMeters) t.distanceMeters = Math.round(dist);
    const etagen = zahl(daten.floorsAscended);
    if (etagen != null && t.floorsClimbed == null) t.floorsClimbed = Math.round(etagen);
    const stress = zahl(daten.averageStressLevel);
    if (stress && !t.stressAvg) t.stressAvg = stress;
    const stressMax = zahl(daten.maxStressLevel);
    if (stressMax && !t.stressMax) t.stressMax = stressMax;
    const bbMax = zahl(daten.bodyBatteryHighestValue) ?? zahl(daten.bodyBatteryMostRecentValue);
    if (bbMax != null && t.bodyBatteryMax == null) t.bodyBatteryMax = bbMax;
    const bbMin = zahl(daten.bodyBatteryLowestValue);
    if (bbMin != null && t.bodyBatteryMin == null) t.bodyBatteryMin = bbMin;
    const spo2 = zahl(daten.averageSpo2) ?? zahl(daten.latestSpo2);
    if (spo2 && !t.spo2Avg) t.spo2Avg = spo2;
    const atem = zahl(daten.avgWakingRespirationValue);
    if (atem && !t.respirationAvg) t.respirationAvg = atem;
    const rest = zahl(daten.restingHeartRate);
    if (rest && !t.restingHr) t.restingHr = rest;
    const minHr = zahl(daten.minHeartRate);
    if (minHr && !t.minHr) t.minHr = minHr;
    const maxHr = zahl(daten.maxHeartRate);
    if (maxHr && !t.maxHr) t.maxHr = maxHr;
    const aktiv = zahl(daten.activeKilocalories);
    if (aktiv && !t.activeCalories) t.activeCalories = Math.round(aktiv);
    const gesamt = zahl(daten.totalKilocalories);
    if (gesamt && !t.totalCalories) t.totalCalories = Math.round(gesamt);
  }

  const tageListe = [...proTag.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Nur Tage behalten, an denen wirklich etwas drinsteht.
  const gefuellt = tageListe.filter((t) =>
    Object.entries(t).some(([k, v]) => k !== 'date' && typeof v === 'number'),
  );

  return {
    fetchedAt: new Date().toISOString(),
    displayName: profil?.displayName ?? profil?.fullName,
    tage: gefuellt,
    nichtVerfuegbar,
  };
}
