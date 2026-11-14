# KI-Prompts Workout / Coach

Eine Markdown-Datei pro KI-Szenario — vollständiger Prompt, Platzhalter `{{…}}` nur für Laufzeit-Daten.

| Datei | API / Funktion |
|-------|----------------|
| `coach-workout-week.md` | Coach-Plan: Trainingswoche generieren |
| `coach-nutrition-week.md` | Coach-Plan: Ernährungswoche generieren |
| `coach-weekly-report.md` | Coach: Wochenreport |
| `workout-template-generate.md` | Einzelnes Workout-Template per KI |

Code: `src/lib/aiPrompts/buildWorkoutPrompts.ts`

Nach Änderungen: Server neu starten.
