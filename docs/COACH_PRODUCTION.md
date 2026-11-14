# Coach Production – E2E, UX, Monitoring, CI & Alerting

## 1. E2E (Playwright)

### Mock (CI / ohne API-Key)

```bash
npm run seed:e2e
npm run test:e2e:coach
```

- `COACH_E2E_MOCK=1` (CI-Default): Refine patcht nur `coachNotes`, kein Mistral/Gemini
- Spec: `e2e/coach-refine-report.spec.ts`

### Live AI (Staging)

Echter KI-Refine gegen Mistral/Gemini:

```bash
# .env: MISTRAL_API_KEY oder GEMINI_API_KEY
npm run seed:e2e
COACH_E2E_LIVE=1 COACH_E2E_MOCK=0 npm run test:e2e:coach:live
```

- Config: `playwright.staging.config.ts`
- Spec: `e2e/coach-refine-report.live.spec.ts`
- Prüft: keine `e2eMock`-Response, `coachNotes` ohne `[E2E refine]`
- Gegen Remote-App: `E2E_BASE_URL=https://staging.example.com npm run test:e2e:coach:live` (ohne lokalen webServer)

### Testuser

| Variable | Default |
|----------|---------|
| `E2E_USER_EMAIL` | `e2e-coach@vrtx.test` |
| `E2E_USER_PASSWORD` | `E2eCoachPass123!` |
| `E2E_BASE_URL` | `http://localhost:3000` (nur Live-Config) |

---

## 2. UX (Production-Feinschliff)

- Bulk-Rationen: Fortschritt + Abbruch
- Dashboard: `CoachAdherenceWidget` im Desktop-Stat-Grid
- `data-testid` für E2E (siehe Specs)

---

## 3. Betriebs-Monitoring

### Health

`GET /api/health` — Coach-Metriken + AI-Status.

### Admin

`GET /api/admin/coach-ops?hours=24` (Basic Auth).

### Cron-Checks

| Befehl | Zweck |
|--------|--------|
| `npm run ops:coach` | DB-Check, Exit 1 bei Schwellwert |
| `npm run ops:coach:alert` | Wie oben + optional Webhook |
| `npm run ops:coach:health` | Prüft `COACH_HEALTH_URL` (Default `http://127.0.0.1:3000/api/health`) |

### Alerting (Pager / Slack / Discord)

```bash
COACH_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
COACH_ALERT_WEBHOOK_FORMAT=slack   # slack | discord | json
COACH_ALERT_MIN_SEVERITY=degraded  # ok | degraded | critical
npm run ops:coach:alert
```

Produktion per HTTP:

```bash
COACH_HEALTH_URL=https://deine-app.de/api/health npm run ops:coach:health
```

**Cron-Beispiel (stündlich):**

```cron
0 * * * * cd /app/fitness_tracker && npm run ops:coach:health >> /var/log/coach-ops.log 2>&1
```

### Schwellwerte

| Variable | Default |
|----------|---------|
| `COACH_OPS_WINDOW_HOURS` | 24 |
| `COACH_OPS_MAX_ERROR_RATE` | 0.35 |
| `COACH_OPS_MAX_REFINE_ERROR_RATE` | 0.4 |
| `COACH_OPS_MIN_REFINE_SAMPLES` | 3 |

---

## 4. GitLab CI

Dateien: `.gitlab/ci/coach.yml` (eingebunden in `.gitlab-ci.yml`).

| Job | Wann | Was |
|-----|------|-----|
| `coach:unit` | MR + Branch | `npm run test:coach:all` |
| `coach:e2e` | MR + Branch | Playwright Mock-E2E |
| `coach:ops` | Default-Branch | `npm run ops:coach` (allow_failure) |
| `coach:e2e:live` | Branch `staging` oder manuell auf `main` | Echter KI-Refine |
| `coach:ops:alert` | Default-Branch + `COACH_ALERT_WEBHOOK_URL` | Webhook nach Deploy |

**CI-Variablen setzen:** `MISTRAL_API_KEY` (masked), optional `COACH_ALERT_WEBHOOK_URL`, `COACH_E2E_LIVE=1` für manuelles Live auf main.

Lokal alles wie CI:

```bash
npm run ci:coach
```

---

## Checkliste vor Go-Live

- [ ] API-Keys in Production
- [ ] `JWT_SECRET`, `ADMIN_*` geändert
- [ ] `coach:unit` + `coach:e2e` grün in GitLab
- [ ] `coach:e2e:live` auf Staging mit echtem Key
- [ ] `COACH_ALERT_WEBHOOK_URL` + Cron/`coach:ops:alert`
- [ ] Branch `staging` für automatisches Live-E2E
