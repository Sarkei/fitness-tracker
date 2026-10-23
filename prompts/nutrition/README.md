# KI-Prompts Ernährung

**Eine Markdown-Datei = ein KI-Szenario.**

| Datei | Szenario |
|-------|----------|
| `meal-parse-text.md` | Mahlzeit **Text** → strukturiertes `MealIntent` (JSON) |
| `meal-parse-photo.md` | Mahlzeit **Foto** (+ optional Text) → `MealIntent` |
| `nutrition-label-scan.md` | Nährwerttabelle auf Verpackung scannen |
| `suggest-custom-food-draft.md` | Neues Lebensmittel anlegen |
| `daily-nutrition-review-de.md` | Tages-Feedback (Deutsch) |
| `daily-nutrition-review-en.md` | Tages-Feedback (Englisch) |
| `meal-recipe-draft.md` | Rezept-Vorlage aus Idee |
| `meal-recipe-refine.md` | Rezept-Vorlage verfeinern |

Katalog-Zuordnung (OFF, App-DB, Baselines) läuft **ohne** separates KI-Prompt — siehe `src/lib/nutrition/nutritionRoutes.ts` (`/api/nutrition/resolve`).

## Code

- Parse-Prompts: `src/lib/nutrition/buildMealParsePrompts.ts`
- Sonstige Prompts: `src/lib/aiPrompts/buildMealPrompts.ts`
- Laden: `src/lib/aiPrompts/loadPrompt.ts`
- UI-Wrapper: `src/services/aiNutritionService.ts`

Server nach Änderung neu starten.
