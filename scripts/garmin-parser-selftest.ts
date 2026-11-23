/**
 * Prueft den Garmin-Parser gegen echte API-Antworten.
 *
 * Ohne diesen Test blieb unbemerkt, dass vier von sieben Endpunkten ins Leere
 * liefen: Garmin antwortet bei falschen Parametern mit HTTP 400 und leerem Body,
 * also ohne Fehlermeldung.
 */
import { readFileSync } from 'node:fs';

const ORDNER = '/opt/data/profiles/coding/cache/scratch/gr';
const lies = (name: string) => JSON.parse(readFileSync(`${ORDNER}/${name}`, 'utf8'));

// Parser-Hilfen aus garmin.ts nachgebaut (gleiche Logik, isoliert testbar).
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

function liste(roh: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(roh)) return roh as Array<Record<string, unknown>>;
  if (roh && typeof roh === 'object') {
    const o = roh as Record<string, unknown>;
    for (const k of ['dailySleepDTOs', 'sleepSummaries', 'summaries', 'hrvSummaries', 'values', 'items', 'data', 'days']) {
      if (Array.isArray(o[k])) return o[k] as Array<Record<string, unknown>>;
    }
    if (o.calendarDate || o.date || o.summaryDate) return [o];
  }
  return [];
}

let fehler = 0;
const pruefe = (name: string, ist: unknown, soll: string) => {
  const ok = ist != null && ist !== '' ;
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name.padEnd(32)} ${String(ist)}   (erwartet: ${soll})`);
  if (!ok) fehler += 1;
};

// ── Schlaf ────────────────────────────────────────────────────────────────
const schlafRoh = lies('sleep.json');
const schlaf = liste(schlafRoh);
pruefe('Schlaf: Tage', schlaf.length, '> 0');
const s0 = schlaf[schlaf.length - 1];
const scores = s0.sleepScores as Record<string, unknown>;
const overall = scores?.overall as Record<string, unknown>;
pruefe('Schlaf: Dauer (s)', s0.sleepTimeSeconds, 'Sekunden');
pruefe('Schlaf: Score', zahl(overall), 'sleepScores.overall.value');
pruefe('Schlaf: Tiefschlaf (s)', s0.deepSleepSeconds, 'Sekunden');
pruefe('Schlaf: REM (s)', s0.remSleepSeconds, 'Sekunden');
pruefe('Schlaf: Leicht (s)', s0.lightSleepSeconds, 'Sekunden');
pruefe('Schlaf: Wach (s)', s0.awakeSleepSeconds, 'Sekunden');

// ── Tageszusammenfassung ──────────────────────────────────────────────────
const daily = liste(lies('daily.json'));
pruefe('Daily: Tage', daily.length, '> 0');
const d0 = daily[daily.length - 1];
const kcal = d0.calories as Record<string, unknown>;
const hf = d0.heartRate as Record<string, unknown>;
const stressBlock = d0.stress as Record<string, unknown>;
const akku = d0.bodyBattery as Record<string, unknown>;
const atem = d0.respiration as Record<string, unknown>;
const bewegung = d0.movement as Record<string, unknown>;
const schrittBlock = bewegung?.steps as Record<string, unknown>;
pruefe('Daily: Schritte', zahl(schrittBlock?.value), 'movement.steps.value');
pruefe('Daily: Distanz', zahl(schrittBlock?.distanceInMeters), 'movement.steps.distanceInMeters');
pruefe('Daily: kcal aktiv', zahl(kcal?.burnedActive), 'calories.burnedActive');
pruefe('Daily: kcal gesamt', zahl(kcal?.burnedTotal), 'calories.burnedTotal');
pruefe('Daily: Ruhepuls', zahl(hf?.restingValue), 'heartRate.restingValue');
pruefe('Daily: Puls min', zahl(hf?.minValue), 'heartRate.minValue');
pruefe('Daily: Puls max', zahl(hf?.maxValue), 'heartRate.maxValue');
pruefe('Daily: Stress Ø', zahl(stressBlock?.avgLevel), 'stress.avgLevel');
pruefe('Daily: Stress max', zahl(stressBlock?.maxLevel), 'stress.maxLevel');
pruefe('Daily: BodyBattery max', zahl(akku?.maxValue), 'bodyBattery.maxValue');
pruefe('Daily: BodyBattery min', zahl(akku?.minValue), 'bodyBattery.minValue');
pruefe('Daily: Atmung', zahl(atem?.avgValue), 'respiration.avgValue');

// ── Schritte und Stress (eigene Endpunkte) ────────────────────────────────
const steps = liste(lies('steps.json'));
pruefe('Steps: Tage', steps.length, '> 0');
pruefe('Steps: Wert', steps[steps.length - 1]?.totalSteps, 'totalSteps');

const stress = liste(lies('stress.json'));
pruefe('Stress: Tage', stress.length, '> 0');
const sv = stress[stress.length - 1]?.values as Record<string, unknown> | undefined;
pruefe('Stress: Level', zahl(sv?.overallStressLevel), 'values.overallStressLevel');

// ── HRV, Gewicht, VO2max ──────────────────────────────────────────────────
const hrv = liste(lies('hrv.json'));
pruefe('HRV: Tage', hrv.length, '> 0');
const h0 = hrv[hrv.length - 1];
pruefe('HRV: Wert', zahl(h0?.lastNightAvg) ?? zahl(h0?.hrvValue) ?? zahl(h0?.weeklyAvg), 'lastNightAvg');

const gewicht = lies('weight.json');
const gw = liste(gewicht).length ? liste(gewicht) : (gewicht?.dailyWeightSummaries ?? []);
pruefe('Gewicht: Eintraege', gw.length, '> 0');

const maxmet = lies('maxmet.json');
pruefe('VO2max vorhanden', JSON.stringify(maxmet).length > 10, 'nicht leer');

console.log(`\nERGEBNIS: ${fehler === 0 ? 'alles gruen' : fehler + ' Fehler'}`);
process.exit(fehler === 0 ? 0 : 1);
