# TODO — Fitness-Tracker Umbau 23.11.2026

## Ziel
Sieben offene Punkte von Tim, alle live und geprüft abliefern.

## Pakete

- [ ] 1. Übungs-Korrektur mit Relevanzprüfung (Code fertig, Test offen)
      „Bankdrücken schräg" darf NICHT zu „Step-up on Chair" werden.
- [ ] 2. Ernährung: 30 Tage scrollbar + Woche-Button weg (Code fertig, Build offen)
- [ ] 3. Heute: „Einheiten von der Uhr" nur heutige; Klick öffnet Vollbild
- [ ] 4. Training: Einheiten in 5er-Seiten mit Blättern
- [ ] 5. Essen-Tab: Grundumsatz + Garmin-Aktivkalorien + gegessen = offen
- [ ] 6. KI-Coach-Lag beim Anlegen beheben
- [ ] 7. DEL2 über RapidAPI beantworten (reine Recherche)

## Arbeitsweise
Nach jedem Paket: Build, Deploy, im Browser prüfen. Erst dann weiter.
Am Ende: Bundle-Hashes gegen Container, Git gepusht, Testdaten weg.

## Notizen
- Deploy: dist + server.js + sw.js in Container, restart.
- Fitness-Tracker IP 172.19.0.15:3000, Token in scratch/ft_token.txt (8h).
- ExerciseDB läuft (Key 50 Zeichen), Host exercisedb.p.rapidapi.com.
- Vorsicht: Bundle-Mismatch sieht wie Code-Fehler aus. Immer Hash vergleichen.
