/**
 * Selbsttest: Wochenansicht darf keine Planwochen erfinden.
 *
 * Fehlerbild (live): Plan laeuft 23.11.–29.11., Woche aufschlagen zeigt aber
 * dieselben Einheiten wie die aktuelle Woche, weil die Tage immer aus
 * `current_schedule` kamen — unabhaengig vom angezeigten Zeitraum.
 */
import { shiftYmdLocal } from '../src/simple/analytics';

let fehler = 0;
function ok(name: string, bedingung: boolean, detail?: string) {
  console.log(`${bedingung ? 'ok    ' : 'FEHLER'} ${name}${detail && !bedingung ? ` -> ${detail}` : ''}`);
  if (!bedingung) fehler += 1;
}

type PlanWeek = { week_number: number; start_date: string; schedule: { weekFocus?: string } | null };

/** Kopie der Auswahl-Logik aus TrainingPage.angezeigtePlanWoche. */
function waehleWoche(planWochen: PlanWeek[], montagYmd: string): PlanWeek | null {
  if (!planWochen.length) return null;
  const treffer = planWochen.find((w) => w.start_date === montagYmd);
  if (treffer) return treffer;
  return (
    planWochen.find((w) => {
      if (!w.start_date) return false;
      const ende = shiftYmdLocal(w.start_date, 6);
      return montagYmd >= w.start_date && montagYmd <= ende;
    }) ?? null
  );
}

// Tims echter Plan: letzte Woche beginnt Mo 23.11.2026.
const echteWochen: PlanWeek[] = [
  { week_number: 17, start_date: '2026-11-16', schedule: { weekFocus: 'W17' } },
  { week_number: 18, start_date: '2026-11-23', schedule: { weekFocus: 'W18' } },
];

ok('aktuelle Woche wird gefunden', waehleWoche(echteWochen, '2026-11-23')?.week_number === 18);
ok('Vorwoche wird gefunden', waehleWoche(echteWochen, '2026-11-16')?.week_number === 17);

// Der gemeldete Fehler: naechste Woche (ab 30.11.) liegt ausserhalb des Plans.
ok(
  'naechste Woche liefert KEINEN Plan (Bug behoben)',
  waehleWoche(echteWochen, '2026-11-30') === null,
  JSON.stringify(waehleWoche(echteWochen, '2026-11-30')),
);
ok(
  'Woche zwei Wochen spaeter liefert KEINEN Plan',
  waehleWoche(echteWochen, '2026-12-07') === null,
);

// Montag mitten in der Planwoche muss die richtige Woche treffen (Fallback ueber Zeitraum).
const luecke: PlanWeek[] = [{ week_number: 3, start_date: '2026-11-25', schedule: { weekFocus: 'W3' } }];
ok(
  'Montag 23.11. faellt NICHT in Woche ab 25.11.',
  waehleWoche(luecke, '2026-11-23') === null,
);
ok('Montag 30.11. faellt in Woche ab 25.11.', waehleWoche(luecke, '2026-11-30')?.week_number === 3);

// Ohne Planwochen: keine erfundene Woche.
ok('ohne Planwochen null', waehleWoche([], '2026-11-23') === null);

// Frueherer Zeitraum (Plan hat schon Wochen hinter sich).
ok('alte Woche bleibt abrufbar', waehleWoche(echteWochen, '2026-11-16')?.week_number === 17);

// Montag-Berechnung: 23.11.2026 ist ein Montag.
ok('Hilfsfunktion shiftYmdLocal stimmt', shiftYmdLocal('2026-11-23', 0) === '2026-11-23');
ok('Wochenende einer Planwoche', shiftYmdLocal('2026-11-23', 6) === '2026-11-29');

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler > 0) process.exit(1);
