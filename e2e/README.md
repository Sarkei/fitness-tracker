# E2E Tests

Playwright gegen `npm run dev` (siehe `playwright.config.ts`).

## Mock (Standard / CI)

```bash
npm run test:e2e:coach
```

- `globalSetup` → `seed:e2e`
- `auth.setup.ts` → `e2e/.auth/user.json`
- `COACH_E2E_MOCK=1` in CI

## Live AI (Staging)

```bash
COACH_E2E_LIVE=1 COACH_E2E_MOCK=0 npm run test:e2e:coach:live
```

- API-Key in `.env` erforderlich
- Gegen Remote: `E2E_BASE_URL=https://… npm run test:e2e:coach:live`

## Alle E2E

```bash
npm run test:e2e
npm run test:e2e:ui
npm run ci:coach          # Unit + Mock-E2E wie GitLab
```

Details: `docs/COACH_PRODUCTION.md`
