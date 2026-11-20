
/** Prueft die Intervals.icu-Anbindung gegen die echte API (ohne gueltigen Key = Fehlerpfad). */
import { fetchAthlete, syncIntervals, buildIntervalsContext } from '../src/lib/intervals';

async function erwarteFehler(name: string, fn: () => Promise<unknown>, mussEnthalten: string) {
  try {
    await fn();
    console.log(`FEHLER ${name}: kein Fehler geworfen`);
    return 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(mussEnthalten)) {
      console.log(`FEHLER ${name}: "${msg}" enthaelt nicht "${mussEnthalten}"`);
      return 1;
    }
    console.log(`ok     ${name} -> ${msg}`);
    return 0;
  }
}

let fehler = 0;
fehler += await erwarteFehler('falscher Key', () => fetchAthlete('definitiv-kein-gueltiger-key', '0'), '401');

// Erreichbarkeit + Auth-Header: leerer Key auch abgelehnt
fehler += await erwarteFehler('leerer Key', () => syncIntervals('', '0', 7), '401');

// Kontext ohne Verbindung bleibt leer
const leer = buildIntervalsContext(undefined);
console.log(leer === '' ? 'ok     kein Kontext ohne Verbindung' : 'FEHLER Kontext sollte leer sein');
if (leer !== '') fehler++;

// Kontext mit Beispieldaten
const ctx = buildIntervalsContext({
  apiKey: 'x',
  cache: {
    fetchedAt: '2026-11-20T08:00:00.000Z',
    athlete: { name: 'Tim', weight: 105, max_hr: 190 },
    activities: [
      { id: '1', type: 'Run', name: 'Morgenlauf', start_date_local: '2026-11-19T07:00:00', moving_time: 1800, distance: 5000, avg_hr: 152, icu_training_load: 42, calories: 400 },
    ],
    wellness: [{ date: '2026-11-19', ctl: 40, atl: 45, tsb: -5, restingHr: 58 }],
  },
});
const checks: Array<[string, boolean]> = [
  ['Athlet im Kontext', ctx.includes('Tim')],
  ['Aktivitaet im Kontext', ctx.includes('Morgenlauf')],
  ['TSB im Kontext', ctx.includes('-5')],
  ['Header', ctx.includes('GARMIN / INTERVALS.ICU')],
];
for (const [n, ok] of checks) {
  console.log(`${ok ? 'ok    ' : 'FEHLER'} ${n}`);
  if (!ok) fehler++;
}

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler) process.exit(1);
