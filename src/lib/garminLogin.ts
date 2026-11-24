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
 * Einen Tag über den Login-Zugang holen.
 *
 * Liefert dieselbe Form wie der offizielle Weg (`GarminTag`), damit die
 * Speicherung und die Ansichten unverändert bleiben.
 */
export async function tagPerLogin(tokensJson: string, datum: string): Promise<Record<string, unknown> | null> {
  const client = clientAusTokens(tokensJson);
  const garmin = new Garmin(client);

  try {
    // Tageszusammenfassung über den Connect-Endpunkt — enthält Schritte,
    // Kalorien, Puls, Stress, Body Battery, SpO₂ und Atmung in einem Aufruf.
    const roh = (await client.connectapi(
      `/usersummary-service/usersummary/daily?calendarDate=${datum}`,
    )) as Record<string, unknown> | null;
    if (!roh) return null;

    const tag: Record<string, unknown> = { date: datum };
    const zahl = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined;

    const schrittBlock = roh.steps as Record<string, unknown> | undefined;
    const schritte = zahl(schrittBlock?.value) ?? zahl(roh.totalSteps);
    if (schritte) tag.steps = schritte;

    const dist = zahl(schrittBlock?.distanceInMeters) ?? zahl(roh.totalDistanceMeters);
    if (dist) tag.distanceMeters = Math.round(dist);

    const etagen = zahl(schrittBlock?.floorsClimbed) ?? zahl(roh.floorsClimbed);
    if (etagen) tag.floorsClimbed = etagen;

    const kcal = roh.calories as Record<string, unknown> | undefined;
    if (kcal) {
      const aktiv = zahl(kcal.burnedActive) ?? zahl(kcal.activeKilocalories);
      const gesamt = zahl(kcal.burnedTotal);
      const ruhe = zahl(kcal.burnedResting);
      if (aktiv) tag.activeCalories = Math.round(aktiv);
      if (gesamt) tag.totalCalories = Math.round(gesamt);
      else if (aktiv && ruhe) tag.totalCalories = Math.round(aktiv + ruhe);
    }

    const hf = roh.heartRate as Record<string, unknown> | undefined;
    if (hf) {
      const rest = zahl(hf.restingValue) ?? zahl(hf.restingHeartRate);
      if (rest) tag.restingHr = rest;
      const min = zahl(hf.minValue);
      const max = zahl(hf.maxValue);
      if (min) tag.minHr = min;
      if (max) tag.maxHr = max;
    }

    const stress = roh.stress as Record<string, unknown> | undefined;
    if (stress) {
      const avg = zahl(stress.avgStressLevel) ?? zahl(stress.averageStressLevel);
      if (avg) tag.stressAvg = avg;
    }

    const bb = roh.bodyBattery as Record<string, unknown> | undefined;
    if (bb) {
      const min = zahl(bb.lowestValue);
      const max = zahl(bb.highestValue);
      if (min != null) tag.bodyBatteryMin = Math.round(min);
      if (max != null) tag.bodyBatteryMax = Math.round(max);
    }

    const spo2 = roh.spo2 as Record<string, unknown> | undefined;
    if (spo2) {
      const wert = zahl(spo2.averageValue);
      if (wert) tag.spo2Avg = Math.round(wert * 10) / 10;
    }

    return tag;
  } catch {
    return null;
  }
}

/**
 * Schlaf der letzten Nacht über den Login-Zugang.
 *
 * Diese Werte liefert die Personal API nicht: Schlafphasen, Schlaf-Stress,
 * nächtlicher SpO₂ und die Schlaf-Herzfrequenz.
 */
export async function schlafPerLogin(
  tokensJson: string,
  datum: string,
): Promise<Record<string, unknown> | null> {
  const client = clientAusTokens(tokensJson);
  try {
    const roh = (await client.connectapi(
      `/wellness-service/wellness/dailySleepData?date=${datum}&nonSleepBufferMinutes=60`,
    )) as Record<string, unknown> | null;
    if (!roh) return null;

    const dto = (roh.dailySleepDTO ?? {}) as Record<string, unknown>;
    const tag: Record<string, unknown> = { date: datum };

    const sek = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;

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

    const score = (dto.sleepScores ?? {}) as Record<string, unknown>;
    const gesamtwert = typeof score.overall === 'number' ? score.overall : undefined;
    if (gesamtwert) tag.sleepScore = Math.round(gesamtwert);
    const qualitaet = typeof score.qualityType === 'string' ? score.qualityType : undefined;
    if (qualitaet) tag.sleepQualityText = qualitaet;

    return tag;
  } catch {
    return null;
  }
}

/** Prüfen, ob die Tokens noch gelten (leichter Aufruf). */
export async function tokensGueltig(tokensJson: string): Promise<boolean> {
  try {
    const client = clientAusTokens(tokensJson);
    await client.connectapi('/userprofile-service/socialProfile');
    return true;
  } catch {
    return false;
  }
}
