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
  /** Login-Weg nennt das Feld `floors` — beide zulassen. */
  floors?: number;
  /** Garmin Readiness (0-100) und Einordnung — nur ueber den Login-Weg. */
  readiness?: number;
  readinessLevel?: string;
  /**
   * Bis wann Garmin für diesen Tag Daten hat (`wellnessEndTimeLocal`).
   * Endet beim letzten Sync der Uhr — nicht beim Abruf.
   */
  datenBis?: string;
  /** Garmin-Trainingsstatus, z. B. PRODUCTIVE, STRAINED. */
  trainingStatus?: string;
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
  /** Login-Weg nennt das Feld `respiration` (ohne Avg) — beide zulassen. */
  respiration?: number;
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
  /*
   * Nicht blind den Kalendertag von heute nehmen: frueh am Morgen hat er nur
   * Schritte und Puls, die Nacht fehlt noch — dann meldete die Anzeige
   * "11 Felder fehlen", obwohl gestern alles da war.
   * Deshalb der juengste Tag mit echter Datengrundlage (Schlaf oder Schritte).
   */
  const aussagekraeftig = [...tage]
    .reverse()
    .find((t) => {
      const r = t as Record<string, unknown>;
      return r.sleepSecs != null || Number(r.steps ?? 0) > 500;
    });
  const juengster = (aussagekraeftig ?? tage[tage.length - 1]) as Record<string, unknown>;

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


/*
 * Token zwischenspeichern.
 *
 * Der Access-Token gilt 24 Stunden. Ohne Cache kostet jeder Abgleich zwei
 * Anfragen (Token + Daten) — bei kurzem Takt frisst der Token-Tausch die
 * Haelfte des Tagesbudgets von 100 Anfragen auf.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function tokenSchluessel(apiKey: string): string {
  // Kein Klartext-Key als Map-Schluessel halten.
  return apiKey.slice(0, 8) + ':' + apiKey.slice(-8) + ':' + apiKey.length;
}

/** Token holen — aus dem Cache, wenn er noch mindestens 30 Minuten gilt. */
export async function garminTokenGecacht(apiKey: string): Promise<GarminToken> {
  const k = tokenSchluessel(apiKey);
  const treffer = tokenCache.get(k);
  if (treffer && treffer.expiresAt - Date.now() > 30 * 60_000) {
    return { token: treffer.token, expiresAt: treffer.expiresAt };
  }
  const frisch = await garminToken(apiKey);
  tokenCache.set(k, { token: frisch.token, expiresAt: frisch.expiresAt });
  return frisch;
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

/**
 * Ein GET gegen die Personal API.
 *
 * Wichtig: Ein Fehler wird NICHT still verschluckt. Vorher gab die Funktion bei
 * jedem Problem `null` zurueck — ein abgelaufener API-Key sah damit wie ein
 * erfolgreicher Abgleich aus, und die App zeigte ewig die alten Cache-Werte,
 * ohne dass irgendwo ein Fehler auftauchte.
 */
export class GarminApiFehler extends Error {
  constructor(public status: number | null, pfad: string, zusatz?: string) {
    super(
      status === 401 || status === 403
        ? 'Der Garmin-Zugang ist abgelaufen. Bitte in den Einstellungen einen neuen API-Key eintragen.'
        : zusatz ?? `Garmin-Abruf fehlgeschlagen (${status ?? 'keine Antwort'}) bei ${pfad}`,
    );
    this.name = 'GarminApiFehler';
  }
}

async function hole<T>(token: string, pfad: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${pfad}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new GarminApiFehler(null, pfad, `Netzwerkfehler: ${(e as Error).message}`);
  }
  // 204 = keine Daten fuer diesen Tag — das ist kein Fehler.
  if (res.status === 204) return null;

  /*
   * Nur ein Auth-Fehler bricht den ganzen Abgleich ab.
   *
   * 401/403 heisst: der Key gilt nicht mehr — dann sind ALLE Abrufe sinnlos.
   *
   * Andere Fehler (400, 404, 500) betreffen genau diesen einen Endpunkt. Sie
   * duerfen den Rest nicht mitreissen: Garmins `dailyHeartRate` antwortet je
   * nach Konto mit 400, und vorher hat das den kompletten Sync verhindert und
   * sogar das Speichern des Keys blockiert. Solche Antworten gelten als
   * "keine Daten" und werden geloggt.
   */
  if (res.status === 401 || res.status === 403) {
    throw new GarminApiFehler(res.status, pfad);
  }
  if (!res.ok) {
    console.warn(`[garmin] ${pfad} -> HTTP ${res.status} (übersprungen)`);
    return null;
  }
  return (await res.json()) as T;
}

/** Ein Messpunkt einer Einheit: Zeit, Puls, Pace, Höhe, Kadenz … */
export type GarminMesspunkt = {
  /** Sekunden seit Beginn der Einheit. */
  t: number;
  hr?: number;
  /** Geschwindigkeit in m/s. */
  speed?: number;
  /** Grad der Steigung/Gefälls. */
  elevation?: number;
  cadence?: number;
  power?: number;
  bodyBattery?: number;
  temperature?: number;
  /** Zurückgelegte Strecke in Metern (kumuliert). */
  distance?: number;
};

/**
 * Zeitreihen einer Einheit abrufen.
 *
 * Ohne diese Daten bleiben die Detailseiten bei Einzelwerten — Tim will bei einem
 * Lauf aber verlaufen sehen, wie Puls, Pace und Höhe sich entwickelt haben.
 * Garmin liefert je Einheit bis zu 1800 Messpunkte über 26 Metriken.
 */
export async function ladeEinheitZeitreihen(
  apiKey: string,
  activityId: number,
): Promise<GarminMesspunkt[]> {
  const { token } = await garminToken(apiKey);
  const roh = await hole<{
    metricDescriptors?: Array<{ key: string; metricsIndex: number }>;
    activityDetailMetrics?: Array<{ metrics: Array<number | null> }>;
  }>(
    token,
    `/activity-service/activity/${activityId}/details?maxChartSize=2000&maxPolylineSize=5000`,
  );
  if (!roh?.metricDescriptors || !roh.activityDetailMetrics) return [];

  // Spaltennamen auf die Indizes abbilden — die Reihenfolge ist nicht stabil.
  const idx = new Map<string, number>();
  for (const d of roh.metricDescriptors) idx.set(d.key, d.metricsIndex);

  const holeWert = (werte: Array<number | null>, key: string): number | undefined => {
    const i = idx.get(key);
    if (i == null) return undefined;
    const v = werte[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };

  const punkte: GarminMesspunkt[] = [];
  let startzeit: number | null = null;

  for (const zeile of roh.activityDetailMetrics) {
    const w = zeile.metrics ?? [];
    const ts = holeWert(w, 'directTimestamp');
    if (ts == null) continue;
    if (startzeit == null) startzeit = ts;
    const t = Math.max(0, Math.round((ts - startzeit) / 1000));

    const punkt: GarminMesspunkt = { t };
    const hr = holeWert(w, 'directHeartRate');
    if (hr) punkt.hr = Math.round(hr);
    const speed = holeWert(w, 'directSpeed');
    if (speed != null && speed > 0) punkt.speed = speed;
    const elev = holeWert(w, 'directElevation');
    if (elev != null) punkt.elevation = Math.round(elev * 10) / 10;
    const cad = holeWert(w, 'directRunCadence') ?? holeWert(w, 'directDoubleCadence');
    if (cad) punkt.cadence = Math.round(cad);
    const power = holeWert(w, 'directPower');
    if (power) punkt.power = Math.round(power);
    const bb = holeWert(w, 'directBodyBattery');
    if (bb) punkt.bodyBattery = Math.round(bb);
    const temp = holeWert(w, 'directAirTemperature');
    if (temp != null) punkt.temperature = Math.round(temp * 10) / 10;
    const dist = holeWert(w, 'sumDistance');
    if (dist) punkt.distance = Math.round(dist);

    punkte.push(punkt);
  }

  /*
   * Auf ~200 Punkte ausdünnen: 1800 Werte pro Diagramm sind im Browser unnötig
   * schwer und im SVG nicht mehr unterscheidbar.
   */
  if (punkte.length <= 240) return punkte;
  const schritt = punkte.length / 240;
  const duenn: GarminMesspunkt[] = [];
  for (let i = 0; i < 240; i++) duenn.push(punkte[Math.floor(i * schritt)]);
  if (duenn[duenn.length - 1] !== punkte[punkte.length - 1]) duenn.push(punkte[punkte.length - 1]);
  return duenn;
}

/** Eine Aktivität, die Tim mit der Uhr getrackt hat. */
export type GarminAktivitaet = {
  activityId: number;
  date: string;
  name: string;
  type: string;
  distanceM?: number;
  durationSecs?: number;
  movingSecs?: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  elevationM?: number;
};

/**
 * Aktivitäten abrufen.
 *
 * Wichtig: Trainings, die Tim einfach mit der Uhr aufzeichnet (ohne geplante
 * Einheit), landen nur hier — nicht in den Tageswerten und nicht im Wochenplan.
 * Ohne diesen Abruf fehlen sie in der App komplett.
 */
export async function syncGarminAktivitaeten(
  apiKey: string,
  limit = 30,
): Promise<GarminAktivitaet[]> {
  const { token } = await garminToken(apiKey);
  const roh = await hole<unknown[]>(
    token,
    `/activitylist-service/activities/search/activities?limit=${limit}&start=0`,
  );
  if (!Array.isArray(roh)) return [];

  const ergebnis: GarminAktivitaet[] = [];
  for (const eintrag of roh as Array<Record<string, unknown>>) {
    const id = Number(eintrag.activityId);
    if (!Number.isFinite(id)) continue;
    const typ = eintrag.activityType as Record<string, unknown> | undefined;
    const start = String(eintrag.startTimeLocal ?? eintrag.startTimeGMT ?? '');
    // startTimeLocal kommt als "2026-11-23 12:24:43" — Datum reicht.
    const datum = start.slice(0, 10);
    if (!datum) continue;
    ergebnis.push({
      activityId: id,
      date: datum,
      name: String(eintrag.activityName ?? ''),
      type: String(typ?.typeKey ?? 'other'),
      distanceM: zahl(eintrag.distance),
      durationSecs: zahl(eintrag.duration) != null ? Math.round(zahl(eintrag.duration)!) : undefined,
      movingSecs:
        zahl(eintrag.movingDuration) != null ? Math.round(zahl(eintrag.movingDuration)!) : undefined,
      avgHr: zahl(eintrag.averageHR) != null ? Math.round(zahl(eintrag.averageHR)!) : undefined,
      maxHr: zahl(eintrag.maxHR) != null ? Math.round(zahl(eintrag.maxHR)!) : undefined,
      calories: zahl(eintrag.calories) != null ? Math.round(zahl(eintrag.calories)!) : undefined,
      elevationM: zahl(eintrag.elevationGain),
    });
  }
  return ergebnis;
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

/**
 * Aufgaben mit begrenzter Parallelitaet abarbeiten.
 *
 * Warum nicht `Promise.all`: dann starten alle Abrufe gleichzeitig und der
 * Fortschrittszaehler springt am Ende von 0 auf 27 — man sieht nie, dass etwas
 * passiert. Mit einer kleinen Warteschlange laufen die Abrufe nacheinander in
 * Gruppen, der Zaehler steigt gleichmaessig, und Garmin wird nicht mit 40
 * gleichzeitigen Anfragen belegt.
 */
async function inPortionen<T, R>(
  posten: T[],
  gleichzeitig: number,
  arbeit: (p: T, index: number) => Promise<R>,
): Promise<R[]> {
  const ergebnisse = new Array<R>(posten.length);
  let naechster = 0;

  const arbeiter = async (): Promise<void> => {
    while (true) {
      const i = naechster;
      naechster += 1;
      if (i >= posten.length) return;
      ergebnisse[i] = await arbeit(posten[i], i);
    }
  };

  // So viele Arbeiter starten, wie gleichzeitig erlaubt sind.
  await Promise.all(Array.from({ length: Math.min(gleichzeitig, posten.length) }, arbeiter));
  return ergebnisse;
}

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
  const anzahlEinzel = Math.min(tage, 14);
  /*
   * Nur 7 Tage Koerperwerte statt 30: VO2max und Fitnessalter aendern sich nicht
   * taeglich, und der Tageswert kommt ueber den leichten Lauf. 30 Tage kosteten
   * 60 Anfragen pro Lauf - mit 7 sind es 14, das haelt das Tagesbudget ein.
   */
  const anzahlKoerper = Math.min(tage, 7);
  // 9 Sammelabrufe + Tagesdetails + Koerperwerte (2 je Tag). Die Aktivitaeten
  // werden ausserhalb geholt und nicht mitgezaehlt — sonst endet die Anzeige bei 83/84.
  const gesamtSchritte = 9 + anzahlEinzel + anzahlKoerper * 2;
  // Startwert sofort melden, damit die Anzeige nicht bei 0/… stehen bleibt.
  onFortschritt?.({ schritt: 0, gesamt: gesamtSchritte });
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

  /*
   * Die neun Sammelabrufe laufen in Zweiergruppen statt alle gleichzeitig.
   * Damit steigt der Fortschrittszaehler sichtbar Schritt fuer Schritt.
   */
  const sammelPfade: Array<{ pfad: string; profil?: boolean }> = [
    { pfad: '/userprofile-service/userprofile/settings', profil: true },
    { pfad: `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${von}&endDate=${bis}` },
    { pfad: `/hrv-service/hrv/daily/${von}/${bis}` },
    { pfad: `/usersummary-service/stats/steps/daily/${kurzVon}/${bis}` },
    { pfad: `/usersummary-service/stats/stress/daily/${kurzVon}/${bis}` },
    { pfad: `/wellness-service/wellness/daily/spo2acclimation/${heute}` },
    { pfad: '/health-service/wellness/dailyHeartRate' },
    { pfad: `/usersummary-service/v2/dailysummaries?startDate=${von}&endDate=${bis}` },
    { pfad: `/weight-service/weight/range/${von}/${bis}` },
  ];
  const sammelErgebnis = await inPortionen(sammelPfade, 2, async (p) => {
    const r = await hole<unknown>(token, p.pfad);
    tick();
    return r;
  });
  const [profil, schlaf, hrv, steps, stress, spo2, herz, summary, gewicht] = sammelErgebnis as [
    { displayName?: string; fullName?: string } | null,
    unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown,
  ];

  /*
   * Tages-Einzelabruf: `usersummary/daily?calendarDate=…` ist die vollstaendigste
   * Quelle — sie liefert Etagen, Schritte, Distanz, Stress, Body Battery, SpO2 und
   * Atmung in einem Objekt. Die Sammel-Endpunkte lassen genau diese Felder weg,
   * deshalb kam vorher fast nichts an. Begrenzt auf die letzten 14 Tage, damit der
   * Abgleich schnell bleibt.
   */
  const tagesDaten = Array.from({ length: anzahlEinzel }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return ymd(d);
  });
  const tagesEinzel = await inPortionen(tagesDaten, 3, async (datum) => {
    const daten = await hole<Record<string, unknown>>(
      token,
      `/usersummary-service/usersummary/daily?calendarDate=${datum}`,
    );
    tick();
    return { datum, daten };
  });

  // VO2max und Fitnessalter je Tag (eigene Endpunkte) — nur für die letzten 30 Tage,
  // damit der Abruf nicht ausufert.
  const koerperDaten = Array.from({ length: anzahlKoerper }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return ymd(d);
  });
  const koerper = await inPortionen(koerperDaten, 3, async (ymd0) => {
    const [maxmet, fitness] = await Promise.all([
      hole<unknown>(token, `/metrics-service/metrics/maxmet/daily/${ymd0}/${ymd0}`),
      hole<unknown>(token, `/fitnessage-service/fitnessage/v2/${ymd0}`),
    ]);
    // Beide Abrufe zaehlen einzeln, damit der Balken gleichmaessig laeuft.
    tick();
    tick();
    return { datum: ymd0, maxmet, fitness };
  });

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

/**
 * Leichter Abgleich: nur der heutige Tag.
 *
 * Tims Vorgabe war ein schneller Refresh, aber unter 100 Anfragen pro Tag.
 * Ein voller Abgleich kostet rund 85 Anfragen (9 Sammel + 14 Tagesdetails +
 * 30 x 2 Koerperwerte) — damit waere nur ein Lauf pro Tag moeglich gewesen.
 *
 * Dieser Weg holt ausschliesslich den heutigen Tagesabruf (Schritte, Kalorien,
 * Puls, Stress, Body Battery, SpO2 in einem Objekt) und braucht dafuer drei
 * Anfragen: Token, Tag, Aktivitaeten. Damit ist ein Takt von 20 Minuten
 * (72 Anfragen/Tag) unkritisch.
 *
 * Der volle Abgleich laeuft weiter seltener und zieht die Historie nach.
 */
export async function syncGarminHeute(apiKey: string): Promise<GarminTag | null> {
  const { token } = await garminTokenGecacht(apiKey);
  const heute = ymd(new Date());

  const daten = await hole<Record<string, unknown>>(
    token,
    `/usersummary-service/usersummary/daily?calendarDate=${heute}`,
  );
  if (!daten) return null;

  // Dieselbe Auswertung wie im vollen Abgleich — nur fuer einen Tag.
  const tag: GarminTag = { date: heute };
  const s = daten;

  const zahl = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  const schrittBlock = s.steps as Record<string, unknown> | undefined;
  const schritte = zahl(schrittBlock?.value) ?? zahl(s.totalSteps) ?? zahl(s.steps);
  if (schritte) tag.steps = schritte;

  const distRaw = zahl(schrittBlock?.distanceInMeters) ?? zahl(s.totalDistanceMeters) ?? zahl(s.distance);
  if (distRaw) tag.distanceMeters = Math.round(distRaw);

  const etagen = zahl(schrittBlock?.floorsClimbed) ?? zahl(s.floorsClimbed) ?? zahl(s.floors);
  if (etagen) tag.floorsClimbed = etagen;

  const kcal = s.calories as Record<string, unknown> | undefined;
  if (kcal) {
    const aktiv = zahl(kcal.burnedActive) ?? zahl(kcal.activeKilocalories);
    const gesamt = zahl(kcal.burnedTotal);
    const ruhe = zahl(kcal.burnedResting);
    if (aktiv) tag.activeCalories = Math.round(aktiv);
    if (gesamt) tag.totalCalories = Math.round(gesamt);
    else if (aktiv && ruhe) tag.totalCalories = Math.round(aktiv + ruhe);
  }

  const hf = s.heartRate as Record<string, unknown> | undefined;
  if (hf) {
    const rest = zahl(hf.restingValue) ?? zahl(hf.restingHeartRate);
    const min = zahl(hf.minValue);
    const max = zahl(hf.maxValue);
    if (rest) tag.restingHr = rest;
    if (min) tag.minHr = min;
    if (max) tag.maxHr = max;
  }

  const stressBlock = s.stress as Record<string, unknown> | undefined;
  if (stressBlock) {
    const avg = zahl(stressBlock.avgStressLevel) ?? zahl(stressBlock.averageStressLevel);
    if (avg) tag.stressAvg = avg;
  }

  const bb = s.bodyBattery as Record<string, unknown> | undefined;
  if (bb) {
    const min = zahl(bb.lowestValue);
    const max = zahl(bb.highestValue);
    if (min != null) tag.bodyBatteryMin = Math.round(min);
    if (max != null) tag.bodyBatteryMax = Math.round(max);
  }

  const spo2 = s.spo2 as Record<string, unknown> | undefined;
  if (spo2) {
    const wert = zahl(spo2.averageValue);
    if (wert) tag.spo2Avg = Math.round(wert * 10) / 10;
  }

  return tag;
}

