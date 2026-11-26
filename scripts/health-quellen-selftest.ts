/**
 * Selbsttest für den Health-Parser.
 *
 * Prüft beide Nutzlast-Formate gegen echte Beispiele sowie die kniffligen
 * Fälle: Zeitzonen, Schlafphasen in Sekunden, Puls-Aggregate, Einheiten.
 */

import { parseHealthNutzlast, parseHealthConnect, parseAppleHealth, tagVon } from '../src/lib/healthQuellen';

let fehler = 0;
const pruefe = (name: string, ist: unknown, soll: unknown) => {
  const a = JSON.stringify(ist);
  const b = JSON.stringify(soll);
  if (a !== b) {
    fehler += 1;
    console.error(`FEHLER ${name}\n  ist:  ${a}\n  soll: ${b}`);
  } else {
    console.log(`ok  ${name}`);
  }
};

/* ── Health Connect: Tageswerte mit Intervallen ── */
const hc = {
  timestamp: '2026-11-26T07:00:00Z',
  app_version: '1.2.3',
  steps: [
    { count: 1200, start_time: '2026-11-26T05:00:00Z', end_time: '2026-11-26T06:00:00Z' },
    { count: 800, start_time: '2026-11-26T06:00:00Z', end_time: '2026-11-26T07:00:00Z' },
  ],
  active_calories: [
    { calories: 120, start_time: '2026-11-26T05:00:00Z', end_time: '2026-11-26T07:00:00Z' },
  ],
  total_calories: [
    { calories: 900, start_time: '2026-11-26T00:00:00Z', end_time: '2026-11-26T07:00:00Z' },
  ],
  resting_heart_rate: [{ bpm: 64, time: '2026-11-26T06:30:00Z' }],
  heart_rate: [
    {
      time: '2026-11-26T06:30:00Z',
      aggregate: { avg: 70, min: 55, max: 132 },
    },
  ],
  sleep: [
    {
      session_end_time: '2026-11-26T05:30:00Z',
      duration: 27000,
      stages: [
        { stage: 'deep', duration: 5400 },
        { stage: 'light', duration: 16200 },
        { stage: 'rem', duration: 5400 },
        { stage: 'awake', duration: 600 },
      ],
    },
  ],
  weight: [{ kilograms: 113.4, time: '2026-11-26T05:10:00Z' }],
  body_fat: [{ percentage: 30.0, time: '2026-11-26T05:10:00Z' }],
  oxygen_saturation: [{ percentage: 97, time: '2026-11-26T05:20:00Z' }],
  /* Wird nicht zugeordnet — muss als unbekannt gemeldet werden, nicht verschwinden. */
  hydration: [{ liters: 0.5, start_time: '2026-11-26T06:00:00Z', end_time: '2026-11-26T06:01:00Z' }],
};

const hcErg = parseHealthConnect(hc);
pruefe('HC: ein Tag erkannt', hcErg.tage.length, 1);
pruefe('HC: Schritte summiert', hcErg.tage[0].werte.steps, 2000);
pruefe('HC: aktive kcal', hcErg.tage[0].werte.activeCalories, 120);
pruefe('HC: Ruhepuls', hcErg.tage[0].werte.restingHr, 64);
pruefe('HC: Puls max', hcErg.tage[0].werte.maxHr, 132);
pruefe('HC: Schlafdauer', hcErg.tage[0].werte.sleepSecs, 27000);
pruefe('HC: Tiefschlaf', hcErg.tage[0].werte.deepSecs, 5400);
pruefe('HC: REM', hcErg.tage[0].werte.remSecs, 5400);
pruefe('HC: Wach', hcErg.tage[0].werte.awakeSecs, 600);
pruefe('HC: Gewicht', hcErg.tage[0].werte.weightKg, 113.4);
pruefe('HC: Körperfett', hcErg.tage[0].werte.bodyFat, 30);
pruefe('HC: SpO2', hcErg.tage[0].werte.spo2Avg, 97);
pruefe('HC: unbekannt gemeldet', hcErg.unbekannt, ['hydration']);

/* Der Stand muss der späteste Zeitpunkt des Tages sein (07:00 UTC). */
pruefe('HC: Stand = spätestes Ereignis', hcErg.tage[0].stand.toISOString(), '2026-11-26T07:00:00.000Z');

/* ── Apple Health: metrics-Format ── */
const ah = {
  data: {
    metrics: [
      {
        name: 'step_count',
        units: 'count',
        data: [
          { qty: 3500, date: '2026-11-26 06:00:00 +0100' },
          { qty: 1500, date: '2026-11-26 09:00:00 +0100' },
        ],
      },
      {
        name: 'active_energy',
        units: 'kcal',
        data: [{ qty: 260, date: '2026-11-26 09:00:00 +0100' }],
      },
      {
        name: 'resting_heart_rate',
        units: 'count/min',
        data: [{ qty: 62, date: '2026-11-26 07:00:00 +0100' }],
      },
      {
        name: 'heart_rate',
        units: 'count/min',
        data: [{ Min: 52, Avg: 71, Max: 148, date: '2026-11-26 09:00:00 +0100' }],
      },
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [{ qty: 7.5, date: '2026-11-26 06:00:00 +0100' }],
      },
      {
        name: 'body_weight',
        units: 'kg',
        data: [{ qty: 113.2, date: '2026-11-26 06:30:00 +0100' }],
      },
      /* Nicht zugeordnet. */
      {
        name: 'mindful_session',
        units: 'min',
        data: [{ qty: 10, date: '2026-11-26 08:00:00 +0100' }],
      },
    ],
  },
};

const ahErg = parseAppleHealth(ah);
pruefe('AH: ein Tag erkannt', ahErg.tage.length, 1);
pruefe('AH: Schritte summiert', ahErg.tage[0].werte.steps, 5000);
pruefe('AH: aktive kcal', ahErg.tage[0].werte.activeCalories, 260);
pruefe('AH: Ruhepuls', ahErg.tage[0].werte.restingHr, 62);
pruefe('AH: Puls min', ahErg.tage[0].werte.minHr, 52);
pruefe('AH: Puls max', ahErg.tage[0].werte.maxHr, 148);
/* 7,5 Stunden in Sekunden — die Einheit muss umgerechnet werden. */
pruefe('AH: Schlaf in Sekunden', ahErg.tage[0].werte.sleepSecs, 27000);
pruefe('AH: Gewicht', ahErg.tage[0].werte.weightKg, 113.2);
pruefe('AH: unbekannt gemeldet', ahErg.unbekannt.length, 1);

/* ── Format-Erkennung ── */
pruefe('Erkennung: HC', parseHealthNutzlast(hc).quelle, 'healthconnect');
pruefe('Erkennung: AH', parseHealthNutzlast(ah).quelle, 'applehealth');

/* ── Zeitzone: 23:30 UTC ist in Berlin schon der nächste Tag ── */
const grenzfall = {
  steps: [{ count: 42, start_time: '2026-11-26T23:30:00Z', end_time: '2026-11-26T23:30:00Z' }],
};
const grenzErg = parseHealthConnect(grenzfall);
pruefe('TZ: 23:30 UTC → 27.11. in Berlin', grenzErg.tage[0].date, '2026-11-27');
pruefe('tagVon direkt', tagVon(new Date('2026-11-26T23:30:00Z')), '2026-11-27');

/* ── Fehlende Felder dürfen nichts erfinden ── */
const leer = parseHealthConnect({ timestamp: '2026-11-26T07:00:00Z' });
pruefe('Leer: keine Tage', leer.tage.length, 0);
pruefe('Leer: keine Felder', leer.felder.length, 0);

const muell = parseHealthNutzlast({ irgendwas: 'anderes' });
pruefe('Müll: keine Ausnahme, keine Tage', muell.tage.length, 0);

/* ── Zeitstempel als Zahl (Unix) ── */
const zahlFall = {
  steps: [{ count: 100, start_time: 1764135000, end_time: 1764135000 }],
};
const zahlErg = parseHealthConnect(zahlFall);
pruefe('Unix-Sekunden erkannt', zahlErg.tage.length, 1);

if (fehler) {
  console.error(`\n${fehler} Fehler`);
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
