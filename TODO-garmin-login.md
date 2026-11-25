# TODO: Garmin-Login als Hauptquelle

Ziel: Der Login-Zugang ersetzt die Personal API. Komplette Historie,
automatischer Takt, alle Daten in der App, Rückschreiben ohne Kreislauf.

Details zum Aufbau: `docs/GARMIN-QUELLEN.md`.

## Pakete

- [x] 1. Sync auf Login umstellen (Tagesdaten + Schlaf + Readiness + Körper)
- [x] 2. Volle Historie nachziehen (bis zu 365 Tage) — 366 Tage liegen in `garmin_days`
- [x] 3. Dienste: Takt 5 Min leicht / 30 Min voll, Fortschritt, Fehleranzeige
- [x] 4. Frontend: Aktualisieren per Pull-Geste, Seiten laden nach Abgleich neu
- [x] 5. Rückschreiben (Gewicht, Wasser) — idempotent über `garmin_schreibstand`
- [x] 6. Wellness-Ansichten mit neuen Feldern (Schlafphasen, Readiness, Trainingsstatus)
- [x] 7. Prüfen: jede Ansicht mit echten Werten (siehe unten)

## Offene Risiken

- Garmin drosselt Logins per IP (Rate-Limit). Tokens halten lange, also kein
  Dauerfeuer an Logins.
- Rückschreiben darf keinen Kreislauf erzeugen: nur schreiben, was sich wirklich
  geändert hat, mit Merker je Objekt.
- Personal API bleibt als Rückfallebene — abschaltbar über `quellen.personalApi`.

## Stand: fertig, 25.11.2026

Zurzeit abgeschaltet: `quellen = {personalApi: false, intervals: false}`.
Es läuft also ausschließlich der Login.

## Geprüft am 25.11.2026

- `POST /api/integrations/refresh` (7 Tage) → `{"tage":7,"aktivitaeten":3,"quelle":"login"}`
- `GET /api/integrations/sync-status` → `{"schritt":30,"gesamt":30,"ergebnis":"30 Tage · 3 Einheiten"}`
- `GET /api/integrations/garmin` → `felder 25/27`, `tage 366`, beide Quellen `false`
- Pull-to-Refresh (390×844, Touch): Anzeige 0 → 110 px, „Loslassen zum
  Aktualisieren", Loslassen startet Lauf mit `0 / 7`
- Bereichswechsel während des Laufs: `1 / 30` → zurück → `11 / 30` läuft weiter
- Pull-Anzeige nach Umbau: **248 × 27 px** statt 277 × 127 (Verhältnis 9,36 statt 2,18)
- Rückschreiben: 1. Lauf `gewicht:true`, 2. Lauf beide `false`; bei Garmin
  nachgelesen: `115 kg (MANUAL)` und `valueInML: 750`
- Health-Übersicht live: `BEREITSCHAFT 44 Niedrig`, Schlafphasen
  (Tief 0:16 / REM 1:56 / Leicht 6:17), Trainingsform „Belastet"

## Zwei Fehler, die dabei auffielen

1. `POST /weight-service/weight/dateWeight` antwortet **HTTP 405** — Route falsch.
   Richtig: `/weight-service/user-weight` mit `value`, `sourceType` und beiden
   Zeitstempeln. Wasser braucht zusätzlich `timestampLocal`.
2. Die Pull-Pille wurde per `align-items: stretch` auf die volle Zughöhe gezogen
   und wirkte dadurch gedrungen. `items-start` plus Mindestbreite behebt das.

## Was Garmin nicht liefert

`floorsClimbed` und `respirationAvg` kommen über die API nicht — unabhängig vom
Zugangsweg. Die App zeigt dafür „—" statt einer erfundenen Null.

## Wichtig beim Arbeiten hier

`github-sync/repos/fitness-tracker/` hängt am Drive-Sync (alle 15 Minuten) und
hat während dieser Arbeit **mehrfach** `server.ts`, `Shell.tsx`,
`WellnessUebersicht.tsx` und diese Datei auf den alten Stand zurückgesetzt —
einmal landete sogar ein leerer Stand im Commit, obwohl der Patch vorher grün war.

Nach jeder Änderung: sofort bauen, committen und gegenprüfen mit
`git show HEAD:<datei> | grep -c "<merkmal>"`. Nicht auf die Arbeitskopie
verlassen.
