# Projektstruktur — VRTX Fitness Tracker

Aktiver Stack: **React 19 + Vite + Express (`server.ts`) + PostgreSQL**.  
Kein paralleler .NET/Blazor-Stack mehr im Repo.

## Root

| Pfad | Zweck |
|------|--------|
| `server.ts` | API, Auth, DB-Migrationen, Vite-Dev-Middleware |
| `envBootstrap.ts` | `.env` laden (vor allen anderen Imports) |
| `aiProviders.ts` | Mistral/Gemini serverseitig |
| `index.html` | SPA-Einstieg → `src/main.tsx` |
| `prompts/` | Markdown-Prompts für KI (Workout, Nutrition) |
| `scripts/` | Selftests & Ops (`npm run test:*`, `ops:coach`) |
| `e2e/` | Playwright |
| `docs/` | Architektur & Betrieb |
| `public/` | Statische Assets |

## Frontend (`src/`)

```
src/
├── main.tsx, AppRoot.tsx, App.tsx   # Bootstrap & Routing
├── types.ts                         # Gemeinsame Typen
├── pages/                           # Admin (eigenes Layout)
├── services/                        # API-Clients (nutrition, exercises, coach, …)
├── components/                      # UI nach Feature
│   ├── auth/ dashboard/ layout/
│   ├── workout/ nutrition/ coach/
│   ├── profile/ social/ stats/
│   ├── onboarding/ system/ ui/
└── lib/                             # Domänenlogik & Hooks
    ├── coach/                       # Periodisierung, Reports, Ops
    ├── nutrition/                   # Meal-Parse, Katalog, API-Routen
    ├── server/                      # Nur server.ts-Imports (Migration, SMTP, …)
    ├── aiPrompts/                   # Prompt-Builder
    └── …                            # exerciseDb, i18n, api, …
```

**Import-Alias:** `@/` → Projektroot (z. B. `@/src/lib/api`).

## Nutrition (eine Pipeline)

- Prompts: `prompts/nutrition/meal-parse-text.md`, `meal-parse-photo.md`, `nutrition-label-scan.md`
- Server: `src/lib/nutrition/nutritionRoutes.ts` → `/api/nutrition/*`, `/api/foods/*`
- Client: `src/services/nutritionLogService.ts` (parse + resolve)
- UI (Food-Log, KI-Foto, Quick-Log): `src/services/aiNutritionService.ts` → ruft dieselbe Pipeline auf, gleiche Fortschritts-UI

## Coach

- Generierung: `src/lib/coachGeneratePipeline.ts`
- Wochenreport: `generateCoachWeeklyReport` in `src/lib/coach/coachWeeklyReportService.ts`
- Tests: `npm run test:coach-engine` (früher `coach-v2-selftest`)

## ExerciseDB

- Konfiguration: `EXERCISEDB_RAPIDAPI_KEY` in `.env` oder Admin `/admin`
- Server: `src/lib/exerciseDb*.ts`, Routen `/api/exercises/*`

## Was bewusst entfernt wurde

- .NET/Blazor (`Program.cs`, `Components/`, …)
- Einmal-Skripte `scripts/fix-*.mjs`, `patch-*.mjs`
- Tote Module: `EditNutritionModal`, `celebrations`, `metabolism`, `envFileUtils`, `exerciseGif` (Re-Export)

## Entwicklung

```bash
npm run dev          # tsx server.ts (API + Vite)
npm run build        # Frontend → dist/
npm run test:coach:all
npm run test:e2e
```
