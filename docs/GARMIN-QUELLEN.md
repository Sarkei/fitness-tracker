# Garmin: welche Quelle liefert was

Stand 25.11.2026. Diese Datei beantwortet die Frage „kommt alles über den
Login, oder schleicht sich die Personal API ein?".

## Antwort in einem Satz

Es läuft **nur der Login**. Personal API und Intervals.icu sind abgeschaltet,
und zwar so, dass kein einziger Aufruf mehr an sie geht — nicht bloß „wird
bevorzugt übersprungen".

## Schalter

Ablage: `users.profile_extras.garmin.quellen`

```json
{ "personalApi": false, "intervals": false }
```

- Fehlt der Block, sind beide **an** (Standard) — nichts ändert sich unbemerkt.
- Nur ein ausdrückliches `false` schaltet ab.
- Endpunkt: `PUT /api/integrations/quellen` mit `{personalApi, intervals}`.

Wichtig: Der Schalter liegt neben den Zugangsdaten, nicht in ihnen. Ein neuer
API-Key oder ein Trennen löscht ihn nicht mit.

## Wo der Schalter greift

| Stelle | Datei | Wirkung |
|---|---|---|
| Hintergrund-Takt (5/30 Min) | `server.ts` `garminTick` | kein Fallback auf Personal API |
| Manueller Abgleich | `server.ts` `/api/integrations/refresh` | kein Personal-API-Zweig |
| Wellness-Ansicht | `server.ts` `/api/integrations/intervals/wellness` | keine Intervals-Lesung |
| Hintergrund-Takt Intervals | `server.ts` `hintergrundTick` | Query filtert Abgeschaltete raus |
| Coach-Chat | `server.ts` `/api/coach/chat` | kein Intervals-Kontext |

Der Login selbst lässt sich nicht abschalten — er ist die Quelle, die geprüft
werden soll.

## Statusanzeige

`GET /api/integrations/garmin` liefert:

- `felder: { gesamt, erfolgreich, fehlend[] }` — belegte Felder des jüngsten
  Tages **mit echter Datengrundlage**. Nicht blind der Kalendertag: früh morgens
  hat der nur Schritte, dann meldete die Anzeige fälschlich fehlende Nachtwerte.
- `tage` — Anzahl Tage in `garmin_days` (nicht im JSON-Cache; der wurde beim
  Login-Refresh nicht nachgeführt und zeigte „2 Tage" bei 366 in der Tabelle).
- `quellen` — der aktuelle Schalterzustand.
- `letzterLauf` — Fortschritt des letzten Abgleichs.

Ergebnis am 25.11.: **25 von 27 Feldern, 366 Tage**. Es fehlen `floorsClimbed`
und `respirationAvg` — beide liefert Garmin über die API nicht, unabhängig vom
Zugangsweg.

## Fortschritt, der einen Bereichswechsel überlebt

- `GET /api/integrations/sync-status` — `{laeuft, schritt, gesamt, seit,
  fertigAm, ergebnis, fehler}`
- Server hält den Lauf in `letzteLaeufe` (10 Minuten nach Ende).
- Frontend: `src/lib/syncStatus.ts` fragt im Takt von 1,2 s, solange ein Lauf
  aktiv ist; der Zustand liegt außerhalb des Komponentenbaums.

## Herunterziehen (mobil)

`src/components/layout/PullToRefresh.tsx`, eingehängt in der Shell.

- Nur ab Scrollposition 0, Auslösung ab 72 px Zug.
- Der Geste-Zustand liegt in **Refs**, nicht in den Effekt-Abhängigkeiten. Ein
  Effekt, der bei jeder Bewegung neu aufgesetzt wird, reißt die Geste ab — die
  Anzeige blieb dann bei 0 stehen, obwohl die Touch-Events ankamen.

## Deploy

```
npm run build && npm run build:server
docker cp server.js fitness-tracker:/app/server.js
docker cp dist/. fitness-tracker:/app/dist/
docker restart fitness-tracker
```

Danach `md5sum` vergleichen. **Achtung:** `github-sync/repos/` hängt am
Drive-Sync und hat während dieser Arbeit zweimal Änderungen zurückgesetzt —
nach dem Bearbeiten sofort committen.
