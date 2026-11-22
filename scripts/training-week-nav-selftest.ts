/**
 * Selbsttest für die Wochen-Navigation im Training:
 *   npx tsx scripts/training-week-nav-selftest.ts
 */
import {
  clampWeekOffset,
  isoWeekNumber,
  mondayOfWeek,
  shiftWeek,
  weekDays,
  weekRangeLabel,
  weekRelationLabel,
} from '../src/lib/trainingWeekNav';

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

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 22.11.2026 ist ein Sonntag -> Montag der Woche ist der 16.11.
const sonntag = new Date(2026, 10, 22, 15, 30);
pruefe('Montag aus Sonntag', ymd(mondayOfWeek(sonntag)), '2026-11-16');
pruefe('Montag aus Montag', ymd(mondayOfWeek(new Date(2026, 10, 16, 8, 0))), '2026-11-16');
pruefe('Montag aus Mittwoch', ymd(mondayOfWeek(new Date(2026, 10, 18, 23, 59))), '2026-11-16');

// Wochen verschieben
const dieseWoche = mondayOfWeek(sonntag);
pruefe('nächste Woche', ymd(shiftWeek(dieseWoche, 1)), '2026-11-23');
pruefe('übernächste Woche', ymd(shiftWeek(dieseWoche, 2)), '2026-11-30');
pruefe('letzte Woche', ymd(shiftWeek(dieseWoche, -1)), '2026-11-09');
pruefe('Jahreswechsel vorwärts', ymd(shiftWeek(new Date(2026, 11, 28), 1)), '2027-01-04');

// Tage der Woche
const tage = weekDays(dieseWoche).map(ymd);
pruefe('sieben Tage, Montag zuerst', [tage.length, tage[0], tage[6]], [7, '2026-11-16', '2026-11-22']);

// Beschriftungen
pruefe('Bereich', weekRangeLabel(dieseWoche), '16.11. – 22.11.');
pruefe('diese Woche', weekRelationLabel(dieseWoche, sonntag), 'Diese Woche');
pruefe('nächste Woche', weekRelationLabel(shiftWeek(dieseWoche, 1), sonntag), 'Nächste Woche');
pruefe('letzte Woche', weekRelationLabel(shiftWeek(dieseWoche, -1), sonntag), 'Letzte Woche');
pruefe('in 3 Wochen', weekRelationLabel(shiftWeek(dieseWoche, 3), sonntag), 'In 3 Wochen');

// ISO-Kalenderwoche: 16.11.2026 -> KW 47
pruefe('ISO-KW 16.11.2026', isoWeekNumber(new Date(2026, 10, 16)), 47);
pruefe('ISO-KW 01.01.2027', isoWeekNumber(new Date(2027, 0, 1)), 53);

// Blätterweite
pruefe('Grenze vorne', clampWeekOffset(-12), -8);
pruefe('Grenze hinten', clampWeekOffset(12), 8);
pruefe('innerhalb', clampWeekOffset(3), 3);
pruefe('ungültig', clampWeekOffset(Number.NaN), 0);

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
if (fehler > 0) process.exitCode = 1;
