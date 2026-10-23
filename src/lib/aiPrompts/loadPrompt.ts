/**
 * Lädt KI-Prompts aus prompts/{category}/*.md
 * - Platzhalter: {{name}}
 * - Phasen: Datei mit `---PHASE_MATCH---` → observe (oben) / match (unten)
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Nach esbuild-Bundle liegt server.js in /app — `../../../prompts` würde fälschlich `/prompts` ergeben. */
function resolvePromptsRoot(): string {
  const envRoot = process.env.PROMPTS_DIR?.trim();
  if (envRoot && existsSync(path.join(envRoot, 'workout'))) {
    return path.resolve(envRoot);
  }
  const candidates = [
    path.resolve(process.cwd(), 'prompts'),
    path.resolve(__dirname, 'prompts'),
    path.resolve(__dirname, '../../../prompts'),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'workout')) && existsSync(path.join(dir, 'nutrition'))) {
      return dir;
    }
  }
  return candidates[0];
}

const PROMPTS_ROOT = resolvePromptsRoot();

const cache = new Map<string, string>();

export type PromptCategory = 'nutrition' | 'workout';
export type PhasedPromptPhase = 'observe' | 'match';

function cacheKey(category: PromptCategory, name: string): string {
  return `${category}/${name.replace(/\.md$/i, '')}`;
}

export function getPromptsDirectory(category: PromptCategory): string {
  return path.join(PROMPTS_ROOT, category);
}

export function clearPromptCache(): void {
  cache.clear();
}

/** @deprecated Nutze clearPromptCache */
export function clearNutritionPromptCache(): void {
  clearPromptCache();
}

function readPromptFile(category: PromptCategory, name: string): string {
  const key = cacheKey(category, name);
  let raw = cache.get(key);
  if (raw === undefined) {
    const base = name.replace(/\.md$/i, '');
    const filePath = path.join(PROMPTS_ROOT, category, `${base}.md`);
    raw = readFileSync(filePath, 'utf8');
    cache.set(key, raw);
  }
  return raw;
}

function applyVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [varKey, value] of Object.entries(vars)) {
    out = out.split(`{{${varKey}}}`).join(value ?? '');
  }
  return out;
}

export function loadPrompt(
  category: PromptCategory,
  name: string,
  vars: Record<string, string> = {},
  phase?: PhasedPromptPhase,
): string {
  let raw = readPromptFile(category, name);
  if (raw.includes('---PHASE_MATCH---')) {
    const parts = raw.split('---PHASE_MATCH---');
    raw = phase === 'match' ? parts.slice(1).join('---PHASE_MATCH---') : parts[0];
  }
  return applyVars(raw.trim(), vars);
}

export function loadNutritionPrompt(name: string, vars: Record<string, string> = {}): string {
  return loadPrompt('nutrition', name, vars);
}

export function getNutritionPromptsDirectory(): string {
  return getPromptsDirectory('nutrition');
}
