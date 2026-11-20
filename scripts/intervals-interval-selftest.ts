
/** Prueft Sync-Intervall-Normalisierung und Faelligkeit. */
import { normalisiereIntervall, syncFaellig } from '../src/lib/intervals';

let fehler = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok    ' : 'FEHLER'} ${name}${detail ? ' -> ' + detail : ''}`);
  if (!ok) fehler++;
}

// Normalisierung
check('0 bleibt 0', normalisiereIntervall(0) === 0);
check('3 bleibt 3', normalisiereIntervall(3) === 3);
check('24 bleibt 24', normalisiereIntervall(24) === 24);
check('999 -> 6', normalisiereIntervall(999) === 6);
check('"abc" -> 6', normalisiereIntervall('abc') === 6);
check('undefined -> 6', normalisiereIntervall(undefined) === 6);
check('-1 -> 6', normalisiereIntervall(-1) === 6);

// Faelligkeit
const jetzt = Date.parse('2026-11-20T12:00:00Z');
check('ohne Key nie faellig', syncFaellig(undefined, jetzt) === false);
check('Intervall 0 = nur manuell', syncFaellig({ apiKey: 'k', syncIntervalHours: 0 }, jetzt) === false);

const vor2h = new Date(jetzt - 2 * 3600_000).toISOString();
const vor7h = new Date(jetzt - 7 * 3600_000).toISOString();
check('6h-Intervall, vor 2h -> nicht faellig', syncFaellig({ apiKey: 'k', syncIntervalHours: 6, lastAutoSyncAt: vor2h }, jetzt) === false);
check('6h-Intervall, vor 7h -> faellig', syncFaellig({ apiKey: 'k', syncIntervalHours: 6, lastAutoSyncAt: vor7h }, jetzt) === true);
check('1h-Intervall, vor 2h -> faellig', syncFaellig({ apiKey: 'k', syncIntervalHours: 1, lastAutoSyncAt: vor2h }, jetzt) === true);
check('24h, vor 7h -> nicht faellig', syncFaellig({ apiKey: 'k', syncIntervalHours: 24, lastAutoSyncAt: vor7h }, jetzt) === false);

// Fallback auf cache.fetchedAt, wenn lastAutoSyncAt fehlt
check(
  'ohne lastAutoSyncAt -> nutzt fetchedAt',
  syncFaellig({ apiKey: 'k', syncIntervalHours: 6, cache: { fetchedAt: vor7h, activities: [], wellness: [] } }, jetzt) === true,
);
check(
  'ohne beide Zeitstempel -> faellig',
  syncFaellig({ apiKey: 'k', syncIntervalHours: 6 }, jetzt) === true,
);

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler) process.exit(1);
