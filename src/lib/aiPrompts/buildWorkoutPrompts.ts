/**
 * Workout-/Coach-KI-Prompts — je Szenario eine Markdown-Datei in prompts/workout/.
 */

import { loadPrompt } from './loadPrompt';

export function buildCoachWorkoutWeekPrompt(vars: Record<string, string>): string {
  return loadPrompt('workout', 'coach-workout-week', vars);
}

export function buildCoachNutritionWeekPrompt(vars: Record<string, string>): string {
  return loadPrompt('workout', 'coach-nutrition-week', vars);
}

export function buildCoachWeeklyReportPrompt(vars: Record<string, string>): string {
  return loadPrompt('workout', 'coach-weekly-report', vars);
}

export function buildCoachWeeklyReportNarrativePrompt(vars: Record<string, string>): string {
  return loadPrompt('workout', 'coach-weekly-report-narrative', vars);
}

export function buildWorkoutTemplateGeneratePrompt(vars: Record<string, string>): string {
  return loadPrompt('workout', 'workout-template-generate', vars);
}

export function buildUserWeeklyReportPrompt(vars: Record<string, string>): string {
  return loadPrompt('workout', 'user-weekly-report', vars);
}
