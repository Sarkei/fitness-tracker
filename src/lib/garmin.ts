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
export async function syncGarmin(apiKey: string, tage = 30): Promise<GarminCache> {
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

  const [profil, schlaf, hrv, steps, stress, bodyBattery, spo2, herz, summary, gewicht] = await Promise.all([
    hole<{ displayName?: string; fullName?: string }>(token, '/userprofile-service/userprofile/settings'),
    hole<unknown>(token, `/sleep-service/sleep/dailySleepSummariesByDate?fromDate=${von}&toDate=${bis}`),
    hole<unknown>(token, `/hrv-service/hrv/daily/${von}/${bis}`),
    hole<unknown>(token, `/usersummary-service/stats/steps/daily/${von}/${bis}`),
    hole<unknown>(token, `/usersummary-service/stats/stress/daily/${von}/${bis}`),
    hole<unknown>(token, `/wellness-service/wellness/bodyBattery/reports/daily?fromDate=${von}&toDate=${bis}`),
    hole<unknown>(token, `/wellness-service/wellness/daily/spo2acclimation/${heute}`),
    hole<unknown>(token, '/wellness-service/wellness/dailyHeartRate'),
    hole<unknown>(token, `/usersummary-service/v2/dailysummaries?fromDate=${von}&toDate=${bis}`),
    hole<unknown>(token, `/weight-service/weight/range/${von}/${bis}`),
  ]);

  // VO2max und Fitnessalter je Tag (eigene Endpunkte) — nur für die letzten 30 Tage,
  // damit der Abruf nicht ausufert.
  const koerper = await Promise.all(
    Array.from({ length: Math.min(tage, 30) }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ymd0 = ymd(d);
      return Promise.all([
        hole<unknown>(token, `/metrics-service/metrics/maxmet/daily/${ymd0}/${ymd0}`),
        hole<unknown>(token, `/fitnessage-service/fitnessage/v2/${ymd0}`),
      ]).then(([m, f]) => ({ datum: ymd0, maxmet: m, fitness: f }));
    }),
  );

  /** Liste aus verschiedenen Umschlagformen ziehen. */
  const liste = (roh: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(roh)) return roh as Array<Record<string, unknown>>;
    if (roh && typeof roh === 'object') {
      const o = roh as Record<string, unknown>;
      for (const k of ['dailySleepDTOs', 'sleepSummaries', 'summaries', 'values', 'items', 'data', 'days']) {
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
    const score = zahl(s.sleepScore) ?? zahl(s.overallSleepScore) ?? zahl(s.sleepScores);
    if (score) t.sleepScore = score;
    const q = zahl(s.sleepQuality);
    if (q) t.sleepQuality = q;
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

  // Gewicht
  if (gewicht) {
    for (const w of liste(gewicht)) {
      const d = String(w.calendarDate ?? w.date ?? w.samplePk ?? '').slice(0, 10);
      if (!d) continue;
      const kg = zahl(w.weight) ?? zahl(w.weightInGrams);
      const t = eintrag(d);
      // Garmin liefert teils Gramm — auf Kilogramm normalisieren.
      if (kg) t.weightKg = kg > 1000 ? Math.round((kg / 1000) * 10) / 10 : Math.round(kg * 10) / 10;
      const fett = zahl(w.bodyFat);
      if (fett) t.bodyFat = fett;
    }
  }

  // VO2max + Fitnessalter (Einzelabrufe je Tag)
  for (const k of koerper) {
    const t = eintrag(k.datum);
    const v = liste(k.maxmet)[0];
    if (v) {
      const vo2 = zahl(v.vo2Max) ?? zahl(v.vo2max) ?? zahl(v.value);
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
    if (v) eintrag(d).hrv = v;
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
    const avg = zahl(s.averageStressLevel) ?? zahl(s.avg) ?? zahl(s.value);
    const max = zahl(s.maxStressLevel) ?? zahl(s.max);
    const t = eintrag(d);
    if (avg) t.stressAvg = avg;
    if (max) t.stressMax = max;
  }

  // Body Battery
  if (bodyBattery == null) nichtVerfuegbar.push('Body Battery');
  for (const b of liste(bodyBattery)) {
    const d = String(b.calendarDate ?? b.date ?? b.summaryDate ?? '').slice(0, 10);
    if (!d) continue;
    const min = zahl(b.bodyBatteryMin) ?? zahl(b.min) ?? zahl(b.lowest);
    const max = zahl(b.bodyBatteryMax) ?? zahl(b.max) ?? zahl(b.highest);
    const t = eintrag(d);
    if (min != null) t.bodyBatteryMin = min;
    if (max != null) t.bodyBatteryMax = max;
  }

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

  // Tageszusammenfassung (Schritte, Etagen, Kalorien, Ruhepuls, Atmung)
  for (const s of liste(summary)) {
    const d = String(s.calendarDate ?? s.date ?? s.summaryDate ?? '').slice(0, 10);
    if (!d) continue;
    const t = eintrag(d);
    const steps2 = zahl(s.totalSteps) ?? zahl(s.steps);
    if (steps2 && !t.steps) t.steps = steps2;
    const floors = zahl(s.floorsClimbed) ?? zahl(s.totalFloors);
    if (floors) t.floorsClimbed = floors;
    const dist = zahl(s.totalDistanceMeters) ?? zahl(s.distance);
    if (dist) t.distanceMeters = Math.round(dist);
    const aktiv = zahl(s.activeKilocalories) ?? zahl(s.activeCalories);
    if (aktiv) t.activeCalories = Math.round(aktiv);
    const gesamt = zahl(s.totalKilocalories) ?? zahl(s.totalCalories);
    if (gesamt) t.totalCalories = Math.round(gesamt);
    const rest = zahl(s.restingHeartRate);
    if (rest && !t.restingHr) t.restingHr = rest;
    const atem = zahl(s.avgWakingRespirationValue) ?? zahl(s.respiration);
    if (atem) t.respirationAvg = atem;
    const minBb = zahl(s.bodyBatteryLowestValue);
    const maxBb = zahl(s.bodyBatteryMostRecentValue);
    if (minBb != null && t.bodyBatteryMin == null) t.bodyBatteryMin = minBb;
    if (maxBb != null && t.bodyBatteryMax == null) t.bodyBatteryMax = maxBb;
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
