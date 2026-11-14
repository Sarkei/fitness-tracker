# VRTX Fitness Tracker – Architektur (Kurzüberblick)

## Stack

- **Frontend:** React 19, Vite, React Router, Tailwind 4, Motion
- **Backend:** Express (`server.ts`), PostgreSQL (`pg`), JWT-Auth
- **Tests:** `tsx` Selftests unter `scripts/`, Playwright unter `e2e/`

## Verzeichnisstruktur

| Pfad | Inhalt |
|------|--------|
| `src/components/` | UI nach Bereich (`dashboard`, `workout`, `nutrition`, `profile`, `coach`, …) |
| `src/lib/` | Domänenlogik, Hooks (`useWorkouts`, `useNutrition`), Analytics, i18n |
| `src/services/` | KI-Coach / Template-Generierung |
| `src/types.ts` | Gemeinsame TypeScript-Typen |
| `server.ts` | API, DB-Migrationen, Auth |
| `docs/` | Diese Dokumentation |

## Auth & Profil

- Registrierung/Login: `POST /api/auth/register`, `POST /api/auth/login`
- Profil: `GET/PATCH /api/profile`; erweiterte Felder in `users.profile_extras` (JSONB), z. B. `exerciseRestSeconds`, `dailyActivityLog`, `freeWorkoutSchedule`

## Workout-Flow

1. Vorlage oder Plan → `WorkoutPage` setzt `activeSession`
2. `WorkoutSessionPlayer` – Sets, Supersätze, GPS-Cardio, Draft (localStorage + `PUT /api/workout-session-draft`)
3. Abschluss → `POST /api/workouts`
4. **Letztes Training wiederholen:** `src/lib/repeatLastWorkout.ts` klont die letzte Session ohne Completion-Flags

## Datenexport

- Clientseitig im Profil: `src/lib/dataExport.ts` (JSON-Bundle oder zwei CSV-Dateien)

## Dashboard

- Tages-KPIs, Coach-Report, **Wochenkarte:** `src/lib/weeklyDigest.ts` (Sessions, Volumen, Fatigue, Energiebilanz)

## Hinweise

- Keine Garmin/Strava/Apple-Health-Anbindung im Web-Prototyp
- Community-Tabs bleiben sichtbar (Mobile: unter „Mehr“)
- Ausführliche Ordnerübersicht: `docs/PROJECT_STRUCTURE.md`
- Kein .NET/Blazor-Stack mehr im Repository (nur React/Express)
