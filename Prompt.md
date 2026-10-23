# Coach Level – umsetzbare Master-Planung (Personal-Trainer-Niveau)

Dieses Dokument ersetzt die frühere „Ultimate“-Version durch einen **realistisch implementierbaren** Fahrplan. Ziel bleibt: Coaching-Qualität wie bei einem guten Personal Trainer (klare Grenzen, nachvollziehbare Progression, Sicherheit) – ohne Wunschdenken bei Latenz, „100 % aller Edge Cases“ oder einem kompletten Front-End-Umbruch über Nacht.

**Technischer Anker (Ist-Stand der App):**

- Backend: `server.ts` – `POST /api/coach/plans`, `…/next-week`, `…/weekly-report`, `…/auto-advance`
- KI: `aiProviders.ts` → `completeCoachJson` (Mistral JSON-Mode / Gemini-Fallback)
- Daten: `coach_plans` (`onboarding_data` JSONB), `coach_weekly_schedules`, `coach_weekly_reports`; Nutzer: `users` (u. a. `measurements`, `weight_history`, `profile_extras` / `dailyActivityLog`-kompatibel)
- Onboarding-UI: `CoachOnboarding.tsx` (Felder siehe Mapping unten)
- Übungsbibliothek: `src/lib/exerciseLibrary.ts` (`key`, `name`, `category`, `tags`)
- Mahlzeiten-Templates: DB `meal_templates` (u. a. `ingredients` JSONB, `yields_portions`); UI/Flow u. a. `RationComposerModal`, Nutrition-Bereich

---

## Grundprinzipien für die Umsetzung

1. **Kein LLM-Rohoutput ohne Schicht** – immer: parsen → **Zod** (oder abgeleitetes Schema) → **Hard Constraints** (deterministisch) → bei Verletzung: **Retry mit konkreter Fehlermeldung** oder **programmatische Reparatur** (lieber reparieren als endlos raten).
2. **Onboarding-first** – ohne valide, vollständige Onboarding-Daten **keine** Generierung (klare 400/422-Fehler, keine leeren Pläne).
3. **Ein kanonisches „Coach-Modell“ intern** – das UI darf vorerst das **bestehende Schedule-JSON** behalten; intern kann ein strengeres Modell existieren und **per Mapper** in das gespeicherte Format übersetzt werden (vermeidet Big-Bang im Frontend).
4. **Messbare Qualität** statt Mystik: Shadow-Logging, Tests für Validator + Mapper, KPIs (Fehlerquote, Retry-Anzahl, mittlere Latenz).
5. **Wahrheit aus der App, nicht nur aus LLM-Fließtext** – Workout-Übungen nur als erlaubte `exerciseKey` aus der Bibliothek (siehe Phase 3); bei Ernährung/Lebensmitteln wo möglich **`foodId`** zur internen DB. **Nährwerte von Rezepten** sind kanonisch nur, was sich **rechnerisch** aus verknüpften Foods ergibt (siehe Querschnitt B).
6. **Strukturierte Nachvollziehbarkeit** – Zusätzlich zu narrativen Coach-Notes: kleine **maschinenlesbare** Felder (`assumptions`, `applied_constraints` o. Ä.) für Debug, UI „Warum so?“, bessere Retry-Hinweise (siehe Querschnitt C).
7. **Verfeinerung statt Voll-Neuauflage** – Nach erstem validierten JSON einen **zweiten, fokussierten** KI-Call mit derselben Pipeline: Eingabe = letzter Stand + Nutzer-Diff (Zeit, Diät, Intoleranz …); spart Tokens und erhält Schema-Stabilität (siehe Querschnitt D).
8. **Versionierung & Regression** – Jeder produktive KI-Lauf speichert **`prompt_version`** + **`model_id`** (siehe Phase 6); **Golden-Fixtures** bei Prompt-Änderungen ausführen (siehe Phase 7 + Querschnitt E).

---

## Querschnitt: KI-Qualität, Wahrheit & Regression

Die folgenden Punkte gelten **coach-übergreifend** und für **Phase 8 (Meal-KI)**; Umsetzung über die genannten Phasen streuen, hier als gemeinsames Zielbild.

### A – Nur aus erlaubter Menge / DB-Anbindung

- **Coach:** Im Prompt nur eine **komprimierte** `exercise_db` mit Keys, die wirklich wählbar sind; generiertes JSON darf keine freien Übungsnamen enthalten, die nicht auf `exerciseLibrary.key` abbilden. Nach Zod: Mapping-Fehler = Retry oder Ersetzung aus Pool (Phase 3).
- **Meal / Template:** Bevorzugt Zutatenzeilen mit optional **`foodId`** (interne Food-Tabelle). Freitext-Zutat (`name` ohne ID) **erlaubt** als Fallback – klar als `unresolved_ingredient` o. Ä. kennzeichnen, **keine** stillschweigende Nährwertgarantie; UI kann „mit Food verknüpfen“ anbieten.
- **Ziel:** Weniger Halluzination, konsistentes Tracking und Skalierung.

### B – Kanonische Nährwerte bei KI-Rezepten

- Das LLM liefert **Zutaten, Mengen, Schritte**; optional **`llm_estimate_nutrients`** (pro `N` Portionen oder pro Portion – ein Mal festlegen) nur als **Vorschau**, nie als alleinige Speicher-Wahrheit.
- **Nach dem Merge der Zutaten:** Server berechnet `computed_totals_for_N` aus allen Zeilen mit **`foodId`** (+ Mengen × `N` / Skalierung); fehlende IDs → fehlender Anteil in `nutrients_computed_coverage` (0–1) oder fehlende Makros nur für aufgelöste Zeilen.
- **Persistiert im Template:** Kanonisch **`nutrients_*`** aus **Berechnung**; Schätzwerte nur zu Vergleich/Debug optional speichern. Beim Loggen immer von **kanonischen** Werten skalieren (`S/N`).

### C – Strukturierte Begründung im Coach-JSON

Zod-Schema um **kurze, begrenzte** Felder erweitern (Namen beispielhaft, im Code vereinheitlichen):

| Feld | Zweck |
|------|--------|
| `assumptions` | max. 3–5 Strings, z. B. „Adherence letzte Woche 60 % → Volumen gehalten“ |
| `applied_constraints` | max. 3–8 Strings, z. B. „deload_flag=true“, „no_overhead_press: shoulder“ |

**Nicht** lange Essays; **narrative** `coachNotes` bleiben für den Nutzer. UI: optional aufklappbar „Kurz begründet“.

### D – Verfeinerungs-Flow (Coach & Meal)

- **Trigger:** Nutzer ändert nach Vorschau nur Randbedingungen („max. 20 Min kochen“, „ohne Schwein“, „eine Session kürzer“).
- **Request-Body:** `{ "previous_valid_json": <letzter Zod-ok-Stand>, "user_refinement": "<kurzer Freitext oder strukturierte Liste>" }` (oder äquivalent).
- **Prompt:** „Ändere **minimal**; Schema identisch; nur was nötig ist, um die neuen Constraints zu erfüllen.“
- **Pipeline:** **dieselbe** Parse → Zod → Constraints → Retry; bei Konflikt klare Fehlermeldung („Constraint X widerspricht Y“).
- **Vorteil:** weniger Tokens, stabileres JSON, bessere UX als komplette Neugenerierung.

### E – Prompt-/Modell-Version & Golden-Tests

- Konstante z. B. `COACH_PROMPT_VERSION = "coach-v3.2"` / `MEAL_RECIPE_PROMPT_VERSION = "meal-recipe-v1.0"` in einer zentralen Datei; bei jeder inhaltlichen Prompt-Änderung hochzählen.
- **`coach_ai_runs` (und analog `meal_ai_runs` o. dgl.):** Spalten **`prompt_version`**, **`model_id`** (z. B. `mistral-small-latest`), optional **`refinement_round`** (0 = Erstcall, 1+ = Verfeinerung).
- **Golden-Suite:** 3–10 **fest eingecheckte** Fixtures (repräsentative `UserContext` + ggf. Snapshot der erwarteten validierten Ausgabe oder nur „muss Zod + Constraints passen“). Läuft in CI oder lokal vor Release; **bei `prompt_version`-Bump** neue oder angepasste Erwartung dokumentieren.
- **Ziel:** messbare Regression statt „fühlt sich anders an“.

---

## Mapping: Onboarding → `UserContext` (alles berücksichtigen)

Beim Aufbau von `UserContext` müssen **mindestens** folgende Quellen zusammengeführt werden:

| Quelle | Felder / Nutzen |
|--------|------------------|
| `coach_plans.onboarding_data` (Workout) | `primaryGoal`, `trainingStyle`, `equipment`, `workoutVibe`, `sports`, `planMode`, `eventName/Date/Distance`, `trainingDays`, `sessionDuration`, `fitnessLevel`, **`availableTrainingDays`**, **`allowDoubleSessions`**, `benchmarks`, `injuries`, `extraWishes` |
| `coach_plans.onboarding_data` (Nutrition) | `nutritionGoal`, `age`, `gender`, `weight`, `height`, `activityLevel`, `restrictions`, `allergies`, `mealsPerDay`, `cookingTime`, `foodPreferences`, `budget` |
| Profil (`users`) | `measurements` (Alter, Größe, Gewicht, Aktivität, Geschlecht), `goals`, `weight_history`, optional `profile_extras` / Schritte+Schlaf wenn vorhanden |
| Letzte Wochen (DB) | Workouts (`workouts`), Ernährung (`nutrition`), Reports (`coach_weekly_reports`) |

**Ergänzungen (falls im PT-Niveau gewünscht, aber nicht im aktuellen Onboarding):**

- `sleep_avg`, `stress_avg`, strukturierte `injury_history` → **entweder** als neue optionale Steps in `CoachOnboarding` **oder** aus `profile_extras` / späteren Quick-Checks – im `UserContext` als nullable Felder führen, nie Generierung blockieren, aber Prompt anreichern.

---

## Phasenplan (empfohlene Reihenfolge)

### Phase 0 – Invarianten & Bugfixes (Pflicht vor „intelligentem“ Coach)

- **Wochenfenster vereinheitlichen:** Report- und Log-Auswertung muss sich an **`coach_weekly_schedules.start_date`** (7 Tage) orientieren – nicht an „beliebigem Kalender-Montag“, sonst falsche Adherence und falsche Reports.
- **`auto-advance` dokumentieren/optional härten:** aktuell trigger über Client-Mount; optional später Cron/Queue – im Prompt als **Zielbild**, nicht als Day-0-Pflicht.

**DoD:** Ein Test oder wiederholbare manuelle Prüfung: gleiche Woche → gleiche Datumsspanne für Logs und Report.

---

### Phase 1 – `UserContext` (Data Layer)

Implementiere eine pure Funktion (z. B. `buildUserContextForCoach({ userId, plan, scheduleWindow })`) die ein **stabiles JSON** liefert:

```json
{
  "onboarding": { "... alle Workout- bzw. Nutrition-Felder normalisiert ..." },
  "profile_snapshot": { "weight_kg", "height_cm", "age", "gender", "activity_level" },
  "rolling": {
    "window_days": 28,
    "workouts_logged": [ ... ],
    "nutrition_summary": { ... },
    "weight_trend": "up|down|stable",
    "last_reports_highlights": [ ... ]
  },
  "constraints_input": {
    "available_weekdays_en": ["Monday", ...],
    "allow_double_sessions": true,
    "session_duration_cap_min": 60,
    "equipment_ids": ["barbell", ...],
    "injuries_plain": "..."
  }
}
```

**DoD:** Wird vor **jeder** Plan- und Report-Generierung gebaut; Unit-Test mit Fixture-Daten.

---

### Phase 2 – Validierung & Retry (Zod + Repair-Schicht)

**Wichtig:** Das bestehende LLM-JSON (`weekFocus`, `coachNotes`, `schedule`-Array mit `day: "Monday"`, …) **nicht** unmittelbar durch das kurze Demo-Schema aus der alten Prompt-Version ersetzen, ohne Mapper – sonst bricht `CoachPage`.

Vorgehen:

1. **Zod-Schema für das *tatsächlich* gespeicherte Format** (aus `buildWorkoutPrompt` / API ableiten, inkl. optional `cardio`, `exercises`, `isRest`, etc.).
2. **`parseCoachJson(raw)`** – extrahiert JSON aus Antwort (trim, optional Markdown-Fences entfernen).
3. **`validateWeeklyWorkoutEnvelope(parsed)`** – `safeParse`; bei Fehler: **Retry** (max. 2–3) mit strukturierter Fehlermeldung („`schedule[2].day` ungültig …“).
4. Optional: zweites, strengeres **„canonical exercise row“**-Schema nur für neue Endpoints oder Feature-Flag.
5. **Verfeinerungs-Route** (`POST …/refine` o. Ä.): nimmt **bereits validiertes** JSON + Nutzer-Diff; **dieselbe** `parseCoachJson` → Zod → Constraints-Kette wie der Erst-Endpoint (Querschnitt D).

**DoD:** Kein `JSON.parse` ohne Zod auf dem kritischen Pfad; alle Coach-Generate-Routen **und** Verfeinerung nutzen dieselbe Pipeline.

---

### Phase 3 – Hard Constraints Engine (deterministisch)

Nach Zod, vor Speichern:

| Regel | Umsetzungshinweis |
|-------|-------------------|
| Nur Training an `availableTrainingDays` | Normalisierung Mo–So; Rest-Tage explizit erlauben |
| Doppel-Sessions nur wenn `allowDoubleSessions` | Max. 2 Slots pro Tag; Typ-Regel (z. B. 2. Session kein schweres Maximum-Strength) |
| Volumen pro Muskelgruppe / Woche | **Tags** aus `exerciseLibrary` → Muskelcluster mappen; Grenzwerte ab `fitnessLevel` (Schwellen als Konstanten, testbar) |
| 48h: gleiche Primär-Muskelgruppe nicht 2× heavy | Heuristik: „heavy“ = RPE-Ziel ≥8 oder sessionType Strength + hohe Satzzahl (tuning!) |
| Verletzungen | Start: **Keyword-Blocklist** + Tag-Blocklist (z. B. Knie → keine `squat_*`, `lunge_*` …); LLM darf **nur** `exerciseKey` aus der **im Prompt mitgelieferten** erlaubten Liste wählen (Querschnitt A); freie Fantasie-Übungsnamen = Validierungsfehler |
| Deload | Alle *n* Wochen **oder** wenn Reports `recommendation === 'deload'` /Completion-Rules – mit boolean `deload_week` im Output |

Bei Verletzung: **Retry mit LLM** *oder* **automatische Korrektur** (z. B. illegale Übung durch nächstbeste aus gleichem Tag-Pool ersetzen) – im Code dokumentieren, was ihr bevorzugt.

**DoD:** Mindestens 5 Unit-Tests (verfügbare Tage, Doppel-Session, Verletzung, Deload-Flag, Volume-Cap).

---

### Phase 4 – Prompt-Design (Personal-Trainer-Ton + harte Fakten)

- **System:** Rolle (erfahrener Coach), **keine Medizin-Diagnose**, Sicherheit zuerst.
- **User:** kompakter `UserContext` + **komprimierte** `exercise_db` (nur erlaubte Keys + Namen + tags; Token-Limit beachten).
- **Sprache:** Default DE für Nutzer-Notes wenn `uiLocale === 'de'`, konsistent mit App.
- **Output:** Weiterhin JSON-only; `coach_notes` / `coachNotes` Längenlimits sinnvoll (z. B. 50–1200 Zeichen je nach UI).
- **Strukturierte Kurz-Begründung:** Pflichtfelder `assumptions` / `applied_constraints` gemäß Querschnitt C (Längenlimits im Zod erzwingen).
- **Verfeinerungs-Prompt:** separater, kurzer System-/User-Block für den **Zweit-Call** (Querschnitt D); „minimal diff“, gleiches JSON-Schema.
- **`COACH_PROMPT_VERSION`:** bei jeder relevanten Text-Änderung hochsetzen; in Logs mitschreiben (Phase 6).

**DoD:** Prompts versioniert (eine Konstanten-/Datei-Quelle), nicht über 20 verstreute Template-Monster ohne Tests; Golden-Suite kennt die aktuelle `prompt_version` (Phase 7).

---

### Phase 5 – „Weekly Evaluation“ / nächste Woche

**Funktion `runWeeklyEvaluation` (empfohlener Name)** – kann intern die Logik aus `auto-advance` + Report-Generierung kapseln:

1. Fenster aus `start_date` bestimmen.
2. Logs + optional Gewicht/Schlaf aus Profil ziehen.
3. **Heuristische Metriken** (Adherence, Durchschnittskalorien, Häufigkeit) + LLM für narrative `coach_message` / Strategie.
4. Entscheidungs-Enums (`increase_volume` / `reduce_volume` / `deload` / `continue`) bleiben; **Mapping** auf nächste Woche explizit im Prompt.
5. Nächste Woche generieren mit **gleichem** Validation+Constraints-Stack.
6. Optional: Nutzer-Feintuning („mehr Cardio“, „einen Tag frei“) über **Verfeinerungs-Endpoint** mit letztem validierten Plan-JSON (Querschnitt D), statt kompletter Neu-Generierung.

**DoD:** Ein End-to-End-Pfad: „Woche abgeschlossen → Report → nächste Schedule“ ohne divergierende Datumslogik.

---

### Phase 6 – Observability & Feature-Flag

- **Tabelle** `coach_ai_runs` (oder JSON-Log-Datei in Dev): `plan_id`, `week`, `endpoint`, `input_hash`, `raw_response`, `zod_ok`, `constraints_ok`, `retries`, `latency_ms`, `final_schedule_hash`, zusätzlich **`prompt_version`**, **`model_id`**, optional **`refinement_round`** (0 = Erstgenerierung), optional **`user_thumbs`** / Feedback-Spalten für spätere Auswertung.
- **Meal-KI analog:** `meal_ai_runs` (oder erweiterte bestehende Log-Tabelle) mit `user_id`, `endpoint`, `prompt_version`, `model_id`, `input_hash`, `zod_ok`, `latency_ms` – gleiche Observability-Philosophie wie Coach.
- **Feature-Flag** `use_coach_level_v2` (z. B. in `users.profile_extras` oder Env + User-Override): neue Pipeline nur für Beta-Nutzer.

**DoD:** Mindestens ein Dashboard oder Admin-Query-Beispiel; Flag schaltbar ohne Deploy-Risiko für alle; jeder produktive Lauf ist einer **`prompt_version` + `model_id`** zuordenbar (Querschnitt E).

---

### Phase 7 – Tests & Qualitätsziele (realistisch)

| Testtyp | Inhalt |
|---------|--------|
| Unit | Zod, Constraints, Datumsfenster, Mapper |
| Integration | `POST /api/coach/plans` mit Mock-LLM oder aufgezeichneter Response |
| **Golden / Regression** | **3–10 feste Fixtures** (`UserContext` + erwartetes Verhalten: Zod ok, Constraints ok, ggf. Snapshot-Hash der serialisierten Ausgabe); **bei jedem Bump von `COACH_PROMPT_VERSION`** Suite grün halten oder Erwartung bewusst anpassen (Querschnitt E) |
| Meal-KI | Mindestens 2–3 Golden-Fixtures für Rezept-JSON (Schema + „Nährwerte nur aus `computed_*` nach Merge“) |
| Manuell | 3 Szenarien aus dem alten Prompt (Anfänger Fettverlust + Knie; Fortgeschritten 5×/Woche + Doppel-Session; Schulter-Reha) |

**Definition of Done (angepasst):**

- Kein Produktionspfad ohne Validierung.
- Onboarding unvollständig → **klarer Fehler**, kein Plan.
- Wochen-Reports und Logs **dasselbe** Zeitfenster.
- Validator + Constraints decken die **in Tests benannten** Edge Cases ab; neue Fälle werden als Test ergänzt (kein „100 % aller möglichen Weltzustände“).
- Latenz: **Ziel** z. B. p95 &lt; 8–15 s für volle Wochengenerierung; **wenn** &lt;3 s gefordert: nur mit kürzerem Modell, weniger exercises im Prompt, Streaming der Notes – explizit ausweisen.

---

## Anweisung an den umsetzenden Agenten (Kurz)

1. Phase 0–2 zuerst (Datenkorrektheit + Validierung).
2. Dann Constraints (Phase 3).
3. Dann Prompt-Konsolidierung (Phase 4).
4. Weekly-Pipeline vereinen (Phase 5).
5. Logging + Flag (Phase 6).
6. Tests iterativ erweitern (Phase 7).
7. **Phase 8** (Zusatzfeature): KI-Mahlzeiten-Template mit Rezept, Schritten und Portions-Skalierung (siehe unten).

Kommentierung im Code: bei **nicht-offensichtlichen** Coach-Entscheidungen kurz `// COACH-LEVEL: …` – nicht bei jeder Zeile Boilerplate.

**Querschnitt** (Wahrheit, Verfeinerung, Versionierung, Golden-Tests) gilt für Coach **und** Meal-KI – beim Implementieren nicht nur Einzelphasen lesen.

---

## Phase 8 – Zusatzfeature: Mahlzeiten-Template per KI („Rezept-Modus“)

Ziel: Nutzer gibt eine **Kurzidee** (z. B. „Bolognese Soße“) ein → die KI liefert ein **strukturiertes Rezept** → beim Speichern entsteht ein **Meal Template**, das beim Tracken fast nur noch **Servings / Portionen** braucht. Zusätzlich: **Zubereitungsanleitung** (nummerierte Schritte), die die KI befüllt und die man manuell editieren kann. **Alle Zutatenmengen** skalieren live mit der gewählten Portionszahl (z. B. Rezeptbasis 4 Portionen → Anzeige für 6 Portionen = Faktor 1,5).

### Nutzerstory

1. **Template anlegen** → Button „Mit KI aus Idee …“ → Freitext (Gericht / Stil / Budget / Zeit optional).
2. KI antwortet mit validiertem JSON: Name, Kategorie, Zutatenliste (mit **Mengen zur Referenz-Portionszahl**), **Schritte**; **Nährwerte** im JSON nur als optionale **LLM-Schätzung** (`llm_estimate_nutrients` o. Ä.) – **gespeicherte Makros** kommen aus **serverseitiger Berechnung** nach Food-Merge (Querschnitt B).
3. Optional **Verfeinerung:** Nutzer schränkt ein („20 Min“, „vegan“) → Zweit-Call mit letztem validiertem JSON + Diff (Querschnitt D).
4. Nutzer sieht Vorschau: **Einkauf** (Zutaten × Menge) + **So geht’s** (Schritte); bei Nährwerten Hinweis, wenn Zutaten ohne `foodId` → **Lücke** in `nutrients_computed_coverage`. `yields_portions` (Referenz, z. B. 4) ist sichtbar editierbar.
5. Beim **Ändern der Portionen** (z. B. von 4 auf 2 oder 6) werden **nur die Mengen der Zutaten** für Anzeige/Kochen neu berechnet; gespeicherte **Basisdaten** bleiben „pro Referenz-Rezept“ (siehe Datenmodell), die Skalierung ist deterministisch im Client/Server.
6. Beim **Loggen** einer Mahlzeit aus diesem Template: Standard = „1 Serving“ des Templates; Nutzer stellt Servings ein → geloggte Makros = **`computed_totals_for_N` × (S / N)** (keine blinden LLM-Werte).

### Datenmodell (Kanon, umsetzbar)

**Referenz:** `yields_portions = N` (integer ≥ 1) = „dieses Rezept ist so ausgelegt, dass die untenstehenden Zutatenmengen **N Portionen** ergeben“.

- **`ingredients[]`** (bestehendes Format wo möglich erweitern, nicht parallel wildwuchs; Querschnitt A):
  - Pro Zeile: `name`, `amount` (Zahl), `unit` (`g` | `ml` | `Stk` | …), optional `note`, **optional `foodId`** (interne DB).
  - Ohne `foodId`: als **unaufgelöst** markieren (Flag/Feld) – keine stillschweigende Nährwert-Vollständigkeit.
  - Die Werte `amount` gelten **immer für genau `N` Portionen** (Referenz).
- **`prep_steps[]`** (neu, JSONB oder Text-Array in `meal_templates`):
  - `order: number`, `title?: string`, `body: string` (ein Schritt = eine Zeile oder kurzer Absatz).
  - KI füllt `body`; Nutzer kann bearbeiten.
- Optional: `prep_time_min`, `cook_time_min`, `storage_notes` (KI oder manuell).
- **Nährwerte (kanonisch, Querschnitt B):** Felder wie `computed_calories_for_n`, `computed_protein_g_for_n`, … (oder ein verschachteltes Objekt `computed_totals`) – ausschließlich aus Summe der **mit `foodId` aufgelösten** Zeilen berechnet; `nutrients_computed_coverage` (0–1) = Anteil Makros abgedeckt oder Zeilenanteil mit ID, je nach Implementierung **eine** Kennzahl dokumentieren.
- Optional gespeichert: `llm_estimate_nutrients` nur zum **Vergleich** / UX-Hinweis („Schätzung der KI“ vs. „aus deiner Datenbank“).

**Skalierung:** für Anzeige und Kochen mit gewünschten Portionen `S` (rational, z. B. 0.5–32):

`display_amount = round_for_cooking( amount * (S / N) )` pro Zutat (Rounding-Regel dokumentieren: z. B. 2 Nachkommastellen, Gewürze Minimum 0,25 TL).

**Tracking:** geloggte Kalorien/Protein/KH/Fett für `S` Servings:

`nutrients_logged = computed_totals_for_N * (S / N)`  

wobei `computed_totals_for_N` **nur** aus der Food-Datenbank abgeleitet ist (Querschnitt B). Kein Fallback auf reine LLM-Zahlen ohne klaren Hinweis in der UI.

### KI-Pipeline (wie Coach-Level)

1. **Input:** Nutzer-Idee + optional Profil-Allergien/Einschränkungen + Sprache (`de`/`en`).
2. **Prompt:** Ausgabe **nur JSON** nach **Zod-Schema** (ähnlich Ruhe wie Meal-Analysis im Projekt: keine Floskeln außerhalb JSON); **`MEAL_RECIPE_PROMPT_VERSION`** loggen (Phase 6).
3. **Validate + Retry** (max. 2–3): bei Schemafehler Retry mit Fehlerdetails.
4. **Post-Check (deterministisch):** Zutatenliste nicht leer; Schritte mindestens 2 bei „gekocht“; `yields_portions` default 4 wenn nicht gesetzt; optional grobe Plausibilität der **Schätz**-Nährwerte (nicht bindend).
5. **Berechnung:** Nach Persistenz der Zutaten **`computed_totals_for_N`** aus `foodId`-Zeilen berechnen; Coverage anzeigen/speichern (Querschnitt B).
6. **Verfeinerung:** Endpunkt analog Coach – Eingabe = letztes gültiges Rezept-JSON + Nutzer-Diff; gleiche Zod-/Berechnungskette (Querschnitt D).
7. **Speichern:** `POST /api/meal-templates` (oder neuer `POST /api/meal-templates/ai-draft` der validiertes JSON zurückgibt und dann speichert).

### UI/UX-Anforderungen

- Template-Editor / Composer: Tabs oder Sektionen **Zutaten** | **Zubereitung** | **Nährwerte** | **Portionen (Referenz N)**.
- **Nährwerte-Sektion:** primär **berechnete** Werte anzeigen; optional Vergleichszeile „KI-Schätzung“; bei `nutrients_computed_coverage` &lt; 1 klarer Hinweis („Zutaten verknüpfen für genaue Makros“).
- Schieberegler oder Stepper für **„Portionen zum Kochen anzeigen“** (`S`) – rein UI-Vorschau, ändert nicht die gespeicherte Basis, nur die **angezeigten** Mengen (oder optional „Rezept auf S Portionen umrechnen“ = setzt neue Basis – dann Klartext im UI, was passiert).
- **Verfeinern-Button** nach erfolgreicher Erstvorschau (sendet letztes JSON + Freitext-Constraints).
- Beim Deploy/Loggen aus Template: klarer Hinweis: „1 Log-Eintrag = `S` × eine Template-Portion“; geloggte Makros basieren auf **berechneten** Template-Werten.

### Integration im bestehenden Stack

- Backend: neue/erweiterte Spalte z. B. `prep_steps JSONB` in `meal_templates` (Migration in `initDb` wie üblich).
- Frontend: Eintrag in Nutrition (Template-Liste, `RationComposerModal` oder dedizierter „KI-Rezept“-Dialog) – **kein** zweites Wahrheitssystem; ein Template-Typ „ai_recipe“ optional als Flag oder `source` im JSON.
- Nutzung von `completeMealAnalysis` / gemeinsamer `mealAiShared`-Parser-Logik wo sinnvoll, oder `completeCoachJson` mit eigenem kleinen Schema – **eine** Route wählen und dokumentieren; **Food-Resolver** (Name → `foodId`) optional als eigener kleiner Schritt oder Tool, um `computed_totals` zu maximieren.

### Tests (Minimum)

- Skalierung: `N=4`, `amount=400` g, `S=6` → erwartete Anzeige 600 g.
- KI-Fixture: validiertes JSON → gespeichertes Template → abgerufene GET-Daten identisch in Struktur.
- **Berechnung:** Fixture-Zutaten mit bekannten `foodId` + Mengen → erwartete `computed_totals_for_N` (Unit-Test gegen echten Food-Lookup).
- **Golden:** 2–3 Rezept-Fixtures inkl. `MEAL_RECIPE_PROMPT_VERSION` (Phase 7); Verfeinerungs-Call ändert nur erwartete Felder.
- Edge: `S=0.5`, sehr kleine Gewürzmengen → keine negativen Werte, Mindestmenge.

### DoD (Phase 8)

- Idee eingeben → KI-Rezept → speichern → in Vorschau Zutaten + Schritte sichtbar.
- Portionen ändern → Zutatenmengen sofort konsistent.
- Aus Template loggen → nur Servings nötig; **Makros aus `computed_*`**, skaliert mit `S/N`; UI zeigt Lücken bei fehlenden `foodId`s.
- Leere Schritte / leere Zutaten → Validierungsfehler, kein Silent Fail.
- Verfeinerung optional in UI; Pipeline identisch zu Erst-Generierung.

---

## Optional: Kanonisches strenges Übungs-JSON (später)

Wenn ihr langfristig `exercise_id` = `LibraryExercise.key` überall wollt:

- Neues internes Schema generieren lassen → **Mapper** → heutiges `schedule`-Format für UI.
- Front-End schrittweise auf Keys umstellen (Anzeigenamen aus Library).

Das ist **Phase 9+** (nach dem Meal-Template-KI-Feature) und nicht Voraussetzung für spürbare Qualitätsgewinne.
