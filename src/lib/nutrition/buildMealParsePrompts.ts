import { loadPrompt } from '../aiPrompts/loadPrompt';
import { listTemplateAliases } from './dishExpander';
import { segmentMealText } from './textMealSegmenter';

export function buildMealParseTextPrompt(userText: string): string {
  const segments = segmentMealText(userText);
  const segmentHints = segments.length > 0 ? segments.map((s, i) => `${i + 1}. ${s}`).join('\n') : '—';
  return loadPrompt('nutrition', 'meal-parse-text', {
    userText: userText.trim(),
    segmentHints,
    templateAliases: listTemplateAliases().join(', '),
  });
}

export function buildMealParsePhotoPrompt(userText: string): string {
  const segments = segmentMealText(userText);
  const segmentHints = segments.length > 0 ? segments.map((s, i) => `${i + 1}. ${s}`).join('\n') : '—';
  return loadPrompt('nutrition', 'meal-parse-photo', {
    userText: userText.trim(),
    segmentHints,
    templateAliases: listTemplateAliases().join(', '),
  });
}

export function buildNutritionLabelScanPrompt(): string {
  return loadPrompt('nutrition', 'nutrition-label-scan', {});
}
