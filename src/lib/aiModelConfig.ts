/**
 * Runtime AI model selection per feature area (Mistral + Gemini).
 * Values load from process.env; admin can update via .env persistence.
 */

export type AiModelArea =
  | "coach_workout"
  | "coach_nutrition"
  | "meal"
  | "meal_vision"
  | "workout_template";

export type AiProviderName = "ollama" | "mistral" | "gemini";

export const AI_MODEL_AREAS: AiModelArea[] = [
  "coach_workout",
  "coach_nutrition",
  "meal",
  "meal_vision",
  "workout_template",
];

export const AI_MODEL_AREA_LABELS: Record<AiModelArea, string> = {
  coach_workout: "Coach – Workout",
  coach_nutrition: "Coach – Ernährung",
  meal: "Ernährung – Textanalyse",
  meal_vision: "Ernährung – Bildanalyse",
  workout_template: "Workout-Vorlagen",
};

export type AiModelRecommendation = {
  model: string;
  hint: string;
};

export type AiModelOption = {
  id: string;
  label: string;
};

/** Kuratierte Modell-Listen fürs Admin-Dropdown (nur bekannte, funktionierende IDs). */
const OLLAMA_MODELS: AiModelOption[] = [
  { id: "gemma4:e2b", label: "Gemma 4 E2B (lokal, empfohlen)" },
  { id: "gemma2:2b", label: "Gemma 2 2B (lokal)" },
  { id: "llama3.2:1b", label: "Llama 3.2 1B (lokal)" },
  { id: "llama3.2:3b", label: "Llama 3.2 3B (lokal)" },
  { id: "mistral:7b", label: "Mistral 7B (lokal)" },
];

const MISTRAL_TEXT_MODELS: AiModelOption[] = [
  { id: "mistral-large-latest", label: "Mistral Large (beste Qualität, JSON)" },
  { id: "mistral-medium-latest", label: "Mistral Medium" },
  { id: "mistral-small-latest", label: "Mistral Small (schnell & günstig)" },
];

const MISTRAL_VISION_MODELS: AiModelOption[] = [
  { id: "pixtral-large-latest", label: "Pixtral Large (Bilder, empfohlen)" },
  { id: "pixtral-12b-2409", label: "Pixtral 12B" },
];

const GEMINI_MODELS: AiModelOption[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (empfohlen)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (schneller)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (höhere Qualität)" },
];

export const AI_MODEL_SELECT_OPTIONS: Record<AiProviderName, Record<AiModelArea, AiModelOption[]>> = {
  ollama: {
    coach_workout: OLLAMA_MODELS,
    coach_nutrition: OLLAMA_MODELS,
    meal: OLLAMA_MODELS,
    meal_vision: OLLAMA_MODELS,
    workout_template: OLLAMA_MODELS,
  },
  mistral: {
    coach_workout: MISTRAL_TEXT_MODELS,
    coach_nutrition: MISTRAL_TEXT_MODELS,
    meal: MISTRAL_TEXT_MODELS,
    meal_vision: MISTRAL_VISION_MODELS,
    workout_template: MISTRAL_TEXT_MODELS,
  },
  gemini: {
    coach_workout: GEMINI_MODELS,
    coach_nutrition: GEMINI_MODELS,
    meal: GEMINI_MODELS,
    meal_vision: GEMINI_MODELS,
    workout_template: GEMINI_MODELS,
  },
};

/** Optionen für Dropdown; unbekannter gespeicherter Wert wird als erste Option ergänzt. */
export function getModelSelectOptions(
  provider: AiProviderName,
  area: AiModelArea,
  currentValue?: string,
): AiModelOption[] {
  const base = AI_MODEL_SELECT_OPTIONS[provider]?.[area] ?? [];
  const cur = currentValue?.trim();
  if (cur && !base.some((o) => o.id === cur)) {
    return [{ id: cur, label: `${cur} (aktuell gespeichert)` }, ...base];
  }
  return base;
}

/** Offizielle Empfehlungen pro Provider & Bereich (Admin-Panel). */
export const AI_MODEL_RECOMMENDATIONS: Record<AiProviderName, Record<AiModelArea, AiModelRecommendation>> = {
  ollama: {
    coach_workout: {
      model: "gemma4:e2b",
      hint: "Lokales Gemma 4 E2B Modell via Ollama (schnell, privat, kein API-Key)",
    },
    coach_nutrition: {
      model: "gemma4:e2b",
      hint: "Lokales Gemma 4 E2B für personalisierte Wochenernährung",
    },
    meal: {
      model: "gemma4:e2b",
      hint: "Lokale Textanalyse & Zutaten-Erkennung",
    },
    meal_vision: {
      model: "gemma4:e2b",
      hint: "Multimodal: Lokale Foto-Mahlzeitanalyse mit Gemma 4",
    },
    workout_template: {
      model: "gemma4:e2b",
      hint: "Lokale strukturierte Vorlagenerstellung",
    },
  },
  mistral: {
    coach_workout: {
      model: "mistral-medium-latest",
      hint: "Schneller als Large, weiterhin starkes JSON (Woche 1)",
    },
    coach_nutrition: {
      model: "mistral-large-latest",
      hint: "Wochenpläne, Makros, Mahlzeiten-Scheduling",
    },
    meal: {
      model: "mistral-small-latest",
      hint: "Schnell & günstig für Zutaten-Parsing",
    },
    meal_vision: {
      model: "pixtral-large-latest",
      hint: "Bildanalyse (Fotos von Mahlzeiten)",
    },
    workout_template: {
      model: "mistral-large-latest",
      hint: "Strukturierte Workout-Vorlagen (JSON)",
    },
  },
  gemini: {
    coach_workout: {
      model: "gemini-2.5-flash",
      hint: "Fallback Coach-Workout — oft am schnellsten",
    },
    coach_nutrition: {
      model: "gemini-2.5-flash",
      hint: "Fallback für Coach-Ernährung",
    },
    meal: {
      model: "gemini-2.5-flash",
      hint: "Text-Parsing & Recherche",
    },
    meal_vision: {
      model: "gemini-2.5-flash",
      hint: "Multimodal (Bild + Text)",
    },
    workout_template: {
      model: "gemini-2.5-flash",
      hint: "Template-JSON wenn Mistral ausfällt",
    },
  },
};

const DEFAULTS: Record<AiProviderName, Record<AiModelArea, string>> = {
  ollama: {
    coach_workout: "gemma4:e2b",
    coach_nutrition: "gemma4:e2b",
    meal: "gemma4:e2b",
    meal_vision: "gemma4:e2b",
    workout_template: "gemma4:e2b",
  },
  mistral: {
    coach_workout: "mistral-medium-latest",
    coach_nutrition: "mistral-large-latest",
    meal: "mistral-small-latest",
    meal_vision: "pixtral-large-latest",
    workout_template: "mistral-large-latest",
  },
  gemini: {
    coach_workout: "gemini-2.5-flash",
    coach_nutrition: "gemini-2.5-flash",
    meal: "gemini-2.5-flash",
    meal_vision: "gemini-2.5-flash",
    workout_template: "gemini-2.5-flash",
  },
};

const GEMINI_DEPRECATED_MODEL_MAP: Record<string, string> = {
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-001": "gemini-2.5-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite-001": "gemini-2.5-flash-lite",
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-pro",
};

function normalizeModel(provider: AiProviderName, raw: string, area: AiModelArea): string {
  const value = raw.trim();
  if (!value) return value;
  if (provider !== "gemini") return value;
  const mapped = GEMINI_DEPRECATED_MODEL_MAP[value];
  if (mapped) {
    console.warn(`[AI] Migrating deprecated Gemini model ${value} -> ${mapped} for ${area}`);
    return mapped;
  }
  return value;
}

function envKey(provider: AiProviderName, area: AiModelArea): string {
  return `AI_${provider.toUpperCase()}_MODEL_${area.toUpperCase()}`;
}

/** Legacy: AI_*_MODEL_COACH gilt für beide Coach-Bereiche, wenn kein spezifischer Key gesetzt ist. */
function legacyCoachModel(provider: AiProviderName): string | undefined {
  return process.env[`AI_${provider.toUpperCase()}_MODEL_COACH`]?.trim() || undefined;
}

export function getAiModel(provider: AiProviderName, area: AiModelArea): string {
  const fromEnv = process.env[envKey(provider, area)]?.trim();
  if (fromEnv && fromEnv.length > 0) return normalizeModel(provider, fromEnv, area);
  if (area === "coach_workout" || area === "coach_nutrition") {
    const legacy = legacyCoachModel(provider);
    if (legacy && legacy.length > 0) return normalizeModel(provider, legacy, area);
  }
  const fallback = DEFAULTS[provider][area];
  if (!fallback) {
    console.warn(`[AI] No model default for ${provider}/${area}, using coach_workout default`);
    return DEFAULTS[provider].coach_workout;
  }
  return normalizeModel(provider, fallback, area);
}

export function getAllAiModels(): Record<AiProviderName, Record<AiModelArea, string>> {
  return {
    ollama: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("ollama", a)])) as Record<AiModelArea, string>,
    mistral: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("mistral", a)])) as Record<AiModelArea, string>,
    gemini: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("gemini", a)])) as Record<AiModelArea, string>,
  };
}

export function getRecommendedModels(): typeof AI_MODEL_RECOMMENDATIONS {
  return AI_MODEL_RECOMMENDATIONS;
}

export function defaultAiModels(): typeof DEFAULTS {
  return {
    ...DEFAULTS,
    ollama: { ...DEFAULTS.ollama },
    mistral: { ...DEFAULTS.mistral },
    gemini: { ...DEFAULTS.gemini },
  };
}

export function coachAreaForPlanType(planType: string | undefined): "coach_workout" | "coach_nutrition" {
  return planType === "nutrition" ? "coach_nutrition" : "coach_workout";
}
