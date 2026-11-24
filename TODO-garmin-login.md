# TODO: Garmin-Login als Hauptquelle

Ziel: Der Login-Zugang ersetzt die Personal API. Komplette Historie, 5-Minuten-Takt,
alle Daten in der App, Rückschreiben ohne Kreislauf.

## Pakete

- [ ] 1. Sync auf Login umstellen (Tagesdaten + Schlaf + Readiness + Körper)
- [ ] 2. Volle Historie nachziehen (bis zu 365 Tage)
- [ ] 3. Dienste: Takt 5 Min, Überwachung, Selbstheilung
- [ ] 4. Frontend: Auto-Refresh alle 5 Min
- [ ] 5. Rückschreiben (Gewicht, Hydration, Workouts) — idempotent
- [ ] 6. Wellness-Ansichten mit neuen Feldern (Phasen, Readiness)
- [ ] 7. Prüfen: jede Tabelle/Diagramm mit echten Werten

## Offene Risiken

- Garmin drosselt Logins per IP (Rate-Limit). Tokens halten lange, also kein
  Dauerfeuer an Logins.
- Rückschreiben darf keinen Kreislauf erzeugen: nur schreiben, was sich wirklich
  geändert hat, mit Merker je Objekt.
- Personal API bleibt als Rückfallebene.

## Stand
Start.
