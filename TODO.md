# TODO — Fitness-Tracker Umbau 23.11.2026

## Ziel
Sieben offene Punkte von Tim, alle live und geprüft abliefern.

## Pakete — alle erledigt und live

- [x] 1. Übungs-Korrektur mit Relevanzprüfung
      Ersetzt unbekannte Übungen statt abzulehnen: exakter Name → deutsche
      Übersetzung → Einzelwörter → Körperteil. Treffer muss ein bedeutungstragendes
      Wort teilen, sonst Auslassen.
      Verifiziert: „Bankdrücken schräg mit Kurzhanteln" → Bench Press,
      „Erfundene Mega-Übung" → entfernt.
      Fallstrick: ohne Relevanzprüfung wurde daraus „Step-up on Chair".

- [x] 2. Ernährung: 30 Tage scrollbar + Woche-Button weg
      Gemessen: 1134 px Scrollbreite auf 356 px, 30 Tages-Buttons, gewählter Tag
      scrollt automatisch in den Blick.
      Achtung: `/foods` ist die Seite (FoodPage), NICHT `/nutrition` (NutritionPage).

- [x] 3. Heute: nur heutige Einheiten; Klick öffnet Vollbild
      Vollbild-Overlay 1280×577 mit Pace, Distanz, Dauer, Puls Ø/max/min,
      Kalorien, Aufstieg, Gesamtzeit.

- [x] 4. Training: Uhr-Einheiten in 5er-Seiten
      „Seite 1 von 2 · 1–5 von 8" mit Zurück/Weiter.

- [x] 5. Essen-Tab: Grundumsatz + Garmin-Aktivkalorien
      Live: 2.300 + 378 = 2.678 kcal offen.

- [x] 6. KI-Coach-Lag behoben
      `tryCoachAutoAdvancePlan` blockierte bei jedem Öffnen. Jetzt 800 ms verzögert.
      Ladezeit 9 s → 4,1 s.

- [x] 7. DEL2 über RapidAPI beantwortet
      RapidAPI hat DEL2 NICHT. SportStatsAPI deckt es ab (Liga-Code `l4au`,
      Live-Scores mit <2 Min Verzögerung, Tabelle, 14 Teams). Spielerstatistiken
      erst ab Stufe 3 gegen Aufpreis. Offene Entscheidung bei Tim: Key kaufen
      oder Ergebnisse nach Spielende scrapen.

## Lehre aus dieser Runde
Textersetzungen per Skript können Code zerschneiden. Ein `useEffect` landete
mitten in einer `useMemo`-Schleife und legte den Essen-Tab lahm
(„Cannot read properties of undefined"). Nach jedem größeren Patch: Typecheck
**und** die betroffene Seite im Browser laden — `tsc` allein findet das nicht.

## Arbeitsweise
Deploy: dist + server.js + sw.js in den Container, restart. Danach Hash
vergleichen (`md5sum server.js` gegen `docker exec … md5sum /app/server.js`),
sonst sieht ein Bundle-Mismatch wie ein Code-Fehler aus. Bei installierter PWA
zusätzlich Service Worker abmelden und Caches löschen.

## Endstand
0 Workouts, 0 Pläne, 31 Garmin-Tage, 40 Aktivitäten. Beide Container healthy,
Git sauber und gepusht.
