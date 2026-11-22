/**
 * Selbsttest für die Fasten-Logik (keine Testbibliothek nötig):
 *   npx tsx scripts/fasting-selftest.ts
 */
import { FASTING_PRESETS, fastingStatus, formatRemaining, isValidPlan, nextEatingStart, planLabel } from '../src/lib/fasting';

let fehler = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) {
    fehler += 1;
    console.error(`FEHLER ${name}: ist=${JSON.stringify(ist)} soll=${JSON.stringify(soll)}`);
  } else {
    console.log(`ok     ${name}`);
  }
}

const plan16 = FASTING_PRESETS[0]; // 16:8, Start 20:00

// 21:00 -> fasten, 15 h übrig (900 min)
pruefe('21:00 fasten', Math.round(fastingStatus(plan16, new Date(2026, 10, 22, 21, 0, 0)).remainingMinutes), 900);
// 08:00 -> fasten, 4 h übrig
const s8 = fastingStatus(plan16, new Date(2026, 10, 23, 8, 0, 0));
pruefe('08:00 fasten', [s8.phase, Math.round(s8.remainingMinutes)], ['fasting', 240]);
// 10:00 -> Essensfenster (12:00 fertig), 2 h übrig
const s10 = fastingStatus(plan16, new Date(2026, 10, 23, 10, 0, 0));
pruefe('10:00 fasten (16:8 endet 12:00)', [s10.phase, Math.round(s10.remainingMinutes)], ['fasting', 120]);
// 13:30 -> essen, 6,5 h übrig
const s13 = fastingStatus(plan16, new Date(2026, 10, 23, 13, 30, 0));
pruefe('13:30 essensfenster', [s13.phase, Math.round(s13.remainingMinutes)], ['eating', 390]);
// 19:59 -> essen, 1 min übrig
const s19 = fastingStatus(plan16, new Date(2026, 10, 23, 19, 59, 0));
pruefe('19:59 essensfenster', [s19.phase, Math.round(s19.remainingMinutes)], ['eating', 1]);
// 20:00 -> fasten beginnt (24 h)
const s20 = fastingStatus(plan16, new Date(2026, 10, 23, 20, 0, 0));
pruefe('20:00 fasten', [s20.phase, Math.round(s20.remainingMinutes)], ['fasting', 960]);

// Fortschritt im Essensfenster: 4 h von 8 h vorbei -> 0.5
pruefe('Fortschritt essen 16:00', Math.round(fastingStatus(plan16, new Date(2026, 10, 23, 16, 0, 0)).progress * 100), 50);

// Anzeige
pruefe('Restzeit 493 min', formatRemaining(493), '8:13');
pruefe('Restzeit 0 min', formatRemaining(0), '0:00');
pruefe('Label 16:8', planLabel(plan16), '16:8');

// Validierung
pruefe('gültiger Plan', isValidPlan(plan16), true);
pruefe('ungueltig: Summe nicht 24', isValidPlan({ fastHours: 16, eatHours: 10, startTime: '20:00' }), false);
pruefe('ungültig: Uhrzeit', isValidPlan({ fastHours: 16, eatHours: 8, startTime: '25:00' }), false);
pruefe('ungültig: leer', isValidPlan(null), false);

// 12:12-Plan: 20:00 Start -> fasten bis 08:00, essen 08:00–20:00
const plan12 = FASTING_PRESETS[4];
const s12 = fastingStatus(plan12, new Date(2026, 10, 23, 9, 0, 0));
pruefe('12:12 um 09:00', [s12.phase, Math.round(s12.remainingMinutes)], ['eating', 660]);

// Alle Presets müssen gültig sein
pruefe('alle Presets gültig', FASTING_PRESETS.every((p) => isValidPlan(p)), true);

// Nächster Essensbeginn (Etikett „Essen ab …")
const ne1 = nextEatingStart(plan16, new Date(2026, 10, 23, 9, 0, 0)); // mitten im Fasten -> Essen beginnt morgen 12:00
pruefe('Essen ab 09:00 (morgen 12:00)', [ne1.getDate(), ne1.getHours()], [24, 12]);
const ne2 = nextEatingStart(plan16, new Date(2026, 10, 23, 19, 0, 0)); // im Essensfenster -> morgen 12:00
pruefe('Essen ab 19:00 (heute, Fenster laeuft)', [ne2.getDate(), ne2.getHours()], [23, 12]);
const ne3 = nextEatingStart(plan16, new Date(2026, 10, 23, 21, 0, 0)); // nach dem Fenster -> morgen
pruefe('Essen ab 21:00 (morgen)', [ne3.getDate(), ne3.getHours()], [24, 12]);

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
if (fehler > 0) process.exitCode = 1;
