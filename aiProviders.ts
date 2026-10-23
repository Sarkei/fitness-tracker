/**
 * Server-side AI routing: prefer Mistral when configured, fall back to Gemini.
 */

import { GoogleGenAI } from "@google/genai";
import { getPersistedEnvValue } from "./envBootstrap.ts";
import {
  getAiModel,
  coachAreaForPlanType,
  type AiModelArea,
  type AiProviderName,
} from "./src/lib/aiModelConfig";

export { coachAreaForPlanType };

export type { AiProviderName };

export let activeProviderOverride: AiProviderName | null = null;

function parseProviderToken(raw: string | undefined | null): AiProviderName | null {
  const t = raw?.trim().toLowerCase();
  if (t === "ollama" || t === "gemini" || t === "mistral") return t;
  return null;
}

/** Liest AI_ACTIVE_PROVIDER aus gemergter .env (hat Vorrang) + process.env. */
export function syncActiveProviderFromEnv(): AiProviderName | null {
  const fromFile = parseProviderToken(getPersistedEnvValue("AI_ACTIVE_PROVIDER"));
  const fromProcess = parseProviderToken(process.env.AI_ACTIVE_PROVIDER);
  const chosen = fromFile ?? fromProcess ?? activeProviderOverride;
  activeProviderOverride = chosen;
  if (chosen) process.env.AI_ACTIVE_PROVIDER = chosen;
  return chosen;
}

syncActiveProviderFromEnv();

export function setActiveProviderOverride(provider: AiProviderName | null) {
  activeProviderOverride = provider;
}

export function getActiveProviderOverride(): AiProviderName | null {
  return activeProviderOverride;
}

export function getOllamaBaseUrl(): string {
  const url = process.env.OLLAMA_BASE_URL?.trim() || "http://ollama:11434";
  return url.replace(/\/+$/, "");
}

export function getLocalLlmModel(area?: AiModelArea): string {
  if (area) {
    const areaModel = getAiModel("ollama", area);
    if (areaModel) return areaModel;
  }
  return process.env.LOCAL_LLM_MODEL?.trim() || "gemma4:e2b";
}

export function isOllamaConfigured(): boolean {
  return Boolean(
    process.env.OLLAMA_BASE_URL?.trim() ||
    process.env.LOCAL_LLM_MODEL?.trim() ||
    process.env.AI_ACTIVE_PROVIDER === "ollama"
  );
}

const PLACEHOLDER_SUBSTRINGS = ["your_mistral_api_key_here", "your_gemini_api_key_here"];

export function isConfiguredApiKey(key: string | undefined | null): boolean {
  if (key == null || typeof key !== "string") return false;
  const t = key.trim();
  if (t.length < 16) return false;
  const lower = t.toLowerCase();
  if (PLACEHOLDER_SUBSTRINGS.some((p) => lower.includes(p))) return false;
  if (/^your[_\s]/i.test(t) && /key/i.test(t)) return false;
  return true;
}

export function resolveAiCapabilities(): {
  enabled: boolean;
  provider: AiProviderName | "none";
  ollamaConfigured: boolean;
  mistralConfigured: boolean;
  geminiConfigured: boolean;
} {
  const preferred = syncActiveProviderFromEnv();

  const ollamaConfigured = isOllamaConfigured();
  const mistralConfigured = isConfiguredApiKey(process.env.MISTRAL_API_KEY);
  const geminiConfigured = isConfiguredApiKey(process.env.GEMINI_API_KEY);
  const e2eMock = process.env.COACH_E2E_MOCK === "1";
  const enabled = ollamaConfigured || mistralConfigured || geminiConfigured || e2eMock;

  let provider: AiProviderName | "none" = "none";
  if (preferred === "ollama" && ollamaConfigured) provider = "ollama";
  else if (preferred === "gemini" && geminiConfigured) provider = "gemini";
  else if (preferred === "mistral" && mistralConfigured) provider = "mistral";
  // Fallbacks if preferred is not configured
  else if (ollamaConfigured) provider = "ollama";
  else if (mistralConfigured) provider = "mistral";
  else if (geminiConfigured) provider = "gemini";
  else provider = "none";

  return { enabled, provider, ollamaConfigured, mistralConfigured, geminiConfigured };
}

/** Validate Ollama reachability and check if the target model is downloaded. */
export async function testOllamaConnection(
  baseUrl = getOllamaBaseUrl(),
  model = getLocalLlmModel(),
): Promise<{ ok: true; model: string; modelsAvailable: string[] } | { ok: false; error: string }> {
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, "");
    const resp = await fetch(`${cleanUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) {
      return { ok: false, error: `Ollama HTTP ${resp.status}: ${resp.statusText}` };
    }
    const data = (await resp.json()) as { models?: Array<{ name: string }> };
    const available = (data.models ?? []).map((m) => m.name);
    const targetNormalized = model.includes(":") ? model : `${model}:latest`;
    const hasModel = available.some((m) => {
      const norm = m.includes(":") ? m : `${m}:latest`;
      return norm === targetNormalized || m === model || m.startsWith(`${model}:`);
    });
    if (!hasModel) {
      return {
        ok: false,
        error:
          available.length > 0
            ? `Ollama ist online, aber Modell '${model}' ist noch nicht heruntergeladen. Verfügbar: ${available.join(", ")}`
            : `Ollama ist online, aber es ist noch kein Modell heruntergeladen (Modell '${model}' fehlt noch).`,
      };
    }
    return { ok: true, model, modelsAvailable: available };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Ollama nicht erreichbar unter ${baseUrl}: ${msg}` };
  }
}

/** Trigger Ollama model download via API. */
export async function pullOllamaModel(
  model = getLocalLlmModel(),
  baseUrl = getOllamaBaseUrl(),
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, "");
    const resp = await fetch(`${cleanUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Pull failed: ${txt}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type MistralContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: string };

type MistralMsg = { role: string; content: string | MistralContentPart[] };

async function mistralChat(
  messages: MistralMsg[],
  jsonObject: boolean,
  temperature: number,
  area: AiModelArea,
): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");

  const model = getAiModel("mistral", area);
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
      temperature,
      max_tokens: 8000,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral error ${resp.status}: ${txt}`);
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Mistral empty response (model=${model}, area=${area})`);
  }
  return content;
}

async function mistralVision(
  messages: MistralMsg[],
  temperature: number,
  jsonObject: boolean,
  area: AiModelArea,
): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");

  const model = getAiModel("mistral", area);
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
      temperature,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral vision error ${resp.status}: ${txt}`);
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Mistral vision empty response (model=${model}, area=${area})`);
  }
  return content;
}

async function geminiGenerate(
  prompt: string,
  inlineImage: { mimeType: string; data: string } | undefined,
  generation: { temperature?: number } | undefined,
  area: AiModelArea,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("GEMINI_API_KEY not configured");

  const ai = new GoogleGenAI({ apiKey: key });
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
  if (inlineImage) {
    parts.push({ inlineData: { mimeType: inlineImage.mimeType, data: inlineImage.data } });
  }

  const configured = getAiModel("gemini", area);
  const fallbackOrder = [configured, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]
    .map((m) => m.trim())
    .filter((m, idx, arr) => m.length > 0 && arr.indexOf(m) === idx);

  let lastError: unknown = null;
  for (const model of fallbackOrder) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          temperature: generation?.temperature ?? 0.35,
        },
      });
      const text = response.text?.trim();
      if (!text) {
        throw new Error(`Empty Gemini response (model=${model}, area=${area})`);
      }
      if (model !== configured) {
        console.warn(`[AI] Gemini fallback model active: ${configured} -> ${model} (area=${area})`);
      }
      return text;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const retryWithNext =
        /not found|unsupported|invalid argument|404/i.test(msg) ||
        msg.includes("models/") ||
        msg.includes("generateContent");
      if (!retryWithNext) throw error;
      console.warn(`[AI] Gemini model failed (${model}, area=${area}) -> trying fallback`, error);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`Gemini request failed for all fallback models (area=${area})`);
}

/** Validate a Mistral API key with a minimal completion request. */
export async function testMistralApiKey(apiKey: string): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ungültiges API-Key-Format" };
  const model = "mistral-small-latest";
  try {
    const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Mistral ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Validate a Gemini API key by listing models. */
export async function testGeminiApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ungültiges API-Key-Format" };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Gemini ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function ollamaChat(
  messages: MistralMsg[],
  jsonObject: boolean,
  temperature: number,
  area: AiModelArea,
): Promise<string> {
  const baseUrl = getOllamaBaseUrl();
  const model = getLocalLlmModel(area);

  const ollamaMsgs: Array<{ role: string; content: string; images?: string[] }> = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      ollamaMsgs.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      let textContent = "";
      const images: string[] = [];
      for (const part of m.content) {
        if (part.type === "text") {
          textContent += (textContent ? "\n" : "") + part.text;
        } else if (part.type === "image_url") {
          const match = part.image_url.match(/^data:[^;]+;base64,(.+)$/);
          images.push(match ? match[1] : part.image_url);
        }
      }
      ollamaMsgs.push({
        role: m.role,
        content: textContent,
        ...(images.length > 0 ? { images } : {}),
      });
    }
  }

  if (jsonObject && ollamaMsgs.length > 0) {
    const last = ollamaMsgs[ollamaMsgs.length - 1];
    if (!last.content.includes("JSON")) {
      last.content += "\n\nRespond with ONLY valid JSON (no markdown formatting, no extra explanations).";
    }
  }

  const numCtx = parseInt(process.env.OLLAMA_NUM_CTX || "8192", 10) || 8192;
  const payload: Record<string, unknown> = {
    model,
    messages: ollamaMsgs,
    stream: false,
    options: {
      temperature,
      num_ctx: numCtx,
    },
  };

  if (jsonObject) {
    payload.format = "json";
  }

  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Ollama error ${resp.status} (${model}): ${txt}`);
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Ollama empty response (model=${model}, area=${area})`);
  }
  return content;
}

/** Coach / structured JSON: Ollama (local) -> Mistral -> Gemini. */
export async function completeCoachJson(
  messages: Array<{ role: string; content: string }>,
  area: AiModelArea = "coach_workout",
): Promise<string> {
  return completeCoachJsonForArea(messages, area);
}

export async function completeCoachWorkoutJson(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  return completeCoachJsonForArea(messages, "coach_workout");
}

export async function completeCoachNutritionJson(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  return completeCoachJsonForArea(messages, "coach_nutrition");
}

async function completeCoachJsonForArea(
  messages: Array<{ role: string; content: string }>,
  area: AiModelArea,
): Promise<string> {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no AI provider or API keys configured");

  const providerOrder: AiProviderName[] = [];
  if (caps.provider === "ollama" || caps.provider === "mistral" || caps.provider === "gemini") {
    providerOrder.push(caps.provider);
  }
  if (caps.ollamaConfigured && !providerOrder.includes("ollama")) providerOrder.push("ollama");
  if (caps.mistralConfigured && !providerOrder.includes("mistral")) providerOrder.push("mistral");
  if (caps.geminiConfigured && !providerOrder.includes("gemini")) providerOrder.push("gemini");

  const merged = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n---\n\n");
  const geminiPrompt = `${merged}\n\nRespond with ONLY valid JSON (no markdown fences). Use English weekday names in schedule[].day: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.`;

  let lastError: unknown;
  for (const provider of providerOrder) {
    try {
      if (provider === "ollama") {
        return await ollamaChat(messages as MistralMsg[], true, 0.4, area);
      }
      if (provider === "mistral") {
        return await mistralChat(messages as MistralMsg[], true, 0.45, area);
      }
      return await geminiGenerate(geminiPrompt, undefined, { temperature: 0.4 }, area);
    } catch (e) {
      lastError = e;
      console.warn(
        `[AI] Coach request failed (${provider}, area=${area}, model=${getAiModel(provider, area)}):`,
        e,
      );
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError ?? "Coach AI request failed for all configured providers"));
}

export type MealAnalysisResponseMode = "json_object" | "text";

/** Meal analysis: Ollama (local) -> Mistral (Pixtral if image) -> Gemini; optional low temperature for structured parsing. */
export async function completeMealAnalysis(
  prompt: string,
  image?: { mimeType: string; data: string },
  options?: { temperature?: number; responseMode?: MealAnalysisResponseMode },
): Promise<string> {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no AI provider or API keys configured");

  const temp = options?.temperature ?? 0.35;
  const responseMode = options?.responseMode ?? "text";
  const wantJson = responseMode === "json_object";
  const area: AiModelArea = image ? "meal_vision" : "meal";
  const providerOrder: AiProviderName[] = [];
  if (caps.provider === "ollama" || caps.provider === "mistral" || caps.provider === "gemini") {
    providerOrder.push(caps.provider);
  }
  if (caps.ollamaConfigured && !providerOrder.includes("ollama")) providerOrder.push("ollama");
  if (caps.mistralConfigured && !providerOrder.includes("mistral")) providerOrder.push("mistral");
  if (caps.geminiConfigured && !providerOrder.includes("gemini")) providerOrder.push("gemini");

  const geminiPrompt = wantJson ? `${prompt}\n\nRespond with ONLY valid JSON (no markdown fences).` : prompt;
  let lastError: unknown = null;
  for (const provider of providerOrder) {
    try {
      if (provider === "ollama") {
        if (image) {
          const dataUrl = `data:${image.mimeType};base64,${image.data}`;
          const messages: MistralMsg[] = [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: dataUrl },
              ],
            },
          ];
          return await ollamaChat(messages, wantJson, Math.min(0.55, temp + 0.15), area);
        }
        return await ollamaChat([{ role: "user", content: prompt }], wantJson, temp, area);
      }
      if (provider === "mistral") {
        if (image) {
          const dataUrl = `data:${image.mimeType};base64,${image.data}`;
          const messages: MistralMsg[] = [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: dataUrl },
              ],
            },
          ];
          return await mistralVision(messages, Math.min(0.55, temp + 0.15), wantJson, area);
        }
        return await mistralChat([{ role: "user", content: prompt }], wantJson, temp, area);
      }
      return await geminiGenerate(geminiPrompt, image, { temperature: temp }, area);
    } catch (e) {
      lastError = e;
      console.warn(`[AI] Meal analysis failed (${provider}, area=${area}, model=${getAiModel(provider, area)}):`, e);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Meal analysis failed for all configured providers");
}

export async function completeWorkoutTemplateJson(prompt: string): Promise<string> {
  return completeCoachJsonForArea([{ role: "user", content: prompt }], "workout_template");
}
