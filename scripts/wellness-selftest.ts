
/** Prueft die Garmin-Auswertung (Schlaf, Form, Aggregate). */
import { schlafStunden, formLabel, schlafBewertung, mittel, summe, letzter } from '../src/lib/wellness';

let fehler = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok    ' : 'FEHLER'} ${name}${detail ? ' -> ' + detail : ''}`);
  if (!ok) fehler++;
}

// Schlafstunden
check('25860 s = 7.2 h', schlafStunden(25860) === 7.2, String(schlafStunden(25860)));
check('0 s = null', schlafStunden(0) === null);
check('null = null', schlafStunden(null) === null);
check('negativ = null', schlafStunden(-100) === null);

// Form
check('TSB +10 -> frisch', formLabel(10).text === 'frisch');
check('TSB 0 -> ausgeglichen', formLabel(0).text === 'ausgeglichen');
check('TSB -20 -> belastet', formLabel(-20).text === 'belastet');
check('TSB -40 -> ueberlastet', formLabel(-40).text === 'überlastet', formLabel(-40).text);
check('TSB null -> leer', formLabel(null).tone === 'leer');

// Schlafscore
check('Score 85 -> sehr gut', schlafBewertung(85) === 'sehr gut');
check('Score 65 -> gut', schlafBewertung(65) === 'gut');
check('Score 45 -> maessig', schlafBewertung(45) === 'mäßig');
check('Score 20 -> schlecht', schlafBewertung(20) === 'schlecht');

// Aggregate
check('mittel ignoriert null', mittel([2, null, 4, undefined]) === 3);
check('mittel ohne Werte = null', mittel([null, undefined]) === null);
check('summe zaehlt nur Zahlen', summe([100, null, 200]) === 300);
check('summe ohne Werte = null', summe([]) === null);

const tage = [
  { date: '2026-11-18', hrv: 20, steps: null },
  { date: '2026-11-19', hrv: null, steps: 5000 },
  { date: '2026-11-20', hrv: 22, steps: 8000 },
];
check('letzter hrv = 22', letzter(tage, 'hrv') === 22);
check('letzter steps = 8000', letzter(tage, 'steps') === 8000);
check('letzter unbekannt = null', letzter(tage, 'vo2max') === null);

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler) process.exit(1);
