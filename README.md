# Fitness Tracker (VRTX)

Web-App für Krafttraining und Ernährung: Live-Sessions werden satzweise protokolliert, Mahlzeiten per Text, Foto oder Barcode erfasst, und ein KI-Coach leitet daraus Wochenpläne und Reports ab. Frontend ist eine React-SPA (Vite), Backend ein einzelner Express-Server (`server.ts`, ~5.500 Zeilen), Daten liegen in PostgreSQL 16, Auth läuft über JWT. Das Repository umfasst 417 Dateien.

## Funktionen

### Konto, Onboarding, Profil
- Registrierung/Login mit E-Mail und Passwort; Hashes mit bcrypt (Kostenfaktor 12), Session als JWT mit 30 Tagen Laufzeit (`Authorization: Bearer …`).
- Passwort vergessen/zurücksetzen (Token 1 Stunde gültig, Versand per SMTP; ohne SMTP gibt `ALLOW_DEV_RESET_LINK=1` einen Dev-Link in der API-Antwort aus), Passwort ändern, Konto löschen.
- Onboarding in fünf Schritten (Sprache/Fokus, Stammdaten, Maße, Ziele, Coach-Assistent). Solange `onboarded` false ist, zeigt die App nur den `OnboardingFlow`.
- Profil: Gewicht und Gewichtsverlauf, Körpermaße, Check-ins mit Foto und Notiz, Tagesziele (Kalorien, Makros, Wasser, Schritte), Theme hell/dunkel, UI-Sprache Deutsch/Englisch.
- Manuelles Aktivitäts-Log: Schritte, Wasser und Schlaf inklusive Schlafphasen pro Tag.
- Datenexport clientseitig als JSON-Bundle oder als zwei CSV-Dateien (`src/lib/dataExport.ts`).
- Datenmigration auf Version 2 (ExerciseDB + Open Food Facts): bei Bedarf blockiert `DataMigrationOverlay` die App, bis die Migration gelaufen ist.

### Training
- Workout-Vorlagen in zwei Modi: einzelnes Workout oder Wochenplan (`templateMode`, `weekPlan`); Editor, CSV-Export der Vorlage, KI-Generierung aus einer Beschreibung.
- Sessions startbar aus Vorlage, Coach-Plan oder frei; „letztes Training wiederholen“ klont die letzte Session ohne Abschluss-Flags.
- Session-Player: Sätze mit Typ (normal, Warm-up, Dropset, Failure), RPE pro Satz, Supersätze, Übungen tauschen/verschieben/löschen, Live-Edit während der Session.
- Struktur-Blöcke: EMOM, AMRAP, Zirkel, Tabata, Intervalle (Arbeits-/Pausenzeit, Runden); Mobilitäts-Übungen mit Countdown statt Satztabelle.
- Cardio: Distanz/Dauer, GPS-Tracking mit Route (`routeData`, Leaflet-Karte), Feedback nach der Einheit (RPE, HF avg/max).
- Pausen-Timer mit Signalton, Standard-Pause pro Übung, Hantelscheiben-Rechner.
- Session-Entwurf wird in localStorage und per `PUT /api/workout-session-draft` gesichert, Recovery-Banner und `POST /api/workouts/recover-session-draft` stellen ihn wieder her; schlägt das Speichern fehl, landet das Workout in einer Offline-Queue.
- Abschluss: Zusammenfassung, Session-RPE, Kalorienschätzung, Share-Text in die Zwischenablage.
- Übungskatalog: lokale Bibliothek (`exerciseKey`) plus ExerciseDB (Suche, Filter, ähnliche Übungen, GIF/Video). Ohne `EXERCISEDB_RAPIDAPI_KEY` antwortet `/api/exercises/search` mit 503 (`exercisedb-not-configured`).

### Coach
- Zwei Plantypen (Workout-Woche, Ernährungswoche) mit eigenem Onboarding: Disziplin, Niveau, Benchmarks, Equipment, Verletzungen, Zeitbudget, Event, Diät-Einschränkungen/Allergien, Küche und Budget.
- Generierung als Pipeline: Prompt → JSON → Zod-Schema → harte Constraints → Reparatur oder Retry (max. 3 Versuche, `COACH_WORKOUT_MAX_RETRIES`), mit Phasenanzeige und Abbruchmöglichkeit.
- Periodisierung: Wochen-Direktive (deload, reduce_volume, increase_volume, continue) aus Adhärenz, Ermüdung, PRs und Abstand zum Event.
- Planpflege: Woche neu generieren, nächste Woche fortschreiben, `auto-advance`, Schedule verfeinern, Übung tauschen, Reihenfolge ändern, Session-Feedback, geplante Sessions mit absolvierten Workouts verknüpfen.
- Wochenreport aus Wochenfakten (Sessions, Volumen, Ermüdung, Ernährung) inklusive KI-Narrativ, Dashboard-Kurzfassung und Adhärenz-Widget.
- Nutzer-Wochenreport (`user_weekly_reports`) mit Fallback ohne KI; Verlauf im Profil einsehbar.

### Ernährung
- Vier Bereiche: Heute, Verlauf, Mahlzeit-Vorlagen, Coach.
- Erfassung per Freitext (KI parst Zutaten), Foto, Barcode-Scan (ZXing/html5-qrcode), Scan der Nährwerttabelle, manuell oder als Schnell-Log aus Favoriten.
- Pipeline `nutrition-v3`: KI-Segmentierung → strenge Open-Food-Facts-Suche → generischer Katalog → KI legt bei Bedarf einen neuen generischen Eintrag an. Timeout 45 s, 2 Versuche, danach Sanity-Check der Nährwerte.
- Zutaten tragen Nährwerte mit Quelle (`database` vs. `model_estimate`) und Match-Konfidenz; Nutzer können Werte überschreiben.
- Mahlzeit-Vorlagen: Rezept aus Idee per KI erzeugen und verfeinern, Portionsanzahl (`yieldsPortions`), berechnete Nährwerte, Ration-Composer, Portions-Picker; eigene Lebensmittel inklusive Kombi-Produkten anlegbar.
- Nutri-Score und Open-Food-Facts-Nährstoffampel pro Lebensmittel; tägliches KI-Review der Ernährung.
- Betriebsseite der Pipeline: `/api/nutrition/v3/{stats,metrics,incidents,alerts,ux-events}`, Reprocess einzelner Logs, Alarm-Schwellen in `/api/health`.

### Dashboard, Statistiken, Community
- Dashboard: Tages-KPIs, Wochen-Digest (Sessions, Volumen, Ermüdung, Energiebilanz), Coach-Report, Fortschritts-Streaks, Resume-Banner für offene Sessions, Schnellaktionen.
- Statistiken mit Zeitraum 7/14/30 Tage: Sessions, Volumen (kg × Wdh.), Ø Kalorien, Trainings-Präsenz, Ermüdungsscore (RPE/Volumen/Frequenz), Kalorien vs. Ziel, Energiebilanz, Cardio (Einheiten/Minuten/km), Gewichtsverlauf, Muskelgruppen-Anteile, Top-Volumen, geschätztes 1RM (Epley, ohne Warm-up), letzte Sessions, PR-Tabelle.
- Druckbarer Zeitraum-Report (`src/lib/periodReport.ts`, `printReport.ts`).
- Community: Feed global oder „gefolgt“, Posts mit Text/Bild und optionaler Workout-Referenz, Likes, Kommentare, Melden, Folgen/Blockieren, Direktnachrichten (Postfach und Thread).

### Admin
- `/admin` mit eigenem HTTP-Basic-Auth, unabhängig vom App-Login.
- Nutzerliste, Bearbeiten (Name, E-Mail, Passwort), Löschen, Sperren (`is_active=false` plus `authInvalidBefore` für laufende Tokens).
- Datenmigrationen für alle Nutzer als Hintergrund-Job mit Log und Statusabfrage.
- KI-Konfiguration: aktiver Provider, Modelle pro Bereich, Ollama-Verbindungstest und Modell-Pull, Test/Speichern von Mistral- und Gemini-Keys.
- ExerciseDB-Key prüfen und speichern (schreibt in die `.env`); Coach-Ops-Metriken unter `/api/admin/coach-ops` und Alert-Skripte.

## Technik

**Frontend:** React 19, TypeScript, Vite 6, Tailwind 4 (`@tailwindcss/vite`), React Router 7, Motion, Recharts, Leaflet/react-leaflet, ZXing, zod, date-fns, lucide-react. Routen werden per `lazy()` geladen, Import-Alias `@/` zeigt auf das Projekt-Root. Eigene Provider für Auth, App-Daten, aktive Session, i18n und Theme.

**Backend:** Express 4 in `server.ts`: JSON-Body bis 10 MB, `requireAuth` (JWT, aktiver Account, `authInvalidBefore`), `requireAdmin` (Basic-Auth). Im Dev-Modus hängt Vite als Middleware davor, in Produktion wird `dist/` statisch ausgeliefert (SPA-Fallback auf `index.html`). Das Schema entsteht beim Start (`initDb()` in `server.ts` plus `ensureNutritionSchema` für die Nutrition-Tabellen) aus `CREATE TABLE IF NOT EXISTS` und `ALTER TABLE … ADD COLUMN IF NOT EXISTS`; separate Migrationsdateien gibt es nicht.

**Datenbank:** PostgreSQL 16, unter anderem `users`, `workouts`, `workout_templates`, `nutrition`, `nutrition_log_components`, `meal_templates`, `user_custom_foods`, `posts`, `post_comments`, `user_follows`, `user_blocks`, `post_reports`, `direct_messages`, `password_reset_tokens`, `coach_plans`, `coach_weekly_schedules`, `coach_weekly_reports`, `user_weekly_reports`, `exercise_name_localizations`, `coach_ai_runs`, `meal_ai_runs`. Likes liegen als Integer-Array in `posts`, große Profilteile als JSONB (`measurements`, `goals`, `profile_extras`, `weight_history`).

**KI:** `aiProviders.ts` kennt drei Provider: Ollama (Standard, lokales Modell), Mistral und Gemini. Auswahl über `AI_ACTIVE_PROVIDER` oder das Admin-Panel, Modell-Overrides pro Bereich (`AI_<PROVIDER>_MODEL_<AREA>`). Prompts sind Markdown-Dateien in `prompts/` mit `{{…}}`-Platzhaltern und werden zur Laufzeit geladen.

## Projektstruktur

```
server.ts               API, Auth, DB-Schema, Coach-/Nutrition-Routen, Static-Serving
aiProviders.ts          Ollama/Mistral/Gemini, JSON-Mode, Modellwahl pro Bereich
envBootstrap.ts         lädt .env vor allen anderen Imports
src/
├── App.tsx             Routen: /, /workouts, /nutrition, /coach, /stats, /social, /profile
├── AppRoot.tsx         Provider-Reihenfolge, Login-Gate, /admin und /reset-password frei
├── types.ts            gemeinsame Typen (Workout, Exercise, SetDetail, Nutrition, Coach…)
├── components/
│   ├── workout/        17 Dateien: Session-Player, Editor, Übungs-Modals, session/ (EMOM, Zirkel, GPS)
│   ├── nutrition/      18 Dateien: Tagesansicht, KI-Analyse, Barcode, Vorlagen, Portionen
│   ├── coach/          19 Dateien: Hub, Onboarding, Plan-Generierung, Reports, Feedback
│   ├── dashboard/      KPIs, Wochen-Digest, Aktivitäts-Log, Resume-Banner
│   ├── stats/          Statistik-Seite (Recharts)
│   ├── social/         Feed, Kommentare, DM-Thread
│   ├── profile/        Profil, Report-Historie
│   ├── layout/         Shell, Navbar, Mobile-Sheets
│   ├── auth/           Login, Passwort-Reset
│   └── ui/             EmptyState, ErrorBanner, Dialoge, RouteErrorBoundary
├── lib/
│   ├── coach/          19 Dateien: Periodisierung, Constraints, Schedule-Postprocessing
│   ├── nutrition/      62 Dateien: Pipeline (pipeline/), Katalog, Parser, Routen
│   ├── weeklyReport/   Wochenfakten, Report-Generierung, Schema
│   ├── server/         nur serverseitig: Migration, SMTP, Custom Foods
│   ├── aiPrompts/      Prompt-Builder für Workout und Ernährung
│   └── *.ts            exerciseDb, Analytics, Fatigue, i18n, sessionDraft, Offline-Queue …
├── services/           API-Clients (aiNutrition, coachPlan, exerciseDb, Open Food Facts …)
└── pages/AdminPage.tsx Admin-Oberfläche mit eigenem Layout
scripts/                34 tsx-Selftests, Golden-Fixtures, Ops-Checks, E2E-Seed
e2e/                    Playwright-Specs und Auth-Setup
prompts/                Markdown-Prompts (workout/, nutrition/)
docs/                   ARCHITECTURE.md, PROJECT_STRUCTURE.md, COACH_PRODUCTION.md
docker-compose*.yaml    prod, dev (Hot Reload), e2e (Postgres auf 5433)
```

## Start

```bash
npm ci --legacy-peer-deps
cp .env.example .env          # Werte anpassen
npm run dev                   # tsx server.ts, Vite im Middleware-Modus → http://localhost:3000
```

Produktion:

```bash
npm run build                 # Frontend → dist/
npm run build:server          # esbuild bündelt server.ts → server.js
npm start                     # laut package.json "node server.ts"; im Container läuft server.js
```

`npm start` setzt eine Laufzeit voraus, die TypeScript direkt ausführt; der Container startet das gebündelte `server.js`.

Docker:

```bash
docker compose up -d --build                   # App auf Port 22222, dazu Postgres 16 und Ollama
docker compose -f docker-compose.dev.yaml up   # Dev mit Hot Reload auf Port 3000
```

Der Prod-Stack zieht zusätzlich das lokale Modell (`ollama-pull`) und hängt im externen Netz `cloudflare-tunnel-net`, das vorher existieren muss. Die Compose-Datei mountet `./.env` als Datei — ein Verzeichnis an dieser Stelle führt zu `EISDIR`.

## Konfiguration

Alle Variablen stehen in `.env.example`; `server.ts` liest sie über `process.env`.

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Beispiel-Verbindungsstring in `.env.example`; der Server baut den Pool aus den `POSTGRES_*`-Werten |
| `JWT_SECRET` | Signatur der Auth-Tokens |
| `APP_PUBLIC_URL`, `APP_NAME` | Basis-URL für Reset-Links/CORS, Anzeigename |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Versand der Passwort-Reset-Mail |
| `ALLOW_DEV_RESET_LINK` | Reset-Link in der API-Antwort, wenn kein SMTP konfiguriert ist |
| `EXERCISEDB_RAPIDAPI_KEY` | ExerciseDB-Zugang (Suche, GIF/Video); ohne Key 503 |
| `EXERCISEDB_RAPIDAPI_HOST` | Host des ExerciseDB-Anbieters (Default AscendAPI V2) |
| `OLLAMA_BASE_URL`, `LOCAL_LLM_MODEL`, `OLLAMA_PORT`, `OLLAMA_NUM_CTX` | lokales Modell und Kontextlänge |
| `AI_ACTIVE_PROVIDER` | `ollama` (Default), `mistral` oder `gemini` |
| `MISTRAL_API_KEY`, `GEMINI_API_KEY` | optionale Cloud-Provider |
| `COACH_WORKOUT_MAX_RETRIES` | KI-Neuversuche bei Schema-/Constraint-Fehlern (Default 3, max. 5) |
| `AI_<PROVIDER>_MODEL_<AREA>` | Modell-Override pro Bereich, z. B. `AI_OLLAMA_MODEL_COACH_WORKOUT` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Basic-Auth für `/admin` (Default `admin`/`admin`) |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `COACH_E2E_MOCK` | Testnutzer und KI-Mock für Playwright |

Im Container setzt Compose zusätzlich `POSTGRES_HOST/PORT/DB/USER/PASSWORD`, `PORT` und `NODE_ENV`.

## Tests

Vitest gibt es im Projekt nicht. Die Unit-Ebene besteht aus eigenständigen `tsx`-Selftest-Skripten in `scripts/` (34 Dateien: Coach-Pipeline, Periodisierung, Nutrition-v3-Vertrag, Meal-Portionen, Session-Draft, Golden-Fixtures), die Ebene darüber aus Playwright-Specs.

```bash
npm run lint                  # tsc --noEmit
npm run test:coach:all        # Coach-Engine, Matching, Postprocessing, Dashboard, Flow, Ops
npm run test:nutrition-v3:all # Pipeline inkl. Off-Integration, Metriken, Last, Reprocess
npm run test:nutrition-log:all
npm run test:workout-session
npm run test:e2e              # Playwright gegen npm run dev, Auth über e2e/auth.setup.ts
npm run test:e2e:ui
npm run test:e2e:coach        # Coach-E2E mit COACH_E2E_MOCK
npm run test:e2e:nutrition    # eigene Config, NUTRITION_E2E_MOCK
npm run test:e2e:coach:live   # Staging-Config, echter KI-Call (API-Key nötig)
```

`playwright.config.ts` startet den Dev-Server selbst, `playwright.e2e.config.ts` nutzt `scripts/e2e-webserver.mjs` mit Mocks, `playwright.staging.config.ts` den Live-Pfad (optional gegen `E2E_BASE_URL`). Für E2E mit echter Datenbank: `docker compose -f docker-compose.e2e.yaml up -d --wait` (Postgres auf 5433). GitLab CI bindet in `.gitlab-ci.yml` die Dateien `.gitlab/ci/coach.yml` (Unit, Mock-E2E, Ops, Live-E2E, Alert) und `.gitlab/ci/nutrition.yml` (strenger Nutrition-Lauf) ein.

## Hinweise

- `JWT_SECRET` hat einen Fallback im Code, `ADMIN_USERNAME`/`ADMIN_PASSWORD` defaulten auf `admin`/`admin`; beides muss in einer echten Installation gesetzt werden.
- Der Server legt sein Schema beim Start selbst an. Änderungen an Tabellen gehören in `initDb()`, sonst fehlen sie auf bestehenden Installationen.
- Ohne ExerciseDB-Key ist der Trainingsbereich eingeschränkt (keine Suche, keine Medien); der Schlüssel lässt sich auch im Admin-Panel hinterlegen.
- KI-Funktionen sind optional: ohne Ollama und ohne Cloud-Key meldet `/api/ai/status` „nicht konfiguriert“, Coach- und Analyse-Buttons sind deaktiviert.
- Keine Anbindung an Garmin, Strava oder Apple Health; Schritte und Schlaf werden manuell erfasst.
- `npm run lint` prüft nur Typen (kein ESLint); `docs/ARCHITECTURE.md` und `docs/PROJECT_STRUCTURE.md` beschreiben den Aufbau ausführlicher.
