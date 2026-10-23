// envBootstrap.ts
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var projectRoot = path.dirname(fileURLToPath(import.meta.url));
function candidateEnvPaths() {
  const cwd = process.cwd();
  return [
    path.join(projectRoot, ".env"),
    path.join(cwd, ".env"),
    path.join(projectRoot, "data", ".env"),
    path.join(cwd, "data", ".env"),
    path.join(projectRoot, "..", ".env"),
    path.join(cwd, "..", ".env")
  ].filter((p, i, arr) => arr.indexOf(p) === i);
}
function isEnvFile(envPath) {
  try {
    return fs.existsSync(envPath) && fs.statSync(envPath).isFile();
  } catch {
    return false;
  }
}
function isEnvDirectory(envPath) {
  try {
    return fs.existsSync(envPath) && fs.statSync(envPath).isDirectory();
  } catch {
    return false;
  }
}
function listReadableEnvFiles() {
  return candidateEnvPaths().filter(isEnvFile);
}
function resolveWritableEnvFilePath() {
  for (const envPath of candidateEnvPaths()) {
    if (isEnvFile(envPath)) return envPath;
    if (!fs.existsSync(envPath)) return envPath;
    if (isEnvDirectory(envPath)) continue;
  }
  const fallback = path.join(projectRoot, "data", ".env");
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}
var ENV_FILE_PATH = resolveWritableEnvFilePath();
function getEnvFileDiagnostic() {
  const mountPath = path.join(projectRoot, ".env");
  const envPathIsDirectory = candidateEnvPaths().some(isEnvDirectory);
  const readablePaths = listReadableEnvFiles();
  let problem = null;
  if (isEnvDirectory(mountPath)) {
    problem = `${mountPath} ist ein Ordner statt einer Datei. Docker legt das an, wenn auf dem Host keine .env-Datei existiert. Auf dem NAS im Projektordner: rm -rf .env && cp .env.example .env \u2014 Keys eintragen \u2014 docker compose up -d.`;
  } else if (!readablePaths.length && !process.env.EXERCISEDB_RAPIDAPI_KEY?.trim()) {
    problem = "Keine lesbare .env-Datei gefunden. Keys in docker-compose.yaml (env_file) oder als echte Datei .env auf dem Host anlegen.";
  }
  return { writePath: ENV_FILE_PATH, readablePaths, envPathIsDirectory, problem };
}
function applyEnvFileToProcess(envPath) {
  if (!isEnvFile(envPath)) return 0;
  let parsed;
  try {
    parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  } catch {
    return 0;
  }
  let n = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (value == null) continue;
    const v = String(value).trim();
    if (!v) continue;
    const cur = process.env[key];
    if (cur === void 0 || cur.trim() === "") {
      process.env[key] = v;
      n += 1;
    }
  }
  return n;
}
function bootstrapAllEnvFiles() {
  let total = 0;
  for (const envPath of listReadableEnvFiles()) {
    total += applyEnvFileToProcess(envPath);
  }
  return total;
}
var diag = getEnvFileDiagnostic();
if (diag.envPathIsDirectory && process.env.NODE_ENV !== "test") {
  console.error(`[env] ${diag.problem}`);
}
var applied = bootstrapAllEnvFiles();
if (applied > 0 && process.env.NODE_ENV !== "test") {
  const edb = process.env.EXERCISEDB_RAPIDAPI_KEY?.trim();
  console.info(
    `[env] ${applied} Wert(e) aus ${diag.readablePaths.join(", ") || "\u2014"} geladen` + (edb ? ` \xB7 EXERCISEDB_RAPIDAPI_KEY: ${edb.length} Zeichen` : " \xB7 EXERCISEDB_RAPIDAPI_KEY: fehlt in Datei")
  );
}

// server.ts
import express from "express";

// aiProviders.ts
import { GoogleGenAI } from "@google/genai";

// src/lib/aiModelConfig.ts
var AI_MODEL_AREAS = [
  "coach_workout",
  "coach_nutrition",
  "meal",
  "meal_vision",
  "workout_template"
];
var AI_MODEL_AREA_LABELS = {
  coach_workout: "Coach \u2013 Workout",
  coach_nutrition: "Coach \u2013 Ern\xE4hrung",
  meal: "Ern\xE4hrung \u2013 Textanalyse",
  meal_vision: "Ern\xE4hrung \u2013 Bildanalyse",
  workout_template: "Workout-Vorlagen"
};
var MISTRAL_TEXT_MODELS = [
  { id: "mistral-large-latest", label: "Mistral Large (beste Qualit\xE4t, JSON)" },
  { id: "mistral-medium-latest", label: "Mistral Medium" },
  { id: "mistral-small-latest", label: "Mistral Small (schnell & g\xFCnstig)" }
];
var MISTRAL_VISION_MODELS = [
  { id: "pixtral-large-latest", label: "Pixtral Large (Bilder, empfohlen)" },
  { id: "pixtral-12b-2409", label: "Pixtral 12B" }
];
var GEMINI_MODELS = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (empfohlen)" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (schneller)" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (h\xF6here Qualit\xE4t)" }
];
var AI_MODEL_SELECT_OPTIONS = {
  mistral: {
    coach_workout: MISTRAL_TEXT_MODELS,
    coach_nutrition: MISTRAL_TEXT_MODELS,
    meal: MISTRAL_TEXT_MODELS,
    meal_vision: MISTRAL_VISION_MODELS,
    workout_template: MISTRAL_TEXT_MODELS
  },
  gemini: {
    coach_workout: GEMINI_MODELS,
    coach_nutrition: GEMINI_MODELS,
    meal: GEMINI_MODELS,
    meal_vision: GEMINI_MODELS,
    workout_template: GEMINI_MODELS
  }
};
function getModelSelectOptions(provider, area, currentValue) {
  const base = AI_MODEL_SELECT_OPTIONS[provider][area] ?? [];
  const cur = currentValue?.trim();
  if (cur && !base.some((o) => o.id === cur)) {
    return [{ id: cur, label: `${cur} (aktuell gespeichert)` }, ...base];
  }
  return base;
}
var AI_MODEL_RECOMMENDATIONS = {
  mistral: {
    coach_workout: {
      model: "mistral-large-latest",
      hint: "Komplexes JSON, Trainingsstruktur & \xDCbungslogik"
    },
    coach_nutrition: {
      model: "mistral-large-latest",
      hint: "Wochenpl\xE4ne, Makros, Mahlzeiten-Scheduling"
    },
    meal: {
      model: "mistral-small-latest",
      hint: "Schnell & g\xFCnstig f\xFCr Zutaten-Parsing"
    },
    meal_vision: {
      model: "pixtral-large-latest",
      hint: "Bildanalyse (Fotos von Mahlzeiten)"
    },
    workout_template: {
      model: "mistral-large-latest",
      hint: "Strukturierte Workout-Vorlagen (JSON)"
    }
  },
  gemini: {
    coach_workout: {
      model: "gemini-2.0-flash",
      hint: "Fallback f\xFCr Coach-Workout; gutes Preis/Leistung"
    },
    coach_nutrition: {
      model: "gemini-2.0-flash",
      hint: "Fallback f\xFCr Coach-Ern\xE4hrung"
    },
    meal: {
      model: "gemini-2.0-flash",
      hint: "Text-Parsing & Recherche"
    },
    meal_vision: {
      model: "gemini-2.0-flash",
      hint: "Multimodal (Bild + Text)"
    },
    workout_template: {
      model: "gemini-2.0-flash",
      hint: "Template-JSON wenn Mistral ausf\xE4llt"
    }
  }
};
var DEFAULTS = {
  mistral: {
    coach_workout: "mistral-large-latest",
    coach_nutrition: "mistral-large-latest",
    meal: "mistral-small-latest",
    meal_vision: "pixtral-large-latest",
    workout_template: "mistral-large-latest"
  },
  gemini: {
    coach_workout: "gemini-2.0-flash",
    coach_nutrition: "gemini-2.0-flash",
    meal: "gemini-2.0-flash",
    meal_vision: "gemini-2.0-flash",
    workout_template: "gemini-2.0-flash"
  }
};
function envKey(provider, area) {
  return `AI_${provider.toUpperCase()}_MODEL_${area.toUpperCase()}`;
}
function legacyCoachModel(provider) {
  return process.env[`AI_${provider.toUpperCase()}_MODEL_COACH`]?.trim() || void 0;
}
function getAiModel(provider, area) {
  const fromEnv = process.env[envKey(provider, area)]?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (area === "coach_workout" || area === "coach_nutrition") {
    const legacy = legacyCoachModel(provider);
    if (legacy && legacy.length > 0) return legacy;
  }
  const fallback = DEFAULTS[provider][area];
  if (!fallback) {
    console.warn(`[AI] No model default for ${provider}/${area}, using coach_workout default`);
    return DEFAULTS[provider].coach_workout;
  }
  return fallback;
}
function getAllAiModels() {
  return {
    mistral: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("mistral", a)])),
    gemini: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("gemini", a)]))
  };
}
function coachAreaForPlanType(planType) {
  return planType === "nutrition" ? "coach_nutrition" : "coach_workout";
}

// aiProviders.ts
var activeProviderOverride = null;
function readPersistedProviderFromEnv() {
  const raw = process.env.AI_ACTIVE_PROVIDER?.trim().toLowerCase();
  if (raw === "gemini" || raw === "mistral") return raw;
  return null;
}
var persisted = readPersistedProviderFromEnv();
if (persisted) activeProviderOverride = persisted;
function setActiveProviderOverride(provider) {
  activeProviderOverride = provider;
}
function getActiveProviderOverride() {
  return activeProviderOverride;
}
var PLACEHOLDER_SUBSTRINGS = ["your_mistral_api_key_here", "your_gemini_api_key_here"];
function isConfiguredApiKey(key) {
  if (key == null || typeof key !== "string") return false;
  const t = key.trim();
  if (t.length < 16) return false;
  const lower = t.toLowerCase();
  if (PLACEHOLDER_SUBSTRINGS.some((p) => lower.includes(p))) return false;
  if (/^your[_\s]/i.test(t) && /key/i.test(t)) return false;
  return true;
}
function resolveAiCapabilities() {
  const mistralConfigured = isConfiguredApiKey(process.env.MISTRAL_API_KEY);
  const geminiConfigured = isConfiguredApiKey(process.env.GEMINI_API_KEY);
  const enabled = mistralConfigured || geminiConfigured;
  let provider = "none";
  if (activeProviderOverride === "gemini" && geminiConfigured) provider = "gemini";
  else if (activeProviderOverride === "mistral" && mistralConfigured) provider = "mistral";
  else provider = mistralConfigured ? "mistral" : geminiConfigured ? "gemini" : "none";
  return { enabled, provider, mistralConfigured, geminiConfigured };
}
async function mistralChat(messages, jsonObject, temperature, area) {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");
  const model = getAiModel("mistral", area);
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...jsonObject ? { response_format: { type: "json_object" } } : {},
      temperature,
      max_tokens: 8e3
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Mistral empty response (model=${model}, area=${area})`);
  }
  return content;
}
async function mistralVision(messages, temperature, jsonObject, area) {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");
  const model = getAiModel("mistral", area);
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...jsonObject ? { response_format: { type: "json_object" } } : {},
      temperature,
      max_tokens: 4096
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral vision error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Mistral vision empty response (model=${model}, area=${area})`);
  }
  return content;
}
async function geminiGenerate(prompt, inlineImage, generation, area) {
  const key = process.env.GEMINI_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("GEMINI_API_KEY not configured");
  const ai = new GoogleGenAI({ apiKey: key });
  const parts = [{ text: prompt }];
  if (inlineImage) {
    parts.push({ inlineData: { mimeType: inlineImage.mimeType, data: inlineImage.data } });
  }
  const model = getAiModel("gemini", area);
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      temperature: generation?.temperature ?? 0.35
    }
  });
  const text = response.text?.trim();
  if (!text) {
    throw new Error(`Empty Gemini response (model=${model}, area=${area})`);
  }
  return text;
}
async function testMistralApiKey(apiKey) {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ung\xFCltiges API-Key-Format" };
  const model = "mistral-small-latest";
  try {
    const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 8,
        temperature: 0
      })
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
async function testGeminiApiKey(apiKey) {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ung\xFCltiges API-Key-Format" };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
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
async function completeCoachJson(messages, area = "coach_workout") {
  return completeCoachJsonForArea(messages, area);
}
async function completeCoachJsonForArea(messages, area) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no valid API keys configured");
  const providerOrder = [];
  if (caps.provider === "mistral" || caps.provider === "gemini") {
    providerOrder.push(caps.provider);
  }
  if (caps.mistralConfigured && !providerOrder.includes("mistral")) providerOrder.push("mistral");
  if (caps.geminiConfigured && !providerOrder.includes("gemini")) providerOrder.push("gemini");
  const merged = messages.map((m) => `${m.role.toUpperCase()}:
${m.content}`).join("\n\n---\n\n");
  const geminiPrompt = `${merged}

Respond with ONLY valid JSON (no markdown fences). Use English weekday names in schedule[].day: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.`;
  let lastError;
  for (const provider of providerOrder) {
    try {
      if (provider === "mistral") {
        return await mistralChat(messages, true, 0.45, area);
      }
      return await geminiGenerate(geminiPrompt, void 0, { temperature: 0.4 }, area);
    } catch (e) {
      lastError = e;
      console.warn(
        `[AI] Coach request failed (${provider}, area=${area}, model=${getAiModel(provider, area)}):`,
        e
      );
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError ?? "Coach AI request failed for all configured providers"));
}
async function completeMealAnalysis(prompt, image, options) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no valid API keys configured");
  const temp = options?.temperature ?? 0.35;
  const responseMode = options?.responseMode ?? "text";
  const wantJson = responseMode === "json_object";
  const area = image ? "meal_vision" : "meal";
  if (caps.provider === "mistral") {
    try {
      if (image) {
        const dataUrl = `data:${image.mimeType};base64,${image.data}`;
        const messages = [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: dataUrl }
            ]
          }
        ];
        return await mistralVision(messages, Math.min(0.55, temp + 0.15), wantJson, area);
      }
      return await mistralChat([{ role: "user", content: prompt }], wantJson, temp, area);
    } catch (e) {
      console.warn("[AI] Mistral meal analysis failed, trying Gemini:", e);
      if (!caps.geminiConfigured) throw e;
    }
  }
  const geminiPrompt = wantJson ? `${prompt}

Respond with ONLY valid JSON (no markdown fences).` : prompt;
  return geminiGenerate(geminiPrompt, image, { temperature: temp }, area);
}
async function completeWorkoutTemplateJson(prompt) {
  return completeCoachJsonForArea([{ role: "user", content: prompt }], "workout_template");
}

// src/lib/envFileManager.ts
import dotenv2 from "dotenv";
import fs2 from "fs";
import path2 from "path";
function isEnvFile2(p) {
  try {
    return fs2.existsSync(p) && fs2.statSync(p).isFile();
  } catch {
    return false;
  }
}
function assertNotDirectory(targetPath) {
  if (!fs2.existsSync(targetPath)) return;
  if (fs2.statSync(targetPath).isDirectory()) {
    throw new Error(
      getEnvFileDiagnostic().problem ?? `${targetPath} ist ein Ordner \u2014 auf dem NAS: rm -rf .env && cp .env.example .env`
    );
  }
}
function getEnvFilePath() {
  return ENV_FILE_PATH;
}
function getEnvFileProblem() {
  return getEnvFileDiagnostic().problem;
}
function parsedEnvFile() {
  const merged = {};
  for (const envPath of listReadableEnvFiles()) {
    try {
      Object.assign(merged, dotenv2.parse(fs2.readFileSync(envPath, "utf8")));
    } catch {
    }
  }
  return merged;
}
function reloadEnvFromFile() {
  let applied2 = 0;
  for (const envPath of listReadableEnvFiles()) {
    applied2 += applyEnvFileToProcess(envPath);
  }
  return { path: ENV_FILE_PATH, applied: applied2 };
}
function envVarStatusInFile(key) {
  const val = parsedEnvFile()[key];
  if (val === void 0) return "missing";
  if (!String(val).trim()) return "empty";
  return "set";
}
function envVarLengthInFile(key) {
  const val = parsedEnvFile()[key];
  if (val === void 0 || !String(val).trim()) return null;
  return String(val).trim().length;
}
function upsertEnvVar(key, value) {
  const diag2 = getEnvFileDiagnostic();
  const writePath = ENV_FILE_PATH;
  if (diag2.envPathIsDirectory) {
    fs2.mkdirSync(path2.dirname(writePath), { recursive: true });
  } else {
    assertNotDirectory(writePath);
  }
  const line = `${key}=${escapeEnvValue(value)}`;
  let content = "";
  const readable = listReadableEnvFiles();
  if (readable.length) {
    content = fs2.readFileSync(readable[0], "utf8");
  } else if (isEnvFile2(writePath)) {
    content = fs2.readFileSync(writePath, "utf8");
  }
  const examplePath = path2.join(path2.dirname(writePath), ".env.example");
  if (!content.trim() && isEnvFile2(examplePath)) {
    content = fs2.readFileSync(examplePath, "utf8");
  }
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = content.trimEnd() + (content.endsWith("\n") || !content ? "" : "\n") + line + "\n";
  }
  fs2.mkdirSync(path2.dirname(writePath), { recursive: true });
  fs2.writeFileSync(writePath, content, "utf8");
  process.env[key] = value;
  if (diag2.envPathIsDirectory && process.env.NODE_ENV !== "test") {
    console.warn(
      `[env] ${key} nach ${writePath} geschrieben \u2014 Host-Mount .env ist ein Ordner. Bitte echte .env-Datei auf dem NAS anlegen und Container neu starten.`
    );
  }
}
function escapeEnvValue(value) {
  if (/[\s#"']/.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return value;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/lib/coachWeekWindow.ts
function toLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocalYmd(ymd) {
  const base = (ymd || "").split("T")[0];
  const [y, m, d] = base.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return new Date(y, m - 1, d);
}
function coachWeekInclusiveEnd(startYmd) {
  const start = parseLocalYmd(startYmd);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return toLocalYmd(end);
}
function addDaysYmd(startYmd, days) {
  const d = parseLocalYmd(startYmd);
  d.setDate(d.getDate() + days);
  return toLocalYmd(d);
}

// src/lib/exerciseDb.ts
var EXERCISEDB_KEY_PREFIX = "edb_";
var EXERCISEDB_MEDIA_BASE = "https://static.exercisedb.dev/media/";
var ExerciseDbFetchError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ExerciseDbFetchError";
  }
};
var EXERCISEDB_ASCEND_V2_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";
var EXERCISEDB_LEGACY_HOST = "exercisedb.p.rapidapi.com";
var ENV_KEY_CANDIDATES = [
  "EXERCISEDB_RAPIDAPI_KEY",
  "EXERCISEDB_API_KEY",
  "EXERCISE_DB_RAPIDAPI_KEY",
  "RAPIDAPI_KEY",
  "RAPIDAPI_EXERCISEDB_KEY",
  "VITE_EXERCISEDB_RAPIDAPI_KEY"
];
function sanitizeEnvSecret(raw) {
  if (raw == null) return "";
  let k = String(raw).trim();
  if (k.charCodeAt(0) === 65279) k = k.slice(1).trim();
  if (k.startsWith('"') && k.endsWith('"') || k.startsWith("'") && k.endsWith("'")) {
    k = k.slice(1, -1).trim();
  }
  return k;
}
function isPlaceholderKey(value) {
  const v = value.trim().toLowerCase();
  if (v.length < 10) return true;
  const exact = /* @__PURE__ */ new Set([
    "none",
    "null",
    "undefined",
    "changeme",
    "replace_me",
    "api_key_here",
    "your_exercisedb_rapidapi_key",
    "your_rapidapi_key_here",
    "<apikey>",
    "xxx"
  ]);
  if (exact.has(v)) return true;
  if (/^your[_-]/.test(v) && v.length < 36) return true;
  if ((v.endsWith("_here") || v.includes("api_key_here")) && v.length < 36) return true;
  return false;
}
function normalizeApiKey(raw) {
  const k = sanitizeEnvSecret(raw);
  if (!k || isPlaceholderKey(k)) return void 0;
  return k;
}
function resolveExerciseDbKeyFromEnv() {
  for (const name of ENV_KEY_CANDIDATES) {
    const k = normalizeApiKey(process.env[name]);
    if (k) return { key: k, source: name };
  }
  return { key: void 0, source: null };
}
function exerciseDbApiKey() {
  return resolveExerciseDbKeyFromEnv().key;
}
function exerciseDbKeySource() {
  return resolveExerciseDbKeyFromEnv().source;
}
function isExerciseDbConfigured() {
  return Boolean(exerciseDbApiKey());
}
function exerciseDbHost() {
  return process.env.EXERCISEDB_RAPIDAPI_HOST?.trim() || EXERCISEDB_ASCEND_V2_HOST;
}
function isLegacyExerciseDbHost(host = exerciseDbHost()) {
  const h = host.trim().toLowerCase();
  return h === EXERCISEDB_LEGACY_HOST || h === "exercisedb.p.rapidapi.com";
}
function isAscendExerciseDbHost(host = exerciseDbHost()) {
  const h = host.trim().toLowerCase();
  if (isLegacyExerciseDbHost(h)) return false;
  return h.includes("ascendapi") || h.startsWith("edb-with-");
}
function legacyBodyPartToAscendLabel(bodyPart) {
  const key = bodyPart.trim().toLowerCase();
  const map = {
    chest: "Chest",
    back: "Back",
    shoulders: "Shoulders",
    "upper arms": "Upper Arms",
    "lower arms": "Lower Arms",
    "upper legs": "Upper Legs",
    "lower legs": "Lower Legs",
    legs: "Legs",
    waist: "Waist",
    cardio: "Cardio",
    "full body": "Full Body",
    neck: "Neck"
  };
  if (map[key]) return map[key];
  return bodyPart.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function normalizeExerciseDbRaw(raw) {
  const bodyPart = raw.bodyPart || (Array.isArray(raw.bodyParts) && raw.bodyParts[0] ? raw.bodyParts[0] : void 0);
  const target = raw.target || (Array.isArray(raw.targetMuscles) && raw.targetMuscles[0] ? raw.targetMuscles[0] : void 0);
  const equipment = raw.equipment || (Array.isArray(raw.equipments) && raw.equipments.length ? raw.equipments.join(", ") : void 0);
  const exerciseType = raw.exerciseType || (Array.isArray(raw.exerciseTypes) && raw.exerciseTypes[0] ? raw.exerciseTypes[0] : void 0);
  return {
    ...raw,
    id: raw.exerciseId || raw.id,
    bodyPart,
    target,
    equipment,
    exerciseType,
    category: raw.category || exerciseType,
    secondaryMuscles: raw.secondaryMuscles
  };
}
function exerciseDbTestUrl(host) {
  if (isLegacyExerciseDbHost(host)) {
    return `https://${host}/exercises/bodyPart/chest`;
  }
  return `https://${host}/api/v1/exercises/search?search=bench&limit=1`;
}
function authRejectedMessage(host) {
  if (isLegacyExerciseDbHost(host)) {
    return `Key von RapidAPI abgelehnt (401/403). Dein Abo ist vermutlich AscendAPI \u2014 setze in .env: EXERCISEDB_RAPIDAPI_HOST=${EXERCISEDB_ASCEND_V2_HOST}`;
  }
  return "Key von RapidAPI abgelehnt (401/403). Pr\xFCfe im RapidAPI-Playground den exakten Wert von X-RapidAPI-Host und ob du dieses API-Produkt abonniert hast (AscendAPI ExerciseDB V2).";
}
async function testExerciseDbApiKey(apiKey) {
  const k = normalizeApiKey(apiKey);
  if (!k) return { ok: false, error: "Ung\xFCltiger oder leerer Key" };
  const host = exerciseDbHost();
  try {
    const r = await fetch(exerciseDbTestUrl(host), {
      headers: {
        "X-RapidAPI-Key": k,
        "X-RapidAPI-Host": host,
        Accept: "application/json"
      }
    });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: authRejectedMessage(host) };
    }
    const text = await r.text();
    return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
function toExerciseDbKey(id) {
  const raw = id.replace(/^edb_/, "").trim();
  return `${EXERCISEDB_KEY_PREFIX}${raw}`;
}
function isExerciseDbCatalogKey(key) {
  return key.startsWith(EXERCISEDB_KEY_PREFIX);
}
function resolveMediaUrl(path5) {
  if (!path5 || !String(path5).trim()) return void 0;
  const p = String(path5).trim();
  if (p === "null" || p === "undefined") return void 0;
  if (/^https?:\/\//i.test(p)) return p;
  const clean = p.replace(/^\//, "");
  return `${EXERCISEDB_MEDIA_BASE}${clean}`;
}
function pickBestResolutionUrl(urls, order = ["720p", "1080p", "480p", "360p"]) {
  if (!urls || typeof urls !== "object") return void 0;
  for (const key of order) {
    const hit = resolveMediaUrl(urls[key]);
    if (hit) return hit;
  }
  for (const v of Object.values(urls)) {
    const hit = resolveMediaUrl(v);
    if (hit) return hit;
  }
  return void 0;
}
var BODY_PART_TO_TAGS = {
  chest: ["brust"],
  back: ["r\xFCcken"],
  shoulders: ["schulter"],
  "upper arms": ["arme"],
  "lower arms": ["arme"],
  "upper legs": ["beine"],
  "lower legs": ["beine"],
  legs: ["beine"],
  waist: ["core"],
  cardio: ["cardio_art"],
  "full body": ["ganzk\xF6rper"]
};
function categoryFromRaw(raw) {
  const cat = `${raw.category || ""} ${raw.exerciseType || ""}`.toLowerCase();
  if (cat.includes("cardio") || cat.includes("plyometric") && raw.bodyPart?.toLowerCase() === "cardio") {
    return "cardio";
  }
  if (/\b(run|bike|swim|row|cardio|endurance|aerobic)\b/i.test(`${raw.name} ${raw.target}`)) {
    return "cardio";
  }
  return "strength";
}
function tagsFromRaw(raw) {
  const tags = /* @__PURE__ */ new Set();
  const partNames = [];
  if (Array.isArray(raw.bodyParts)) {
    for (const p of raw.bodyParts) {
      const s = String(p || "").toLowerCase().trim();
      if (s) partNames.push(s);
    }
  }
  const bpSingle = (raw.bodyPart || "").toLowerCase().trim();
  if (bpSingle) partNames.push(bpSingle);
  for (const bp of partNames) {
    for (const t of BODY_PART_TO_TAGS[bp] || []) tags.add(t);
  }
  const target = (raw.target || "").toLowerCase();
  if (/quad|glute|hamstring|calve|leg|hip/.test(target)) tags.add("beine");
  if (/pectoral|chest/.test(target)) tags.add("brust");
  if (/lat|trap|back|rhomb/.test(target)) tags.add("r\xFCcken");
  if (/delt|shoulder/.test(target)) tags.add("schulter");
  if (/bicep|tricep|forearm|arm/.test(target)) tags.add("arme");
  if (/ab|oblique|core|waist/.test(target)) tags.add("core");
  if (categoryFromRaw(raw) === "cardio") tags.add("cardio_art");
  return [...tags];
}
function mapExerciseDbToCatalog(raw) {
  const norm2 = normalizeExerciseDbRaw(raw);
  const id = String(norm2.exerciseId || norm2.id || "").trim();
  const name = String(norm2.name || "").trim();
  if (!id || !name) return null;
  const imageUrl = resolveMediaUrl(norm2.imageUrl) || pickBestResolutionUrl(norm2.imageUrls);
  const videoUrl = resolveMediaUrl(norm2.videoUrl) || pickBestResolutionUrl(norm2.videoUrls);
  const gifUrl = resolveMediaUrl(norm2.gifUrl) || imageUrl;
  return {
    key: toExerciseDbKey(id),
    exerciseId: id,
    name,
    category: categoryFromRaw(norm2),
    tags: tagsFromRaw(norm2),
    gifUrl,
    imageUrl,
    videoUrl,
    bodyPart: norm2.bodyPart,
    targetMuscle: norm2.target,
    equipment: norm2.equipment,
    secondaryMuscles: norm2.secondaryMuscles,
    instructions: norm2.instructions,
    overview: norm2.overview || norm2.description,
    exerciseTips: norm2.exerciseTips,
    variations: norm2.variations,
    difficulty: norm2.difficulty,
    source: "exercisedb"
  };
}
function muscleFilterToBodyParts(muscle) {
  switch (muscle) {
    case "brust":
      return ["chest"];
    case "r\xFCcken":
      return ["back"];
    case "schulter":
      return ["shoulders"];
    case "beine":
      return ["upper legs", "lower legs"];
    case "arme":
      return ["upper arms", "lower arms"];
    case "core":
      return ["waist"];
    case "ganzk\xF6rper":
      return ["full body"];
    case "cardio_art":
      return ["cardio"];
    default:
      return [];
  }
}

// src/lib/exerciseDbAscendFetch.ts
var TTL_MS = 1e3 * 60 * 60 * 12;
var cache = /* @__PURE__ */ new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}
function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
}
function headers() {
  const key = exerciseDbApiKey();
  if (!key) throw new ExerciseDbFetchError("ExerciseDB API key missing", "not_configured");
  const host = exerciseDbHost();
  return {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
    Accept: "application/json"
  };
}
function unwrapData(body) {
  if (body && typeof body === "object" && "data" in body) {
    const env = body;
    if (env.success === false) {
      throw new ExerciseDbFetchError("ExerciseDB API returned success=false", "unavailable");
    }
    return env.data;
  }
  return body;
}
async function parseAscendJson(r) {
  const text = await r.text();
  if (r.status === 429) {
    throw new ExerciseDbFetchError("ExerciseDB rate limit", "rate_limited");
  }
  if (!r.ok) {
    throw new ExerciseDbFetchError(`ExerciseDB HTTP ${r.status}: ${text.slice(0, 200)}`, "unavailable");
  }
  try {
    const parsed = JSON.parse(text);
    return unwrapData(parsed);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError("Invalid JSON from ExerciseDB", "unavailable");
  }
}
async function fetchAscend(pathWithQuery) {
  const host = exerciseDbHost();
  const url = `https://${host}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  const cached = cacheGet(url);
  if (cached) return cached;
  const r = await fetch(url, { headers: headers() });
  const data = await parseAscendJson(r);
  cacheSet(url, data);
  return data;
}
function mapList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of raw) {
    const ex = mapExerciseDbToCatalog(row);
    if (!ex || seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
  }
  return out;
}
function queryString(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === void 0 || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
async function ascendFetchExerciseById(id) {
  const clean = id.replace(/^edb_/, "").trim();
  if (!clean) return null;
  const raw = await fetchAscend(
    `/api/v1/exercises/${encodeURIComponent(clean)}`
  );
  return mapExerciseDbToCatalog(raw);
}
async function ascendSearchByName(query, limit = 25) {
  const q = query.trim();
  if (q.length < 2) return [];
  const raw = await fetchAscend(
    `/api/v1/exercises/search${queryString({ search: q, limit: Math.min(25, limit) })}`
  );
  return mapList(raw).slice(0, limit);
}
var cachedBodyPartNames = null;
async function resolveAscendBodyPartLabel(bodyPartSlug) {
  const slug = bodyPartSlug.trim().toLowerCase();
  const fallback = legacyBodyPartToAscendLabel(bodyPartSlug);
  try {
    if (!cachedBodyPartNames) {
      const lists = await ascendFetchFilterLists();
      cachedBodyPartNames = lists.bodyParts ?? [];
    }
    const fold = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const want = fold(slug);
    const hit = cachedBodyPartNames.find((n) => fold(n) === want || fold(n).includes(want) || want.includes(fold(n)));
    if (hit) return hit;
  } catch {
  }
  return fallback;
}
async function ascendFetchByBodyPart(bodyPart, limit = 30) {
  const label = await resolveAscendBodyPartLabel(bodyPart);
  const lim = Math.min(50, Math.max(1, limit));
  const attempts = [
    queryString({ bodyParts: label, limit: lim }),
    queryString({ bodyPart: label, limit: lim })
  ];
  for (const qs of attempts) {
    try {
      const raw = await fetchAscend(`/api/v1/exercises${qs}`);
      const list = mapList(raw);
      if (list.length > 0) return list.slice(0, limit);
    } catch {
    }
  }
  try {
    const raw = await fetchAscend(
      `/api/v1/exercises/search${queryString({ search: bodyPart.replace(/\s+/g, " "), limit: lim })}`
    );
    return mapList(raw).slice(0, limit);
  } catch {
    return [];
  }
}
async function ascendFetchBrowse(limit = 25) {
  const raw = await fetchAscend(
    `/api/v1/exercises${queryString({ limit: Math.min(25, limit) })}`
  );
  return mapList(raw);
}
async function ascendFetchByTarget(target, limit = 30) {
  const t = target.trim();
  if (!t) return [];
  const raw = await fetchAscend(
    `/api/v1/exercises${queryString({
      targetMuscles: t,
      limit: Math.min(25, limit)
    })}`
  );
  return mapList(raw).slice(0, limit);
}
async function ascendFetchFilterLists() {
  const [bodyPartsRaw, musclesRaw, equipmentsRaw] = await Promise.all([
    fetchAscend("/api/v1/bodyparts"),
    fetchAscend("/api/v1/muscles"),
    fetchAscend("/api/v1/equipments")
  ]);
  return {
    bodyParts: (bodyPartsRaw || []).map((x) => x.name).filter(Boolean),
    targets: (musclesRaw || []).map((x) => x.name).filter(Boolean),
    equipments: (equipmentsRaw || []).map((x) => x.name).filter(Boolean)
  };
}

// src/lib/exerciseSimilar.ts
function norm(s) {
  return (s || "").trim().toLowerCase();
}
function tokenOverlap(a, b) {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n += 1;
  return n;
}
function rankSimilarExercises(source, candidates, limit = 12) {
  const srcTarget = norm(source.targetMuscle);
  const srcBody = norm(source.bodyPart);
  const srcEquip = norm(source.equipment);
  const srcCat = source.category;
  const srcName = source.name;
  const scored = candidates.filter((c) => c.key !== source.key).map((c) => {
    let score = 0;
    const t = norm(c.targetMuscle);
    const bp = norm(c.bodyPart);
    const eq = norm(c.equipment);
    if (srcTarget && t === srcTarget) score += 40;
    else if (srcTarget && t && (t.includes(srcTarget) || srcTarget.includes(t))) score += 22;
    if (srcBody && bp === srcBody) score += 25;
    if (srcEquip && eq === srcEquip) score += 18;
    else if (srcEquip && eq && (eq.includes("body weight") || srcEquip.includes("body weight"))) score += 8;
    if (c.category === srcCat) score += 12;
    const tagOverlap = (source.tags || []).filter((tag) => c.tags?.includes(tag)).length;
    score += tagOverlap * 6;
    score += tokenOverlap(srcName, c.name) * 4;
    for (const v of source.variations || []) {
      if (tokenOverlap(v, c.name) >= 2) score += 10;
    }
    return { ex: c, score };
  }).filter((x) => x.score > 8).sort((a, b) => b.score - a.score);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const { ex } of scored) {
    if (seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
    if (out.length >= limit) break;
  }
  return out;
}

// src/lib/exerciseDbFetch.ts
var MUSCLE_FILTER_FALLBACK_SEARCH = {
  beine: ["squat", "leg press", "lunge", "leg curl", "deadlift", "calf raise"],
  arme: ["bicep curl", "tricep extension", "curl"],
  brust: ["bench press", "push-up", "fly"],
  r\u00FCcken: ["row", "pull-up", "lat pulldown"],
  schulter: ["shoulder press", "lateral raise"],
  core: ["plank", "crunch", "abs"],
  ganzk\u00F6rper: ["burpee", "clean"]
};
var MUSCLE_FILTER_FALLBACK_TARGETS = {
  beine: ["quadriceps", "hamstrings", "glutes", "calves", "adductors"],
  arme: ["biceps", "triceps", "forearms"],
  brust: ["pectorals", "chest"],
  r\u00FCcken: ["lats", "traps", "upper back"],
  schulter: ["delts", "shoulders"],
  core: ["abs", "obliques"]
};
var TTL_MS2 = 1e3 * 60 * 60 * 12;
var cache2 = /* @__PURE__ */ new Map();
function cacheGet2(key) {
  const hit = cache2.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS2) {
    cache2.delete(key);
    return null;
  }
  return hit.data;
}
function cacheSet2(key, data) {
  cache2.set(key, { at: Date.now(), data });
}
function headers2() {
  const key = exerciseDbApiKey();
  if (!key) throw new ExerciseDbFetchError("ExerciseDB API key missing", "not_configured");
  return {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": exerciseDbHost(),
    Accept: "application/json"
  };
}
async function parseJson(r) {
  const text = await r.text();
  if (r.status === 429) {
    throw new ExerciseDbFetchError("ExerciseDB rate limit", "rate_limited");
  }
  if (!r.ok) {
    throw new ExerciseDbFetchError(`ExerciseDB HTTP ${r.status}: ${text.slice(0, 200)}`, "unavailable");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExerciseDbFetchError("Invalid JSON from ExerciseDB", "unavailable");
  }
}
async function fetchPath(path5) {
  const url = `https://${exerciseDbHost()}${path5.startsWith("/") ? path5 : `/${path5}`}`;
  const cacheKey2 = url;
  const cached = cacheGet2(cacheKey2);
  if (cached) return cached;
  const r = await fetch(url, { headers: headers2() });
  const data = await parseJson(r);
  cacheSet2(cacheKey2, data);
  return data;
}
function mapList2(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of raw) {
    const ex = mapExerciseDbToCatalog(row);
    if (!ex || seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
  }
  return out;
}
async function fetchExerciseDbById(id) {
  if (!isExerciseDbConfigured()) return null;
  const clean = id.replace(/^edb_/, "").trim();
  if (!clean) return null;
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchExerciseById(clean);
    }
    const raw = await fetchPath(`/exercises/exercise/${encodeURIComponent(clean)}`);
    return mapExerciseDbToCatalog(raw);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function searchExerciseDbByName(query, limit = 25) {
  if (!isExerciseDbConfigured()) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendSearchByName(q, limit);
    }
    const raw = await fetchPath(
      `/exercises/name/${encodeURIComponent(q)}`
    );
    return mapList2(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function fetchExerciseDbByBodyPart(bodyPart, limit = 30) {
  if (!isExerciseDbConfigured()) return [];
  const bp = bodyPart.trim().toLowerCase();
  if (!bp) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchByBodyPart(bp, limit);
    }
    const raw = await fetchPath(
      `/exercises/bodyPart/${encodeURIComponent(bp)}`
    );
    return mapList2(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function fetchExerciseDbByBodyParts(bodyParts, limit = 40) {
  const parts = bodyParts.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!isExerciseDbConfigured() || parts.length === 0) return [];
  const perPart = Math.max(10, Math.ceil(limit / parts.length));
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const batches = await Promise.all(
    parts.map(
      (bp) => fetchExerciseDbByBodyPart(bp, perPart).catch(() => [])
    )
  );
  for (const batch of batches) {
    for (const ex of batch) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        out.push(ex);
      }
    }
  }
  return out.slice(0, limit);
}
async function fetchExerciseDbByTarget(target, limit = 30) {
  if (!isExerciseDbConfigured()) return [];
  const t = target.trim().toLowerCase();
  if (!t) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchByTarget(t, limit);
    }
    const raw = await fetchPath(
      `/exercises/target/${encodeURIComponent(t)}`
    );
    return mapList2(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function searchExerciseDbCatalog(opts) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
  const q = (opts.query || "").trim();
  const muscle = opts.muscle ?? "all";
  if (muscle !== "all" && muscle !== "cardio_art" && q.length < 2) {
    const parts2 = muscleFilterToBodyParts(muscle);
    if (parts2.length > 0) {
      return fetchExercisesForMuscleFilter(muscle, limit);
    }
  }
  if (q.length >= 2) {
    let list = await searchExerciseDbByName(q, limit);
    if (muscle !== "all") {
      list = list.filter((e) => {
        if (muscle === "cardio_art") return e.category === "cardio";
        return e.tags?.includes(muscle) ?? false;
      });
    }
    return list.slice(0, limit);
  }
  if (muscle === "cardio_art") {
    return fetchExerciseDbByBodyPart("cardio", limit);
  }
  const parts = muscleFilterToBodyParts(muscle);
  if (parts.length > 0) return fetchExercisesForMuscleFilter(muscle, limit);
  if (isAscendExerciseDbHost() && isExerciseDbConfigured()) {
    return ascendFetchBrowse(limit);
  }
  return [];
}
async function fetchExercisesForMuscleFilter(muscle, limit) {
  const parts = muscleFilterToBodyParts(muscle);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const merge = (batch) => {
    for (const ex of batch) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        out.push(ex);
      }
    }
  };
  merge(await fetchExerciseDbByBodyParts(parts, limit));
  if (out.length < limit) {
    for (const target of MUSCLE_FILTER_FALLBACK_TARGETS[muscle] ?? []) {
      merge(await fetchExerciseDbByTarget(target, 14).catch(() => []));
      if (out.length >= limit) break;
    }
  }
  if (out.length < limit) {
    for (const term of MUSCLE_FILTER_FALLBACK_SEARCH[muscle] ?? []) {
      const batch = await searchExerciseDbByName(term, 12).catch(() => []);
      for (const ex of batch) {
        if (!seen.has(ex.key) && (ex.tags?.includes(muscle) ?? true)) {
          seen.add(ex.key);
          out.push(ex);
        }
      }
      if (out.length >= limit) break;
    }
  }
  if (out.length === 0 && isAscendExerciseDbHost()) {
    const browse = await ascendFetchBrowse(Math.min(80, limit * 3)).catch(() => []);
    for (const ex of browse) {
      if (ex.tags?.includes(muscle)) merge([ex]);
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}
async function fetchExerciseDbFilterLists() {
  if (!isExerciseDbConfigured()) {
    return { bodyParts: [], targets: [], equipments: [] };
  }
  if (isAscendExerciseDbHost()) {
    return ascendFetchFilterLists();
  }
  const [bodyParts, targets, equipments] = await Promise.all([
    fetchPath("/exercises/bodyPartList"),
    fetchPath("/exercises/targetList"),
    fetchPath("/exercises/equipmentList")
  ]);
  return { bodyParts, targets, equipments };
}
async function findSimilarExercises(exerciseKey, limit = 12) {
  if (!isExerciseDbConfigured()) return [];
  const id = exerciseKey.replace(/^edb_/, "").trim();
  if (!id) return [];
  let source = await fetchExerciseDbById(id);
  if (!source) return [];
  const pool2 = [];
  const seen = /* @__PURE__ */ new Set([source.key]);
  const addList = (list) => {
    for (const ex of list) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        pool2.push(ex);
      }
    }
  };
  if (source.targetMuscle) {
    addList(await fetchExerciseDbByTarget(source.targetMuscle, 35));
  }
  if (source.bodyPart) {
    addList(await fetchExerciseDbByBodyPart(source.bodyPart, 25));
  }
  if (pool2.length < 8 && source.name.length >= 3) {
    const words = source.name.split(/\s+/).filter((w) => w.length > 3);
    const q = words[0] || source.name.slice(0, 8);
    addList(await searchExerciseDbByName(q, 20));
  }
  return rankSimilarExercises(source, pool2, limit);
}
async function formatExerciseDbCatalogForCoach(maxPerGroup = 22) {
  if (!isExerciseDbConfigured()) return "";
  const groups = [
    { label: "push_chest", bodyPart: "chest", target: "pectorals" },
    { label: "pull_back", bodyPart: "back", target: "lats" },
    { label: "legs", bodyPart: "upper legs", target: "quads" },
    { label: "glutes_hams", bodyPart: "upper legs", target: "glutes" },
    { label: "shoulders", bodyPart: "shoulders", target: "deltoids" },
    { label: "arms", bodyPart: "upper arms", target: "biceps" },
    { label: "core", bodyPart: "waist", target: "abs" },
    { label: "cardio", bodyPart: "cardio" }
  ];
  const lines = [];
  const seen = /* @__PURE__ */ new Set();
  for (const g of groups) {
    try {
      let items = [];
      if (g.target) {
        try {
          items = await fetchExerciseDbByTarget(g.target, maxPerGroup);
        } catch {
          items = await fetchExerciseDbByBodyPart(g.bodyPart, maxPerGroup);
        }
      } else {
        items = await fetchExerciseDbByBodyPart(g.bodyPart, maxPerGroup);
      }
      for (const ex of items) {
        if (seen.has(ex.key)) continue;
        seen.add(ex.key);
        const meta = [
          g.label,
          ex.targetMuscle ? `target:${ex.targetMuscle}` : "",
          ex.bodyPart ? `body:${ex.bodyPart}` : "",
          ex.equipment ? `equip:${ex.equipment}` : ""
        ].filter(Boolean).join(" ");
        lines.push(`${ex.key} | ${ex.name} | ${meta}`);
      }
    } catch {
    }
  }
  return lines.join("\n");
}

// src/lib/coachExercisePrompt.ts
var NO_EXERCISEDB_HINT = "ExerciseDB ist nicht konfiguriert (EXERCISEDB_RAPIDAPI_KEY). Kein lokaler \xDCbungskatalog mehr \u2014 bitte API-Key setzen.";
async function formatExerciseDbForCoachPromptAsync() {
  if (!isExerciseDbConfigured()) {
    return NO_EXERCISEDB_HINT;
  }
  try {
    const remote = await formatExerciseDbCatalogForCoach(24);
    if (remote.trim()) {
      return `${remote}

Format: edb_<id> | name | muscle tags (target/body/equip). Use exerciseKey on every strength exercise. Balance push/pull/legs/core weekly.`;
    }
  } catch (e) {
    console.error("ExerciseDB coach catalog:", e);
  }
  return `${NO_EXERCISEDB_HINT}
(ExerciseDB-Katalogabruf lieferte keine Treffer.)`;
}
function formatExerciseDbForCoachPrompt() {
  return NO_EXERCISEDB_HINT;
}

// src/lib/server/exerciseDbEnv.ts
var ENV_KEY_CANDIDATES2 = [
  "EXERCISEDB_RAPIDAPI_KEY",
  "EXERCISEDB_API_KEY",
  "EXERCISE_DB_RAPIDAPI_KEY",
  "RAPIDAPI_KEY",
  "RAPIDAPI_EXERCISEDB_KEY",
  "VITE_EXERCISEDB_RAPIDAPI_KEY"
];
function normalizeApiKeyFromRaw(raw) {
  const k = sanitizeEnvSecret(raw);
  if (!k || k.length < 10) return void 0;
  const v = k.toLowerCase();
  const placeholders = /* @__PURE__ */ new Set([
    "none",
    "null",
    "undefined",
    "changeme",
    "api_key_here",
    "your_exercisedb_rapidapi_key",
    "xxx"
  ]);
  if (placeholders.has(v)) return void 0;
  if (/^your[_-]/.test(v) && k.length < 36) return void 0;
  return k;
}
function getExerciseDbEnvDiagnostics() {
  const { applied: envReloadApplied } = reloadEnvFromFile();
  const envFileProblem = getEnvFileProblem();
  const key = exerciseDbApiKey();
  const source = exerciseDbKeySource();
  const hints = [];
  if (envFileProblem) hints.unshift(envFileProblem);
  for (const name of ENV_KEY_CANDIDATES2) {
    const inFile = envVarStatusInFile(name);
    const raw = sanitizeEnvSecret(process.env[name]);
    const valid = normalizeApiKeyFromRaw(raw);
    if (valid) {
      const where = inFile === "missing" ? "Server-Umgebung (Docker/Panel, nicht in .env-Datei)" : inFile === "empty" ? "Umgebung + leere Zeile in .env" : "Umgebung und .env-Datei";
      hints.push(`${name}: aktiv, ${raw.length} Zeichen (${where})`);
    } else if (raw.length > 0) {
      hints.push(
        `${name}: Wert vorhanden (${raw.length} Zeichen), wird abgelehnt \u2014 pr\xFCfe Leerzeichen/Zeilenumbruch`
      );
    } else if (inFile === "set") {
      const fileLen = envVarLengthInFile(name);
      hints.push(
        `${name}: in .env (${fileLen ?? "?"} Zeichen), Prozess leer \u2014 \u201EAktualisieren\u201C klicken oder Server neu starten`
      );
    } else if (inFile === "empty") {
      hints.push(`${name}: Zeile in .env, aber leer`);
    } else {
      hints.push(`${name}: nicht gesetzt (weder Umgebung noch .env)`);
    }
  }
  return {
    configured: isExerciseDbConfigured(),
    source,
    host: exerciseDbHost(),
    envFileHints: hints,
    envFilePath: getEnvFilePath(),
    envFileProblem,
    keyLength: key ? key.length : null,
    envReloadApplied
  };
}

// src/lib/buildUserContextForCoach.ts
function simpleWeightTrend(weightHistory) {
  if (!Array.isArray(weightHistory) || weightHistory.length < 2) return "stable";
  const nums = weightHistory.map((e) => e && typeof e.value === "number" ? e.value : NaN).filter((x) => Number.isFinite(x));
  if (nums.length < 2) return "stable";
  const a = nums[0];
  const b = nums[nums.length - 1];
  const d = b - a;
  if (d > 0.4) return "up";
  if (d < -0.4) return "down";
  return "stable";
}
async function buildUserContextForCoach(params) {
  const { pool: pool2, userId, plan } = params;
  const ob = plan.onboarding_data || {};
  const userRow = await pool2.query(
    `SELECT measurements, weight_history, profile_extras, goals FROM users WHERE id=$1`,
    [userId]
  );
  const row = userRow.rows[0] || {};
  const m = row.measurements || {};
  const wh = row.weight_history;
  const rollEnd = /* @__PURE__ */ new Date();
  const rollStart = new Date(rollEnd);
  rollStart.setDate(rollEnd.getDate() - 27);
  const rollA = toLocalYmd(rollStart);
  const rollB = toLocalYmd(rollEnd);
  let evalStart = null;
  let evalEnd = null;
  if (params.scheduleWindow?.startYmd) {
    evalStart = params.scheduleWindow.startYmd;
    evalEnd = coachWeekInclusiveEnd(evalStart);
  }
  const [wCount, nAgg, reports] = await Promise.all([
    pool2.query(`SELECT COUNT(*)::int AS c FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      userId,
      rollA,
      rollB
    ]),
    pool2.query(
      `SELECT COUNT(*)::int AS entries, COALESCE(AVG(calories),0)::float AS avg_cal
       FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
      [userId, rollA, rollB]
    ),
    plan.id ? pool2.query(
      `SELECT week_number, report FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC LIMIT 3`,
      [plan.id]
    ) : Promise.resolve({ rows: [] })
  ]);
  const highlights = (reports.rows || []).map((r) => ({
    week: r.week_number,
    recommendation: r.report?.recommendation,
    rating: r.report?.overallRating
  }));
  return {
    onboarding: ob,
    profile_snapshot: {
      weight_kg: m.weight ?? null,
      height_cm: m.height ?? null,
      age: m.age ?? null,
      gender: m.gender ?? null,
      activity_level: m.activityLevel ?? null
    },
    rolling: {
      window_days: 28,
      workouts_logged_count: wCount.rows[0]?.c ?? 0,
      nutrition_summary: {
        entries: nAgg.rows[0]?.entries ?? 0,
        avg_calories: nAgg.rows[0]?.avg_cal ?? 0
      },
      weight_trend: simpleWeightTrend(wh),
      last_reports_highlights: highlights
    },
    constraints_input: {
      available_weekdays_en: ob.availableTrainingDays ?? [],
      allow_double_sessions: ob.allowDoubleSessions !== false,
      session_duration_cap_min: ob.sessionDuration ?? null,
      equipment_ids: ob.equipment ?? [],
      injuries_plain: String(ob.injuries ?? "")
    },
    schedule_eval_window: evalStart && evalEnd ? { start: evalStart, end: evalEnd } : null
  };
}

// src/lib/parseCoachJson.ts
function stripMarkdownCodeFences(raw) {
  let t = (raw || "").trim();
  if (!t.startsWith("```")) return t;
  t = t.replace(/^```[a-zA-Z0-9_-]*\s*/m, "");
  t = t.replace(/\s*```\s*$/m, "").trim();
  return t;
}
function parseJsonLoose(raw) {
  const stripped = stripMarkdownCodeFences(raw);
  return JSON.parse(stripped);
}

// src/lib/coachScheduleZod.ts
import { z } from "zod";
var coachExerciseRowSchema = z.object({
  name: z.string(),
  exerciseKey: z.string().optional(),
  setType: z.string().optional(),
  sets: z.union([z.number(), z.string()]).optional(),
  reps: z.union([z.number(), z.string()]).optional(),
  rest: z.string().optional(),
  weight: z.string().optional(),
  notes: z.string().optional()
}).passthrough();
var cardioSchema = z.object({
  type: z.string().optional(),
  duration: z.string().optional(),
  distance: z.string().optional(),
  pace: z.string().optional(),
  zones: z.string().optional(),
  details: z.string().optional()
}).passthrough();
var scheduleDaySchema = z.object({
  day: z.string(),
  sessionSlot: z.string().optional(),
  isRest: z.boolean().optional(),
  sessionType: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  estimatedDuration: z.number().optional(),
  intensity: z.string().optional(),
  rpe: z.number().optional(),
  warmup: z.string().optional(),
  exercises: z.array(coachExerciseRowSchema).optional(),
  cardio: cardioSchema.optional(),
  cooldown: z.string().optional(),
  notes: z.string().optional()
}).passthrough();
var coachWorkoutWeekSchema = z.object({
  weekFocus: z.string(),
  coachNotes: z.string(),
  assumptions: z.array(z.string()).max(5).optional().default([]),
  applied_constraints: z.array(z.string()).max(8).optional().default([]),
  schedule: z.array(scheduleDaySchema)
});
var nutritionIngredientSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    amount: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional()
  }).passthrough()
]);
var nutritionMealSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  prepTime: z.string().optional(),
  servings: z.number().optional(),
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  ingredients: z.array(nutritionIngredientSchema).optional(),
  prepSteps: z.array(z.string()).optional(),
  prep_steps: z.array(z.string()).optional(),
  notes: z.string().optional()
}).passthrough();
var nutritionDaySchema = z.object({
  day: z.string(),
  totalCalories: z.number().optional(),
  meals: z.array(nutritionMealSchema).optional()
}).passthrough();
var coachNutritionWeekSchema = z.object({
  weekFocus: z.string(),
  coachNotes: z.string(),
  assumptions: z.array(z.string()).max(5).optional().default([]),
  applied_constraints: z.array(z.string()).max(8).optional().default([]),
  dailyTargets: z.object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional()
  }).passthrough().optional(),
  mealPlan: z.array(nutritionDaySchema),
  shoppingListHighlights: z.array(z.string()).optional(),
  supplementRecommendations: z.array(z.string()).optional()
});
var weeklyReportSchema = z.object({
  overallRating: z.number(),
  coachMessage: z.string(),
  summary: z.string(),
  performanceHighlights: z.array(z.string()),
  areasToImprove: z.array(z.string()),
  weekOverWeekComparison: z.string().optional(),
  completionRate: z.number(),
  nextWeekStrategy: z.string(),
  nextWeekChanges: z.array(z.string()),
  recommendation: z.enum(["continue", "reduce_volume", "increase_volume", "deload"])
});

// src/lib/coachConstraints.ts
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var ALLOWED_DAY_SET = new Set(DAY_NAMES);
function isAllowedExerciseKey(key) {
  if (!key) return false;
  return isExerciseDbCatalogKey(key);
}
function normalizeDayName(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  if (ALLOWED_DAY_SET.has(cap)) return cap;
  const lower = t.toLowerCase();
  const map = {
    sun: "Sunday",
    sunday: "Sunday",
    sonntag: "Sunday",
    mon: "Monday",
    monday: "Monday",
    montag: "Monday",
    tue: "Tuesday",
    tues: "Tuesday",
    tuesday: "Tuesday",
    dienstag: "Tuesday",
    wed: "Wednesday",
    weds: "Wednesday",
    wednesday: "Wednesday",
    mittwoch: "Wednesday",
    thu: "Thursday",
    thur: "Thursday",
    thurs: "Thursday",
    thursday: "Thursday",
    donnerstag: "Thursday",
    fri: "Friday",
    friday: "Friday",
    freitag: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
    samstag: "Saturday"
  };
  return map[lower] ?? (ALLOWED_DAY_SET.has(cap) ? cap : null);
}
function injuryKneeActive(plain) {
  const s = plain.toLowerCase();
  return s.includes("knie") || s.includes("knee") || s.includes("patella");
}
function injuryShoulderActive(plain) {
  const s = plain.toLowerCase();
  return s.includes("schulter") || s.includes("shoulder") || s.includes("rotator");
}
var KNEE_BLOCKED = /squat|lunge|bulgarian|step_up|leg_press|jump|box jump/i;
var SHOULDER_BLOCKED = /overhead|ohp|military press|shoulder press|push press|handstand|kettlebell snatch|kettlebell swing/i;
function validateWorkoutConstraints(week, input) {
  const violations = [];
  const allowed = /* @__PURE__ */ new Set();
  if (Array.isArray(input.availableTrainingDays) && input.availableTrainingDays.length > 0) {
    for (const d of input.availableTrainingDays) {
      const n = normalizeDayName(d);
      if (n) allowed.add(n);
    }
  }
  const enforceDays = allowed.size > 0;
  const allowDoubles = input.allowDoubleSessions !== false;
  const inj = String(input.injuriesPlain || "");
  const perDayCounts = /* @__PURE__ */ new Map();
  for (let i = 0; i < week.schedule.length; i++) {
    const d = week.schedule[i];
    const dayName = normalizeDayName(String(d.day || ""));
    if (!dayName) {
      violations.push({ code: "bad_day", message: `schedule[${i}].day invalid` });
      continue;
    }
    const rest = d.isRest === true;
    if (!rest) {
      if (enforceDays && !allowed.has(dayName)) {
        violations.push({
          code: "day_not_allowed",
          message: `Non-rest session on ${dayName} but only ${[...allowed].join(", ")} allowed`
        });
      }
      perDayCounts.set(dayName, (perDayCounts.get(dayName) || 0) + 1);
    }
    const ex = Array.isArray(d.exercises) ? d.exercises : [];
    for (let j = 0; j < ex.length; j++) {
      const row = ex[j];
      const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
      if (key && !isAllowedExerciseKey(key)) {
        violations.push({
          code: "unknown_exercise_key",
          message: `schedule[${i}].exercises[${j}] unknown exerciseKey "${key}"`
        });
      }
      const nameBlob = `${row.name || ""} ${key || ""}`;
      if (injuryKneeActive(inj) && KNEE_BLOCKED.test(String(nameBlob))) {
        violations.push({
          code: "injury_knee",
          message: `schedule[${i}] exercise likely conflicts with knee limitation: ${nameBlob}`
        });
      }
      if (injuryShoulderActive(inj) && SHOULDER_BLOCKED.test(String(nameBlob))) {
        violations.push({
          code: "injury_shoulder",
          message: `schedule[${i}] exercise likely conflicts with shoulder limitation: ${nameBlob}`
        });
      }
    }
  }
  if (!allowDoubles) {
    for (const [dn, c] of perDayCounts) {
      if (c > 1) {
        violations.push({
          code: "double_session_forbidden",
          message: `More than one non-rest session on ${dn} but two-a-days disabled`
        });
      }
    }
  }
  return violations.length ? { ok: false, violations } : { ok: true };
}
function repairUnknownExerciseKeys(week) {
  const next = { ...week, schedule: week.schedule.map((d) => ({ ...d })) };
  let stripped = 0;
  for (const day of next.schedule) {
    if (!Array.isArray(day.exercises)) continue;
    day.exercises = day.exercises.map((row) => {
      const r = { ...row };
      const key = typeof r.exerciseKey === "string" ? r.exerciseKey.trim() : "";
      if (key && !isAllowedExerciseKey(key)) {
        stripped += 1;
        delete r.exerciseKey;
      }
      return r;
    });
  }
  const ac = [...week.applied_constraints || []];
  if (stripped) ac.push(`repaired:stripped_unknown_exerciseKey_count=${stripped}`);
  next.applied_constraints = ac.slice(0, 8);
  return next;
}

// src/lib/coachGeneratePipeline.ts
var CoachGenerationError = class extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
};
async function generateCoachWorkoutWeekWithPipeline(args) {
  const max = args.maxRetries ?? 3;
  let repairHint = "";
  let lastRaw = "";
  const zodErrors = [];
  const constraintViolations = [];
  for (let attempt = 0; attempt < max; attempt++) {
    const prompt = args.buildPrompt(repairHint);
    lastRaw = await args.callAi([{ role: "user", content: prompt }]);
    let parsed;
    try {
      parsed = parseJsonLoose(lastRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      zodErrors.push(`json_parse: ${msg}`);
      repairHint = `Die vorherige Antwort war kein g\xFCltiges JSON. ${msg}`;
      continue;
    }
    const normalized = args.normalizeEnvelope(parsed);
    const z3 = coachWorkoutWeekSchema.safeParse(normalized);
    if (!z3.success) {
      const msg = z3.error.issues.map((er) => `${er.path.join(".")}: ${er.message}`).join("; ");
      zodErrors.push(msg);
      repairHint = `Schema validation failed. Fix exactly: ${msg}`;
      continue;
    }
    let week = z3.data;
    week = repairUnknownExerciseKeys(week);
    const v = validateWorkoutConstraints(week, args.constraints);
    if (v.ok === false) {
      const msgs = v.violations.map((vi) => `${vi.code}: ${vi.message}`).join("; ");
      constraintViolations.push(msgs);
      repairHint = `Hard constraints violated \u2014 repair the schedule: ${msgs}`;
      continue;
    }
    return { week, rawLast: lastRaw, retries: attempt, zodErrors, constraintViolations };
  }
  throw new CoachGenerationError(
    `Coach workout generation failed after ${max} attempts`,
    { zodErrors, constraintViolations, lastRaw }
  );
}
async function generateCoachNutritionWeekWithPipeline(args) {
  const max = args.maxRetries ?? 3;
  let repairHint = "";
  let lastRaw = "";
  const zodErrors = [];
  for (let attempt = 0; attempt < max; attempt++) {
    const prompt = args.buildPrompt(repairHint);
    lastRaw = await args.callAi([{ role: "user", content: prompt }]);
    let parsed;
    try {
      parsed = parseJsonLoose(lastRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      zodErrors.push(`json_parse: ${msg}`);
      repairHint = `Die vorherige Antwort war kein g\xFCltiges JSON. ${msg}`;
      continue;
    }
    const z3 = coachNutritionWeekSchema.safeParse(parsed);
    if (!z3.success) {
      const msg = z3.error.issues.map((er) => `${er.path.join(".")}: ${er.message}`).join("; ");
      zodErrors.push(msg);
      repairHint = `Schema validation failed. Fix exactly: ${msg}`;
      continue;
    }
    return { week: z3.data, rawLast: lastRaw, retries: attempt, zodErrors };
  }
  throw new CoachGenerationError(`Coach nutrition generation failed after ${max} attempts`, {
    zodErrors,
    constraintViolations: [],
    lastRaw
  });
}

// src/lib/aiRunLogger.ts
import { createHash } from "node:crypto";

// src/lib/coachPromptVersions.ts
var COACH_PROMPT_VERSION = "coach-v1.0.0";
var MEAL_RECIPE_PROMPT_VERSION = "meal-recipe-v1.0.0";

// src/lib/aiRunLogger.ts
function hashJson(obj) {
  return createHash("sha256").update(JSON.stringify(obj ?? null)).digest("hex").slice(0, 32);
}
async function logCoachAiRun(pool2, row) {
  const caps = resolveAiCapabilities();
  const modelId = caps.provider === "mistral" ? "mistral-large-latest" : caps.provider === "gemini" ? "gemini-2.0-flash" : "none";
  try {
    await pool2.query(
      `INSERT INTO coach_ai_runs (
        user_id, plan_id, week_number, endpoint, prompt_version, model_id, input_hash,
        raw_response, zod_ok, constraints_ok, retries, latency_ms, final_schedule_hash,
        refinement_round, error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        row.userId,
        row.planId,
        row.weekNumber,
        row.endpoint,
        COACH_PROMPT_VERSION,
        modelId,
        hashJson(row.inputSummary),
        row.rawResponse,
        row.zodOk,
        row.constraintsOk,
        row.retries,
        row.latencyMs,
        row.finalScheduleHash,
        row.refinementRound ?? 0,
        row.errorMessage ?? null
      ]
    );
  } catch (e) {
    console.warn("[coach_ai_runs] log failed", e);
  }
}
async function logMealAiRun(pool2, row) {
  const caps = resolveAiCapabilities();
  const modelId = caps.provider === "mistral" ? "mistral-large-latest" : caps.provider === "gemini" ? "gemini-2.0-flash" : "none";
  try {
    await pool2.query(
      `INSERT INTO meal_ai_runs (
        user_id, endpoint, prompt_version, model_id, input_hash,
        raw_response, zod_ok, retries, latency_ms, error_message, refinement_round
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.userId,
        row.endpoint,
        MEAL_RECIPE_PROMPT_VERSION,
        modelId,
        hashJson(row.inputSummary),
        row.rawResponse,
        row.zodOk,
        row.retries,
        row.latencyMs,
        row.errorMessage ?? null,
        row.refinementRound ?? 0
      ]
    );
  } catch (e) {
    console.warn("[meal_ai_runs] log failed", e);
  }
}

// src/lib/mealRecipeZod.ts
import { z as z2 } from "zod";
var prepStepSchema = z2.object({
  order: z2.number(),
  title: z2.string().optional(),
  body: z2.string()
});
var recipeIngredientSchema = z2.object({
  name: z2.string(),
  amount: z2.number(),
  unit: z2.string(),
  foodId: z2.string().optional(),
  note: z2.string().optional(),
  unresolved: z2.boolean().optional()
});
var mealRecipeAiSchema = z2.object({
  name: z2.string(),
  category: z2.string().optional(),
  yields_portions: z2.number().int().min(1).max(999).optional(),
  ingredients: z2.array(recipeIngredientSchema).min(1),
  prep_steps: z2.array(prepStepSchema).min(1),
  llm_estimate_nutrients: z2.object({
    calories: z2.number().optional(),
    protein: z2.number().optional(),
    carbs: z2.number().optional(),
    fat: z2.number().optional()
  }).optional()
});

// src/lib/coachNutritionSchedule.ts
var COACH_NUTRITION_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
var COACH_MEAL_SLOT_TYPES = ["breakfast", "lunch", "dinner", "snack"];
function normalizeNutritionMealSchedule(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const day = String(row.day || "").trim();
    if (!COACH_NUTRITION_WEEKDAYS.includes(day)) continue;
    const mealsIn = row.meals;
    if (!Array.isArray(mealsIn)) continue;
    const meals = [];
    for (const m of mealsIn) {
      if (!m || typeof m !== "object") continue;
      const typeRaw = String(m.type || "").toLowerCase();
      const type = COACH_MEAL_SLOT_TYPES.includes(typeRaw) ? typeRaw : null;
      if (!type) continue;
      const servings = Math.max(1, Math.min(12, Math.round(Number(m.servings) || 1)));
      meals.push({ type, servings });
    }
    if (meals.length > 0) out.push({ day, meals });
  }
  return out;
}
function legacyMealScheduleFromMealsPerDay(mealsPerDay) {
  const n = Math.max(2, Math.min(5, Math.round(mealsPerDay) || 3));
  const types = n <= 2 ? ["breakfast", "dinner"] : n === 3 ? ["breakfast", "lunch", "dinner"] : n === 4 ? ["breakfast", "lunch", "dinner", "snack"] : ["breakfast", "lunch", "snack", "dinner", "snack"];
  return COACH_NUTRITION_WEEKDAYS.map((day) => ({
    day,
    meals: types.slice(0, n).map((type) => ({ type, servings: 1 }))
  }));
}
function resolveNutritionMealSchedule(ob) {
  const normalized = normalizeNutritionMealSchedule(ob.mealSchedule);
  if (normalized.length > 0) return normalized;
  const mpd = Number(ob.mealsPerDay);
  if (Number.isFinite(mpd) && mpd >= 2) return legacyMealScheduleFromMealsPerDay(mpd);
  return legacyMealScheduleFromMealsPerDay(3);
}
function formatMealScheduleForCoachPrompt(schedule) {
  if (!schedule.length) return "No meal slots configured.";
  return schedule.map(
    (d) => `- ${d.day}: ${d.meals.map((m) => `${m.type} (${m.servings} ${m.servings === 1 ? "person" : "persons"})`).join(", ")}`
  ).join("\n");
}

// src/lib/mealTemplateComputedNutrition.ts
function findStaticFoodById(_id) {
  return null;
}
function ingredientAmountToGrams(amount, unitRaw) {
  const u = String(unitRaw || "").trim().toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (u === "g" || u === "gram" || u === "gramm") return amount;
  if (u === "kg") return amount * 1e3;
  if (u === "ml" || u === "milliliter") return amount;
  if (u === "l" || u === "liter") return amount * 1e3;
  if (u === "stk" || u === "st\xFCck" || u === "stueck" || u === "piece" || u === "pcs") return null;
  return null;
}
function computeMealTemplateNutritionForRecipe(ingredients, extraFoodResolver) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let resolvedRows = 0;
  let totalRows = 0;
  for (const ing of ingredients || []) {
    totalRows += 1;
    const grams = ingredientAmountToGrams(Number(ing.amount), ing.unit);
    const food = (ing.foodId && extraFoodResolver ? extraFoodResolver(ing.foodId) : null) ?? findStaticFoodById(ing.foodId);
    if (!food || grams == null) continue;
    resolvedRows += 1;
    const f = 0.01 * grams;
    const c = food.nutrients.calories * f;
    totals.calories += c;
    totals.protein += food.nutrients.protein * f;
    totals.carbs += food.nutrients.carbs * f;
    totals.fat += food.nutrients.fat * f;
  }
  const rowCoverage = totalRows > 0 ? resolvedRows / totalRows : 0;
  const caloriesCoverage = totalRows > 0 ? resolvedRows / totalRows : 0;
  return {
    computed: {
      calories: Math.round(totals.calories * 10) / 10,
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10
    },
    rowCoverage: Math.round(rowCoverage * 1e3) / 1e3,
    caloriesCoverage: Math.round(caloriesCoverage * 1e3) / 1e3
  };
}

// server.ts
import { createHash as createHash2 } from "crypto";

// src/lib/portionUtils.ts
var DEFAULT_STUECK_GRAMS_FALLBACK = 100;
function parseGroupedPieceCount(name) {
  const t = name.trim();
  const m = t.match(/^(\d+)\s*(?:stk\.?|stück|stueck|scheiben|scheibe\b|eier\b)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function gramsPerPieceFromExplicitServing(s) {
  if (!s.grams || s.grams <= 0) return null;
  const t = s.name.trim();
  const isPieceOrSlice = /stk\.?|stück|stueck|\bpiece\b/i.test(t) || /scheibe/i.test(t) || /\beier\b/i.test(t);
  if (!isPieceOrSlice) return null;
  const grouped = parseGroupedPieceCount(t);
  const divisor = grouped ?? 1;
  return Math.max(1, Math.round(s.grams / divisor));
}
function isPortionOrPackagingServingName(name) {
  const low = name.trim().toLowerCase();
  return /\b(portion|portionen|menü|menu|paket|packung|pack\b|teller|ration|komplett|family|familien|pers\.|personen)\b/i.test(
    low
  );
}
function inferStueckGramsFromFood(food) {
  const servings = food.servings ?? [];
  for (const s of servings) {
    const g = gramsPerPieceFromExplicitServing(s);
    if (g != null) return g;
  }
  const onePrefixed = servings.find((s) => {
    if (!s.grams || s.grams <= 0) return false;
    const n = s.name.trim();
    if (!/^\s*1\s+/i.test(n)) return false;
    if (isPortionOrPackagingServingName(n)) return false;
    return true;
  });
  if (onePrefixed) return Math.round(onePrefixed.grams);
  const nonReference = servings.find((s) => {
    if (!s.grams || s.grams <= 0) return false;
    if (/^100\s*g$/i.test(s.name.trim())) return false;
    const sn = s.name.trim().toLowerCase();
    if (/vorschlag|schätz|schätzung|geschätzt|gesamtportion|korrigier/i.test(sn)) return false;
    if (isPortionOrPackagingServingName(s.name)) return false;
    const grp = parseGroupedPieceCount(s.name);
    if (grp != null && grp > 1) return false;
    return true;
  });
  if (nonReference) return Math.round(nonReference.grams);
  const any = servings.find((s) => s.grams > 0);
  if (any) return Math.max(1, Math.round(any.grams));
  return DEFAULT_STUECK_GRAMS_FALLBACK;
}
function isCondimentLikePourFood(food) {
  const n = food.name.toLowerCase();
  if (/\b(essig|balsamico|apfelessig|weißweinessig|branntweinessig|essenz)\b/i.test(n)) return true;
  if (/\b(öls?|öl\b|pflanzenöl|olivenöl|sesamöl|distelöl|sonnenblumenöl|rapsöl)\b/i.test(n)) return true;
  if (/\b(senf|ketchup|mayo|mayonnaise|worcester|tabasco|sriracha|harissa)\b/i.test(n)) return true;
  if (/\b(soße|soss|dressing|würzsauce|fischsauce|oyster|sojasauce|pesto)\b/i.test(n)) return true;
  if (/\b(kapern|paste|currypaste|wasabi|relish)\b/i.test(n)) return true;
  if (/\b(sirup|honig|ahornsirup|melasse|marmelade|nutella|konfit)\b/i.test(n)) return true;
  return false;
}
function parseLeadingCountFromName(name) {
  const m = name.trim().match(/^(\d+)/);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function inferScheibeGramsFromFood(food) {
  const s = food.servings?.find((x) => /scheibe/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferPortionGramsFromFood(food) {
  const s = food.servings?.find((x) => /\bportion/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferDoseGramsFromFood(food) {
  const s = food.servings?.find((x) => /dose/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferFlascheGramsFromFood(food) {
  if (food.category !== "drink" || isCondimentLikePourFood(food)) return null;
  const s = food.servings?.find((x) => /flasche/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferGlasMlFromFood(food) {
  if (food.category !== "drink" || isCondimentLikePourFood(food)) return null;
  if (/\bshot\b/i.test(food.name)) return null;
  const s = food.servings?.find((x) => /(glas|gläser|becher)/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferDefaultLogPortionForFood(food) {
  if (isCondimentLikePourFood(food)) {
    return { unit: "ml", quantity: 100 };
  }
  if (food.category === "spice") {
    return { unit: "g", quantity: 100 };
  }
  if (food.category === "sauce") {
    return { unit: "ml", quantity: 100 };
  }
  const doseG = inferDoseGramsFromFood(food);
  const mentionsDose = /\bdose\b/i.test(food.name) || (food.servings ?? []).some((s) => /dose/i.test(s.name));
  if (doseG && mentionsDose && (food.category === "canned" || /\bdose\b/i.test(food.name))) {
    return { unit: "dose", quantity: 1 };
  }
  if (food.category === "drink") {
    if (/\bshot\b/i.test(food.name)) {
      const s = food.servings?.find((x) => x.grams > 0);
      return { unit: "ml", quantity: s ? Math.max(1, Math.round(s.grams)) : 30 };
    }
    for (const s of food.servings ?? []) {
      const sn = s.name.toLowerCase();
      if (/flasche/.test(sn) && s.grams > 0) return { unit: "flasche", quantity: 1 };
    }
    for (const s of food.servings ?? []) {
      const sn = s.name.toLowerCase();
      if (/(glas|gläser|becher)/.test(sn) && s.grams > 0) return { unit: "glas", quantity: 1 };
    }
    if (inferFlascheGramsFromFood(food)) return { unit: "flasche", quantity: 1 };
    if (inferGlasMlFromFood(food)) return { unit: "glas", quantity: 1 };
    const mlServing = (food.servings ?? []).find((s) => s.grams > 0);
    return { unit: "ml", quantity: mlServing ? Math.max(1, Math.round(mlServing.grams)) : 100 };
  }
  if (doseG && mentionsDose) {
    return { unit: "dose", quantity: 1 };
  }
  const scheibeG = inferScheibeGramsFromFood(food);
  if (scheibeG && /\b(brot|toast|vollkorn|schwarz|weißbrot|baguette)\b/i.test(food.name)) {
    return { unit: "scheibe", quantity: 1 };
  }
  if (inferPortionGramsFromFood(food)) {
    return { unit: "portion", quantity: 1 };
  }
  return { unit: "stk", quantity: 1 };
}

// src/lib/portionHeuristics.ts
function isLikelyWholePieceSmokedOrCookedSausageName(name) {
  const n = name.toLowerCase();
  if (/\b(scheibe|aufschnitt|gekocht\s*schinken|roher\s*schinken|geschnitten)\b/i.test(n)) return false;
  return /\b(debreziner|debrecziner|debreceni|knackwurst|bockwurst|wiener|frankfurter|bratwurst|currywurst|würstchen|wurstchen|merguez|landjäger|bierwurst|schenkenwurst|rauchwurst|extrawurst|serdelki|sremska)\b/i.test(
    n
  );
}
function typicalGramsPerPieceFromProductName(name) {
  const n = name.toLowerCase();
  if (/\bei(er)?\b|\begg\b/i.test(n) && !/eiernudeln|eierschwammerl|eierlikör|eierkuchen/i.test(n))
    return 58;
  if (/\bapfel\b|\bapple\b/i.test(n)) return 130;
  if (/\bbanane\b/i.test(n)) return 120;
  if (/\bbirne\b/i.test(n)) return 150;
  if (/\borange\b|\bclementine\b/i.test(n)) return 140;
  if (/\bdebreziner\b|debrecziner|debreceni|ungarische\s*rauchwurst/i.test(n)) return 55;
  if (/\bwiener\b|frankfurter\b/i.test(n)) return 50;
  if (/\bknackwurst\b/i.test(n)) return 55;
  if (/\bbockwurst\b/i.test(n)) return 90;
  if (/\bmerguez\b/i.test(n)) return 55;
  if (/\bbratwurst\b(?!en\b)/i.test(n)) return 100;
  if (/\bcurrywurst\b(?!sauce)(?!\s*mit)/i.test(n)) return 180;
  if (/\bcervelat\b|lyoner\b|fleischwurst\b|gelbwurst\b|bierschinken\b/i.test(n)) return 20;
  if (isLikelyWholePieceSmokedOrCookedSausageName(name)) return 55;
  return null;
}
function normalizeAiParsedFoodPortion(item) {
  const uRaw = (item.unit || "g").trim().toLowerCase().replace(/\./g, "");
  const isStk = uRaw === "stk" || uRaw.includes("st\xFCck") || uRaw.includes("stueck") || uRaw === "piece" || uRaw === "pcs" || uRaw === "x";
  const { amount, name } = item;
  if (!isStk || !Number.isFinite(amount)) return item;
  if (isLikelyWholePieceSmokedOrCookedSausageName(name) && amount > 25) {
    return { ...item, amount, unit: "g" };
  }
  return item;
}

// src/lib/mealAiShared.ts
var FOOD_CATEGORY_LIST = [
  "protein",
  "carbs",
  "fat",
  "fruit",
  "vegetable",
  "dairy",
  "sauce",
  "snack",
  "drink",
  "canned",
  "frozen",
  "fastfood",
  "readymeal",
  "bakery",
  "sweets",
  "spice",
  "breakfast"
];
function normalizeGermanMealInputForRanking(raw) {
  return raw.trim().replace(/\r?\n+/g, " ").replace(/\s+/g, " ");
}
function buildMealQuantityHintsForPrompt(userText) {
  const t = userText.replace(/\r?\n/g, " ").trim();
  if (!t) return "";
  const lines = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /\b(\d+(?:[.,]\d+)?)\s*(scheiben?|stück(?:e)?|stk\.?|x)\s+([^,;]+?)(?=\s+(?:und|plus|dazu|daneben|,)|\s*$)/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const n = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) continue;
    const w = m[2].toLowerCase();
    const rest = m[3].trim().replace(/\s+/g, " ").slice(0, 90);
    if (!rest) continue;
    const key = `${n}|${w}|${rest.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (/^scheib/.test(w)) {
      const lo = Math.round(n * 25);
      const hi = Math.round(n * 45);
      lines.push(
        `- \u201E${rest}\u201C: ${n} Scheibe(n) \u2192 eine ingredients-Zeile, **unit "g"**, **amount** typ. ${lo}\u2013${hi} (Mitte ok, nicht stk).`
      );
    } else {
      lines.push(
        `- \u201E${rest}\u201C: ${n} ${m[2].trim()} \u2192 bei ganzer Br\xFChwurst **stk** (ganzzahlig), sonst **g**; keine Grammzahl bei stk.`
      );
    }
  }
  if (lines.length === 0) return "";
  return `STRUKTURIERTE_HINWEISE (Leitpf\xE4hle \u2014 Nutzertext hat Vorrang):
${lines.join("\n")}`;
}
function coerceFoodCategory(raw) {
  const s = (raw || "").trim().toLowerCase();
  return FOOD_CATEGORY_LIST.includes(s) ? s : "readymeal";
}
function isOpenFoodFactsFood(food) {
  const id = food.id != null ? String(food.id).trim() : "";
  return id.startsWith("off_");
}
function isAppCatalogFood(food) {
  const id = food.id != null ? String(food.id).trim() : "";
  return id.startsWith("off_") || id.startsWith("ucf_");
}
function filterOffOnlyIngredients(ingredients, pool2 = []) {
  return ingredients.filter((ing) => {
    const id = ing.id != null ? String(ing.id).trim() : "";
    if (id.startsWith("est_") || id.startsWith("proposal_") || id.startsWith("ucf_preview_")) {
      return false;
    }
    if (ing.nutrientSource === "model_estimate") return false;
    if (isAppCatalogFood({ id })) return true;
    const food = (id ? pool2.find((f) => f.id === id) : null) ?? matchFoodExactFromPool(ing.name, pool2);
    return food != null && isAppCatalogFood(food);
  });
}
function mergeCatalogFoodPool(catalogFoods = []) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of catalogFoods) {
    const k = normalizeName(f.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}
function isParsedStkUnit(unit) {
  const u = (unit || "").trim().toLowerCase();
  if (!u) return false;
  if (u.includes("stk") || u.includes("st\xFCck") || u.includes("stuck")) return true;
  if (u === "piece" || u === "pcs" || u === "pc" || u === "x") return true;
  return false;
}
function normalizeDecomposedStkAmounts(items) {
  return items.map((row) => {
    if (!isParsedStkUnit(row.unit)) return row;
    const amt = row.amount;
    if (!Number.isFinite(amt)) return { ...row, amount: 1 };
    if (Number.isInteger(amt) && amt >= 1) return row;
    const rounded = Math.max(1, Math.round(amt));
    return { ...row, amount: rounded };
  });
}
var STOPWORDS = /* @__PURE__ */ new Set([
  "und",
  "oder",
  "mit",
  "ohne",
  "ein",
  "eine",
  "einen",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ist",
  "war",
  "hab",
  "hat",
  "aus",
  "auf",
  "als",
  "wie",
  "mir",
  "mal",
  "bitte",
  "ca",
  "zum",
  "zur",
  "vom"
]);
function expandCompoundTokens(tokens) {
  const out = new Set(tokens);
  for (const t of tokens) {
    const suf = ["salat", "suppe", "toast", "salami"];
    for (const s of suf) {
      if (t.endsWith(s) && t.length > s.length + 2) {
        const base = t.slice(0, -s.length);
        if (base.length >= 3) out.add(base);
      }
    }
  }
  return out;
}
function collectInputTokens(input) {
  const raw = (input.toLowerCase().match(/[a-zäöüß]+/g) ?? []).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return expandCompoundTokens(new Set(raw));
}
function extractPercentHintNumbersFromText(text) {
  const lower = text.toLowerCase();
  const out = [];
  for (const m of lower.matchAll(/(\d{1,2})\s*%/g)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  const m2 = lower.match(/\b(\d{1,2})\s*%?\s*fett\b/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  return [...new Set(out)].filter((n) => n >= 0 && n <= 100);
}
function percentNumbersInFoodName(name) {
  const nums = [];
  for (const m of name.toLowerCase().matchAll(/(\d{1,2})\s*%/g)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) nums.push(n);
  }
  return [...new Set(nums)];
}
function percentSpecScore(foodNameLower, wanted) {
  if (wanted.length === 0) return 0;
  const inName = percentNumbersInFoodName(foodNameLower);
  let s = 0;
  for (const w of wanted) {
    if (inName.includes(w)) s += 120;
    else if (inName.some((n) => Math.abs(n - w) <= 1 && n !== w)) s += 55;
    else if (inName.length > 0 && !inName.some((n) => Math.abs(n - w) <= 2)) s -= 85;
  }
  return s;
}
function nameMatchesNumericToken(name, token) {
  const raw = token.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return false;
  const escaped = raw.replace(/\./g, "\\.");
  const re = new RegExp(`(?:^|[^0-9])${escaped}(?:\\s*%|[^0-9%]|%|$)`, "i");
  return re.test(name);
}
var MEAL_AI_MIN_SEMANTIC_SCORE = 20;
function mealTextDescribesSingleComposedDish(userText) {
  const lower = userText.trim().toLowerCase();
  if (lower.length < 6) return false;
  if (/^(nudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|lasagne|pizza|burger|auflauf|curry|reis|risotto|eintopf|suppe|salat|bowl)\b/i.test(
    lower
  ) && /\bmit\b/.test(lower)) {
    return true;
  }
  if (/\b(überbacken|uberbacken|gratin|carbonara|bolognese|arrabiata)\b/i.test(lower)) return true;
  return false;
}
function extractMealBrandHint(userText) {
  const t = userText.trim();
  if (!t) return null;
  const von = t.match(/\b(?:von|bei|from)\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß0-9&'. -]{1,48})/i);
  if (!von) return null;
  const brand = von[1].trim().replace(/\s*[,;].*$/, "").trim();
  return brand.length >= 2 ? brand : null;
}
function extractMealTextSegments(userText) {
  const t = normalizeGermanMealInputForRanking(userText);
  if (t.length < 2) return [];
  if (mealTextDescribesSingleComposedDish(t)) return [t];
  const parts = t.split(/\s*[,;+]\s*|\s+(?:und|plus|sowie|dazu)\s+/i).map((s) => s.trim().replace(/^[\d.,]+\s*(scheiben?|stück|stk\.?|x)\s+/i, "").trim()).filter((s) => s.length >= 2);
  if (parts.length >= 2) return parts.slice(0, 8);
  return [t];
}
function tokenCoverageRatio(tokens, foodNameLower) {
  if (tokens.size === 0) return 0;
  let hit = 0;
  for (const tok of tokens) {
    if (foodNameLower.includes(tok)) hit++;
  }
  return hit / tokens.size;
}
function scoreFoodRelevanceForMealText(food, queryText) {
  const normalized = normalizeGermanMealInputForRanking(queryText);
  const lower = normalized.toLowerCase().trim();
  if (!lower) return 0;
  const tokens = collectInputTokens(normalized);
  const fn = food.name.toLowerCase();
  const fnNorm = normalizeName(food.name);
  let score = 0;
  if (fnNorm === normalizeName(normalized)) score += 140;
  if (lower.length >= 4 && fn.includes(lower)) score += 95;
  if (lower.length >= 4 && lower.includes(fnNorm) && fnNorm.length >= 4) score += 75;
  const coverage = tokenCoverageRatio(tokens, fn);
  score += Math.round(coverage * 55);
  if (tokens.size >= 2 && coverage < 0.34) score -= 70;
  if (fn.length > 78) score -= 28;
  if (/\|/.test(food.name)) score -= 18;
  score += extractPercentHintNumbersFromText(queryText).length > 0 ? percentSpecScore(food.name, extractPercentHintNumbersFromText(queryText)) : 0;
  score += scoreFoodRelevanceCompoundPenalties(fn, lower);
  if (/leberk[aä]s|leberkaas|fleischk[aä]se/i.test(lower)) {
    if (/fleischkäse|leberkaas|leberkäse/i.test(fn)) score += 85;
    if (/leberwurst/i.test(fn) && !/fleischkäse|leberkaas|leberkäse/i.test(fn)) score -= 110;
  }
  if (/\bapfel\b/i.test(lower) && /\bapfel\b/i.test(fn)) score += 90;
  if (/\bapfel\b/i.test(lower) && /müsli|muesli|cornflakes|crunch/i.test(fn)) score -= 90;
  const brand = extractMealBrandHint(queryText);
  if (brand) {
    const brandTokens = collectInputTokens(brand);
    let brandHits = 0;
    for (const tok of brandTokens) {
      if (fn.includes(tok)) brandHits++;
    }
    if (brandHits > 0) score += Math.min(80, 22 * brandHits);
  }
  return score;
}
function applyContextualMealRankingBonuses(score, food, lower, tokens) {
  let s = score;
  const fn = food.name.toLowerCase();
  const wantedPerc = extractPercentHintNumbersFromText(lower);
  const wantsDeli = lower.includes("wurst") || lower.includes("debrez") || lower.includes("knackwurst") || lower.includes("bockwurst") || lower.includes("aufschnitt") || lower.includes("lyoner") || lower.includes("schinken");
  const deliHints = /wurst|debreziner|debrecziner|knackwurst|bockwurst|schinken|salami|mortadella|lyoner|bierwurst|bratwurst|leberwurst|leberkäs|fleischkäse|mett|speck|prosciutto|pute|hähnchen|hühnchen/i;
  const wurstSaladVegHints = /gurke|zwiebel|paprika|tomate/i;
  const sandwichBread = /\bsemmel\b|brötchen|weckerl|sandwich|belegte?\s*semmel|stulle|brotzeit|weizenbrötchen/i.test(
    lower
  );
  const wantsBratenAsSandwich = sandwichBread && /\bbraten\b|schweinebraten|schweinsbraten|rostbraten|braten-?semmel/i.test(lower);
  const wantsSweetMustard = /sü(ß|ss)(er?)?\s*senf|senf.*sü(ß|ss)|bayerisch(er)?\s*senf|wei(ß|ss)wurstsenf|sü(ß|ss?)senf/i.test(
    lower
  );
  const wantsHotMustard = /\bscharf(er)?\s*senf|senf.*scharf|mittelscharf|dijon|meerrettichsenf/i.test(lower);
  const wantsPastaDish = /\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|maccaroni|makkaroni|lasagne\b/i.test(lower);
  const wantsPizzaDish = /\bpizza|pizzateig\b/i.test(lower);
  const wantsBreadDish = /\bsemmel|brötchen|sandwich|toast\b/i.test(lower);
  if (wantsPastaDish && !wantsPizzaDish) {
    if (/pizzateig|pizza\b|pizzarolle/i.test(fn)) s -= 200;
    if (/nudel|pasta|spaghetti|penne|fusilli|tagliatelle|teigwaren/i.test(fn)) s += 45;
  }
  if (wantsPizzaDish && !wantsPastaDish) {
    if (/^nudel|pasta gekocht|spaghetti gekocht/i.test(fn)) s -= 80;
    if (/pizzateig|pizza\b/i.test(fn)) s += 40;
  }
  if (wantsBreadDish && /pizzateig|pasta gekocht|nudeln gekocht/i.test(fn)) s -= 60;
  if (wantedPerc.length > 0) s += percentSpecScore(food.name, wantedPerc);
  for (const tok of tokens) {
    if (fn.includes(tok)) s += 10;
  }
  if (wantsBratenAsSandwich) {
    if (/\bbraten\b|schweinebraten|schweinsbraten|rostbraten/i.test(fn) && !/bratwurst|würstchen|wiener|nuernberger|nürnberger/i.test(fn)) {
      s += 95;
    }
    if (/bratwurst|nuernberger|nürnberger|wiener\s*würstchen/i.test(fn)) s -= 110;
  }
  if (wantsSweetMustard && /senf/.test(fn)) {
    if (/sü(ß|ss)|bayerisch/i.test(fn)) s += 70;
    if (/mittelscharf|dijon|sriracha|scharf/i.test(fn)) s -= 55;
  }
  if (wantsHotMustard && /senf/.test(fn)) {
    if (/mittelscharf|dijon/i.test(fn)) s += 55;
    if (/sü(ß|ss)|bayerisch/i.test(fn)) s -= 45;
  }
  if (wantsDeli && deliHints.test(fn)) s += 35;
  if ((wantsDeli || lower.includes("salat")) && food.category === "vegetable" && wurstSaladVegHints.test(fn)) {
    s += 18;
  }
  const looksLeberkaese = /leberkas|leberkäse|leberkaas|fleischkäse/i.test(lower) || [...tokens].some((tk) => /leberkas|leberkäse|leberkaas|fleischkäse/i.test(tk));
  if (looksLeberkaese && /leberwurst/i.test(fn) && !/fleischkäse|leberkaas|leberkäse/i.test(fn)) {
    s -= 120;
  }
  return s;
}
function rankFoodsForMealDescription(input, maxCount = 260, pool2 = []) {
  const normalized = normalizeGermanMealInputForRanking(input);
  const lower = normalized.toLowerCase().trim();
  const tokens = collectInputTokens(normalized);
  const wantsPastaDish = /\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|maccaroni|makkaroni|lasagne\b/i.test(lower);
  const wantsPizzaDish = /\bpizza|pizzateig\b/i.test(lower);
  const scored = pool2.map((food) => {
    let score = scoreFoodRelevanceForMealText(food, normalized);
    score = applyContextualMealRankingBonuses(score, food, lower, tokens);
    const fn = food.name.toLowerCase();
    if (wantsPastaDish && !wantsPizzaDish) {
      if (/tomaten(sauce|soße|sose)|passata|sugo/i.test(fn)) score += 28;
      if (/sahne|rahm|schmand|creme fraiche|käse|kaese|mozzarella|parmesan|gratink/i.test(fn)) score += 18;
    }
    const words = fn.split(/[\s(),\-\/]+/).filter((w) => w.length >= 3);
    for (const w of words) {
      if (lower.includes(w)) score += 8;
    }
    return { food, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const maxPick = Math.min(maxCount, 56);
  const top = scored[0]?.score ?? 0;
  let picked = scored.filter((s) => s.score >= Math.max(MEAL_AI_MIN_SEMANTIC_SCORE, top * 0.5)).slice(0, maxPick).map((s) => s.food);
  if (picked.length < 6) {
    picked = scored.filter((s) => s.score >= 14).slice(0, maxPick).map((s) => s.food);
  }
  if (picked.length < 3 && top > 10) {
    picked = scored.filter((s) => s.score > 0).slice(0, maxPick).map((s) => s.food);
  }
  return picked;
}
function formatAllowedFoodLinesForPrompt(foods, maxLines = 80) {
  const total = foods.length;
  const slice = foods.slice(0, maxLines);
  const body = slice.map((f) => `- ${f.name}`).join("\n");
  const lines = total > maxLines ? `${body}
\u2026 (${total - maxLines} weitere Kandidaten ausgeblendet \u2014 nur sichtbare Zeilen verwenden oder Position weglassen)` : body;
  return { lines, truncated: total > maxLines, total };
}
function scoreFoodRelevanceCompoundPenalties(foodNameLower, queryLower) {
  let p = 0;
  const fn = foodNameLower;
  const q = queryLower;
  if ((/\bsemmel\b|\bbrötchen\b|\bwecken\b|\bbrot\b/.test(q) || /\bleberk[aä]ssemmel\b/.test(q)) && /\bknödel\b|\bklöß|\bkloß/.test(fn) && !/\bknödel\b/.test(q)) {
    p -= 95;
  }
  if (/\bnudel|pasta|spaghetti|penne|auflauf/i.test(q) && /\bknödel\b|\bsemmel\b|\bbrötchen\b/.test(fn) && !/\bknödel|semmel|brötchen\b/.test(q)) {
    p -= 95;
  }
  if (/\bleberk|fleischk[aä]se|leberkaas/i.test(q) && /\bdebrezin|debrecziner\b/.test(fn) && !/\bdebrez/i.test(q)) {
    p -= 70;
  }
  if (/\btomat|sahne|soße|sose|sauce|käse|kaese/i.test(q) && /\bmüsli|cornflakes|schokolade\b/.test(fn)) {
    p -= 60;
  }
  return p;
}
function collectOffQueriesFromInterpretedGroups(groups, userText = "") {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const g of groups) {
    const mode = inferMealItemTrackingMode(g, userText);
    if (g.label.trim().length >= 2) add(g.label);
    if (mode === "product" || mode === "auto") {
      for (const q of buildOffSearchQueriesForPhrase(g.label, userText)) add(q);
    }
    for (const row of g.parsed) {
      add(row.name);
      const stripped = row.name.replace(/^\d+(?:[.,]\d+)?\s*(scheiben?|stück|stk\.?|x)\s+/i, "").trim();
      if (stripped.length >= 3) add(stripped);
      for (const tok of collectInputTokens(stripped || row.name)) {
        if (tok.length >= 4) add(tok);
      }
    }
  }
  return out.slice(0, 16);
}
function buildOffSearchQueriesForPhrase(phrase, userText) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const t = q.trim();
    const k = t.toLowerCase();
    if (t.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  const p = phrase.trim();
  if (p.length < 2) return out;
  add(p);
  const withoutBrand = p.replace(/\s+(?:von|bei|from)\s+.+$/i, "").trim();
  if (withoutBrand.length >= 2 && withoutBrand.toLowerCase() !== p.toLowerCase()) add(withoutBrand);
  const brand = extractMealBrandHint(userText);
  if (brand) {
    const core = withoutBrand.length >= 2 ? withoutBrand : p;
    if (!core.toLowerCase().includes(brand.toLowerCase())) add(`${core} ${brand}`);
  }
  const tokens = [...collectInputTokens(p)].filter((t) => t.length >= 3);
  if (tokens.length >= 2) add(tokens.join(" "));
  if (tokens.length >= 3) add(tokens.slice(0, 3).join(" "));
  return out.slice(0, 5);
}
function collectOffQueriesForTextMealAnalysis(groups, userText) {
  const flat = flattenDecomposedMealItems(groups);
  const fromGroups = collectOffQueriesFromInterpretedGroups(groups, userText);
  const fromObserved = buildTextOffSearchQueries(flat, userText);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const q of [...fromGroups, ...fromObserved]) add(q);
  for (const seg of extractMealTextSegments(userText).slice(0, 8)) {
    add(seg);
    for (const q of buildOffSearchQueriesForPhrase(seg, userText)) add(q);
  }
  for (const row of flat) {
    for (const q of buildOffSearchQueriesForPhrase(row.name, userText)) add(q);
  }
  const norm2 = normalizeGermanMealInputForRanking(userText);
  if (norm2.length >= 2 && norm2.length <= 80) add(norm2);
  return out.slice(0, 18);
}
function collectOffQueriesForUnmatchedItems(unmatched, userText, maxItems = 6) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const row of unmatched.slice(0, maxItems)) {
    for (const q of buildOffSearchQueriesForPhrase(row.name, userText)) add(q);
  }
  return out.slice(0, 12);
}
function assignIngredientsToDecomposedMealGroups(groups, ingredients, pool2) {
  const usedIng = /* @__PURE__ */ new Set();
  const ingKey = (ing) => `${ing.id ?? ""}|${normalizeName(ing.name)}|${ing.amount}|${ing.unit}`;
  const mealItemGroups = [];
  const unmatched = [];
  const claimIngredient = (ing) => {
    const k = ingKey(ing);
    if (usedIng.has(k)) return false;
    usedIng.add(k);
    return true;
  };
  for (const g of groups) {
    const label = g.label.trim() || "Mahlzeit";
    const stripped = stripSelfReferentialDecomposeRows(label, g.parsed, pool2);
    const rows = normalizeDecomposedParsedItems(stripped);
    const groupIngs = [];
    for (const row of rows) {
      const phrase = row.name.trim();
      if (!phrase) continue;
      let bestIng = null;
      let bestScore = MEAL_AI_MIN_SEMANTIC_SCORE - 1;
      for (const ing of ingredients) {
        if (usedIng.has(ingKey(ing))) continue;
        const food = (ing.id && !String(ing.id).startsWith("est_") ? pool2.find((f) => f.id === ing.id) : null) ?? matchFoodExactFromPool(ing.name, pool2);
        if (!food) continue;
        const s = Math.max(
          scoreFoodRelevanceForMealText(food, phrase),
          scoreFoodRelevanceForMealText(food, ing.name) * 0.9
        );
        if (s > bestScore && parenMatchAllowsDbLink(phrase, food.name)) {
          bestScore = s;
          bestIng = ing;
        }
      }
      if (bestIng && claimIngredient(bestIng)) {
        groupIngs.push(bestIng);
      } else {
        unmatched.push(row);
      }
    }
    const ingSan = stripSelfReferentialResolvedIngredients(label, groupIngs, pool2);
    if (ingSan.length > 0) {
      mealItemGroups.push({ label, ingredients: ingSan });
    } else if (rows.length === 0) {
      unmatched.push({ name: label, amount: 1, unit: "g" });
    }
  }
  for (const ing of ingredients) {
    if (!usedIng.has(ingKey(ing))) {
      const orphanLabel = ing.name.trim() || "Mahlzeit";
      const existing = mealItemGroups.find((g) => decomposeLabelsTitleEquivalent(g.label, orphanLabel));
      if (existing && claimIngredient(ing)) {
        existing.ingredients.push(ing);
      } else if (claimIngredient(ing)) {
        mealItemGroups.push({ label: orphanLabel, ingredients: [ing] });
      }
    }
  }
  return { mealItemGroups, unmatched };
}
function resolveMealGroupsAgainstFoodPool(groups, fullPool, userText) {
  const mealItemGroups = [];
  const unmatched = [];
  const ctx = userText.trim();
  for (const g of groups) {
    const label = g.label.trim() || "Mahlzeit";
    const mode = inferMealItemTrackingMode(g, ctx);
    const stripped = stripSelfReferentialDecomposeRows(label, g.parsed, fullPool);
    const rows = normalizeDecomposedParsedItems(stripped);
    if (mode === "product" || mode === "auto") {
      const whole = tryResolveMealItemAsWholeProduct(label, rows, fullPool, ctx);
      if (whole) {
        mealItemGroups.push({ label, ingredients: [whole] });
        continue;
      }
      if (mode === "product" && rows.length <= 1) {
        unmatched.push(
          rows[0] ?? { name: label, amount: 1, unit: looksLikePreparedDishLabel(label) ? "stk" : "g" }
        );
        continue;
      }
    }
    const ingredients = [];
    for (const row of rows) {
      const phrase = row.name.trim();
      if (!phrase) continue;
      const rankQuery = `${phrase} ${label} ${ctx}`.slice(0, 140);
      const localCandidates = rankFoodsForMealDescription(rankQuery, 32, fullPool);
      const poolSlice = localCandidates.length >= 3 ? localCandidates : fullPool;
      let food = findBestSemanticFoodForPhrase(phrase, poolSlice);
      let score = food ? scoreFoodRelevanceForMealText(food, phrase) : 0;
      if (!food || score < MEAL_AI_MIN_SEMANTIC_SCORE) {
        const alt = findBestSemanticFoodForPhrase(phrase, fullPool);
        const altScore = alt ? scoreFoodRelevanceForMealText(alt, phrase) : 0;
        if (alt && altScore > score) {
          food = alt;
          score = altScore;
        }
      }
      if (food && score >= MEAL_AI_MIN_SEMANTIC_SCORE && parenMatchAllowsDbLink(phrase, food.name)) {
        ingredients.push(ingredientFromParsedItem(row, food));
      } else {
        unmatched.push(row);
      }
    }
    const ingSan = stripSelfReferentialResolvedIngredients(label, ingredients, fullPool);
    if (ingSan.length > 0) {
      mealItemGroups.push({ label, ingredients: ingSan });
    } else if (rows.length === 0) {
      unmatched.push({ name: label, amount: 1, unit: "g" });
    }
  }
  return { mealItemGroups, unmatched };
}
function visionObservedSummaryText(items) {
  return items.map((i) => {
    const n = i.name.trim();
    if (!n) return "";
    const amt = Number.isFinite(i.amount) && i.amount > 0 ? i.amount : 1;
    const u = (i.unit || "g").trim();
    return `${n} (${amt} ${u})`;
  }).filter(Boolean).join("; ");
}
function buildVisionOffSearchQueries(visionItems, userText) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  if (userText.trim().length >= 2) {
    for (const seg of extractMealTextSegments(userText).slice(0, 6)) add(seg);
  }
  for (const item of visionItems) {
    const n = item.name.trim();
    if (n.length >= 2) add(n);
    for (const q of buildOffSearchQueriesForPhrase(n, userText)) add(q);
  }
  return out.slice(0, 18);
}
function collectOffQueriesForVisionAnalysis(observed, userText) {
  const ctx = userText.trim() || observed.map((i) => i.name).join(", ");
  const groups = observed.map((row) => ({
    label: row.name.trim() || "Mahlzeit",
    parsed: [row],
    tracking: "auto"
  }));
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const q of collectOffQueriesForTextMealAnalysis(groups, ctx)) add(q);
  for (const q of buildVisionOffSearchQueries(observed, userText)) add(q);
  return out.slice(0, 20);
}
function buildTextOffSearchQueries(observedItems, userText) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (q) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const seg of extractMealTextSegments(userText).slice(0, 8)) {
    add(seg);
    for (const q of buildOffSearchQueriesForPhrase(seg, userText)) add(q);
  }
  for (const item of observedItems) {
    const n = item.name.trim();
    if (n.length >= 2) add(n);
    const stripped = n.replace(/^\d+(?:[.,]\d+)?\s*(scheiben?|stück|stk\.?|x)\s+/i, "").trim();
    if (stripped.length >= 3) add(stripped);
    for (const tok of collectInputTokens(stripped || n)) {
      if (tok.length >= 4) add(tok);
    }
  }
  const norm2 = normalizeGermanMealInputForRanking(userText);
  if (observedItems.length === 0 && norm2.length >= 2 && norm2.length <= 48) add(norm2);
  return out.slice(0, 12);
}
function rankFoodPoolFromMultipleQueries(queries, pool2, maxCount = 260) {
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const q of queries) {
    for (const f of rankFoodsForMealDescription(q, maxCount, pool2)) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        merged.push(f);
      }
      if (merged.length >= maxCount) break;
    }
    if (merged.length >= maxCount) break;
  }
  if (merged.length === 0 && queries.length > 0) {
    return rankFoodsForMealDescription(queries.join(" "), maxCount, pool2);
  }
  return merged.slice(0, maxCount);
}
function resolveCandidateFoodsForAnalysis(userText, hasImage, pool2 = [], observedItems = []) {
  const t = userText.trim();
  let picked = [];
  if (observedItems.length > 0) {
    const queries = hasImage ? buildVisionOffSearchQueries(observedItems, t) : buildTextOffSearchQueries(observedItems, t);
    if (queries.length > 0) {
      picked = rankFoodPoolFromMultipleQueries(queries, pool2, 120).slice(0, 56);
    }
  }
  if (picked.length === 0 && t.length >= 2) {
    if (!mealTextDescribesSingleComposedDish(t)) {
      const segments = extractMealTextSegments(t);
      if (segments.length >= 2) {
        picked = rankFoodPoolFromMultipleQueries(segments, pool2, 120).slice(0, 56);
      }
    }
    if (picked.length === 0) {
      picked = rankFoodsForMealDescription(t, 56, pool2);
    }
  }
  if (picked.length === 0 && pool2.length > 0) {
    picked = rankFoodsForMealDescription(t || "mahlzeit", 40, pool2);
  }
  if (hasImage && picked.length === 0) return rankFoodsForMealDescription("", 40, pool2);
  return picked;
}
function findBestSemanticFoodForPhrase(phrase, pool2) {
  const q = phrase.trim();
  if (!q || pool2.length === 0) return null;
  const exact = matchFoodExactFromPool(q, pool2);
  if (exact) return exact;
  let best = null;
  let bestScore = MEAL_AI_MIN_SEMANTIC_SCORE - 1;
  for (const food of pool2) {
    const s = scoreFoodRelevanceForMealText(food, q);
    if (s > bestScore && parenMatchAllowsDbLink(q, food.name)) {
      bestScore = s;
      best = food;
    }
  }
  return best;
}
function parseDataUrl(dataUrl) {
  const m = dataUrl.trim().match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].trim() || "image/jpeg", data: m[2].replace(/\s/g, "") };
}
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}
function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/\(.*\)/g, "").trim();
}
function parenQualifiersLower(name) {
  const out = [];
  for (const m of name.toLowerCase().matchAll(/\(\s*([^)]*?)\s*\)/g)) {
    const q = m[1].trim();
    if (q) out.push(q);
  }
  return out;
}
function parenMatchAllowsDbLink(userRequested, dbFoodName) {
  const uq = parenQualifiersLower(userRequested);
  if (uq.length === 0) return true;
  const fq = parenQualifiersLower(dbFoodName);
  if (fq.length > 0) return uq.join("|") === fq.join("|");
  const wantedPerc = extractPercentHintNumbersFromText(userRequested);
  if (wantedPerc.length > 0 && uq.every((q) => /^\d+([.,]\d+)?\s*%?$/.test(q.replace(/\s/g, "")))) {
    const inName = percentNumbersInFoodName(dbFoodName);
    if (wantedPerc.some((w) => inName.includes(w))) return true;
  }
  return false;
}
function findBestFoodMatch(foodName, pool2 = []) {
  return findBestFoodMatchWithHint(foodName, pool2);
}
function findBestFoodMatchWithHint(foodName, pool2 = []) {
  const normalized = normalizeName(foodName);
  const wantedPerc = extractPercentHintNumbersFromText(foodName);
  const candidates = [];
  const threshold = 6;
  for (const food of pool2) {
    const foodNormalized = normalizeName(food.name);
    const distance = levenshteinDistance(normalized, foodNormalized);
    if (foodNormalized === normalized && parenMatchAllowsDbLink(foodName, food.name)) {
      return food;
    }
    if (distance <= threshold && parenMatchAllowsDbLink(foodName, food.name)) {
      candidates.push({ food, distance });
    }
  }
  if (candidates.length === 0) {
    let bestMatch = null;
    let bestScore = Infinity;
    for (const food of pool2) {
      const foodNormalized = normalizeName(food.name);
      const distance = levenshteinDistance(normalized, foodNormalized);
      if ((foodNormalized.includes(normalized) || normalized.includes(foodNormalized.split(" ")[0])) && parenMatchAllowsDbLink(foodName, food.name)) {
        if (distance < bestScore) {
          bestScore = distance;
          bestMatch = food;
        }
      }
    }
    return bestMatch;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const bestD = candidates[0].distance;
  const tied = candidates.filter((c) => c.distance <= bestD + 1 && parenMatchAllowsDbLink(foodName, c.food.name)).map((c) => c.food);
  if (tied.length === 0) return null;
  if (tied.length === 1) return tied[0];
  if (wantedPerc.length > 0) {
    const scored = tied.map((food) => ({
      food,
      s: percentSpecScore(food.name, wantedPerc)
    }));
    scored.sort((a, b) => b.s - a.s);
    if (scored[0].s !== scored[1]?.s) return scored[0].food;
  }
  return tied[0];
}
function matchFoodExactFromPool(name, pool2) {
  const raw = name.trim().toLowerCase();
  if (!raw) return null;
  for (const food of pool2) {
    if (food.name.trim().toLowerCase() === raw) return food;
  }
  const norm2 = normalizeName(name);
  for (const food of pool2) {
    if (normalizeName(food.name) !== norm2) continue;
    if (!parenMatchAllowsDbLink(name, food.name)) continue;
    return food;
  }
  return null;
}
function convertToGrams(amount, unit) {
  const unitLower = unit.toLowerCase();
  if (unitLower.includes("g") || unitLower.includes("gram")) return amount;
  if (unitLower.includes("oz")) return amount * 28.35;
  if (unitLower.includes("lb")) return amount * 453.6;
  if (unitLower.includes("ml") || unitLower.includes("l")) return amount;
  if (unitLower.includes("cup") || unitLower.includes("tasse")) return amount * 240;
  if (unitLower.includes("tbsp") || unitLower.includes("el")) return amount * 15;
  if (unitLower.includes("tsp") || unitLower.includes("tl")) return amount * 5;
  return amount;
}
var MEAL_AI_PRODUCT_MATCH_MIN_SCORE = 30;
var PREPARED_DISH_LABEL_HINT = /\b(burger|cheeseburger|hamburger|pizza|pizz|wrap|döner|doner|kebab|lasagne|sandwich|panini|bagel|menü|menu|nuggets|schnitzel|currywurst|auflauf|carbonara|bolognese|risotto|sushi|bowl|burrito|taco|quesadilla|fertig|tiefkühl|tiefkuehl|frozen|ready\s*meal|fertiggericht)\b/i;
var SIMPLE_WHOLE_FOOD_HINT = /^(apfel|äpfel|banane|birne|orange|mandarine|joghurt|yogurt|milch|wasser|kaffee|tee|ei|eier|tomate|gurke|karotte|möhre|mozzarella|butter|honig|nuss|nüsse|beere|beeren|traube|trauben)(\s|$)/i;
function looksLikePreparedDishLabel(text) {
  const t = text.trim();
  if (t.length < 4) return false;
  if (PREPARED_DISH_LABEL_HINT.test(t)) return true;
  if (/\bmit\s+(soße|sauce|käse|kaese|salat|pommes|reis|nudeln)\b/i.test(t)) return false;
  return false;
}
function isLikelySingleWholeFood(name) {
  const t = name.trim();
  if (t.length < 3 || t.length > 48) return false;
  if (/\bmit\b|,|\+| und /.test(t)) return false;
  if (looksLikePreparedDishLabel(t)) return false;
  if (SIMPLE_WHOLE_FOOD_HINT.test(t)) return true;
  const tokens = [...collectInputTokens(t)];
  return tokens.length <= 2 && t.length <= 24;
}
function inferMealItemTrackingMode(group, _userText) {
  if (group.tracking === "product" || group.tracking === "components") return group.tracking;
  const label = group.label.trim();
  const rows = group.parsed;
  if (rows.length === 0) return looksLikePreparedDishLabel(label) ? "auto" : "product";
  if (rows.length === 1) {
    const rowName = rows[0].name.trim();
    if (isLikelySingleWholeFood(rowName) || isLikelySingleWholeFood(label)) return "product";
    if (looksLikePreparedDishLabel(label) || looksLikePreparedDishLabel(rowName)) return "auto";
    return "auto";
  }
  if (rows.length >= 2) {
    if (looksLikePreparedDishLabel(label) && rows.length >= 2) return "components";
    return "components";
  }
  return "auto";
}
function tryResolveMealItemAsWholeProduct(label, parsed, pool2, userText) {
  if (pool2.length === 0) return null;
  const phrases = /* @__PURE__ */ new Set();
  const add = (p) => {
    const t = p.trim();
    if (t.length >= 2) phrases.add(t);
  };
  add(label);
  if (parsed.length === 1) add(parsed[0].name);
  for (const q of buildOffSearchQueriesForPhrase(label, userText)) add(q);
  const portionRow = parsed.length === 1 ? parsed[0] : { name: label, amount: 1, unit: looksLikePreparedDishLabel(label) ? "stk" : "g" };
  let best = null;
  for (const phrase of phrases) {
    const food = findBestSemanticFoodForPhrase(phrase, pool2);
    if (!food || !isOpenFoodFactsFood(food)) continue;
    const score = Math.max(
      scoreFoodRelevanceForMealText(food, label),
      scoreFoodRelevanceForMealText(food, phrase)
    );
    if (score >= MEAL_AI_PRODUCT_MATCH_MIN_SCORE && (!best || score > best.score)) {
      best = { food, score };
    }
  }
  if (!best) return null;
  return ingredientFromParsedItem(portionRow, best.food);
}
function decomposeFoldKey(s) {
  return normalizeName(s).replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "");
}
function decomposeLabelsTitleEquivalent(label, rowName) {
  const A = decomposeFoldKey(label);
  const B = decomposeFoldKey(rowName);
  if (A.length < 4 || B.length < 4) return false;
  if (A === B) return true;
  const maxL = Math.max(A.length, B.length);
  if (maxL <= 28 && levenshteinDistance(A, B) <= 1) return true;
  return false;
}
function isSelfReferentialDecomposeRow(label, row, pool2) {
  if (decomposeLabelsTitleEquivalent(label, row.name)) return true;
  const exact = matchFoodExactFromPool(row.name, pool2);
  if (exact?.compositeIngredients?.length && decomposeLabelsTitleEquivalent(label, exact.name)) return true;
  if (exact) return false;
  const fuzzy = findBestFoodMatch(row.name, pool2);
  if (fuzzy?.compositeIngredients?.length && decomposeLabelsTitleEquivalent(label, fuzzy.name)) {
    const fn = decomposeFoldKey(fuzzy.name);
    const rn = decomposeFoldKey(row.name);
    if (fn === rn || levenshteinDistance(fn, rn) <= 2) return true;
  }
  return false;
}
function stripSelfReferentialDecomposeRows(label, parsed, pool2) {
  return parsed.filter((row) => !isSelfReferentialDecomposeRow(label, row, pool2));
}
function mergeParsedFoodItemsByNameUnit(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const u = (r.unit || "g").trim().toLowerCase();
    const k = `${normalizeName(r.name)}|${u}`;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...r, unit: u });
    else map.set(k, { ...prev, amount: prev.amount + r.amount });
  }
  return [...map.values()];
}
function dedupeDecomposedMealItemsByLabel(groups) {
  const map = /* @__PURE__ */ new Map();
  for (const g of groups) {
    const key = decomposeFoldKey(g.label) || normalizeName(g.label).replace(/\s+/g, "") || g.label.trim().toLowerCase();
    if (!key) continue;
    const ex = map.get(key);
    if (!ex) map.set(key, { label: g.label, parsed: [...g.parsed], tracking: g.tracking });
    else {
      ex.parsed.push(...g.parsed);
      if (g.tracking === "components") ex.tracking = "components";
      else if (!ex.tracking && g.tracking) ex.tracking = g.tracking;
    }
  }
  return [...map.values()].map((h) => ({
    label: h.label,
    parsed: mergeParsedFoodItemsByNameUnit(h.parsed),
    tracking: h.tracking
  }));
}
function stripSelfReferentialResolvedIngredients(label, ingredients, pool2) {
  return ingredients.filter((ing) => {
    if (decomposeLabelsTitleEquivalent(label, ing.name)) return false;
    const id = ing.id != null ? String(ing.id).trim() : "";
    let food;
    if (id && !id.startsWith("est_")) food = pool2.find((x) => x.id === id);
    if (!food) {
      const hit = matchFoodExactFromPool(ing.name, pool2);
      if (hit) food = hit;
    }
    if (food?.compositeIngredients?.length && decomposeLabelsTitleEquivalent(label, food.name)) return false;
    return true;
  });
}
function extractDecomposedMealItemsFromAiContent(content, userQueryFallbackLabel) {
  const fallbackLabel = userQueryFallbackLabel.trim().replace(/\r?\n+/g, " ").slice(0, 120) || "Mahlzeit";
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr);
    const mealItemsRaw = parsed.meal_items;
    if (Array.isArray(mealItemsRaw) && mealItemsRaw.length > 0) {
      const out = [];
      for (const rawGroup of mealItemsRaw) {
        if (!rawGroup || typeof rawGroup !== "object") continue;
        const g = rawGroup;
        const label = typeof g.label === "string" && g.label.trim() ? g.label.trim().slice(0, 200) : fallbackLabel;
        const ingArr = g.ingredients;
        if (!Array.isArray(ingArr) || ingArr.length === 0) continue;
        const parsedRows = ingArr.map(parseParsedFoodItemRow).filter((x) => x !== null);
        if (parsedRows.length === 0) continue;
        const tr = g.tracking;
        let tracking;
        if (tr === "product" || tr === "components" || tr === "auto") tracking = tr;
        out.push({ label, parsed: parsedRows, ...tracking ? { tracking } : {} });
      }
      if (out.length > 0) return out;
    }
    const flat = extractIngredientsFromAiContent(content);
    if (flat.length > 0) return [{ label: fallbackLabel, parsed: flat }];
    return [];
  } catch {
    return [];
  }
}
function flattenDecomposedMealItems(items) {
  return items.flatMap((m) => m.parsed);
}
var SLICE_PRODUCT_HINT = /leberk|leberka|fleischk|lyoner|mortadell|salami|schinken|aufschnitt|rohwurst|gelbwurst|bierschinken|extrawurst|käse|kaese|schnittk|emment|gouda|tilsit|brie|camembert|scheiben|wurst|pastete|braten/i;
function isStkLikeUnit(unit) {
  const u = (unit || "").toLowerCase().trim().replace(/\./g, "");
  if (!u) return false;
  if (u === "stk" || u === "st\xFCck" || u === "stueck" || u === "stuck") return true;
  if (/\bstk\b/.test(u) || u.includes("st\xFCck") || u.includes("stueck")) return true;
  return false;
}
function looksLikeSliceableProductName(name) {
  return SLICE_PRODUCT_HINT.test((name || "").trim());
}
function normalizeDecomposedParsedItems(rows) {
  return rows.map((row) => {
    let { name, amount, unit } = row;
    if (!Number.isFinite(amount) || amount <= 0) amount = 1;
    if (!isStkLikeUnit(unit)) return { name, amount, unit };
    const whole = Math.round(amount);
    const isInteger = Math.abs(amount - whole) < 1e-6;
    if (isInteger && whole >= 1) return { name, amount: whole, unit: "stk" };
    if (looksLikeSliceableProductName(name)) {
      const grams = Math.max(25, Math.round(amount * 120));
      return { name, amount: grams, unit: "g" };
    }
    return { name, amount: Math.max(1, whole || 1), unit: "stk" };
  });
}
function stripAiJsonPayload(raw) {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1].trim();
  return s;
}
function extractBalancedJsonObject(s) {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"' && !escape) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}
function extractModelJsonObjectString(content) {
  const cleaned = stripAiJsonPayload(String(content ?? ""));
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
  }
  const bal = extractBalancedJsonObject(cleaned);
  if (!bal) return null;
  try {
    JSON.parse(bal);
    return bal;
  } catch {
    return bal;
  }
}
function parseParsedFoodItemRow(raw) {
  const o = raw;
  const name = typeof o.name === "string" ? o.name : "";
  const amount = typeof o.amount === "number" ? o.amount : parseFloat(String(o.amount ?? "0")) || 0;
  const unit = typeof o.unit === "string" ? o.unit : "g";
  if (!name.trim()) return null;
  return normalizeAiParsedFoodPortion({ name: name.trim(), amount, unit });
}
function extractIngredientsFromAiContent(content) {
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr);
    const ing = parsed.ingredients;
    if (!Array.isArray(ing)) return [];
    return ing.map(parseParsedFoodItemRow).filter((x) => x !== null);
  } catch {
    return [];
  }
}
function extractVisionObservedFromAiContent(content) {
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr);
    const arr = parsed.observed ?? parsed.items ?? parsed.ingredients;
    if (!Array.isArray(arr)) return [];
    return arr.map(parseParsedFoodItemRow).filter((x) => x !== null);
  } catch {
    return [];
  }
}
function parseSimpleDescription(description) {
  const items = [];
  const chunks = description.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const m = chunk.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb)?$/i);
    if (m) {
      const amt = parseFloat(m[2].replace(",", "."));
      items.push({ name: m[1].trim(), amount: amt, unit: m[3] || "g" });
    } else if (chunk.length > 1 && chunk.length < 120) {
      items.push({ name: chunk, amount: 100, unit: "g" });
    }
  }
  return items;
}
function pieceGramsForMatchedFood(food) {
  const pp = "perPiece" in food ? food.perPiece : void 0;
  return pp && pp > 0 ? pp : inferStueckGramsFromFood(food);
}
function gramsFromQtyUnitForFood(qty, unit, food) {
  const u = (unit || "g").toLowerCase().replace(/\./g, "");
  const stkG = pieceGramsForMatchedFood(food);
  const doseG = inferDoseGramsFromFood(food);
  const glasMl = inferGlasMlFromFood(food);
  const flascheMl = inferFlascheGramsFromFood(food);
  const scheibeG = inferScheibeGramsFromFood(food);
  const portionG = inferPortionGramsFromFood(food);
  const map = {
    g: 1,
    ml: 1,
    tl: 5,
    el: 15,
    stk: stkG,
    st\u00FCck: stkG,
    stueck: stkG,
    scheibe: scheibeG ?? stkG,
    slice: scheibeG ?? stkG,
    portion: portionG ?? stkG,
    dose: doseG ?? void 0,
    glas: glasMl ?? void 0,
    flasche: flascheMl ?? void 0
  };
  const mul = map[u];
  if (mul != null && mul > 0) return Math.max(0, qty * mul);
  const fb = Math.max(1, food.servings?.find((s) => s.grams > 0)?.grams ?? 100);
  if (u === "dose") return Math.max(0, qty * fb);
  if (u === "glas") return Math.max(0, qty * (glasMl ?? fb));
  if (u === "flasche") return Math.max(0, qty * (flascheMl ?? fb));
  return Math.max(0, convertToGrams(qty, unit));
}
function ingredientFromFoodQtyUnit(food, qty, unit) {
  const gramsTotal = gramsFromQtyUnitForFood(qty, unit, food);
  const safeGrams = gramsTotal > 0 ? gramsTotal : Math.max(1, food.servings[0]?.grams || 100);
  const ratio = safeGrams / 100;
  const n = food.nutrients;
  const nearestServing = food.servings?.length > 0 ? food.servings.reduce(
    (best, s) => Math.abs(s.grams - safeGrams) < Math.abs(best.grams - safeGrams) ? s : best,
    food.servings[0]
  ) : void 0;
  return {
    id: food.id,
    name: food.name,
    amount: qty,
    unit,
    servingName: nearestServing?.name,
    calories: Math.round(n.calories * ratio),
    protein: Math.round(n.protein * ratio * 10) / 10,
    carbs: Math.round(n.carbs * ratio * 10) / 10,
    fat: Math.round(n.fat * ratio * 10) / 10,
    nutrientSource: "database"
  };
}
function ingredientDedupeKey(i) {
  const id = i.id != null ? String(i.id).trim() : "";
  const unitNorm = String(i.unit ?? "").trim().toLowerCase();
  if (id) return `id:${id}|${unitNorm}`;
  return `name:${String(i.name).trim().toLowerCase()}|${unitNorm}`;
}
function mergeTwoIngredients(base, add) {
  return {
    ...base,
    amount: (Number(base.amount) || 0) + (Number(add.amount) || 0),
    calories: Math.round((base.calories || 0) + (add.calories || 0)),
    protein: Math.round(((base.protein || 0) + (add.protein || 0)) * 10) / 10,
    carbs: Math.round(((base.carbs || 0) + (add.carbs || 0)) * 10) / 10,
    fat: Math.round(((base.fat || 0) + (add.fat || 0)) * 10) / 10,
    nutrientSource: base.nutrientSource === "model_estimate" || add.nutrientSource === "model_estimate" ? "model_estimate" : base.nutrientSource ?? add.nutrientSource
  };
}
function collapseDuplicateIngredients(lines) {
  const out = [];
  for (const line of lines) {
    const key = ingredientDedupeKey(line);
    const idx = out.findIndex((o) => ingredientDedupeKey(o) === key);
    if (idx === -1) out.push({ ...line });
    else out[idx] = mergeTwoIngredients(out[idx], line);
  }
  return out;
}
function compositeIngredientsJsonToLines(ciRaw) {
  if (ciRaw == null) return [];
  const arr = typeof ciRaw === "string" ? JSON.parse(ciRaw) : ciRaw;
  if (!Array.isArray(arr)) return [];
  const lines = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item;
    const nm = typeof o.name === "string" ? o.name.trim() : "";
    if (!nm) continue;
    const amount = typeof o.amount === "number" ? o.amount : parseFloat(String(o.amount ?? "0")) || 0;
    const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : "g";
    const id0 = typeof o.id === "string" && o.id.trim() ? o.id.trim() : void 0;
    const cal = typeof o.calories === "number" ? o.calories : parseFloat(String(o.calories ?? "0")) || 0;
    const pr = typeof o.protein === "number" ? o.protein : parseFloat(String(o.protein ?? "0")) || 0;
    const cb = typeof o.carbs === "number" ? o.carbs : parseFloat(String(o.carbs ?? "0")) || 0;
    const ft = typeof o.fat === "number" ? o.fat : parseFloat(String(o.fat ?? "0")) || 0;
    const sn = typeof o.servingName === "string" ? o.servingName : void 0;
    const nsrc = o.nutrientSource === "model_estimate" || o.nutrientSource === "database" ? o.nutrientSource : void 0;
    lines.push({
      ...id0 ? { id: id0 } : {},
      name: nm,
      amount,
      unit,
      ...sn ? { servingName: sn } : {},
      calories: Math.round(cal),
      protein: Math.round(pr * 10) / 10,
      carbs: Math.round(cb * 10) / 10,
      fat: Math.round(ft * 10) / 10,
      ...nsrc ? { nutrientSource: nsrc } : {}
    });
  }
  return lines;
}
function foodNameHintsCondiment(name) {
  return /senf|ketchup|mayo|dressing|so(ß|s)e|sauce|essig|\böl\b|olivenöl|salz|pfeffer|gewürz|kräuter|pesto|remoulade|dip/i.test(
    name.toLowerCase()
  );
}
function clampTotalGramsForAiMatchedFood(grams, food) {
  if (!Number.isFinite(grams)) return Math.max(1, food.servings[0]?.grams || 100);
  const g0 = Math.max(0, grams);
  const n = food.name.toLowerCase();
  const condiment = food.category === "sauce" || food.category === "spice" || food.category === "fat" || foodNameHintsCondiment(n);
  let maxG;
  if (condiment) maxG = 180;
  else if (food.category === "drink") maxG = 1800;
  else if (food.category === "fruit" || food.category === "vegetable") maxG = 750;
  else if (food.category === "protein") maxG = 850;
  else if (food.category === "bakery" || food.category === "sweets") maxG = 550;
  else if (food.category === "snack") maxG = 700;
  else maxG = 1100;
  let minG = 10;
  if (condiment) minG = 2;
  if (food.category === "drink") minG = 20;
  return Math.min(maxG, Math.max(minG, g0));
}
function ingredientFromParsedItem(item, matchedFood) {
  const norm2 = normalizeAiParsedFoodPortion(item);
  const rawUnit = (norm2.unit || "g").toLowerCase();
  let gramsAmount;
  if (/\bstk\b|stück|stueck|piece|pc\b/.test(rawUnit)) {
    gramsAmount = Math.max(0, norm2.amount * pieceGramsForMatchedFood(matchedFood));
  } else {
    gramsAmount = convertToGrams(norm2.amount, norm2.unit || "g");
  }
  if (!Number.isFinite(gramsAmount) || gramsAmount <= 0) {
    gramsAmount = matchedFood.servings[0]?.grams || 100;
  }
  gramsAmount = clampTotalGramsForAiMatchedFood(gramsAmount, matchedFood);
  const preferredUnit = inferDefaultLogPortionForFood(matchedFood).unit;
  const perUnit = gramsFromQtyUnitForFood(1, preferredUnit, matchedFood);
  const safePer = perUnit > 0 ? perUnit : Math.max(1, matchedFood.servings?.find((s) => s.grams > 0)?.grams ?? 100);
  const qty = Math.max(0.25, gramsAmount / safePer);
  const qtyRounded = Math.round(qty * 1e3) / 1e3;
  return ingredientFromFoodQtyUnit(matchedFood, qtyRounded, preferredUnit);
}
function parseCustomFoodDraftFromAi(content, fallbackQuery) {
  const q0 = fallbackQuery.trim() || "Neues Lebensmittel";
  const fallbackDisclaimer = "Unverifizierte Sch\xE4tzung: KI-Antwort war nicht sauber strukturierbar. Bitte Werte vor dem Speichern pr\xFCfen.";
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) throw new Error("no json");
    const parsed = JSON.parse(jsonStr);
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const categoryRaw = typeof parsed.category === "string" ? parsed.category : "readymeal";
    const nper = parsed.nutrients_per_100g;
    const cal = typeof nper?.calories === "number" ? nper.calories : parseFloat(String(nper?.calories ?? "NaN"));
    const pr = typeof nper?.protein === "number" ? nper.protein : parseFloat(String(nper?.protein ?? "NaN"));
    const cb = typeof nper?.carbs === "number" ? nper.carbs : parseFloat(String(nper?.carbs ?? "NaN"));
    const ft = typeof nper?.fat === "number" ? nper.fat : parseFloat(String(nper?.fat ?? "NaN"));
    const disclaim = typeof parsed.disclaimer === "string" && parsed.disclaimer.trim() ? parsed.disclaimer.trim() : fallbackDisclaimer;
    const servingsRaw = parsed.servings;
    const servingsOut = [];
    if (Array.isArray(servingsRaw)) {
      for (const row of servingsRaw) {
        const o = row;
        const sn = typeof o.name === "string" ? o.name.trim() : "";
        const gm = typeof o.grams === "number" ? o.grams : parseFloat(String(o.grams ?? "NaN"));
        if (!sn || !Number.isFinite(gm)) continue;
        const gRounded = Math.max(1, Math.min(2500, Math.round(gm)));
        servingsOut.push({ name: sn, grams: gRounded });
      }
    }
    let servings = servingsOut.filter((s) => Number.isFinite(s.grams));
    const hasSmall = servings.some((s) => Math.abs(s.grams - 100) <= 2);
    if (!hasSmall) servings = [{ name: "100 g", grams: 100 }, ...servings];
    const def = parsed.default_portion;
    const amt = typeof def?.amount === "number" ? def.amount : parseFloat(String(def?.amount ?? "NaN"));
    const unitRaw = typeof def?.unit === "string" ? def.unit.trim().toLowerCase() : "g";
    const allowed = /* @__PURE__ */ new Set(["g", "ml", "stk", "dose", "glas", "flasche", "tl", "el"]);
    const unit = allowed.has(unitRaw) ? unitRaw : "g";
    let defaultAmount = Number.isFinite(amt) && amt > 0 ? amt : unit === "g" || unit === "ml" ? 100 : 1;
    const gppRaw = parsed.grams_per_piece;
    let gramsPerPiece;
    const gpp = typeof gppRaw === "number" ? gppRaw : gppRaw == null ? NaN : parseFloat(String(gppRaw));
    if (Number.isFinite(gpp) && gpp > 0) gramsPerPiece = Math.round(Math.min(2e3, gpp));
    if (unit === "stk" && gramsPerPiece == null) {
      const h = typicalGramsPerPieceFromProductName(name);
      if (h != null) gramsPerPiece = h;
    }
    if (!name) throw new Error("no name");
    return {
      name,
      category: coerceFoodCategory(categoryRaw),
      nutrientsPer100g: {
        calories: Math.max(0, Math.round(Number.isFinite(cal) ? cal : 0)),
        protein: Math.max(0, Math.round((Number.isFinite(pr) ? pr : 0) * 10) / 10),
        carbs: Math.max(0, Math.round((Number.isFinite(cb) ? cb : 0) * 10) / 10),
        fat: Math.max(0, Math.round((Number.isFinite(ft) ? ft : 0) * 10) / 10)
      },
      servings: servings.length > 0 ? servings : [{ name: "100 g", grams: 100 }],
      defaultAmount,
      defaultUnit: unit,
      ...gramsPerPiece !== void 0 ? { gramsPerPiece } : {},
      disclaimer: disclaim
    };
  } catch {
    return {
      name: q0,
      category: "readymeal",
      nutrientsPer100g: { calories: 240, protein: 7, carbs: 40, fat: 5 },
      servings: [{ name: "100 g", grams: 100 }],
      defaultAmount: 100,
      defaultUnit: "g",
      disclaimer: fallbackDisclaimer
    };
  }
}

// src/lib/aiPrompts/loadPrompt.ts
import { existsSync, readFileSync } from "fs";
import path3 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var __dirname = path3.dirname(fileURLToPath2(import.meta.url));
function resolvePromptsRoot() {
  const envRoot = process.env.PROMPTS_DIR?.trim();
  if (envRoot && existsSync(path3.join(envRoot, "workout"))) {
    return path3.resolve(envRoot);
  }
  const candidates = [
    path3.resolve(process.cwd(), "prompts"),
    path3.resolve(__dirname, "prompts"),
    path3.resolve(__dirname, "../../../prompts")
  ];
  for (const dir of candidates) {
    if (existsSync(path3.join(dir, "workout")) && existsSync(path3.join(dir, "nutrition"))) {
      return dir;
    }
  }
  return candidates[0];
}
var PROMPTS_ROOT = resolvePromptsRoot();
var cache3 = /* @__PURE__ */ new Map();
function cacheKey(category, name) {
  return `${category}/${name.replace(/\.md$/i, "")}`;
}
function readPromptFile(category, name) {
  const key = cacheKey(category, name);
  let raw = cache3.get(key);
  if (raw === void 0) {
    const base = name.replace(/\.md$/i, "");
    const filePath = path3.join(PROMPTS_ROOT, category, `${base}.md`);
    raw = readFileSync(filePath, "utf8");
    cache3.set(key, raw);
  }
  return raw;
}
function applyVars(template, vars) {
  let out = template;
  for (const [varKey, value] of Object.entries(vars)) {
    out = out.split(`{{${varKey}}}`).join(value ?? "");
  }
  return out;
}
function loadPrompt(category, name, vars = {}, phase) {
  let raw = readPromptFile(category, name);
  if (raw.includes("---PHASE_MATCH---")) {
    const parts = raw.split("---PHASE_MATCH---");
    raw = phase === "match" ? parts.slice(1).join("---PHASE_MATCH---") : parts[0];
  }
  return applyVars(raw.trim(), vars);
}

// src/lib/aiPrompts/buildMealPrompts.ts
function normalizeUserText(raw) {
  return raw.trim().replace(/\r?\n+/g, " ");
}
function quantityHintsPlaceholder(userQuery) {
  const hints = buildMealQuantityHintsForPrompt(userQuery);
  return hints ? `
${hints}
` : "";
}
function buildMealAnalyzeTextPrompt(userText, allowedFoods) {
  const { lines } = formatAllowedFoodLinesForPrompt(allowedFoods, 72);
  const ut = normalizeUserText(userText);
  return loadPrompt("nutrition", "meal-analyze-text", {
    userText: ut,
    allowedFoodLines: lines,
    quantityHints: quantityHintsPlaceholder(ut)
  });
}
function buildMealAnalyzePhotoPrompt(opts) {
  const ut = normalizeUserText(opts.userText);
  if (opts.phase === "observe") {
    return loadPrompt(
      "nutrition",
      "meal-analyze-photo",
      {
        begleittext: ut ? `Begleittext: "${ut}"` : "Kein Begleittext \u2014 nur das Foto.",
        visionSummary: "",
        userTextLine: "",
        allowedFoodLines: "",
        quantityHints: ""
      },
      "observe"
    );
  }
  const { lines } = formatAllowedFoodLinesForPrompt(opts.allowedFoods ?? [], 80);
  return loadPrompt(
    "nutrition",
    "meal-analyze-photo",
    {
      begleittext: "",
      visionSummary: opts.visionSummary || "\u2014",
      userTextLine: ut ? `
Nutzer-Text: "${ut}"` : "",
      allowedFoodLines: lines,
      quantityHints: quantityHintsPlaceholder(ut || opts.visionSummary || "")
    },
    "match"
  );
}
function buildMealIngredientExpandPrompt(itemLabel, mealContext) {
  return loadPrompt("nutrition", "meal-ingredient-expand", {
    itemLabel: itemLabel.trim().slice(0, 120),
    mealContext: normalizeUserText(mealContext).slice(0, 400)
  });
}
function buildSuggestCustomFoodDraftPrompt(userQuery) {
  return loadPrompt("nutrition", "suggest-custom-food-draft", {
    userQuery: normalizeUserText(userQuery),
    foodCategories: FOOD_CATEGORY_LIST.join(", ")
  });
}
function buildDailyNutritionReviewPrompt(locale, vars) {
  const name = locale === "en" ? "daily-nutrition-review-en" : "daily-nutrition-review-de";
  return loadPrompt("nutrition", name, vars);
}
function buildMealRecipeDraftPrompt(idea, allergies, yieldsPortions) {
  return loadPrompt("nutrition", "meal-recipe-draft", {
    idea: idea.trim(),
    allergies: allergies.trim() || "none",
    yieldsPortions: String(yieldsPortions > 0 ? yieldsPortions : 4)
  });
}
function buildMealRecipeRefinePrompt(userRefinement, currentJson) {
  return loadPrompt("nutrition", "meal-recipe-refine", {
    userRefinement: userRefinement.trim(),
    currentJson
  });
}

// src/lib/aiPrompts/buildWorkoutPrompts.ts
function buildCoachWorkoutWeekPrompt(vars) {
  return loadPrompt("workout", "coach-workout-week", vars);
}
function buildCoachNutritionWeekPrompt(vars) {
  return loadPrompt("workout", "coach-nutrition-week", vars);
}
function buildCoachWeeklyReportPrompt(vars) {
  return loadPrompt("workout", "coach-weekly-report", vars);
}
function buildWorkoutTemplateGeneratePrompt(vars) {
  return loadPrompt("workout", "workout-template-generate", vars);
}

// src/lib/openFoodFacts.ts
var OFF_USER_AGENT = "VRTX-FitnessTracker/1.0 (nutrition; contact: reuse@openfoodfacts.org)";
function normalizeOffSearchQuery(query) {
  return query.trim().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");
}
function brandsLabel(raw) {
  if (Array.isArray(raw)) {
    return raw.map((b) => String(b).trim()).filter(Boolean).join(", ");
  }
  return String(raw ?? "").trim();
}
function num(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function kcalPer100g(n) {
  const kcal = num(n["energy-kcal_100g"]) ?? num(n.energy_kcal_100g);
  if (kcal != null) return Math.max(0, kcal);
  const kj = num(n["energy-kj_100g"]) ?? num(n.energy_100g);
  if (kj != null) return Math.max(0, Math.round(kj / 4.184));
  return null;
}
function labelText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).join(", ");
  }
  return String(value).trim();
}
function parseMassMlFromText(text) {
  const t = text.trim().toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilogramm|g|gramm|ml|milliliter|l|liter|cl|cl\.)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  if (u === "kg" || u === "kilogramm") return { grams: Math.round(n * 1e3), isMl: false };
  if (u === "l" || u === "liter") return { grams: Math.round(n * 1e3), isMl: true };
  if (u === "cl" || u === "cl.") return { grams: Math.round(n * 10), isMl: true };
  if (u === "ml" || u === "milliliter") return { grams: Math.round(n), isMl: true };
  return { grams: Math.round(n), isMl: false };
}
function mapLevel(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "low" || s === "moderate" || s === "high") return s;
  return void 0;
}
function mapOffNutritionGrades(product) {
  const levelsRaw = product.nutrient_levels;
  const levels = levelsRaw ? {
    fat: mapLevel(levelsRaw.fat),
    saturatedFat: mapLevel(levelsRaw["saturated-fat"]),
    sugars: mapLevel(levelsRaw.sugars),
    salt: mapLevel(levelsRaw.salt)
  } : void 0;
  const ns = String(product.nutriscore_grade ?? "").trim().toLowerCase();
  const nutriScore = ns === "a" || ns === "b" || ns === "c" || ns === "d" || ns === "e" ? ns : void 0;
  const nova = num(product.nova_group);
  const hasLevels = levels && Object.values(levels).some(Boolean);
  if (!nutriScore && !hasLevels && nova == null) return void 0;
  return {
    ...nutriScore ? { nutriScore } : {},
    ...nova != null ? { novaGroup: Math.round(nova) } : {},
    ...hasLevels ? { levels } : {}
  };
}
function buildServingsFromOffProduct(product) {
  const out = [{ name: "100 g", grams: 100 }];
  const seen = /* @__PURE__ */ new Set([100]);
  const add = (name, grams) => {
    const g = Math.max(1, Math.round(grams));
    if (seen.has(g) && /100\s*g/i.test(name)) return;
    if (seen.has(g) && out.some((s) => s.grams === g && s.name === name)) return;
    seen.add(g);
    out.push({ name: name.slice(0, 80), grams: g });
  };
  const qty = labelText(product.quantity);
  const pack = qty ? parseMassMlFromText(qty) : null;
  if (pack) {
    if (pack.isMl) {
      add(`1 Flasche (${qty})`, pack.grams);
      add(`1 Glas (${qty})`, Math.min(pack.grams, Math.max(150, Math.round(pack.grams / 4))));
    } else {
      add(`1 Packung (${qty})`, pack.grams);
      add(`1 St\xFCck (${qty})`, pack.grams);
    }
  }
  const ss = labelText(product.serving_size);
  if (ss) {
    const serving = parseMassMlFromText(ss);
    if (serving) {
      add(`1 Portion (${ss})`, serving.grams);
    }
  }
  return out;
}
function buildDisplayName(product, barcode) {
  const base = (product.product_name_de || product.product_name || "").trim() || `Produkt ${barcode}`;
  const brand = brandsLabel(product.brands).split(",")[0]?.trim();
  const qty = labelText(product.quantity);
  const parts = [base];
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  if (qty) parts.push(qty);
  return parts.join(" \xB7 ").slice(0, 200);
}
function mapOpenFoodFactsProduct(product, barcode) {
  const code = String(barcode).replace(/\D/g, "");
  if (!code) return null;
  const n = product.nutriments ?? {};
  const calories = kcalPer100g(n);
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  const hasName = Boolean((product.product_name_de || product.product_name || "").trim());
  if (!hasName && calories == null && protein == null && carbs == null && fat == null) return null;
  const offGrades = mapOffNutritionGrades(product);
  return {
    id: `off_${code}`,
    name: buildDisplayName(product, code),
    category: "readymeal",
    nutrients: {
      calories: Math.round(calories ?? 0),
      protein: Math.round((protein ?? 0) * 10) / 10,
      carbs: Math.round((carbs ?? 0) * 10) / 10,
      fat: Math.round((fat ?? 0) * 10) / 10
    },
    servings: buildServingsFromOffProduct(product),
    ...offGrades ? { offGrades } : {},
    catalogSource: "openfoodfacts"
  };
}
function mapOpenFoodFactsSearchHit(hit) {
  const code = String(hit.code ?? "").replace(/\D/g, "");
  if (!code) return null;
  return mapOpenFoodFactsProduct(hit, code);
}

// src/lib/foodSearch.ts
var QUERY_EXPANSIONS = [
  { test: /leberkas|leberkäse|leberkaas/i, insertTerms: ["fleischk\xE4se", "leberkaas", "leberk\xE4se"] },
  { test: /wei(ß|ss|s)wurst/i, insertTerms: ["wei\xDFwurst", "weisswurst"] },
  { test: /obatzda|obatzter|obazda/i, insertTerms: ["obatzda", "k\xE4seaufstrich"] },
  { test: /brezn|brezel/i, insertTerms: ["brezel"] },
  { test: /radi\b/i, insertTerms: ["rettich"] }
];
var STRONG_TERMS_STOPWORDS = /* @__PURE__ */ new Set([
  "und",
  "oder",
  "mit",
  "ohne",
  "aus",
  "auf",
  "als",
  "wie",
  "von",
  "zum",
  "zur",
  "vom",
  "ein",
  "eine",
  "einen",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "im",
  "in",
  "an",
  "ca",
  "circa",
  "etwas",
  "bitte"
]);
function foldForSearch(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}
function asciiFoldDe(s) {
  return s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
function collectSearchTerms(raw) {
  const t = raw.trim();
  const out = /* @__PURE__ */ new Set();
  if (!t) return out;
  const lower = t.toLowerCase();
  out.add(lower);
  out.add(foldForSearch(lower));
  out.add(asciiFoldDe(lower));
  const tokens = lower.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    out.add(tok);
    out.add(asciiFoldDe(tok));
  }
  for (const { test, insertTerms } of QUERY_EXPANSIONS) {
    if (test.test(t)) {
      for (const x of insertTerms) out.add(x);
    }
  }
  return out;
}
function foodMatchesAnyTerm(food, terms) {
  const hay = foldForSearch(food.name);
  const hayBare = asciiFoldDe(food.name);
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    const a = foldForSearch(term);
    const b = asciiFoldDe(term);
    if (hay.includes(a) || hay.includes(term.toLowerCase()) || hayBare.includes(b)) return true;
  }
  return false;
}
function dedupeById(foods) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of foods) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}
function collectStrongMatchParts(raw) {
  const t = raw.trim().toLowerCase();
  if (!t) return [];
  const parts = [];
  const words = t.split(/\s+/).map((w) => w.replace(/[,;.]+$/g, "")).filter(Boolean);
  for (const w of words) {
    if (STRONG_TERMS_STOPWORDS.has(w)) continue;
    if (/^\d+([.,]\d+)?$/.test(w)) {
      parts.push(w.replace(",", "."));
      continue;
    }
    if (/^\d+([.,]\d+)?%$/.test(w)) {
      parts.push(w.replace("%", "").replace(",", "."));
      continue;
    }
    if (w.length >= 2) parts.push(w);
  }
  return [...new Set(parts)];
}
function foodMatchesAllStrongParts(food, parts) {
  if (parts.length === 0) return false;
  const hay = foldForSearch(food.name);
  const hayBare = asciiFoldDe(food.name);
  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) {
      if (!nameMatchesNumericToken(food.name, p)) return false;
      continue;
    }
    const a = foldForSearch(p);
    const b = asciiFoldDe(p);
    if (!hay.includes(a) && !hayBare.includes(b) && !hayBare.includes(a) && !hay.includes(b) && !hay.includes(p.toLowerCase())) {
      return false;
    }
  }
  return true;
}
function searchStaticFoodsTiered(query, pool2 = [], maxStrong = 24, maxSimilar = 40) {
  const q = query.trim();
  if (!q) return { strong: [], similar: pool2.slice(0, Math.min(maxSimilar, 50)) };
  const parts = collectStrongMatchParts(q);
  const strongBase = parts.length > 0 ? pool2.filter((f) => foodMatchesAllStrongParts(f, parts)) : [];
  const strong = dedupeById(rankFoodsForMealDescription(q, 120, strongBase)).slice(0, maxStrong);
  const similarRanked = searchStaticFoods(q, pool2, maxSimilar + strong.length + 8);
  const strongIds = new Set(strong.map((f) => f.id));
  const similar = similarRanked.filter((f) => !strongIds.has(f.id)).slice(0, maxSimilar);
  return { strong, similar };
}
function searchStaticFoods(query, pool2 = [], maxResults = 80) {
  const q = query.trim();
  if (!q) return pool2.slice(0, Math.min(maxResults, 50));
  const terms = collectSearchTerms(q);
  const direct = pool2.filter((f) => {
    const fn = f.name.toLowerCase();
    return fn.includes(q.toLowerCase()) || foodMatchesAnyTerm(f, terms);
  });
  const poolForRank = direct.length > 0 ? direct : pool2.filter((f) => foodMatchesAnyTerm(f, terms));
  const ranked = rankFoodsForMealDescription(q, 400, poolForRank.length > 0 ? poolForRank : pool2);
  return dedupeById(ranked).slice(0, maxResults);
}

// src/lib/catalogSearch.ts
function tierFoodsFromOffPool(query, offFoods, maxStrong = 20, maxSimilar = 32) {
  const q = query.trim();
  if (q.length < 2) {
    return { strong: [], similar: [] };
  }
  const pool2 = mergeCatalogFoodPool(offFoods);
  const tiered = searchStaticFoodsTiered(q, pool2, maxStrong, maxSimilar);
  if (tiered.strong.length > 0 || tiered.similar.length > 0 || pool2.length === 0) {
    return tiered;
  }
  const qFold = normalizeOffSearchQuery(q);
  const ranked = rankFoodsForMealDescription(qFold, maxStrong + maxSimilar, pool2);
  if (ranked.length > 0) {
    return {
      strong: ranked.slice(0, maxStrong),
      similar: ranked.slice(maxStrong, maxStrong + maxSimilar)
    };
  }
  return {
    strong: pool2.slice(0, maxStrong),
    similar: pool2.slice(maxStrong, maxStrong + maxSimilar)
  };
}

// src/lib/openFoodFactsFetch.ts
var OpenFoodFactsFetchError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "OpenFoodFactsFetchError";
  }
};
var OFF_FETCH_TIMEOUT_MS = 12e3;
var OFF_RETRY_ATTEMPTS = 2;
var OFF_RETRY_DELAY_MS = 600;
function offHeaders() {
  return { "User-Agent": OFF_USER_AGENT, Accept: "application/json" };
}
function offFetchSignal() {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(OFF_FETCH_TIMEOUT_MS);
  }
  return void 0;
}
function isOffBlockedHtml(text) {
  return text.includes("Page temporarily unavailable") || text.includes("not available to anonymous users") || text.includes("Seite vor\xFCbergehend nicht verf\xFCgbar");
}
async function parseJsonResponse(r) {
  const text = await r.text();
  if (isOffBlockedHtml(text)) {
    throw new OpenFoodFactsFetchError("Open Food Facts rate limit / anonymous block", "rate_limited");
  }
  if (!r.ok) {
    throw new OpenFoodFactsFetchError(`Open Food Facts HTTP ${r.status}`, r.status === 429 ? "rate_limited" : "unavailable");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new OpenFoodFactsFetchError("Invalid JSON from Open Food Facts", "unavailable");
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetryableOffError(err) {
  return err instanceof OpenFoodFactsFetchError && (err.code === "rate_limited" || err.code === "network" || err.code === "unavailable");
}
async function withOffRetries(fn) {
  let last;
  for (let attempt = 0; attempt <= OFF_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt >= OFF_RETRY_ATTEMPTS || !isRetryableOffError(err)) throw err;
      await sleep(OFF_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw last;
}
function mapHits(products) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const hit of products) {
    try {
      const food = mapOpenFoodFactsSearchHit(hit);
      if (!food || seen.has(food.id)) continue;
      seen.add(food.id);
      out.push(food);
    } catch (err) {
      console.warn("OFF map hit skipped:", hit.code, err);
    }
  }
  return out;
}
async function searchViaSearchALicious(query, pageSize) {
  const q = normalizeOffSearchQuery(query);
  const params = new URLSearchParams({
    q,
    size: String(Math.min(50, Math.max(1, pageSize)))
  });
  const url = `https://search.openfoodfacts.org/search?${params.toString()}`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse(r);
  const hits = data.hits ?? [];
  return { foods: mapHits(hits), rawHits: hits.length };
}
async function searchViaApiV2(query, pageSize) {
  const params = new URLSearchParams({
    search_terms: normalizeOffSearchQuery(query),
    page_size: String(Math.min(50, Math.max(1, pageSize))),
    fields: "code,product_name,product_name_de,brands,quantity,serving_size,nutriments,nutrient_levels,nutriscore_grade,nova_group"
  });
  const url = `https://world.openfoodfacts.org/api/v2/search?${params.toString()}`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse(r);
  const products = data.products ?? [];
  return { foods: mapHits(products), rawHits: products.length };
}
async function fetchOffCatalogFoods(query, pageSize = 32) {
  const q = query.trim();
  if (q.length < 2) return { foods: [], rawHitCount: 0 };
  let rawHitCount = 0;
  try {
    const primary = await withOffRetries(() => searchViaSearchALicious(q, pageSize));
    rawHitCount = primary.rawHits;
    if (primary.foods.length > 0) return { foods: primary.foods, rawHitCount };
    if (rawHitCount > 0) {
      console.warn("OFF: search-a-licious hits could not be mapped", { q, rawHitCount });
    }
  } catch (primaryErr) {
    if (primaryErr instanceof OpenFoodFactsFetchError && primaryErr.code === "rate_limited") {
      throw primaryErr;
    }
  }
  try {
    const fallback = await withOffRetries(() => searchViaApiV2(q, pageSize));
    rawHitCount = Math.max(rawHitCount, fallback.rawHits);
    return { foods: fallback.foods, rawHitCount };
  } catch (fallbackErr) {
    if (fallbackErr instanceof OpenFoodFactsFetchError) throw fallbackErr;
    throw new OpenFoodFactsFetchError(
      fallbackErr instanceof Error ? fallbackErr.message : "Open Food Facts search failed",
      "network"
    );
  }
}
async function fetchOpenFoodFactsByBarcode(code) {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${digits}?fields=code,product_name,product_name_de,brands,quantity,serving_size,nutriments,nutrient_levels,nutriscore_grade,nova_group`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse(r);
  if (data.status !== 1 || !data.product) return null;
  return mapOpenFoodFactsProduct(data.product, digits);
}
async function searchOpenFoodFactsProducts(query, pageSize = 16) {
  const { foods } = await fetchOffCatalogFoods(query, pageSize);
  return foods;
}
async function searchOpenFoodFactsProductsParallel(queries, opts) {
  const seenQ = /* @__PURE__ */ new Set();
  const unique = [];
  for (const raw of queries) {
    const q = raw.trim();
    const k = q.toLowerCase();
    if (q.length < 2 || seenQ.has(k)) continue;
    seenQ.add(k);
    unique.push(q);
  }
  const maxQueries = opts?.maxQueries ?? 18;
  const capped = unique.slice(0, maxQueries);
  const concurrency = Math.max(1, Math.min(6, opts?.concurrency ?? 3));
  const pageSize = opts?.pageSize ?? 14;
  const seenId = /* @__PURE__ */ new Set();
  const out = [];
  let idx = 0;
  let queriesFailed = 0;
  let lastError;
  const addFoods = (foods) => {
    for (const f of foods) {
      if (!seenId.has(f.id)) {
        seenId.add(f.id);
        out.push(f);
      }
    }
  };
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= capped.length) break;
      const q = capped[i];
      try {
        addFoods(await searchOpenFoodFactsProducts(q, pageSize));
      } catch (err) {
        queriesFailed += 1;
        if (err instanceof OpenFoodFactsFetchError) lastError = err;
      }
      opts?.onQueryDone?.(i + 1, capped.length, q);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, capped.length) }, () => worker())
  );
  return {
    foods: out,
    queriesAttempted: capped.length,
    queriesFailed,
    lastError
  };
}
function isOffSearchUnavailable(result) {
  if (result.foods.length > 0) return false;
  if (result.queriesAttempted === 0) return false;
  return result.queriesFailed >= result.queriesAttempted;
}

// src/lib/server/appCustomFoods.ts
var UCF_ID_PREFIX = "ucf_";
function ucfIdFromRowId(rowId) {
  return `${UCF_ID_PREFIX}${String(rowId).trim()}`;
}
function rowIdFromUcfFoodId(foodId) {
  const id = String(foodId ?? "").trim();
  if (!id.startsWith(UCF_ID_PREFIX)) return null;
  const raw = id.slice(UCF_ID_PREFIX.length).trim();
  return raw.length >= 8 ? raw : null;
}
function parseJsonCol(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return raw;
}
function rowToFood(row) {
  const nutrients = parseJsonCol(row.nutrients, {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });
  let servings = parseJsonCol(row.servings, []);
  if (!Array.isArray(servings) || servings.length === 0) {
    servings = [{ name: "100 g", grams: 100 }];
  }
  const compositeRaw = row.composite_ingredients;
  const compositeLines = compositeIngredientsJsonToLines(compositeRaw);
  const food = {
    id: ucfIdFromRowId(String(row.id)),
    name: String(row.name ?? "").trim(),
    category: coerceFoodCategory(String(row.category ?? "readymeal")),
    nutrients: {
      calories: Math.round(Number(nutrients.calories) || 0),
      protein: Math.round((Number(nutrients.protein) || 0) * 10) / 10,
      carbs: Math.round((Number(nutrients.carbs) || 0) * 10) / 10,
      fat: Math.round((Number(nutrients.fat) || 0) * 10) / 10
    },
    servings,
    catalogSource: "app"
  };
  if (compositeLines.length > 0) {
    food.compositeIngredients = compositeLines.map((line) => ({
      id: line.id,
      name: line.name,
      amount: line.amount,
      unit: line.unit,
      servingName: line.servingName,
      calories: line.calories,
      protein: line.protein,
      carbs: line.carbs,
      fat: line.fat,
      nutrientSource: line.nutrientSource
    }));
  }
  return food;
}
async function searchAppCustomFoods(pool2, query, limit = 24) {
  const q = query.trim();
  if (q.length < 2) return [];
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods
     WHERE name ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [`%${q}%`, Math.min(40, Math.max(1, limit))]
  );
  return rows.map((row) => rowToFood(row));
}
async function getAppCustomFoodById(pool2, foodId) {
  const rowId = rowIdFromUcfFoodId(foodId);
  if (!rowId) return null;
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods WHERE id = $1::uuid LIMIT 1`,
    [rowId]
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0]);
}
async function findAppCustomFoodByExactName(pool2, name) {
  const n = name.trim();
  if (!n) return null;
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [n]
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0]);
}
async function insertAppCustomFoodFromDraft(pool2, draft, source = "user_confirmed_ai") {
  const name = draft.name.trim().slice(0, 320);
  const existing = await findAppCustomFoodByExactName(pool2, name);
  if (existing) return existing;
  const servings = draft.servings.length > 0 ? draft.servings : [{ name: "100 g", grams: 100 }];
  const { rows } = await pool2.query(
    `INSERT INTO user_custom_foods (user_id, name, category, nutrients, servings, source)
     VALUES (NULL, $1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING id, name, category, nutrients, servings, composite_ingredients, source, created_at`,
    [
      name,
      coerceFoodCategory(draft.category),
      JSON.stringify(draft.nutrientsPer100g),
      JSON.stringify(servings),
      source
    ]
  );
  return rowToFood(rows[0]);
}

// src/lib/server/persistMealUnmatchedFoods.ts
var MEAL_AUTO_PERSIST_MAX = 5;
function applyMealPortionToDraft(draft, row) {
  const unitRaw = (row.unit || "g").trim().toLowerCase();
  const allowed = /* @__PURE__ */ new Set(["g", "ml", "stk", "dose", "glas", "flasche", "tl", "el"]);
  let unit = unitRaw;
  if (unit.includes("stk") || unit.includes("st\xFCck") || unit.includes("stueck") || unit === "piece") {
    unit = "stk";
  }
  if (!allowed.has(unit)) return draft;
  const amount = Number.isFinite(row.amount) && row.amount > 0 ? row.amount : unit === "g" || unit === "ml" ? 100 : 1;
  return { ...draft, defaultAmount: amount, defaultUnit: unit };
}
async function draftForUnmatchedRow(row, completeMealAnalysis2) {
  const query = row.name.trim().slice(0, 240);
  const prompt = buildSuggestCustomFoodDraftPrompt(query);
  const raw = await completeMealAnalysis2(prompt, void 0, {
    temperature: 0.25,
    responseMode: "json_object"
  });
  const draft = parseCustomFoodDraftFromAi(raw, query);
  return applyMealPortionToDraft(draft, row);
}
async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
async function persistMealUnmatchedToAppDb(pool2, unmatched, completeMealAnalysis2) {
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const row of unmatched) {
    const name = row.name.trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length >= MEAL_AUTO_PERSIST_MAX) break;
  }
  if (rows.length === 0) return [];
  const persisted2 = await mapWithConcurrency(rows, 2, async (row) => {
    const name = row.name.trim();
    const existing = await findAppCustomFoodByExactName(pool2, name);
    if (existing) return existing;
    try {
      const draft = await draftForUnmatchedRow(row, completeMealAnalysis2);
      return await insertAppCustomFoodFromDraft(pool2, draft, "meal_analyze_auto");
    } catch (err) {
      console.warn("persistMealUnmatched: skip", name, err);
      return null;
    }
  });
  return persisted2.filter((f) => f != null);
}
function findCatalogFoodForRow(row, pool2) {
  const exact = pool2.find((f) => normalizeName(f.name) === normalizeName(row.name));
  if (exact && isAppCatalogFood(exact)) return exact;
  const best = findBestFoodMatch(row.name, pool2);
  return best && isAppCatalogFood(best) ? best : null;
}
async function finalizeMealAnalyzeWithAutoPersist(input) {
  let {
    outUnmatched,
    outIngredients,
    mealItemGroups,
    mergedPool
  } = input;
  if (outUnmatched.length === 0) {
    return {
      outUnmatched,
      outIngredients,
      mealItemGroups,
      mergedPool,
      autoPersistedNames: []
    };
  }
  const persisted2 = await persistMealUnmatchedToAppDb(
    input.pool,
    outUnmatched,
    input.completeMealAnalysis
  );
  if (persisted2.length === 0) {
    return {
      outUnmatched,
      outIngredients,
      mealItemGroups,
      mergedPool,
      autoPersistedNames: []
    };
  }
  mergedPool = [...mergedPool, ...persisted2.filter((f) => !mergedPool.some((p) => p.id === f.id))];
  const recovered = [];
  const matchedRowKeys = /* @__PURE__ */ new Set();
  for (const row of outUnmatched) {
    const food = findCatalogFoodForRow(row, persisted2) ?? findCatalogFoodForRow(row, mergedPool);
    if (!food) continue;
    recovered.push(ingredientFromParsedItem(row, food));
    matchedRowKeys.add(`${normalizeName(row.name)}|${(row.unit || "g").toLowerCase()}`);
  }
  if (recovered.length > 0) {
    outIngredients = collapseDuplicateIngredients([...outIngredients, ...recovered]);
    const regroup = assignIngredientsToDecomposedMealGroups(input.groups, outIngredients, mergedPool);
    if (regroup.mealItemGroups.length > 0) {
      mealItemGroups = regroup.mealItemGroups;
    }
    outUnmatched = outUnmatched.filter((row) => {
      const k = `${normalizeName(row.name)}|${(row.unit || "g").toLowerCase()}`;
      return !matchedRowKeys.has(k);
    });
  }
  outIngredients = filterOffOnlyIngredients(outIngredients, mergedPool);
  mealItemGroups = mealItemGroups.map((g) => ({
    ...g,
    ingredients: filterOffOnlyIngredients(g.ingredients, mergedPool)
  })).filter((g) => g.ingredients.length > 0);
  return {
    outUnmatched,
    outIngredients,
    mealItemGroups,
    mergedPool,
    autoPersistedNames: persisted2.map((f) => f.name.trim()).filter(Boolean)
  };
}

// server.ts
import path4 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// src/lib/userName.ts
function splitNameParts(full) {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
function buildDisplayName2(firstName, lastName) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
function validateNameParts(firstName, lastName) {
  return firstName.trim().length >= 2 && lastName.trim().length >= 2;
}
function resolveUserNameFields(row) {
  const storedFirst = (row.first_name ?? "").trim();
  const storedLast = (row.last_name ?? "").trim();
  if (storedFirst || storedLast) {
    const displayName = buildDisplayName2(storedFirst, storedLast) || row.display_name?.trim() || row.name?.trim() || "";
    return {
      firstName: storedFirst,
      lastName: storedLast,
      displayName
    };
  }
  const legacy = (row.display_name ?? row.name ?? "").trim();
  const { firstName, lastName } = splitNameParts(legacy);
  return {
    firstName,
    lastName,
    displayName: buildDisplayName2(firstName, lastName) || legacy
  };
}

// src/lib/dataMigration.ts
var DATA_MIGRATION_VERSION = 2;

// src/lib/server/migrateUserDataV2.ts
function parseProfileExtras(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw || "{}");
      return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}
function userNeedsDataMigration(extras, targetVersion = DATA_MIGRATION_VERSION) {
  if (extras.migrationV2Required === true) return true;
  const v = extras.dataMigrationVersion;
  return v == null || Number(v) < targetVersion;
}
async function resolveExerciseKey(name, existingKey) {
  const key = String(existingKey || "").trim();
  if (key && isExerciseDbCatalogKey(key)) return key;
  const n = String(name || "").trim();
  if (!n && key) return key;
  if (isExerciseDbConfigured() && n) {
    try {
      const hits = await searchExerciseDbByName(n, 8);
      const exact = hits.find((h) => h.name.toLowerCase() === n.toLowerCase());
      if (exact) return exact.key;
      if (hits[0]) return hits[0].key;
    } catch {
    }
  }
  return existingKey || void 0;
}
async function migrateExerciseArray(exercises) {
  if (!Array.isArray(exercises)) return exercises;
  const out = [];
  for (const row of exercises) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    const ex = row;
    const name = String(ex.name || "");
    const key = await resolveExerciseKey(name, typeof ex.exerciseKey === "string" ? ex.exerciseKey : void 0);
    out.push(key ? { ...ex, exerciseKey: key, name: name || ex.name } : ex);
  }
  return out;
}
async function migrateCoachSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return schedule;
  const s = schedule;
  const days = s.schedule ?? s.days;
  if (!Array.isArray(days)) return schedule;
  const newDays = [];
  for (const day of days) {
    if (!day || typeof day !== "object") {
      newDays.push(day);
      continue;
    }
    const d = day;
    if (Array.isArray(d.exercises)) {
      newDays.push({ ...d, exercises: await migrateExerciseArray(d.exercises) });
    } else {
      newDays.push(d);
    }
  }
  return { ...s, schedule: newDays };
}
async function migrateWeekPlan(weekPlan) {
  if (!Array.isArray(weekPlan)) return weekPlan;
  const out = [];
  for (const day of weekPlan) {
    if (!day || typeof day !== "object") {
      out.push(day);
      continue;
    }
    const d = day;
    out.push({
      ...d,
      exercises: await migrateExerciseArray(d.exercises)
    });
  }
  return out;
}
async function migrateProfileExtras(extras, foodPool) {
  const out = { ...extras };
  if (out.workoutPlan && typeof out.workoutPlan === "object") {
    const wp = out.workoutPlan;
    if (Array.isArray(wp.schedule)) {
      const schedule = [];
      for (const day of wp.schedule) {
        if (!day || typeof day !== "object") {
          schedule.push(day);
          continue;
        }
        const d = day;
        schedule.push({
          ...d,
          exercises: await migrateExerciseArray(d.exercises)
        });
      }
      out.workoutPlan = { ...wp, schedule };
    }
  }
  if (Array.isArray(out.freeWorkoutSchedule)) {
    const days = [];
    for (const day of out.freeWorkoutSchedule) {
      if (!day || typeof day !== "object") {
        days.push(day);
        continue;
      }
      const d = day;
      days.push({
        ...d,
        exercises: await migrateExerciseArray(d.exercises)
      });
    }
    out.freeWorkoutSchedule = days;
  }
  if (out.workoutSessionDraft && typeof out.workoutSessionDraft === "object") {
    const draft = out.workoutSessionDraft;
    if (Array.isArray(draft.exercises)) {
      out.workoutSessionDraft = {
        ...draft,
        exercises: await migrateExerciseArray(draft.exercises)
      };
    }
  }
  return out;
}
async function resolveFoodIdForIngredient(ing, pool2) {
  const name = String(ing.name || "").trim();
  if (!name) return ing;
  const id = ing.id != null ? String(ing.id) : "";
  if (id && !id.startsWith("est_")) {
    const hit = pool2.find((f) => f.id === id);
    if (hit && matchFoodExactFromPool(name, [hit])) return ing;
  }
  const exact = matchFoodExactFromPool(name, pool2);
  if (exact) {
    return { ...ing, id: exact.id, name: exact.name, nutrientSource: "database" };
  }
  try {
    const off = await searchOpenFoodFactsProducts(name, 8);
    const merged = mergeCatalogFoodPool(off);
    const hit2 = matchFoodExactFromPool(name, merged) ?? merged[0];
    if (hit2) return { ...ing, id: hit2.id, name: hit2.name, nutrientSource: "database" };
  } catch {
  }
  return ing;
}
async function migrateIngredients(ingredients, foodPool) {
  if (!Array.isArray(ingredients)) return ingredients;
  const out = [];
  for (const row of ingredients) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    out.push(await resolveFoodIdForIngredient(row, foodPool));
  }
  return out;
}
async function runUserDataMigrationV2(pool2, userId) {
  const errors = [];
  let exercisesUpdated = 0;
  let nutritionUpdated = 0;
  let coachWeeksUpdated = 0;
  const globalFoods = [];
  try {
    const templates = await pool2.query(
      `SELECT id, exercises, week_plan FROM workout_templates WHERE user_id=$1`,
      [userId]
    );
    for (const row of templates.rows) {
      const ex = await migrateExerciseArray(row.exercises);
      const wp = row.week_plan ? await migrateWeekPlan(row.week_plan) : row.week_plan;
      await pool2.query(`UPDATE workout_templates SET exercises=$2::jsonb, week_plan=$3::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ex),
        wp ? JSON.stringify(wp) : null
      ]);
      exercisesUpdated += 1;
    }
  } catch (e) {
    errors.push(`templates: ${e}`);
  }
  try {
    const workouts = await pool2.query(`SELECT id, exercises FROM workouts WHERE user_id=$1`, [userId]);
    for (const row of workouts.rows) {
      const ex = await migrateExerciseArray(row.exercises);
      await pool2.query(`UPDATE workouts SET exercises=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(ex)]);
      exercisesUpdated += 1;
    }
  } catch (e) {
    errors.push(`workouts: ${e}`);
  }
  try {
    const plans = await pool2.query(`SELECT id FROM coach_plans WHERE user_id=$1`, [userId]);
    for (const p of plans.rows) {
      const weeks = await pool2.query(
        `SELECT id, schedule FROM coach_weekly_schedules WHERE plan_id=$1`,
        [p.id]
      );
      for (const w of weeks.rows) {
        const sched = await migrateCoachSchedule(w.schedule);
        await pool2.query(`UPDATE coach_weekly_schedules SET schedule=$2::jsonb WHERE id=$1`, [
          w.id,
          JSON.stringify(sched)
        ]);
        coachWeeksUpdated += 1;
      }
    }
  } catch (e) {
    errors.push(`coach: ${e}`);
  }
  try {
    const meals = await pool2.query(`SELECT id, ingredients FROM meal_templates WHERE user_id=$1`, [userId]);
    for (const row of meals.rows) {
      const ing = await migrateIngredients(row.ingredients, globalFoods);
      await pool2.query(`UPDATE meal_templates SET ingredients=$2::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ing)
      ]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`meal_templates: ${e}`);
  }
  try {
    const logs = await pool2.query(`SELECT id, ingredients FROM nutrition WHERE user_id=$1`, [userId]);
    for (const row of logs.rows) {
      const ing = await migrateIngredients(row.ingredients, globalFoods);
      await pool2.query(`UPDATE nutrition SET ingredients=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(ing)]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`nutrition: ${e}`);
  }
  try {
    const ucf = await pool2.query(
      `SELECT id, composite_ingredients FROM user_custom_foods WHERE user_id=$1 AND composite_ingredients IS NOT NULL`,
      [userId]
    );
    for (const row of ucf.rows) {
      const ing = await migrateIngredients(row.composite_ingredients, globalFoods);
      await pool2.query(`UPDATE user_custom_foods SET composite_ingredients=$2::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ing)
      ]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`user_custom_foods: ${e}`);
  }
  const cur = await pool2.query(`SELECT profile_extras FROM users WHERE id=$1`, [userId]);
  const prev = parseProfileExtras(cur.rows[0]?.profile_extras);
  const migratedExtras = await migrateProfileExtras(prev, globalFoods);
  await pool2.query(`UPDATE users SET profile_extras=$2::jsonb, updated_at=NOW() WHERE id=$1`, [
    userId,
    JSON.stringify({
      ...migratedExtras,
      dataMigrationVersion: DATA_MIGRATION_VERSION,
      migrationV2Required: false
    })
  ]);
  return {
    ok: errors.length === 0,
    exercisesUpdated,
    nutritionUpdated,
    coachWeeksUpdated,
    errors
  };
}
async function getDataMigrationStatus(pool2) {
  const r = await pool2.query(`SELECT id, profile_extras FROM users WHERE is_active=true`);
  let pending = 0;
  let upToDate = 0;
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (userNeedsDataMigration(prev)) pending += 1;
    else upToDate += 1;
  }
  const edb = getExerciseDbEnvDiagnostics();
  return {
    targetVersion: DATA_MIGRATION_VERSION,
    pendingUsers: pending,
    upToDateUsers: upToDate,
    totalActiveUsers: r.rows.length,
    exerciseDbConfigured: edb.configured,
    exerciseDbSource: edb.source,
    exerciseDbHost: edb.host,
    exerciseDbEnvHints: edb.envFileHints,
    envFilePath: edb.envFilePath,
    envFileProblem: edb.envFileProblem,
    envReloadApplied: edb.envReloadApplied
  };
}
async function runBatchDataMigrationForAllUsers(pool2, opts) {
  const r = await pool2.query(`SELECT id, profile_extras FROM users WHERE is_active=true ORDER BY id`);
  let usersMigrated = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  let exercisesUpdated = 0;
  let nutritionUpdated = 0;
  let coachWeeksUpdated = 0;
  const errors = [];
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (!opts?.force && !userNeedsDataMigration(prev)) {
      usersSkipped += 1;
      continue;
    }
    try {
      const result = await runUserDataMigrationV2(pool2, row.id);
      usersMigrated += 1;
      exercisesUpdated += result.exercisesUpdated;
      nutritionUpdated += result.nutritionUpdated;
      coachWeeksUpdated += result.coachWeeksUpdated;
      if (!result.ok) {
        usersFailed += 1;
        for (const e of result.errors) errors.push(`User #${row.id}: ${e}`);
      }
    } catch (e) {
      usersFailed += 1;
      errors.push(`User #${row.id}: ${e}`);
    }
  }
  return {
    ok: usersFailed === 0,
    targetVersion: DATA_MIGRATION_VERSION,
    usersMigrated,
    usersSkipped,
    usersFailed,
    exercisesUpdated,
    nutritionUpdated,
    coachWeeksUpdated,
    errors: errors.slice(0, 50)
  };
}
async function flagAllUsersForMigrationV2(pool2) {
  const r = await pool2.query(`SELECT id, profile_extras FROM users WHERE is_active=true`);
  let n = 0;
  const authInvalidBefore = Math.floor(Date.now() / 1e3);
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (!userNeedsDataMigration(prev)) continue;
    await pool2.query(`UPDATE users SET profile_extras=$2::jsonb WHERE id=$1`, [
      row.id,
      JSON.stringify({
        ...prev,
        migrationV2Required: true,
        authInvalidBefore
      })
    ]);
    n += 1;
  }
  return n;
}

// server.ts
function parseCoachOnboarding(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}
function joinCoachList(value, fallback = "none") {
  if (Array.isArray(value)) {
    const s = value.map((x) => String(x)).filter(Boolean).join(", ");
    return s || fallback;
  }
  return fallback;
}
function mergeOffParallelResults(...parts) {
  const seen = /* @__PURE__ */ new Set();
  const foods = [];
  let queriesAttempted = 0;
  let queriesFailed = 0;
  let lastError;
  for (const p of parts) {
    queriesAttempted += p.queriesAttempted;
    queriesFailed += p.queriesFailed;
    if (p.lastError) lastError = p.lastError;
    for (const f of p.foods) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        foods.push(f);
      }
    }
  }
  return { foods, queriesAttempted, queriesFailed, lastError };
}
var { Pool } = pg;
var __filename = fileURLToPath3(import.meta.url);
var __dirname2 = path4.dirname(__filename);
var pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "fitness_tracker",
  user: process.env.POSTGRES_USER || "vrtx",
  password: process.env.POSTGRES_PASSWORD || "vrtx_secret"
});
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(100) NOT NULL DEFAULT '',
      email          VARCHAR(200) UNIQUE NOT NULL,
      password_hash  VARCHAR(256),
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name   VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url      TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded      BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership     VARCHAR(20) NOT NULL DEFAULT 'pro'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'dark'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS goals          JSONB NOT NULL DEFAULT '{"type":"maintain","dailySteps":10000,"dailyCalories":2500}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS measurements   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS workout_plan   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_preferences JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_history JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coaching_active BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_extras JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`
  ];
  for (const sql of migrations) {
    await pool.query(sql);
  }
  const legacyNames = await pool.query(
    `SELECT id, name, display_name, first_name, last_name FROM users
     WHERE (first_name IS NULL OR TRIM(first_name) = '')
       AND (last_name IS NULL OR TRIM(last_name) = '')
       AND (COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(name), '')) IS NOT NULL)`
  );
  for (const row of legacyNames.rows) {
    const legacy = String(row.display_name || row.name || "").trim();
    if (!legacy) continue;
    const { firstName, lastName } = splitNameParts(legacy);
    await pool.query(
      `UPDATE users SET first_name = $2, last_name = $3, updated_at = NOW() WHERE id = $1`,
      [row.id, firstName, lastName]
    );
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workouts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      subtype        VARCHAR(50),
      duration       INTEGER NOT NULL DEFAULT 0,
      calories_burned INTEGER NOT NULL DEFAULT 0,
      date           DATE NOT NULL DEFAULT CURRENT_DATE,
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes          TEXT,
      shared         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      template_mode  VARCHAR(20) NOT NULL DEFAULT 'workout',
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      week_plan      JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'workout'`);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS week_plan JSONB`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal       VARCHAR(200) NOT NULL,
      category   VARCHAR(30),
      calories   NUMERIC NOT NULL DEFAULT 0,
      protein    NUMERIC NOT NULL DEFAULT 0,
      carbs      NUMERIC NOT NULL DEFAULT 0,
      fat        NUMERIC NOT NULL DEFAULT 0,
      date       DATE NOT NULL DEFAULT CURRENT_DATE,
      ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS quantity NUMERIC`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(200) NOT NULL,
      category      VARCHAR(30),
      ingredients   JSONB NOT NULL DEFAULT '[]'::jsonb,
      total_calories NUMERIC NOT NULL DEFAULT 0,
      total_protein  NUMERIC NOT NULL DEFAULT 0,
      total_carbs    NUMERIC NOT NULL DEFAULT 0,
      total_fat      NUMERIC NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS yields_portions INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_custom_foods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(320) NOT NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'readymeal',
      nutrients JSONB NOT NULL,
      servings JSONB NOT NULL DEFAULT '[{"name":"100g","grams":100}]'::jsonb,
      source VARCHAR(40) NOT NULL DEFAULT 'user_confirmed_ai',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_custom_foods_user ON user_custom_foods (user_id)`
  );
  await pool.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS composite_ingredients JSONB`);
  await pool.query(`ALTER TABLE user_custom_foods DROP CONSTRAINT IF EXISTS user_custom_foods_user_id_fkey`);
  await pool.query(`ALTER TABLE user_custom_foods ALTER COLUMN user_id DROP NOT NULL`);
  await pool.query(`
    ALTER TABLE user_custom_foods
    ADD CONSTRAINT user_custom_foods_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`UPDATE user_custom_foods SET user_id = NULL WHERE user_id IS NOT NULL`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_custom_foods_name_lower ON user_custom_foods (LOWER(name))`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      image_url  TEXT,
      likes      INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      type       VARCHAR(20) NOT NULL DEFAULT 'manual',
      workout_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body          TEXT NOT NULL,
      read_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON direct_messages (sender_id, recipient_id, created_at DESC)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_plans (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type           VARCHAR(20) NOT NULL,           -- 'workout' | 'nutrition'
      status         VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active'|'paused'|'cancelled'|'completed'
      discipline     VARCHAR(60),                    -- workout discipline
      plan_mode      VARCHAR(20) NOT NULL,           -- 'ongoing' | 'event'
      event_name     VARCHAR(200),
      event_date     DATE,
      event_distance VARCHAR(100),
      current_week   INTEGER NOT NULL DEFAULT 1,
      onboarding_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_schedules (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      start_date   DATE,
      schedule     JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_reports (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      report       JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_ai_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id UUID REFERENCES coach_plans(id) ON DELETE SET NULL,
      week_number INTEGER,
      endpoint VARCHAR(160) NOT NULL,
      prompt_version VARCHAR(64) NOT NULL,
      model_id VARCHAR(120) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      raw_response TEXT,
      zod_ok BOOLEAN NOT NULL DEFAULT FALSE,
      constraints_ok BOOLEAN NOT NULL DEFAULT FALSE,
      retries INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      final_schedule_hash VARCHAR(64),
      refinement_round INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_ai_runs_user ON coach_ai_runs (user_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_ai_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint VARCHAR(160) NOT NULL,
      prompt_version VARCHAR(64) NOT NULL,
      model_id VARCHAR(120) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      raw_response TEXT,
      zod_ok BOOLEAN NOT NULL DEFAULT FALSE,
      retries INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      refinement_round INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_meal_ai_runs_user ON meal_ai_runs (user_id, created_at DESC)`);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS prep_steps JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS llm_estimate_nutrients JSONB`);
  await pool.query(
    `ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS nutrients_computed_coverage NUMERIC NOT NULL DEFAULT 0`
  );
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'manual'`);
  console.log("\u2705 Database schema ready");
}
async function resolveCatalogFoodById(id) {
  const raw = id?.trim() ?? "";
  if (raw.startsWith("off_")) {
    const code = raw.slice(4).replace(/\D/g, "");
    if (!code) return null;
    try {
      return await fetchOpenFoodFactsByBarcode(code);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("ucf_")) {
    try {
      return await getAppCustomFoodById(pool, raw);
    } catch {
      return null;
    }
  }
  return null;
}
async function buildOffFoodResolverForIngredients(ingredients) {
  const cache4 = /* @__PURE__ */ new Map();
  for (const ing of ingredients) {
    const id = ing.foodId?.trim();
    if (!id || cache4.has(id)) continue;
    if (!id.startsWith("off_") && !id.startsWith("ucf_")) continue;
    const hit = await resolveCatalogFoodById(id);
    if (hit) cache4.set(id, hit);
  }
  return (foodId) => cache4.get(foodId) ?? null;
}
function navigationFocusFrom(raw) {
  if (raw === "workout" || raw === "nutrition" || raw === "hybrid") return raw;
  return "hybrid";
}
function mapUser(row) {
  const pe = typeof row.profile_extras === "string" ? JSON.parse(row.profile_extras || "{}") : row.profile_extras || {};
  const pref = row.theme_preference === "light" || row.theme_preference === "dark" ? row.theme_preference : "dark";
  const names = resolveUserNameFields(row);
  return {
    uid: row.id.toString(),
    firstName: names.firstName,
    lastName: names.lastName,
    displayName: names.displayName,
    email: row.email,
    photoURL: row.photo_url || "",
    bio: row.bio || "",
    onboarded: row.onboarded ?? false,
    accountCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : void 0,
    themePreference: pref,
    goals: row.goals || { type: "maintain", dailySteps: 1e4, dailyCalories: 2500 },
    measurements: row.measurements || null,
    workoutPlan: row.workout_plan || null,
    coachPreferences: row.coach_preferences || null,
    weightHistory: row.weight_history || [],
    coachingActive: row.coaching_active || false,
    freeWorkoutSchedule: pe.freeWorkoutSchedule ?? void 0,
    dailyWaterLog: pe.dailyWaterLog ?? void 0,
    dailyActivityLog: pe.dailyActivityLog ?? void 0,
    checkIns: pe.checkIns ?? void 0,
    favoriteMealTemplateIds: pe.favoriteMealTemplateIds ?? void 0,
    bodyMeasurements: pe.bodyMeasurements ?? void 0,
    navigationFocus: navigationFocusFrom(pe.navigationFocus),
    uiLocale: pe.uiLocale === "de" || pe.uiLocale === "en" ? pe.uiLocale : void 0,
    /** Opt-out über profile_extras — Standard: true (erweiterte Coach-Pipeline / Refine). */
    useCoachLevelV2: typeof pe.useCoachLevelV2 === "boolean" ? pe.useCoachLevelV2 : true,
    exerciseRestSeconds: pe.exerciseRestSeconds && typeof pe.exerciseRestSeconds === "object" ? pe.exerciseRestSeconds : void 0,
    dataMigrationVersion: typeof pe.dataMigrationVersion === "number" ? pe.dataMigrationVersion : void 0,
    migrationV2Required: pe.migrationV2Required === true
  };
}
function mapWorkout(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Other",
    subtype: row.subtype,
    duration: row.duration || 0,
    caloriesBurned: row.calories_burned || 0,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    exercises: row.exercises || [],
    notes: row.notes || "",
    shared: row.shared || false
  };
}
function mapTemplate(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Strength",
    templateMode: row.template_mode || "workout",
    exercises: row.exercises || [],
    weekPlan: row.week_plan || null
  };
}
function mapNutrition(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    meal: row.meal,
    category: row.category || "snack",
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    ingredients: row.ingredients || [],
    quantity: row.quantity != null ? Number(row.quantity) : void 0,
    unit: row.unit || void 0
  };
}
function mapMealTemplate(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    category: row.category || "snack",
    ingredients: row.ingredients || [],
    totalCalories: Number(row.total_calories),
    totalProtein: Number(row.total_protein),
    totalCarbs: Number(row.total_carbs),
    totalFat: Number(row.total_fat),
    yieldsPortions: Math.max(1, parseInt(String(row.yields_portions ?? 1), 10) || 1),
    prepSteps: row.prep_steps || [],
    llmEstimateNutrients: row.llm_estimate_nutrients ?? void 0,
    nutrientsComputedCoverage: row.nutrients_computed_coverage != null ? Number(row.nutrients_computed_coverage) : void 0,
    source: row.source || "manual"
  };
}
function mapPost(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    userName: row.user_name || "",
    userPhoto: row.user_photo || "",
    content: row.content,
    imageUrl: row.image_url,
    likes: (row.likes || []).map(String),
    type: row.type || "manual",
    workoutId: row.workout_id,
    createdAt: row.created_at
  };
}
var JWT_SECRET = process.env.JWT_SECRET || "vrtx-dev-secret-change-me";
var ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin";
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  void (async () => {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      const row = await pool.query(`SELECT profile_extras FROM users WHERE id=$1`, [payload.userId]);
      if (!row.rows.length) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const extras = typeof row.rows[0].profile_extras === "string" ? JSON.parse(row.rows[0].profile_extras || "{}") : row.rows[0].profile_extras || {};
      const inv = Number(extras.authInvalidBefore);
      if (Number.isFinite(inv) && inv > 0 && typeof payload.iat === "number" && payload.iat < inv) {
        res.status(401).json({ error: "session-expired", code: "REAUTH_REQUIRED" });
        return;
      }
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  })();
}
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Basic ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user, ...rest] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  if (user === ADMIN_USER && rest.join(":") === ADMIN_PASS) {
    next();
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/ai/status", (_req, res) => {
    const caps = resolveAiCapabilities();
    res.json({
      enabled: caps.enabled,
      provider: caps.provider,
      mistralConfigured: caps.mistralConfigured,
      geminiConfigured: caps.geminiConfigured,
      activeOverride: getActiveProviderOverride()
    });
  });
  app.get("/api/foods/barcode/:code", requireAuth, async (req, res) => {
    const code = String(req.params.code ?? "").replace(/\D/g, "");
    if (code.length < 8 || code.length > 14) {
      res.status(400).json({ error: "invalid-barcode" });
      return;
    }
    try {
      const food = await fetchOpenFoodFactsByBarcode(code);
      if (!food) {
        res.status(404).json({ error: "product-not-found" });
        return;
      }
      res.json({ food, source: "openfoodfacts" });
    } catch (err) {
      console.error("OFF barcode:", err);
      const code2 = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "off-rate-limited" : "off-fetch-failed";
      res.status(502).json({ error: code2 });
    }
  });
  app.get("/api/exercises/status", requireAuth, (_req, res) => {
    const d = getExerciseDbEnvDiagnostics();
    res.json({
      configured: d.configured,
      source: d.source,
      host: d.host
    });
  });
  app.get("/api/exercises/filters", requireAuth, async (_req, res) => {
    try {
      const lists = await fetchExerciseDbFilterLists();
      res.json(lists);
    } catch (err) {
      console.error("ExerciseDB filters:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });
  app.get("/api/exercises/search", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured", exercises: [] });
      return;
    }
    const q = String(req.query.q ?? "").trim();
    const muscle = String(req.query.muscle ?? "all");
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "24"), 10) || 24));
    try {
      const exercises = await searchExerciseDbCatalog({
        query: q,
        muscle,
        limit
      });
      res.json({ exercises });
    } catch (err) {
      console.error("ExerciseDB search:", err);
      const code = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "exercisedb-rate-limited" : "exercisedb-fetch-failed";
      res.status(502).json({ error: code });
    }
  });
  app.get("/api/exercises/similar", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured", exercises: [] });
      return;
    }
    const key = String(req.query.key ?? req.query.exerciseKey ?? "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? "12"), 10) || 12));
    if (!key) {
      res.status(400).json({ error: "missing-key" });
      return;
    }
    try {
      const exercises = await findSimilarExercises(key, limit);
      res.json({ exercises });
    } catch (err) {
      console.error("ExerciseDB similar:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });
  app.get("/api/exercises/media", requireAuth, async (req, res) => {
    const raw = String(req.query.url ?? "").trim();
    if (!raw) {
      res.status(400).json({ error: "missing-url" });
      return;
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      res.status(400).json({ error: "invalid-url" });
      return;
    }
    const hostOk = parsed.hostname === "cdn.exercisedb.dev" || parsed.hostname.endsWith(".cdn.exercisedb.dev") || parsed.hostname === "static.exercisedb.dev" || parsed.hostname.endsWith(".static.exercisedb.dev");
    if (!hostOk || parsed.protocol !== "https:") {
      res.status(400).json({ error: "host-not-allowed" });
      return;
    }
    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { Accept: "image/*,video/*,*/*" }
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      console.error("Exercise media proxy:", err);
      res.status(502).json({ error: "media-proxy-failed" });
    }
  });
  app.get("/api/exercises/:id", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured" });
      return;
    }
    const id = String(req.params.id ?? "").replace(/^edb_/, "").trim();
    if (!id) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    try {
      const exercise = await fetchExerciseDbById(id);
      if (!exercise) {
        res.status(404).json({ error: "exercise-not-found" });
        return;
      }
      res.json({ exercise });
    } catch (err) {
      console.error("ExerciseDB detail:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });
  app.get("/api/foods/openfoodfacts/search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ foods: [] });
      return;
    }
    try {
      const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.page_size ?? "16"), 10) || 16));
      const { foods } = await fetchOffCatalogFoods(q, pageSize);
      res.json({ foods });
    } catch (err) {
      console.error("OFF search:", err, { query: q });
      const code = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "off-rate-limited" : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });
  app.get("/api/foods/catalog/:foodId", requireAuth, async (req, res) => {
    const foodId = String(req.params.foodId ?? "").trim();
    if (!foodId) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    try {
      const food = await resolveCatalogFoodById(foodId);
      if (!food) {
        res.status(404).json({ error: "food-not-found" });
        return;
      }
      res.json({ food });
    } catch (err) {
      console.error("catalog food by id:", err);
      res.status(502).json({ error: "food-fetch-failed" });
    }
  });
  app.post("/api/foods/app-custom", requireAuth, async (req, res) => {
    const body = req.body;
    const draft = body.draft;
    if (!draft?.name?.trim() || !draft.nutrientsPer100g) {
      res.status(400).json({ error: "invalid-draft" });
      return;
    }
    try {
      const food = await insertAppCustomFoodFromDraft(pool, draft, "user_confirmed");
      res.json({ food });
    } catch (err) {
      console.error("app-custom food insert:", err);
      res.status(500).json({ error: "app-custom-save-failed" });
    }
  });
  app.get("/api/foods/catalog-search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ strong: [], similar: [] });
      return;
    }
    try {
      const maxStrong = Math.min(40, Math.max(1, parseInt(String(req.query.max_strong ?? "20"), 10) || 20));
      const maxSimilar = Math.min(48, Math.max(0, parseInt(String(req.query.max_similar ?? "32"), 10) || 32));
      const pageSize = Math.min(52, Math.max(maxStrong + maxSimilar, 24));
      const [{ foods: offFoods, rawHitCount }, appFoods] = await Promise.all([
        fetchOffCatalogFoods(q, pageSize),
        searchAppCustomFoods(pool, q, 20)
      ]);
      const mergedPool = [...offFoods, ...appFoods];
      const tiered = tierFoodsFromOffPool(q, mergedPool, maxStrong, maxSimilar);
      res.json({
        ...tiered,
        offMappingDroppedAll: rawHitCount > 0 && offFoods.length === 0 && appFoods.length === 0
      });
    } catch (err) {
      console.error("catalog-search:", err, { query: q });
      const code = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "off-rate-limited" : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });
  const writeMealAnalyzeStreamLine = (res, payload) => {
    res.write(`${JSON.stringify(payload)}
`);
    const flush = res.flush;
    if (typeof flush === "function") flush.call(res);
  };
  app.post("/api/ai/analyze-meal", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const { input, imageDataUrl, decomposeDish, streamProgress } = req.body;
    const useStream = Boolean(streamProgress);
    let streamClosed = false;
    const emitProgress = (phase, progress) => {
      if (!useStream || streamClosed) return;
      writeMealAnalyzeStreamLine(res, { type: "progress", phase, progress });
    };
    const finishStream = (payload) => {
      if (!useStream || streamClosed) return;
      writeMealAnalyzeStreamLine(res, { type: "result", ...payload });
      streamClosed = true;
      res.end();
    };
    const failStream = (message, status = 500) => {
      if (useStream && !streamClosed) {
        writeMealAnalyzeStreamLine(res, { type: "error", message });
        streamClosed = true;
        res.end();
        return;
      }
      if (!streamClosed) res.status(status).json({ error: message });
    };
    if (useStream) {
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
    }
    const text = (input ?? "").trim();
    let image;
    if (imageDataUrl) {
      const parsedUrl = parseDataUrl(imageDataUrl);
      if (parsedUrl) image = { mimeType: parsedUrl.mimeType, data: parsedUrl.data };
    }
    if (!text && !image) {
      res.status(400).json({ error: "Beschreibung oder Bild erforderlich." });
      return;
    }
    const isDecompose = false;
    try {
      const globalFoods = [];
      if (text && !image) {
        emitProgress("interpret", 8);
        const fbLabel = text.trim().replace(/\r?\n+/g, " ").slice(0, 120) || "Mahlzeit";
        let groups2 = extractMealTextSegments(text).map((seg) => ({
          label: seg.trim().slice(0, 120) || fbLabel,
          parsed: [{ name: seg.trim(), amount: 100, unit: "g" }],
          tracking: "auto"
        }));
        if (!flattenDecomposedMealItems(groups2).length) {
          groups2 = [{ label: fbLabel, parsed: parseSimpleDescription(text) }];
        }
        groups2 = dedupeDecomposedMealItemsByLabel(groups2);
        groups2 = groups2.map((g) => ({ ...g, parsed: normalizeDecomposedStkAmounts(g.parsed) }));
        emitProgress("interpret", 22);
        const flatParsed2 = flattenDecomposedMealItems(groups2);
        const textForRank2 = normalizeGermanMealInputForRanking(text);
        const offQueries2 = collectOffQueriesForTextMealAnalysis(groups2, text);
        emitProgress("off_search", 28);
        let offParallel2 = await searchOpenFoodFactsProductsParallel(offQueries2, {
          maxQueries: 18,
          concurrency: 3,
          pageSize: 14,
          onQueryDone: (done, total) => {
            emitProgress("off_search", 28 + Math.round(18 * done / Math.max(1, total)));
          }
        });
        let offCandidates2 = offParallel2.foods;
        if (offCandidates2.length === 0 && textForRank2.length >= 2) {
          offParallel2 = mergeOffParallelResults(
            offParallel2,
            await searchOpenFoodFactsProductsParallel([textForRank2.slice(0, 80)], {
              maxQueries: 1,
              concurrency: 1,
              pageSize: 20
            })
          );
          offCandidates2 = offParallel2.foods;
        }
        emitProgress("off_search", 46);
        let mergedPool2 = mergeCatalogFoodPool(offCandidates2);
        let candidateFoods2 = resolveCandidateFoodsForAnalysis(
          textForRank2,
          false,
          mergedPool2,
          flatParsed2
        );
        if (candidateFoods2.length === 0 && mergedPool2.length > 0) {
          candidateFoods2 = rankFoodsForMealDescription(textForRank2, 56, mergedPool2);
        }
        let mealItemGroups2 = [];
        let outIngredients2 = [];
        let outUnmatched2 = [];
        const applySemanticFallback2 = () => {
          const fb = resolveMealGroupsAgainstFoodPool(groups2, mergedPool2, text);
          mealItemGroups2 = fb.mealItemGroups;
          outUnmatched2 = fb.unmatched;
          outIngredients2 = mealItemGroups2.flatMap((g) => g.ingredients);
        };
        const countGroupedIngredients2 = (grps) => grps.reduce((n, g) => n + g.ingredients.length, 0);
        applySemanticFallback2();
        const baselineIngredientCount = countGroupedIngredients2(mealItemGroups2);
        if (mergedPool2.length > 0 && candidateFoods2.length > 0) {
          emitProgress("match", 52);
          try {
            const analyzePrompt = buildMealAnalyzeTextPrompt(text, candidateFoods2);
            const analyzeRaw = await completeMealAnalysis(analyzePrompt, void 0, {
              temperature: 0.14,
              responseMode: "json_object"
            });
            const aiGroups = extractDecomposedMealItemsFromAiContent(analyzeRaw, text);
            if (aiGroups.length > 0) {
              groups2 = dedupeDecomposedMealItemsByLabel(
                aiGroups.map((g) => ({
                  ...g,
                  parsed: normalizeDecomposedParsedItems(normalizeDecomposedStkAmounts(g.parsed))
                }))
              );
              const fb = resolveMealGroupsAgainstFoodPool(groups2, mergedPool2, text);
              if (fb.mealItemGroups.length > countGroupedIngredients2(mealItemGroups2)) {
                mealItemGroups2 = fb.mealItemGroups;
                outUnmatched2 = fb.unmatched;
                outIngredients2 = mealItemGroups2.flatMap((g) => g.ingredients);
              }
            }
          } catch (e) {
            console.warn("analyze-meal: text analyze prompt failed, semantic fallback:", e);
          }
        }
        emitProgress("match", 74);
        const dedupeUnmatched2 = () => {
          const seen = /* @__PURE__ */ new Set();
          return outUnmatched2.filter((row) => {
            const k = `${normalizeName(row.name)}|${(row.unit || "g").toLowerCase()}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        };
        outUnmatched2 = dedupeUnmatched2();
        if (outUnmatched2.length > 0) {
          emitProgress("alternatives", 78);
          const rescueQueries = collectOffQueriesForUnmatchedItems(outUnmatched2, text, 6);
          const rescueParallel = await searchOpenFoodFactsProductsParallel(rescueQueries, {
            maxQueries: 12,
            concurrency: 3,
            pageSize: 12,
            onQueryDone: (done, total) => {
              emitProgress("alternatives", 78 + Math.round(10 * done / Math.max(1, total)));
            }
          });
          offParallel2 = mergeOffParallelResults(offParallel2, rescueParallel);
          const rescueFoods = rescueParallel.foods;
          if (rescueFoods.length > 0) {
            mergedPool2 = mergeCatalogFoodPool([...offCandidates2, ...rescueFoods]);
            const retry = resolveMealGroupsAgainstFoodPool(
              [{ label: "Nachladen", parsed: outUnmatched2 }],
              mergedPool2,
              text
            );
            const recovered = retry.mealItemGroups.flatMap((g) => g.ingredients);
            if (recovered.length > 0) {
              outIngredients2 = collapseDuplicateIngredients([...outIngredients2, ...recovered]);
              const regroup = assignIngredientsToDecomposedMealGroups(
                groups2,
                outIngredients2,
                mergedPool2
              );
              if (regroup.mealItemGroups.length > 0) {
                mealItemGroups2 = regroup.mealItemGroups;
              }
              outUnmatched2 = regroup.unmatched.length > 0 ? regroup.unmatched : retry.unmatched;
            }
          }
          const needExpand = outUnmatched2.length > 0 && outUnmatched2.length <= 2 && countGroupedIngredients2(mealItemGroups2) < Math.max(1, flatParsed2.length);
          if (needExpand) {
            const row = outUnmatched2[0];
            try {
              emitProgress("alternatives", 88);
              const expandRaw = await completeMealAnalysis(
                buildMealIngredientExpandPrompt(row.name, text),
                void 0,
                { temperature: 0.18, responseMode: "json_object" }
              );
              let expanded = extractIngredientsFromAiContent(expandRaw);
              expanded = normalizeDecomposedParsedItems(expanded);
              if (expanded.length > 0) {
                const expandParallel = await searchOpenFoodFactsProductsParallel(
                  expanded.flatMap((exRow) => buildOffSearchQueriesForPhrase(exRow.name, text)),
                  { maxQueries: 10, concurrency: 3, pageSize: 12 }
                );
                offParallel2 = mergeOffParallelResults(offParallel2, expandParallel);
                const expandFoods = expandParallel.foods;
                if (expandFoods.length > 0) {
                  mergedPool2 = mergeCatalogFoodPool([...mergedPool2, ...expandFoods]);
                  const expandResolve = resolveMealGroupsAgainstFoodPool(
                    [{ label: row.name, parsed: expanded, tracking: "components" }],
                    mergedPool2,
                    text
                  );
                  const extra = expandResolve.mealItemGroups.flatMap((g) => g.ingredients);
                  if (extra.length > 0) {
                    outIngredients2 = collapseDuplicateIngredients([...outIngredients2, ...extra]);
                    const regroup = assignIngredientsToDecomposedMealGroups(
                      groups2,
                      outIngredients2,
                      mergedPool2
                    );
                    if (regroup.mealItemGroups.length > 0) {
                      mealItemGroups2 = regroup.mealItemGroups;
                    }
                    const matchedNames = new Set(extra.map((i) => normalizeName(i.name)));
                    outUnmatched2 = outUnmatched2.filter(
                      (u) => !matchedNames.has(normalizeName(u.name))
                    );
                  }
                }
              }
            } catch (e) {
              console.warn("analyze-meal: ingredient expand skipped:", row.name, e);
            }
          }
          emitProgress("alternatives", 90);
        }
        emitProgress("finalize", 96);
        outUnmatched2 = dedupeUnmatched2();
        outIngredients2 = filterOffOnlyIngredients(
          collapseDuplicateIngredients(
            mealItemGroups2.length > 0 ? mealItemGroups2.flatMap((g) => g.ingredients) : outIngredients2
          ),
          mergedPool2
        );
        mealItemGroups2 = mealItemGroups2.map((g) => ({
          ...g,
          ingredients: filterOffOnlyIngredients(g.ingredients, mergedPool2)
        })).filter((g) => g.ingredients.length > 0);
        emitProgress("finalize", 98);
        const textAutoPersist = await finalizeMealAnalyzeWithAutoPersist({
          pool,
          outUnmatched: outUnmatched2,
          outIngredients: outIngredients2,
          mealItemGroups: mealItemGroups2,
          mergedPool: mergedPool2,
          groups: groups2,
          completeMealAnalysis
        });
        outUnmatched2 = textAutoPersist.outUnmatched;
        outIngredients2 = textAutoPersist.outIngredients;
        mealItemGroups2 = textAutoPersist.mealItemGroups;
        mergedPool2 = textAutoPersist.mergedPool;
        const textPayload = {
          ingredients: outIngredients2,
          mealItemGroups: mealItemGroups2.length > 0 ? mealItemGroups2 : void 0,
          proposedDbFoods: [],
          researchNote: null,
          offUnmatched: outUnmatched2.map((u) => u.name.trim()).filter(Boolean),
          autoPersistedAppFoods: textAutoPersist.autoPersistedNames,
          offCatalogEmpty: isOffSearchUnavailable(offParallel2),
          decomposeSanitized: null,
          learnedMealCombo: null
        };
        emitProgress("finalize", 100);
        if (useStream) {
          finishStream(textPayload);
          return;
        }
        res.json(textPayload);
        return;
      }
      if (!image) {
        failStream("Bild erforderlich.", 400);
        return;
      }
      const textForRank = text ? normalizeGermanMealInputForRanking(text) : "";
      const mealContext = textForRank || "Foto Mahlzeit";
      emitProgress("interpret", 10);
      let visionObserved = [];
      try {
        const observePrompt = buildMealAnalyzePhotoPrompt({ phase: "observe", userText: text });
        const idRaw = await completeMealAnalysis(observePrompt, image, {
          temperature: 0.12,
          responseMode: "json_object"
        });
        visionObserved = extractVisionObservedFromAiContent(idRaw);
      } catch (e) {
        console.warn("analyze-meal: photo observe failed:", e);
      }
      const visionSummary = visionObservedSummaryText(visionObserved);
      let groups = visionObserved.map((row) => ({
        label: row.name.trim() || "Mahlzeit",
        parsed: [row],
        tracking: "auto"
      }));
      if (!groups.length && text) {
        const fbLabel = text.trim().replace(/\r?\n+/g, " ").slice(0, 120) || "Mahlzeit";
        groups = [{ label: fbLabel, parsed: parseSimpleDescription(text) }];
      }
      groups = dedupeDecomposedMealItemsByLabel(
        groups.map((g) => ({ ...g, parsed: normalizeDecomposedStkAmounts(g.parsed) }))
      );
      emitProgress("interpret", 24);
      emitProgress("off_search", 32);
      let offParallel = {
        foods: [],
        queriesAttempted: 0,
        queriesFailed: 0
      };
      let offCandidates = [];
      const offQueries = collectOffQueriesForVisionAnalysis(visionObserved, text);
      if (offQueries.length > 0 || textForRank.length >= 2) {
        offParallel = await searchOpenFoodFactsProductsParallel(
          offQueries.length > 0 ? offQueries : [textForRank.slice(0, 80)],
          {
            maxQueries: 20,
            concurrency: 3,
            pageSize: 14,
            onQueryDone: (done, total) => {
              emitProgress("off_search", 32 + Math.round(16 * done / Math.max(1, total)));
            }
          }
        );
        offCandidates = offParallel.foods;
        if (offCandidates.length === 0 && textForRank.length >= 2) {
          offParallel = mergeOffParallelResults(
            offParallel,
            await searchOpenFoodFactsProductsParallel([textForRank.slice(0, 80)], {
              maxQueries: 1,
              concurrency: 1,
              pageSize: 20
            })
          );
          offCandidates = offParallel.foods;
        }
      }
      emitProgress("off_search", 48);
      let mergedPool = mergeCatalogFoodPool(offCandidates);
      const flatParsed = flattenDecomposedMealItems(groups);
      emitProgress("match", 55);
      let candidateFoods = resolveCandidateFoodsForAnalysis(
        textForRank || visionSummary,
        true,
        mergedPool,
        flatParsed
      );
      if (candidateFoods.length === 0 && mergedPool.length > 0) {
        candidateFoods = rankFoodsForMealDescription(text || visionSummary || "mahlzeit", 56, mergedPool);
      }
      let mealItemGroups = [];
      let outIngredients = [];
      let outUnmatched = [];
      const countGroupedIngredients = (grps) => grps.reduce((n, g) => n + g.ingredients.length, 0);
      const applySemanticFallback = () => {
        const fb = resolveMealGroupsAgainstFoodPool(groups, mergedPool, mealContext);
        mealItemGroups = fb.mealItemGroups;
        outUnmatched = fb.unmatched;
        outIngredients = mealItemGroups.flatMap((g) => g.ingredients);
      };
      applySemanticFallback();
      if (mergedPool.length > 0 && candidateFoods.length > 0 && visionSummary) {
        try {
          const matchPrompt = buildMealAnalyzePhotoPrompt({
            phase: "match",
            userText: text,
            visionSummary,
            allowedFoods: candidateFoods
          });
          const matchRaw = await completeMealAnalysis(matchPrompt, image, {
            temperature: 0.14,
            responseMode: "json_object"
          });
          const aiGroups = extractDecomposedMealItemsFromAiContent(matchRaw, text || visionSummary);
          if (aiGroups.length > 0) {
            groups = dedupeDecomposedMealItemsByLabel(
              aiGroups.map((g) => ({
                ...g,
                parsed: normalizeDecomposedParsedItems(normalizeDecomposedStkAmounts(g.parsed))
              }))
            );
            const fb = resolveMealGroupsAgainstFoodPool(groups, mergedPool, mealContext);
            if (fb.mealItemGroups.length > countGroupedIngredients(mealItemGroups)) {
              mealItemGroups = fb.mealItemGroups;
              outUnmatched = fb.unmatched;
              outIngredients = mealItemGroups.flatMap((g) => g.ingredients);
            }
          }
        } catch (e) {
          console.warn("analyze-meal: photo match failed, semantic fallback:", e);
        }
      }
      emitProgress("match", 74);
      const dedupeUnmatched = () => {
        const seen = /* @__PURE__ */ new Set();
        return outUnmatched.filter((row) => {
          const k = `${normalizeName(row.name)}|${(row.unit || "g").toLowerCase()}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };
      outUnmatched = dedupeUnmatched();
      if (outUnmatched.length > 0) {
        emitProgress("alternatives", 78);
        const rescueQueries = collectOffQueriesForUnmatchedItems(outUnmatched, mealContext, 8);
        const rescueParallel = await searchOpenFoodFactsProductsParallel(rescueQueries, {
          maxQueries: 12,
          concurrency: 3,
          pageSize: 12
        });
        offParallel = mergeOffParallelResults(offParallel, rescueParallel);
        const rescueFoods = rescueParallel.foods;
        if (rescueFoods.length > 0) {
          mergedPool = mergeCatalogFoodPool([...offCandidates, ...rescueFoods]);
          const retry = resolveMealGroupsAgainstFoodPool(
            [{ label: "Foto", parsed: outUnmatched }],
            mergedPool,
            mealContext
          );
          const recovered = retry.mealItemGroups.flatMap((g) => g.ingredients);
          if (recovered.length > 0) {
            outIngredients = collapseDuplicateIngredients([...outIngredients, ...recovered]);
            const regroup = assignIngredientsToDecomposedMealGroups(groups, outIngredients, mergedPool);
            if (regroup.mealItemGroups.length > 0) {
              mealItemGroups = regroup.mealItemGroups;
              outUnmatched = regroup.unmatched.length > 0 ? regroup.unmatched : retry.unmatched;
            }
          }
        }
        const needExpand = outUnmatched.length > 0 && outUnmatched.length <= 2 && countGroupedIngredients(mealItemGroups) < Math.max(1, flatParsed.length);
        if (needExpand) {
          const row = outUnmatched[0];
          try {
            emitProgress("alternatives", 88);
            const expandRaw = await completeMealAnalysis(
              buildMealIngredientExpandPrompt(row.name, mealContext),
              void 0,
              { temperature: 0.18, responseMode: "json_object" }
            );
            let expanded = extractIngredientsFromAiContent(expandRaw);
            expanded = normalizeDecomposedParsedItems(expanded);
            if (expanded.length > 0) {
              const expandParallel = await searchOpenFoodFactsProductsParallel(
                expanded.flatMap((exRow) => buildOffSearchQueriesForPhrase(exRow.name, mealContext)),
                { maxQueries: 10, concurrency: 3, pageSize: 12 }
              );
              offParallel = mergeOffParallelResults(offParallel, expandParallel);
              const expandFoods = expandParallel.foods;
              if (expandFoods.length > 0) {
                mergedPool = mergeCatalogFoodPool([...mergedPool, ...expandFoods]);
                const expandResolve = resolveMealGroupsAgainstFoodPool(
                  [{ label: row.name, parsed: expanded, tracking: "components" }],
                  mergedPool,
                  mealContext
                );
                const extra = expandResolve.mealItemGroups.flatMap((g) => g.ingredients);
                if (extra.length > 0) {
                  outIngredients = collapseDuplicateIngredients([...outIngredients, ...extra]);
                  const regroup = assignIngredientsToDecomposedMealGroups(groups, outIngredients, mergedPool);
                  if (regroup.mealItemGroups.length > 0) {
                    mealItemGroups = regroup.mealItemGroups;
                  }
                  const matchedNames = new Set(extra.map((i) => normalizeName(i.name)));
                  outUnmatched = outUnmatched.filter((u) => !matchedNames.has(normalizeName(u.name)));
                }
              }
            }
          } catch (e) {
            console.warn("analyze-meal: photo expand skipped:", row.name, e);
          }
        }
        emitProgress("alternatives", 92);
      }
      emitProgress("finalize", 96);
      outUnmatched = dedupeUnmatched();
      outIngredients = filterOffOnlyIngredients(
        collapseDuplicateIngredients(
          mealItemGroups.length > 0 ? mealItemGroups.flatMap((g) => g.ingredients) : outIngredients
        ),
        mergedPool
      );
      mealItemGroups = mealItemGroups.map((g) => ({
        ...g,
        ingredients: filterOffOnlyIngredients(g.ingredients, mergedPool)
      })).filter((g) => g.ingredients.length > 0);
      emitProgress("finalize", 98);
      const photoAutoPersist = await finalizeMealAnalyzeWithAutoPersist({
        pool,
        outUnmatched,
        outIngredients,
        mealItemGroups,
        mergedPool,
        groups,
        completeMealAnalysis
      });
      outUnmatched = photoAutoPersist.outUnmatched;
      outIngredients = photoAutoPersist.outIngredients;
      mealItemGroups = photoAutoPersist.mealItemGroups;
      mergedPool = photoAutoPersist.mergedPool;
      const photoPayload = {
        ingredients: outIngredients,
        mealItemGroups: mealItemGroups.length > 0 ? mealItemGroups : void 0,
        proposedDbFoods: [],
        researchNote: null,
        offUnmatched: outUnmatched.map((u) => u.name.trim()).filter(Boolean),
        autoPersistedAppFoods: photoAutoPersist.autoPersistedNames,
        offCatalogEmpty: isOffSearchUnavailable(offParallel),
        decomposeSanitized: null,
        learnedMealCombo: null
      };
      emitProgress("finalize", 100);
      if (useStream) {
        finishStream(photoPayload);
        return;
      }
      res.json(photoPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Meal analysis failed";
      console.error("analyze-meal:", err);
      failStream(msg);
    }
  });
  app.post("/api/ai/suggest-custom-food-draft", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const { query } = req.body;
    const q = (query ?? "").trim();
    if (!q || q.length > 240) {
      res.status(400).json({ error: "Produktname erforderlich (max. 240 Zeichen)." });
      return;
    }
    try {
      const prompt = buildSuggestCustomFoodDraftPrompt(q);
      const raw = await completeMealAnalysis(prompt, void 0, {
        temperature: 0.25,
        responseMode: "json_object"
      });
      const draft = parseCustomFoodDraftFromAi(raw, q);
      res.json({ draft });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "custom food draft failed";
      console.error("suggest-custom-food-draft:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/ai/daily-nutrition-review", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const fin = (x, fb = 0) => {
      const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
      return Number.isFinite(n) ? n : fb;
    };
    const body = req.body;
    const locale = body.locale === "en" ? "en" : "de";
    const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const adjustedCalorieTarget = Math.max(0, Math.round(fin(body.adjustedCalorieTarget, 0)));
    const baseCalorieTarget = Math.max(0, Math.round(fin(body.baseCalorieTarget, 0)));
    const activeBurnToday = Math.max(0, Math.round(fin(body.activeBurnToday, 0)));
    const tm = body.targetMacros;
    const targetMacros = {
      protein: Math.max(0, fin(tm?.protein, 0)),
      carbs: Math.max(0, fin(tm?.carbs, 0)),
      fat: Math.max(0, fin(tm?.fat, 0))
    };
    const cons = body.consumed;
    const consumed = {
      calories: Math.max(0, Math.round(fin(cons?.calories, 0))),
      protein: Math.max(0, fin(cons?.protein, 0)),
      carbs: Math.max(0, fin(cons?.carbs, 0)),
      fat: Math.max(0, fin(cons?.fat, 0))
    };
    const gt = body.goalType;
    const goalType = gt === "lose" || gt === "maintain" || gt === "gain" ? gt : "maintain";
    const mealsRaw = body.meals;
    const meals = [];
    if (Array.isArray(mealsRaw)) {
      for (const row of mealsRaw.slice(0, 48)) {
        const o = row;
        const meal = String(o.meal ?? "").trim().slice(0, 220);
        if (!meal) continue;
        const cat = String(o.category ?? "snack").trim().slice(0, 24);
        meals.push({
          meal,
          category: cat,
          calories: Math.max(0, Math.round(fin(o.calories, 0))),
          protein: Math.round(fin(o.protein, 0) * 10) / 10,
          carbs: Math.round(fin(o.carbs, 0) * 10) / 10,
          fat: Math.round(fin(o.fat, 0) * 10) / 10
        });
      }
    }
    if (meals.length === 0 && consumed.calories <= 0) {
      res.status(400).json({
        error: locale === "de" ? "Keine Eintr\xE4ge f\xFCr diesen Tag." : "No entries for this day."
      });
      return;
    }
    const macroKcal = 4 * consumed.protein + 4 * consumed.carbs + 9 * consumed.fat;
    const pctP = macroKcal > 0 ? 4 * consumed.protein * 100 / macroKcal : 0;
    const pctC = macroKcal > 0 ? 4 * consumed.carbs * 100 / macroKcal : 0;
    const pctF = macroKcal > 0 ? 9 * consumed.fat * 100 / macroKcal : 0;
    const catDe = {
      breakfast: "Fr\xFChst\xFCck",
      lunch: "Mittagessen",
      dinner: "Abendessen",
      snack: "Snack"
    };
    const catEn = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snack: "Snack"
    };
    const byCategory = /* @__PURE__ */ new Map();
    for (const m of meals) {
      const key = String(m.category ?? "snack").toLowerCase().slice(0, 24) || "snack";
      const row = byCategory.get(key) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        count: 0
      };
      row.calories += m.calories;
      row.protein += m.protein;
      row.carbs += m.carbs;
      row.fat += m.fat;
      row.count += 1;
      byCategory.set(key, row);
    }
    const catOrder = ["breakfast", "lunch", "dinner", "snack"];
    const restCats = [...byCategory.keys()].filter((c) => !catOrder.includes(c)).sort();
    const orderedCats = [
      ...catOrder.filter((c) => byCategory.has(c)),
      ...restCats
    ];
    const fmtCatLines = (labels) => orderedCats.map((c) => {
      const a = byCategory.get(c);
      const label = labels[c] ?? c;
      const p = Math.round(a.protein * 10) / 10;
      const cb = Math.round(a.carbs * 10) / 10;
      const f = Math.round(a.fat * 10) / 10;
      const n = a.count;
      return locale === "de" ? `- ${label}: ${a.calories} kcal; P ${p} g, KH ${cb} g, Fett ${f} g (${n} ${n === 1 ? "Eintrag" : "Eintr\xE4ge"})` : `- ${label}: ${a.calories} kcal; P ${p} g, C ${cb} g, F ${f} g (${n} ${n === 1 ? "entry" : "entries"})`;
    }).join("\n");
    const mealCategorySummary = fmtCatLines(locale === "de" ? catDe : catEn);
    const goalExplainDe = goalType === "lose" ? "Gewicht reduzieren / Defizit" : goalType === "gain" ? "Gewicht zunehmen / Aufbau" : "Gewicht halten / Erhalt";
    const goalExplainEn = goalType === "lose" ? "weight loss / caloric deficit" : goalType === "gain" ? "muscle gain / surplus" : "maintenance";
    const reviewVars = {
      goalExplain: locale === "de" ? goalExplainDe : goalExplainEn,
      date,
      adjustedCalorieTarget: String(adjustedCalorieTarget),
      baseCalorieTarget: String(baseCalorieTarget),
      activeBurnToday: String(activeBurnToday),
      targetProtein: String(targetMacros.protein),
      targetCarbs: String(targetMacros.carbs),
      targetFat: String(targetMacros.fat),
      consumedCalories: String(consumed.calories),
      consumedProtein: String(Math.round(consumed.protein * 10) / 10),
      consumedCarbs: String(Math.round(consumed.carbs * 10) / 10),
      consumedFat: String(Math.round(consumed.fat * 10) / 10),
      pctProtein: pctP.toFixed(0),
      pctCarbs: pctC.toFixed(0),
      pctFat: pctF.toFixed(0),
      mealCategorySummary: mealCategorySummary || (locale === "de" ? "(noch keine Kategorie-Summen \u2014 nur Gesamtwerte oben)" : "(no per-category totals yet \u2014 use the day totals above)")
    };
    const prompt = buildDailyNutritionReviewPrompt(locale, reviewVars);
    function stripMdNutAiText(t) {
      return t.replace(/\r\n/g, "\n").split("\n").map((line) => {
        let s = line.trim();
        if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(s)) return "";
        if (/^general information only/i.test(s)) return "";
        s = s.replace(/\*\*+/g, "");
        s = s.replace(/\*+/g, "");
        s = s.replace(/_+/g, "");
        s = s.replace(/`+/g, "");
        s = s.replace(/^#+\s*/, "");
        return s.trim();
      }).filter((l) => l.length > 0).join("\n");
    }
    function normalizeDailyNutritionReviewText(raw, loc) {
      let s = stripMdNutAiText(String(raw ?? "").trim());
      const linesIn = s.split("\n").map((l) => l.trim());
      const lines = [];
      let skipRest = false;
      for (const line of linesIn) {
        if (!line) continue;
        if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(line)) {
          skipRest = true;
          continue;
        }
        if (/^general information only/i.test(line)) {
          skipRest = true;
          continue;
        }
        if (skipRest) continue;
        lines.push(line);
      }
      s = lines.join("\n").trim();
      const marker = loc === "de" ? "Gut:" : "Good:";
      const idx = s.indexOf(marker);
      if (idx > 0) s = s.slice(idx).trim();
      const maxChars = 900;
      if (s.length <= maxChars) return s;
      const cut = s.slice(0, maxChars);
      const lastNl = cut.lastIndexOf("\n");
      if (lastNl > maxChars * 0.35) return cut.slice(0, lastNl).trim();
      return `${cut.replace(/\s+\S*$/, "").trim()}\u2026`;
    }
    try {
      const raw = await completeMealAnalysis(prompt, void 0, {
        temperature: 0.35,
        responseMode: "text"
      });
      const text = normalizeDailyNutritionReviewText(raw, locale);
      if (!text) {
        res.status(500).json({ error: "Leere KI-Antwort." });
        return;
      }
      res.json({ text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "daily nutrition review failed";
      console.error("daily-nutrition-review:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/ai/generate-workout-template", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const body = req.body;
    const equipment = Array.isArray(body.equipment) ? body.equipment : [];
    const duration = typeof body.duration === "number" ? body.duration : 60;
    const type = body.type === "Cardio" || body.type === "Hybrid" ? body.type : "Strength";
    const equipmentList = equipment.length > 0 ? equipment.join(", ") : "bodyweight only";
    const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
    const exerciseKeyBlock = exerciseCatalog.trim() ? `

ALLOWED exerciseKey values (prefer exact keys from this catalog; format edb_<id>):
${exerciseCatalog}
` : "";
    const prompt = buildWorkoutTemplateGeneratePrompt({
      workoutType: type,
      equipmentList,
      duration: String(duration),
      specialRequestsBlock: body.specialRequests ? `- Special requests: ${body.specialRequests}` : "",
      exerciseKeyBlock
    });
    try {
      const text = await completeWorkoutTemplateJson(prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ error: "Could not parse AI workout response" });
        return;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      res.json({
        name: parsed.name || "AI Generated Workout",
        type: parsed.type || type,
        description: parsed.description,
        exercises: parsed.exercises || []
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Workout generation failed";
      console.error("generate-workout-template:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, firstName, lastName, email, password, age, gender, themePreference } = req.body;
      const themePref = themePreference === "light" || themePreference === "dark" ? themePreference : "dark";
      const first = String(firstName ?? "").trim();
      const last = String(lastName ?? "").trim();
      const displayName = (name?.trim() || `${first} ${last}`.trim()).trim();
      if (!displayName || displayName.length < 3 || !email || !password) {
        res.status(400).json({ error: "All fields required" });
        return;
      }
      if (firstName != null && first.length < 2) {
        res.status(400).json({ error: "Invalid first name" });
        return;
      }
      if (lastName != null && last.length < 2) {
        res.status(400).json({ error: "Invalid last name" });
        return;
      }
      const regFirst = first || splitNameParts(displayName).firstName;
      const regLast = last || splitNameParts(displayName).lastName;
      const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
      if (existing.rows.length) {
        res.status(409).json({ error: "auth/email-already-in-use" });
        return;
      }
      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, display_name, first_name, last_name, theme_preference)
         VALUES ($1,$2,$3,$1,$4,$5,$6) RETURNING *`,
        [displayName, email, hash, regFirst, regLast, themePref]
      );
      const user = result.rows[0];
      if (age || gender) {
        const initialMeasurements = { age: age || null, gender: gender || null };
        await pool.query(
          "UPDATE users SET measurements=$2, updated_at=NOW() WHERE id=$1",
          [user.id, JSON.stringify(initialMeasurements)]
        );
        user.measurements = initialMeasurements;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query("SELECT * FROM users WHERE email=$1 AND is_active=true", [email]);
      if (!result.rows.length) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const user = result.rows[0];
      if (!user.password_hash) {
        res.status(401).json({ error: "Use Google sign-in" });
        return;
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });
  app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || typeof password !== "string") {
        res.status(400).json({ error: "password-required" });
        return;
      }
      const result = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
      if (!result.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      const ph = result.rows[0].password_hash;
      if (!ph) {
        res.status(400).json({ error: "oauth-account-no-password" });
        return;
      }
      const valid = await bcrypt.compare(password, ph);
      if (!valid) {
        res.status(401).json({ error: "invalid-password" });
        return;
      }
      await pool.query("DELETE FROM users WHERE id=$1", [req.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error("delete-account:", err);
      res.status(500).json({ error: "delete-failed" });
    }
  });
  app.post("/api/migration/v2/run", requireAuth, async (req, res) => {
    try {
      const result = await runUserDataMigrationV2(pool, req.userId);
      const profileRow = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
      res.json({ ...result, profile: mapUser(profileRow.rows[0]) });
    } catch (err) {
      console.error("migration/v2/run:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-failed" });
    }
  });
  app.get("/api/admin/migration/status", requireAdmin, async (_req, res) => {
    try {
      const status = await getDataMigrationStatus(pool);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-status-failed" });
    }
  });
  app.post("/api/admin/migration/run-all", requireAdmin, async (req, res) => {
    try {
      const force = !!req.body?.force;
      const result = await runBatchDataMigrationForAllUsers(pool, { force });
      res.json({ ok: result.ok, ...result });
    } catch (err) {
      console.error("admin/migration/run-all:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-batch-failed" });
    }
  });
  app.post("/api/admin/flag-migration-v2", requireAdmin, async (_req, res) => {
    try {
      const count = await flagAllUsersForMigrationV2(pool);
      res.json({ ok: true, usersFlagged: count });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "flag-failed" });
    }
  });
  app.get("/api/profile", requireAuth, async (req, res) => {
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(mapUser(result.rows[0]));
  });
  app.patch("/api/profile", requireAuth, async (req, res) => {
    const extrasKeys = [
      "freeWorkoutSchedule",
      "dailyWaterLog",
      "checkIns",
      "favoriteMealTemplateIds",
      "bodyMeasurements",
      "dailyActivityLog",
      "navigationFocus",
      "uiLocale",
      "useCoachLevelV2",
      "exerciseRestSeconds",
      "dataMigrationVersion",
      "migrationV2Required"
    ];
    const pePatch = {};
    for (const k of extrasKeys) {
      if (k in req.body) pePatch[k] = req.body[k];
    }
    if (Object.keys(pePatch).length > 0 || "themePreference" in req.body) {
      const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
      const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
      const merged = { ...prev, ...pePatch };
      delete merged.themeVariant;
      await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
        req.userId,
        JSON.stringify(merged)
      ]);
    }
    const allowed = {
      displayName: "display_name",
      photoURL: "photo_url",
      bio: "bio",
      onboarded: "onboarded",
      themePreference: "theme_preference",
      goals: "goals",
      measurements: "measurements",
      workoutPlan: "workout_plan",
      coachPreferences: "coach_preferences",
      weightHistory: "weight_history",
      coachingActive: "coaching_active"
    };
    const sets = [];
    const vals = [req.userId];
    for (const [key, col] of Object.entries(allowed)) {
      if (key in req.body) {
        const v = req.body[key];
        vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
        sets.push(`${col}=$${vals.length}`);
      }
    }
    if (sets.length) {
      await pool.query(`UPDATE users SET ${sets.join(",")},updated_at=NOW() WHERE id=$1`, vals);
    }
    const body = req.body;
    if ("firstName" in body || "lastName" in body) {
      const cur = await pool.query("SELECT first_name, last_name, display_name, name FROM users WHERE id=$1", [
        req.userId
      ]);
      const row = cur.rows[0] ?? {};
      const resolved = resolveUserNameFields(row);
      const nextFirst = "firstName" in body ? String(body.firstName ?? "").trim() : resolved.firstName;
      const nextLast = "lastName" in body ? String(body.lastName ?? "").trim() : resolved.lastName;
      if (!validateNameParts(nextFirst, nextLast)) {
        res.status(400).json({ error: "Invalid name" });
        return;
      }
      const displayName = buildDisplayName2(nextFirst, nextLast);
      await pool.query(
        `UPDATE users SET first_name=$2, last_name=$3, name=$4, display_name=$4, updated_at=NOW() WHERE id=$1`,
        [req.userId, nextFirst, nextLast, displayName]
      );
    } else if ("displayName" in body) {
      const displayName = String(body.displayName ?? "").trim();
      if (displayName.length < 3) {
        res.status(400).json({ error: "Invalid name" });
        return;
      }
      const { firstName, lastName } = splitNameParts(displayName);
      await pool.query(
        `UPDATE users SET first_name=$2, last_name=$3, name=$4, display_name=$4, updated_at=NOW() WHERE id=$1`,
        [req.userId, firstName, lastName, displayName]
      );
    }
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
    res.json(mapUser(result.rows[0]));
  });
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT id, display_name, name, photo_url FROM users WHERE id=$1",
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const u = result.rows[0];
    res.json({ uid: u.id.toString(), displayName: u.display_name || u.name, photoURL: u.photo_url || "" });
  });
  app.get("/api/users/:id/social", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    if (Number.isNaN(uid)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [followers, following, rel] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE following_id=$1`, [uid]),
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE follower_id=$1`, [uid]),
      pool.query(`SELECT 1 FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, uid])
    ]);
    res.json({
      followers: followers.rows[0]?.c ?? 0,
      following: following.rows[0]?.c ?? 0,
      youFollow: rel.rows.length > 0
    });
  });
  app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    if (Number.isNaN(target) || target === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    await pool.query(
      `INSERT INTO user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.userId, target]
    );
    res.json({ ok: true });
  });
  app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, target]);
    res.json({ ok: true });
  });
  app.get("/api/users/:id/posts", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 80`,
      [uid]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.get("/api/posts/liked", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE $1 = ANY(p.likes) ORDER BY p.created_at DESC LIMIT 80`,
      [req.userId]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.get("/api/messages/inbox", requireAuth, async (req, res) => {
    const result = await pool.query(
      `WITH partners AS (
         SELECT DISTINCT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS oid
         FROM direct_messages WHERE sender_id=$1 OR recipient_id=$1
       )
       SELECT u.id, u.display_name, u.name, u.photo_url,
         (SELECT body FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_body,
         (SELECT created_at FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_at
       FROM partners p JOIN users u ON u.id=p.oid
       ORDER BY last_at DESC NULLS LAST`,
      [req.userId]
    );
    res.json(
      result.rows.map((r) => ({
        userId: r.id.toString(),
        displayName: r.display_name || r.name || "",
        photoURL: r.photo_url || "",
        lastMessage: r.last_body || "",
        lastAt: r.last_at
      }))
    );
  });
  app.get("/api/messages/thread/:userId", requireAuth, async (req, res) => {
    const other = parseInt(req.params.userId, 10);
    const result = await pool.query(
      `SELECT id, sender_id, recipient_id, body, created_at FROM direct_messages
       WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
       ORDER BY created_at ASC LIMIT 300`,
      [req.userId, other]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        senderId: r.sender_id.toString(),
        recipientId: r.recipient_id.toString(),
        body: r.body,
        createdAt: r.created_at
      }))
    );
  });
  app.post("/api/messages", requireAuth, async (req, res) => {
    const { recipientId, body } = req.body;
    const rid = parseInt(String(recipientId || ""), 10);
    const text = (body || "").trim().slice(0, 4e3);
    if (!text || Number.isNaN(rid) || rid === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.userId, rid, text]
    );
    res.json({ id: ins.rows[0].id, createdAt: ins.rows[0].created_at });
  });
  app.get("/api/workouts", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapWorkout));
  });
  app.post("/api/workouts", requireAuth, async (req, res) => {
    const { name, type, subtype, duration, caloriesBurned, date, exercises, notes, shared } = req.body;
    const result = await pool.query(
      `INSERT INTO workouts (user_id,name,type,subtype,duration,calories_burned,date,exercises,notes,shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        req.userId,
        name,
        type,
        subtype,
        duration || 0,
        caloriesBurned || 0,
        date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(exercises || []),
        notes,
        shared || false
      ]
    );
    res.json({ id: result.rows[0].id });
  });
  app.put("/api/workouts/:id", requireAuth, async (req, res) => {
    const { name, duration, caloriesBurned, exercises, notes, shared } = req.body;
    await pool.query(
      `UPDATE workouts SET name=$2,duration=$3,calories_burned=$4,exercises=$5,notes=$6,shared=$7,updated_at=NOW()
       WHERE id=$1 AND user_id=$8`,
      [req.params.id, name, duration, caloriesBurned, JSON.stringify(exercises || []), notes, shared, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/workouts/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM workouts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/workout-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const extras = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    res.json(extras.workoutSessionDraft ?? null);
  });
  app.put("/api/workout-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    const merged = { ...prev, workoutSessionDraft: req.body };
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(merged)
    ]);
    res.json({ ok: true });
  });
  app.delete("/api/workout-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    const { workoutSessionDraft: _d, ...rest } = prev;
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(rest)
    ]);
    res.json({ ok: true });
  });
  app.get("/api/workout-templates", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM workout_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapTemplate));
  });
  app.post("/api/workout-templates", requireAuth, async (req, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    const result = await pool.query(
      "INSERT INTO workout_templates (user_id,name,type,template_mode,exercises,week_plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [req.userId, name, type, templateMode || "workout", JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null]
    );
    res.json({ id: result.rows[0].id });
  });
  app.put("/api/workout-templates/:id", requireAuth, async (req, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    await pool.query(
      "UPDATE workout_templates SET name=$2,type=$3,template_mode=$4,exercises=$5,week_plan=$6 WHERE id=$1 AND user_id=$7",
      [req.params.id, name, type, templateMode || "workout", JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/workout-templates/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM workout_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/nutrition", requireAuth, async (req, res) => {
    const { date } = req.query;
    let query = "SELECT * FROM nutrition WHERE user_id=$1";
    const vals = [req.userId];
    if (date) {
      vals.push(date);
      query += ` AND date=$${vals.length}`;
    } else {
      query += " AND date >= CURRENT_DATE - INTERVAL '30 days'";
    }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, vals);
    res.json(result.rows.map(mapNutrition));
  });
  app.post("/api/nutrition", requireAuth, async (req, res) => {
    const { meal, category, calories, protein, carbs, fat, date, ingredients, quantity, unit } = req.body;
    const result = await pool.query(
      `INSERT INTO nutrition (user_id,meal,category,calories,protein,carbs,fat,date,ingredients,quantity,unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        req.userId,
        meal,
        category,
        calories || 0,
        protein || 0,
        carbs || 0,
        fat || 0,
        date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(ingredients || []),
        quantity != null && quantity !== "" ? Number(quantity) : null,
        unit || null
      ]
    );
    res.json({ id: result.rows[0].id });
  });
  app.patch("/api/nutrition/:id", requireAuth, async (req, res) => {
    const { meal, category, calories, protein, carbs, fat, date, ingredients, quantity, unit } = req.body;
    const dateVal = typeof date === "string" ? date.includes("T") ? date.split("T")[0] : date : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const qNum = quantity != null && quantity !== "" ? Number(quantity) : null;
    const result = await pool.query(
      `UPDATE nutrition SET
         meal=$1, category=$2, calories=$3, protein=$4, carbs=$5, fat=$6, date=$7,
         ingredients=$8::jsonb, quantity=$9, unit=$10
       WHERE id=$11 AND user_id=$12`,
      [
        String(meal || ""),
        category || "snack",
        Number(calories) || 0,
        Number(protein) || 0,
        Number(carbs) || 0,
        Number(fat) || 0,
        dateVal,
        JSON.stringify(ingredients ?? []),
        qNum,
        unit ? String(unit) : null,
        req.params.id,
        req.userId
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });
  app.delete("/api/nutrition/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM nutrition WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/meal-templates", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM meal_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapMealTemplate));
  });
  app.post("/api/meal-templates", requireAuth, async (req, res) => {
    const {
      name,
      category,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      yieldsPortions,
      prepSteps,
      source,
      llmEstimateNutrients,
      nutrientsComputedCoverage
    } = req.body;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions || 1), 10) || 1));
    const prepJson = JSON.stringify(Array.isArray(prepSteps) ? prepSteps : []);
    const llmEst = llmEstimateNutrients && typeof llmEstimateNutrients === "object" ? JSON.stringify(llmEstimateNutrients) : null;
    const cov = nutrientsComputedCoverage != null && nutrientsComputedCoverage !== "" ? Number(nutrientsComputedCoverage) : 0;
    const src = typeof source === "string" && source.trim() ? String(source).slice(0, 40) : "manual";
    await pool.query(
      `INSERT INTO meal_templates (
        user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
        prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
      ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)`,
      [
        req.userId,
        name,
        category,
        JSON.stringify(ingredients || []),
        totalCalories || 0,
        totalProtein || 0,
        totalCarbs || 0,
        totalFat || 0,
        yp,
        prepJson,
        llmEst,
        cov,
        src
      ]
    );
    res.json({ ok: true });
  });
  app.patch("/api/meal-templates/:id", requireAuth, async (req, res) => {
    const body = req.body;
    const {
      name,
      category,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      yieldsPortions,
      prepSteps,
      source,
      llmEstimateNutrients,
      nutrientsComputedCoverage
    } = body;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions ?? 1), 10) || 1));
    const existing = await pool.query(
      "SELECT prep_steps, llm_estimate_nutrients, nutrients_computed_coverage, source FROM meal_templates WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Template not found" });
    const row0 = existing.rows[0];
    const prepFinal = prepSteps != null ? JSON.stringify(prepSteps) : JSON.stringify(row0.prep_steps || []);
    const llmFinal = llmEstimateNutrients != null && typeof llmEstimateNutrients === "object" ? JSON.stringify(llmEstimateNutrients) : row0.llm_estimate_nutrients != null ? JSON.stringify(row0.llm_estimate_nutrients) : null;
    const covFinal = nutrientsComputedCoverage != null && nutrientsComputedCoverage !== "" ? Number(nutrientsComputedCoverage) : Number(row0.nutrients_computed_coverage ?? 0);
    const srcFinal = typeof source === "string" && source.trim() ? String(source).slice(0, 40) : String(row0.source || "manual");
    await pool.query(
      `UPDATE meal_templates SET
         name=$1, category=$2, ingredients=$3::jsonb,
         total_calories=$4, total_protein=$5, total_carbs=$6, total_fat=$7, yields_portions=$8,
         prep_steps=$9::jsonb, llm_estimate_nutrients=$10::jsonb, nutrients_computed_coverage=$11, source=$12
       WHERE id=$13 AND user_id=$14`,
      [
        name,
        category,
        JSON.stringify(ingredients || []),
        Number(totalCalories) || 0,
        Number(totalProtein) || 0,
        Number(totalCarbs) || 0,
        Number(totalFat) || 0,
        yp,
        prepFinal,
        llmFinal,
        covFinal,
        srcFinal,
        req.params.id,
        req.userId
      ]
    );
    res.json({ ok: true });
  });
  app.post("/api/meal-templates/ai-draft", requireAuth, async (req, res) => {
    const t0 = Date.now();
    let attempts = 0;
    let rawLast = "";
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { idea, allergies, yieldsPortions } = req.body;
      const ideaStr = String(idea || "").trim();
      if (!ideaStr) {
        res.status(400).json({ error: "idea required" });
        return;
      }
      const ypHint = yieldsPortions != null ? Number(yieldsPortions) : void 0;
      const ypHintNum = ypHint != null && Number.isFinite(ypHint) && ypHint > 0 ? ypHint : 4;
      const basePrompt = buildMealRecipeDraftPrompt(ideaStr, String(allergies || ""), ypHintNum);
      let repair = "";
      let parsed = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts = attempt;
        const prompt = repair ? `${basePrompt}

VALIDATOR REPAIR:
${repair}` : basePrompt;
        rawLast = await completeMealAnalysis(prompt, void 0, { responseMode: "json_object", temperature: 0.35 });
        try {
          const j = parseJsonLoose(rawLast);
          const z3 = mealRecipeAiSchema.safeParse(j);
          if (!z3.success) {
            repair = z3.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z3.data;
          repair = "";
          break;
        } catch (e) {
          repair = e?.message || String(e);
        }
      }
      if (!parsed) {
        await logMealAiRun(pool, {
          userId: req.userId,
          endpoint: "POST /api/meal-templates/ai-draft",
          inputSummary: { idea: ideaStr },
          rawResponse: rawLast.slice(0, 12e4),
          zodOk: false,
          retries: attempts,
          latencyMs: Date.now() - t0,
          errorMessage: repair || "validation failed",
          refinementRound: 0
        });
        res.status(500).json({ error: repair || "Meal AI validation failed" });
        return;
      }
      const yp = Math.max(1, Math.min(999, parsed.yields_portions ?? ypHint ?? 4));
      const ings = parsed.ingredients.map((i) => ({
        ...i,
        unresolved: i.unresolved ?? !i.foodId
      }));
      const offResolver = await buildOffFoodResolverForIngredients(ings);
      const compute = computeMealTemplateNutritionForRecipe(ings, offResolver);
      const ins = await pool.query(
        `INSERT INTO meal_templates (
          user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
          prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'ai_recipe') RETURNING *`,
        [
          req.userId,
          parsed.name,
          parsed.category || "meal",
          JSON.stringify(ings),
          compute.computed.calories,
          compute.computed.protein,
          compute.computed.carbs,
          compute.computed.fat,
          yp,
          JSON.stringify(parsed.prep_steps),
          parsed.llm_estimate_nutrients ? JSON.stringify(parsed.llm_estimate_nutrients) : null,
          compute.rowCoverage
        ]
      );
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-draft",
        inputSummary: { idea: ideaStr },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: null,
        refinementRound: 0
      });
      res.json(mapMealTemplate(ins.rows[0]));
    } catch (e) {
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-draft",
        inputSummary: { err: true },
        rawResponse: rawLast ? rawLast.slice(0, 12e4) : null,
        zodOk: false,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: e?.message ?? String(e),
        refinementRound: 0
      });
      console.error("meal-templates ai-draft:", e);
      res.status(500).json({ error: e?.message || "AI draft failed" });
    }
  });
  app.post("/api/meal-templates/ai-refine", requireAuth, async (req, res) => {
    const t0 = Date.now();
    let attempts = 0;
    let rawLast = "";
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { previousValid, userRefinement } = req.body;
      if (!previousValid || typeof userRefinement !== "string" || !userRefinement.trim()) {
        res.status(400).json({ error: "previousValid and userRefinement required" });
        return;
      }
      const base = buildMealRecipeRefinePrompt(
        userRefinement.trim(),
        JSON.stringify(previousValid, null, 2)
      );
      let repair = "";
      let parsed = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts = attempt;
        const prompt = repair ? `${base}
REPAIR: ${repair}` : base;
        rawLast = await completeMealAnalysis(prompt, void 0, { responseMode: "json_object", temperature: 0.35 });
        try {
          const j = parseJsonLoose(rawLast);
          const z3 = mealRecipeAiSchema.safeParse(j);
          if (!z3.success) {
            repair = z3.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z3.data;
          repair = "";
          break;
        } catch (e) {
          repair = e?.message || String(e);
        }
      }
      if (!parsed) {
        await logMealAiRun(pool, {
          userId: req.userId,
          endpoint: "POST /api/meal-templates/ai-refine",
          inputSummary: { userRefinement },
          rawResponse: rawLast.slice(0, 12e4),
          zodOk: false,
          retries: attempts,
          latencyMs: Date.now() - t0,
          errorMessage: repair || "validation failed",
          refinementRound: 1
        });
        res.status(500).json({ error: repair || "Refine validation failed" });
        return;
      }
      const yp = Math.max(1, Math.min(999, parsed.yields_portions ?? 4));
      const ings = parsed.ingredients.map((i) => ({
        ...i,
        unresolved: i.unresolved ?? !i.foodId
      }));
      const offResolver = await buildOffFoodResolverForIngredients(ings);
      const compute = computeMealTemplateNutritionForRecipe(ings, offResolver);
      const ins = await pool.query(
        `INSERT INTO meal_templates (
          user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
          prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'ai_recipe') RETURNING *`,
        [
          req.userId,
          parsed.name,
          parsed.category || "meal",
          JSON.stringify(ings),
          compute.computed.calories,
          compute.computed.protein,
          compute.computed.carbs,
          compute.computed.fat,
          yp,
          JSON.stringify(parsed.prep_steps),
          parsed.llm_estimate_nutrients ? JSON.stringify(parsed.llm_estimate_nutrients) : null,
          compute.rowCoverage
        ]
      );
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-refine",
        inputSummary: { userRefinement },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: null,
        refinementRound: 1
      });
      res.json(mapMealTemplate(ins.rows[0]));
    } catch (e) {
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-refine",
        inputSummary: { err: true },
        rawResponse: rawLast ? rawLast.slice(0, 12e4) : null,
        zodOk: false,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: e?.message ?? String(e),
        refinementRound: 1
      });
      console.error("meal-templates ai-refine:", e);
      res.status(500).json({ error: e?.message || "AI refine failed" });
    }
  });
  app.delete("/api/meal-templates/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM meal_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/posts", requireAuth, async (_req, res) => {
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       ORDER BY p.created_at DESC LIMIT 50`
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.post("/api/posts", requireAuth, async (req, res) => {
    const { content, imageUrl, type, workoutId } = req.body;
    const result = await pool.query(
      "INSERT INTO posts (user_id,content,image_url,type,workout_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [req.userId, content, imageUrl, type || "manual", workoutId]
    );
    res.json({ id: result.rows[0].id });
  });
  app.delete("/api/posts/:id", requireAuth, async (req, res) => {
    const result = await pool.query("DELETE FROM posts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!result.rowCount) {
      res.status(404).json({ error: "Beitrag nicht gefunden oder keine Berechtigung" });
      return;
    }
    res.json({ ok: true });
  });
  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_append(likes,$2) WHERE id=$1 AND NOT ($2=ANY(likes))",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/posts/:id/like", requireAuth, async (req, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_remove(likes,$2) WHERE id=$1",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });
  app.get("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT c.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM post_comments c JOIN users u ON u.id=c.user_id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      userId: r.user_id.toString(),
      userName: r.user_name || r.user_name_fallback || "",
      userPhoto: r.user_photo || "",
      content: r.content,
      createdAt: r.created_at
    })));
  });
  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const { content } = req.body;
    await pool.query(
      "INSERT INTO post_comments (post_id,user_id,content) VALUES ($1,$2,$3)",
      [req.params.id, req.userId, content]
    );
    res.json({ ok: true });
  });
  app.delete("/api/posts/:postId/comments/:commentId", requireAuth, async (req, res) => {
    await pool.query(
      "DELETE FROM post_comments WHERE id=$1 AND user_id=$2",
      [req.params.commentId, req.userId]
    );
    res.json({ ok: true });
  });
  function callCoachAi(messages, area) {
    return completeCoachJson(messages, area);
  }
  function callCoachAiForPlan(plan, messages) {
    return callCoachAi(messages, coachAreaForPlanType(plan.type));
  }
  function coachPayloadHash(obj) {
    try {
      return createHash2("sha256").update(JSON.stringify(obj ?? null)).digest("hex").slice(0, 32);
    } catch {
      return null;
    }
  }
  function normalizeCoachWorkoutDay(d) {
    if (!d || typeof d !== "object") return d;
    if (d.isRest) return d;
    const sessionType = String(d.sessionType || "");
    const title = String(d.title || "");
    const lower = `${sessionType} ${title}`.toLowerCase();
    const noLift = !Array.isArray(d.exercises) || d.exercises.length === 0;
    const looksCardio = /cardio|interval|\brun\b|\bride\b|bike|swim|row|aerobic|tempo|endurance|jog|\b5k\b|\b10k\b|track|hiit|time trial|lauf/.test(lower) || noLift && /assessment|trial|evaluation/.test(lower);
    let cardio = d.cardio;
    if (looksCardio || cardio && typeof cardio === "object") {
      const base = cardio && typeof cardio === "object" ? { ...cardio } : {};
      if (!base.type || !String(base.type).trim()) {
        if (/swim/.test(lower)) base.type = "swim";
        else if (/bike|cycl|ride|erg/.test(lower)) base.type = "bike";
        else if (/row/.test(lower)) base.type = "row";
        else base.type = "run";
      }
      const hasGrid = !!(base.duration && String(base.duration).trim()) || !!(base.distance && String(base.distance).trim()) || !!(base.pace && String(base.pace).trim()) || !!(base.zones && String(base.zones).trim());
      const detail = typeof base.details === "string" ? base.details.trim() : "";
      if (!hasGrid && !detail) {
        const fromDesc = String(d.description || "").trim();
        const fromNotes = String(d.notes || "").trim();
        const warmup = String(d.warmup || "").trim();
        const cooldown = String(d.cooldown || "").trim();
        let fallback = [fromDesc, fromNotes].filter(Boolean).join("\n\n").trim();
        if (!fallback && warmup && cooldown) {
          fallback = `Ausf\xFChrung: Hauptteil gem\xE4\xDF Session-Titel und Wochenfokus \u2014 Warm-up und Cool-down sind unten bereits detailliert; der **Block zwischen Warm-up und Cool-down** muss mit konkreten Intervallen/Zeiten/(Zonen) beschrieben sein.

Session: ${title || sessionType || "Cardio"}.`.trim();
        }
        if (fallback) base.details = fallback;
        else if (looksCardio) {
          base.details = `Hauptteil (Cardio/Intervals): Konkrete Arbeit zwischen Warm-up und Cool-down \u2014 z. B. Zeitfahren, Intervall-Stufen, Wiederholungen, Erholung, Ziel-Zonen/RPE. Titel: ${title || sessionType || "Cardio"}.`.trim();
        }
      }
      cardio = base;
    }
    return { ...d, cardio };
  }
  function normalizeCoachWorkoutEnvelope(parsed) {
    if (!parsed || typeof parsed !== "object") return parsed;
    const inner = parsed.schedule;
    if (!Array.isArray(inner)) return { ...parsed, schedule: inner };
    return { ...parsed, schedule: inner.map(normalizeCoachWorkoutDay) };
  }
  function buildWorkoutPrompt(plan, weekNumber, lastReport, startDayName, userContext, repairHint, exerciseCatalogText) {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const weeksUntilEvent = plan.event_date ? Math.round((new Date(plan.event_date).getTime() - Date.now()) / (7 * 24 * 3600 * 1e3)) : null;
    const isTaper = weeksUntilEvent !== null && weeksUntilEvent <= 2;
    const adaptationBlock = lastReport ? `
LAST WEEK PERFORMANCE (Week ${weekNumber - 1}):
- Overall rating: ${lastReport.overallRating}/10
- Completion rate: ${lastReport.completionRate}%
- Assessment: ${lastReport.summary}
- Strengths: ${(lastReport.performanceHighlights || []).join("; ")}
- Weaknesses: ${(lastReport.areasToImprove || []).join("; ")}
- Coach recommendation: ${lastReport.recommendation}
- Specific changes requested: ${(lastReport.nextWeekChanges || []).join("; ")}
- Strategy: ${lastReport.nextWeekStrategy}

\u2192 ADAPT THIS WEEK ACCORDINGLY: ${lastReport.recommendation === "increase_volume" ? "Increase training volume by ~10% and push intensity." : lastReport.recommendation === "reduce_volume" ? "Reduce total volume by ~15%, keep quality high." : lastReport.recommendation === "deload" ? "DELOAD WEEK: cut volume by 40%, reduce weights 20%, no high-intensity work." : "Continue with similar structure, implement the specific changes listed above."}` : "";
    const avail = Array.isArray(ob.availableTrainingDays) && ob.availableTrainingDays.length ? ob.availableTrainingDays.join(", ") : "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday (no restriction \u2014 athlete did not specify)";
    const allowDoubles = ob.allowDoubleSessions !== false;
    const ctxBlock = userContext != null ? `

USER_CONTEXT_JSON (machine-readable \u2014 honor constraints_input.available_weekdays_en / injuries_plain / rolling stats):
${JSON.stringify(userContext, null, 2)}
` : "";
    const repairBlock = repairHint ? `

VALIDATOR / SCHEMA REPAIR \u2014 address this precisely; output ONLY valid JSON:
${repairHint}
` : "";
    const exerciseDbBlock = `

ALLOWED EXERCISE KEYS (set exercises[].exerciseKey when possible \u2014 ONLY keys from this list, format edb_<id>):
${exerciseCatalogText ?? formatExerciseDbForCoachPrompt()}
`;
    const athleteProfile = `- Age: ${ob.age}, Gender: ${ob.gender}
- Fitness Level: ${ob.fitnessLevel}
- Training style: ${ob.trainingStyle || "strength"}, Vibe: ${ob.workoutVibe || "classic_lifting"}
- Sports: ${joinCoachList(ob.sports, "n/a")}
- Target: ${ob.trainingDays} **training sessions per week** (each non-rest day entry counts as one session). Session duration up to ~${ob.sessionDuration} minutes per session unless a two-a-day explicitly uses shorter slots.
- **Available training weekdays** (you may ONLY assign non-rest sessions on these days; other weekdays MUST be isRest=true): ${avail}
- **Two-a-days:** ${allowDoubles ? 'ALLOWED \u2014 if the athlete needs slightly more weekly load but has few available days, you MAY output TWO separate sessions on the SAME weekday (two objects with the same "day"), e.g. "Morning easy" + "Evening quality". Keep recovery realistic.' : "NOT allowed \u2014 at most ONE non-rest session per weekday."}
- Equipment: ${joinCoachList(ob.equipment, "bodyweight only")}
- Injuries/limitations: ${ob.injuries || "none"}
- Current performance/bests: ${ob.currentBests || "not specified"}
- Extra wishes: ${ob.extraWishes || "none"}`;
    const planConfiguration = `- Discipline: ${plan.discipline}
- Mode: ${plan.plan_mode === "event" ? "Event-based" : "Ongoing"}
${plan.plan_mode === "event" ? `- Event: ${plan.event_name} | ${plan.event_distance || ""} | Date: ${plan.event_date} | Weeks remaining: ${weeksUntilEvent}` : ""}
${isTaper ? "\u26A0\uFE0F TAPER WEEK: Reduce volume by 40-50%, maintain intensity. Focus on recovery. Short, sharp sessions only." : ""}`;
    const weekBlock = weekNumber === 1 ? `THIS IS WEEK 1 \u2014 ASSESSMENT WEEK:
The primary goal is to COLLECT BASELINE DATA, not to push the athlete hard.
- Include proper assessment sessions: test sets, time trials, max-rep tests
- Keep overall volume at 60-70% of normal
- Note clearly in each session what is being assessed and why
- Provide specific instructions for the athlete to note down their results (weight used, time, reps)
- These results will be used by the AI to calibrate future weeks
${startDayName ? `TODAY IS ${startDayName.toUpperCase()}. This is a PARTIAL first week. Only schedule sessions from ${startDayName} onwards (do NOT create sessions for days before today in the calendar sense). Days before ${startDayName} in the same Mon\u2013Sun list should be Rest. Still output the usual Mon\u2013Sun ordering in the JSON array (or additional same-day sessions where allowed).` : ""}` : `This is Week ${weekNumber}. Apply progression and the adaptations above.`;
    return buildCoachWorkoutWeekPrompt({
      discipline: String(ob.discipline || plan.discipline),
      weekNumber: String(weekNumber),
      athleteProfile,
      adaptationBlock,
      planConfiguration,
      weekBlock,
      userContextBlock: ctxBlock,
      exerciseDbBlock,
      repairBlock
    });
  }
  function buildNutritionPrompt(plan, weekNumber, lastReport, userContext, repairHint) {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const mealSchedule = resolveNutritionMealSchedule(ob);
    const mealScheduleBlock = formatMealScheduleForCoachPrompt(mealSchedule);
    const scheduledDays = new Set(mealSchedule.map((d) => d.day));
    const ctxBlock = userContext != null ? `

USER_CONTEXT_JSON:
${JSON.stringify(userContext, null, 2)}
` : "";
    const repairBlock = repairHint ? `

VALIDATOR / SCHEMA REPAIR \u2014 address precisely; output ONLY valid JSON:
${repairHint}
` : "";
    const adaptationBlock = lastReport ? `
LAST WEEK NUTRITION PERFORMANCE (Week ${weekNumber - 1}):
- Rating: ${lastReport.overallRating}/10, Completion: ${lastReport.completionRate}%
- Assessment: ${lastReport.summary}
- Changes needed: ${(lastReport.nextWeekChanges || []).join("; ")}
- Strategy: ${lastReport.nextWeekStrategy}

\u2192 ADJUST macros, timing, or meal structure based on this feedback.` : "";
    const athleteProfile = `- Age: ${ob.age}, Gender: ${ob.gender}, Weight: ${ob.weight}kg, Height: ${ob.height}cm
- Goal: ${ob.nutritionGoal}
- Activity level: ${ob.activityLevel}
- Dietary restrictions: ${joinCoachList(ob.restrictions)}
- Allergies: ${ob.allergies || "none"}
- Cooking time: ${ob.cookingTime}
- Food preferences: ${ob.foodPreferences || "varied"}
- Budget: ${ob.budget || "medium"}`;
    const weekIntro = `This is Week ${weekNumber}. ${weekNumber === 1 ? "Establish baseline targets." : "Adjust macros and meal structure based on feedback above."}`;
    return buildCoachNutritionWeekPrompt({
      weekNumber: String(weekNumber),
      athleteProfile,
      mealScheduleBlock,
      adaptationBlock,
      weekIntro,
      userContextBlock: ctxBlock,
      repairBlock,
      scheduledWeekdays: [...scheduledDays].join(", ") || "see schedule above"
    });
  }
  function buildReportPrompt(plan, schedule, completedWorkouts, nutritionEntries, prevReport) {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const workoutSummary = completedWorkouts.length > 0 ? completedWorkouts.map((w) => `- ${w.date}: ${w.name} (${w.duration}min, ${w.calories_burned}kcal)`).join("\n") : "No workouts logged this week.";
    const nutritionSummary = nutritionEntries.length > 0 ? `Total entries: ${nutritionEntries.length}, Avg calories: ${Math.round(nutritionEntries.reduce((s, e) => s + Number(e.calories), 0) / Math.max(1, nutritionEntries.length))}kcal` : "No nutrition logged this week.";
    const prevWeekComparison = prevReport ? `
COMPARISON WITH WEEK ${plan.current_week - 1}:
- Last week's rating: ${prevReport.overallRating}/10
- Last week's completion: ${prevReport.completionRate}%
- Last week's coach message: "${prevReport.coachMessage?.substring(0, 200)}..."
- What was planned to change: ${(prevReport.nextWeekChanges || []).join("; ")}
- Did those changes happen? Evaluate honestly in your report.` : "";
    return buildCoachWeeklyReportPrompt({
      athleteSummary: `${ob.age}y ${ob.gender}, Level: ${ob.fitnessLevel || ob.activityLevel}, Discipline: ${plan.discipline || ob.nutritionGoal}`,
      currentWeek: String(plan.current_week),
      planMode: String(plan.plan_mode),
      prevWeekComparison,
      plannedScheduleJson: JSON.stringify(
        schedule?.schedule?.map((d) => ({
          day: d.day,
          type: d.sessionType || d.meals?.length,
          title: d.title,
          duration: d.estimatedDuration
        })),
        null,
        2
      ),
      workoutSummary,
      nutritionSummary
    });
  }
  app.get("/api/coach/plans", requireAuth, async (req, res) => {
    const plans = await pool.query(
      `SELECT p.*,
              (SELECT row_to_json(s) FROM coach_weekly_schedules s WHERE s.plan_id=p.id AND s.week_number=p.current_week LIMIT 1) AS current_schedule,
              (SELECT row_to_json(r) FROM coach_weekly_reports r WHERE r.plan_id=p.id ORDER BY r.week_number DESC LIMIT 1) AS latest_report
       FROM coach_plans p WHERE p.user_id=$1 ORDER BY p.created_at DESC`,
      [req.userId]
    );
    res.json(plans.rows);
  });
  app.get("/api/coach/plans/:id", requireAuth, async (req, res) => {
    const plan = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!plan.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const schedules = await pool.query("SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 ORDER BY week_number", [req.params.id]);
    const reports = await pool.query("SELECT * FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC", [req.params.id]);
    res.json({ ...plan.rows[0], schedules: schedules.rows, reports: reports.rows });
  });
  app.post("/api/coach/plans", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { type, discipline, planMode, eventName, eventDate, eventDistance, onboardingData } = req.body;
      const planResult = await pool.query(
        `INSERT INTO coach_plans (user_id,type,discipline,plan_mode,event_name,event_date,event_distance,onboarding_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.userId, type, discipline, planMode, eventName, eventDate || null, eventDistance, JSON.stringify(onboardingData)]
      );
      const plan = planResult.rows[0];
      const today = /* @__PURE__ */ new Date();
      let targetDate = new Date(today);
      if (onboardingData?.startDate === "tomorrow") {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (onboardingData?.startDate === "next_monday") {
        const daysUntilMonday = (8 - targetDate.getDay()) % 7;
        targetDate.setDate(targetDate.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
      }
      const DAY_NAMES2 = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const targetDayName = DAY_NAMES2[targetDate.getDay()];
      const dayOffset = targetDate.getDay() === 0 ? 6 : targetDate.getDay() - 1;
      const actualWeekMonday = new Date(targetDate);
      actualWeekMonday.setDate(actualWeekMonday.getDate() - dayOffset);
      const isPartialWeek = targetDate.getDay() !== 1;
      const startDateStr = toLocalYmd(actualWeekMonday);
      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId,
        plan,
        scheduleWindow: { startYmd: startDateStr }
      });
      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data;
      const constraints = {
        availableTrainingDays: Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [],
        allowDoubleSessions: ob.allowDoubleSessions !== false,
        injuriesPlain: String(ob.injuries || "")
      };
      let schedule;
      let rawLast = "";
      let retries = 0;
      try {
        if (type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => buildNutritionPrompt(plan, 1, void 0, userCtx, hint),
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => buildWorkoutPrompt(
              plan,
              1,
              void 0,
              isPartialWeek ? targetDayName : void 0,
              userCtx,
              hint,
              exerciseCatalog
            ),
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e) {
        const latencyMs = Date.now() - t0;
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: 1,
          endpoint: "POST /api/coach/plans",
          inputSummary: { type, discipline },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 12e4) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e)
        });
        console.error("coach/plans POST error:", e);
        const errBody = { error: e?.message || "Failed to create plan" };
        if (e instanceof CoachGenerationError) {
          errBody.zodErrors = e.detail.zodErrors;
          errBody.constraintViolations = e.detail.constraintViolations;
        }
        res.status(500).json(errBody);
        return;
      }
      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$3",
        [plan.id, startDateStr, JSON.stringify(schedule)]
      );
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: 1,
        endpoint: "POST /api/coach/plans",
        inputSummary: { type, discipline },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null
      });
      res.json({ planId: plan.id, schedule });
    } catch (err) {
      console.error("coach/plans POST error:", err);
      res.status(500).json({ error: err.message || "Failed to create plan" });
    }
  });
  app.patch("/api/coach/plans/:id", requireAuth, async (req, res) => {
    const { status } = req.body;
    await pool.query(
      "UPDATE coach_plans SET status=$2, updated_at=NOW() WHERE id=$1 AND user_id=$3",
      [req.params.id, status, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/coach/plans/:id", requireAuth, async (req, res) => {
    try {
      const check = await pool.query(
        "SELECT status FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId]
      );
      if (!check.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (check.rows[0].status !== "cancelled") {
        res.status(400).json({ error: "Only cancelled plans can be deleted. Cancel the plan first." });
        return;
      }
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/coach/plans/:id/next-week", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const nextWeek = plan.current_week + 1;
      const prevSchedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week]
      );
      const prevRow = prevSchedResult.rows[0];
      const prevStart = prevRow?.start_date != null ? String(
        prevRow.start_date instanceof Date ? prevRow.start_date.toISOString().split("T")[0] : prevRow.start_date
      ).split("T")[0] : null;
      const nextStartYmd = prevStart ? addDaysYmd(prevStart, 7) : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let lastReport = void 0;
      const rep = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week]
      );
      if (rep.rows.length) lastReport = rep.rows[0].report;
      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId,
        plan,
        scheduleWindow: { startYmd: nextStartYmd }
      });
      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data;
      const constraints = {
        availableTrainingDays: Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [],
        allowDoubleSessions: ob.allowDoubleSessions !== false,
        injuriesPlain: String(ob.injuries || "")
      };
      let schedule;
      let rawLast = "";
      let retries = 0;
      try {
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => buildNutritionPrompt(plan, nextWeek, lastReport, userCtx, hint),
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => buildWorkoutPrompt(plan, nextWeek, lastReport, void 0, userCtx, hint, exerciseCatalog),
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e) {
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: nextWeek,
          endpoint: "POST /api/coach/plans/:id/next-week",
          inputSummary: { nextWeek, nextStartYmd },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 12e4) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e)
        });
        console.error("next-week error:", e);
        res.status(500).json({ error: e.message || "Failed to generate next week" });
        return;
      }
      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$4",
        [plan.id, nextWeek, nextStartYmd, JSON.stringify(schedule)]
      );
      await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [plan.id, nextWeek]);
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: nextWeek,
        endpoint: "POST /api/coach/plans/:id/next-week",
        inputSummary: { nextWeek, nextStartYmd },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null
      });
      res.json({ weekNumber: nextWeek, schedule });
    } catch (err) {
      console.error("next-week error:", err);
      res.status(500).json({ error: err.message || "Failed to generate next week" });
    }
  });
  app.post("/api/coach/plans/:id/weekly-report", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week]
      );
      const schedule = schedResult.rows[0];
      const startYmd = schedule?.start_date != null ? String(
        schedule.start_date instanceof Date ? schedule.start_date.toISOString().split("T")[0] : schedule.start_date
      ).split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const endYmd = coachWeekInclusiveEnd(startYmd);
      const [workoutsResult, nutritionResult] = await Promise.all([
        pool.query("SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3", [
          req.userId,
          startYmd,
          endYmd
        ]),
        pool.query("SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3", [
          req.userId,
          startYmd,
          endYmd
        ])
      ]);
      const prevReportResult = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week - 1]
      );
      const prevReport = prevReportResult.rows[0]?.report ?? null;
      let rawLast = "";
      let report;
      let retries = 0;
      let repair = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        retries = attempt;
        const base = buildReportPrompt(plan, schedule, workoutsResult.rows, nutritionResult.rows, prevReport);
        const prompt = repair ? `${base}

JSON schema repair: ${repair}` : base;
        rawLast = await callCoachAiForPlan(plan, [{ role: "user", content: prompt }]);
        try {
          const parsed = parseJsonLoose(rawLast);
          const z3 = weeklyReportSchema.safeParse(parsed);
          if (!z3.success) {
            repair = z3.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          report = z3.data;
          repair = "";
          break;
        } catch (e) {
          repair = e?.message || String(e);
        }
      }
      if (!report) {
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: plan.current_week,
          endpoint: "POST /api/coach/plans/:id/weekly-report",
          inputSummary: { startYmd, endYmd },
          rawResponse: rawLast.slice(0, 12e4),
          zodOk: false,
          constraintsOk: true,
          retries,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: repair || "weekly report zod failed"
        });
        res.status(500).json({ error: "Report validation failed" });
        return;
      }
      await pool.query(
        "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
        [plan.id, plan.current_week, JSON.stringify(report)]
      );
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: plan.current_week,
        endpoint: "POST /api/coach/plans/:id/weekly-report",
        inputSummary: { startYmd, endYmd },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(report),
        errorMessage: null
      });
      res.json(report);
    } catch (err) {
      console.error("weekly-report error:", err);
      res.status(500).json({ error: err.message || "Failed to generate report" });
    }
  });
  app.post("/api/coach/plans/:id/refine-schedule", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { previousValid, userRefinement, weekNumber } = req.body;
      if (!previousValid || typeof userRefinement !== "string" || !userRefinement.trim()) {
        res.status(400).json({ error: "previousValid and userRefinement required" });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const wk = Math.max(1, parseInt(String(weekNumber ?? plan.current_week), 10) || plan.current_week);
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, wk]
      );
      const schedRow = schedResult.rows[0];
      const startYmd = schedRow?.start_date != null ? String(
        schedRow.start_date instanceof Date ? schedRow.start_date.toISOString().split("T")[0] : schedRow.start_date
      ).split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId,
        plan,
        scheduleWindow: { startYmd }
      });
      const baseJson = JSON.stringify(previousValid, null, 2);
      const refinementIntro = `You are editing an ALREADY VALID ${plan.type} week JSON. Make the MINIMAL changes required to satisfy the athlete request. Keep the same top-level schema keys. Output ONLY valid JSON.

ATHLETE REQUEST:
${userRefinement.trim()}

CURRENT VALID JSON:
${baseJson}

USER_CONTEXT_JSON:
${JSON.stringify(userCtx, null, 2)}
`;
      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data;
      const constraints = {
        availableTrainingDays: Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [],
        allowDoubleSessions: ob.allowDoubleSessions !== false,
        injuriesPlain: String(ob.injuries || "")
      };
      let schedule;
      let rawLast = "";
      let retries = 0;
      try {
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => `${refinementIntro}
${hint ? `REPAIR:
${hint}` : ""}`,
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => `${refinementIntro}
${hint ? `REPAIR:
${hint}` : ""}`,
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e) {
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: wk,
          endpoint: "POST /api/coach/plans/:id/refine-schedule",
          inputSummary: { userRefinement },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 12e4) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e),
          refinementRound: 1
        });
        res.status(500).json({ error: e?.message || "Refine failed" });
        return;
      }
      await pool.query("UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2", [
        req.params.id,
        wk,
        JSON.stringify(schedule)
      ]);
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: wk,
        endpoint: "POST /api/coach/plans/:id/refine-schedule",
        inputSummary: { userRefinement },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null,
        refinementRound: 1
      });
      res.json({ weekNumber: wk, schedule });
    } catch (err) {
      console.error("refine-schedule error:", err);
      res.status(500).json({ error: err.message || "Failed to refine" });
    }
  });
  app.patch("/api/coach/plans/:id/schedules/:weekNum/reorder", requireAuth, async (req, res) => {
    try {
      const planCheck = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planCheck.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const schedResult = await pool.query(
        "SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum)]
      );
      if (!schedResult.rows.length) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const { days } = req.body;
      const existing = schedResult.rows[0].schedule;
      const updated = { ...existing, schedule: days };
      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum), JSON.stringify(updated)]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/coach/plans/:id/auto-advance", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      if (plan.status !== "active") {
        res.json({ advanced: false, reason: "Plan not active" });
        return;
      }
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, plan.current_week]
      );
      if (!schedResult.rows.length) {
        res.json({ advanced: false, reason: "No current schedule" });
        return;
      }
      const currentSched = schedResult.rows[0];
      const startYmd = currentSched.start_date != null ? String(
        currentSched.start_date instanceof Date ? currentSched.start_date.toISOString().split("T")[0] : currentSched.start_date
      ).split("T")[0] : toLocalYmd(/* @__PURE__ */ new Date());
      const lastDayYmd = coachWeekInclusiveEnd(startYmd);
      const todayYmd = toLocalYmd(/* @__PURE__ */ new Date());
      if (todayYmd <= lastDayYmd) {
        const ms = parseLocalYmd(lastDayYmd).getTime() - parseLocalYmd(todayYmd).getTime();
        const daysLeft = Math.max(1, Math.ceil(ms / 864e5) + 1);
        res.json({ advanced: false, reason: "Current week still active", daysLeft });
        return;
      }
      let report;
      const existingReport = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, plan.current_week]
      );
      if (existingReport.rows.length) {
        report = existingReport.rows[0].report;
      } else {
        const endYmd = coachWeekInclusiveEnd(startYmd);
        const [workoutsResult, nutritionResult] = await Promise.all([
          pool.query("SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3", [
            req.userId,
            startYmd,
            endYmd
          ]),
          pool.query("SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3", [
            req.userId,
            startYmd,
            endYmd
          ])
        ]);
        const prevReportResult = await pool.query(
          "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
          [req.params.id, plan.current_week - 1]
        );
        const prevReport = prevReportResult.rows[0]?.report ?? null;
        let rawReport = "";
        let repair = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const base = buildReportPrompt(plan, currentSched, workoutsResult.rows, nutritionResult.rows, prevReport);
          const reportPrompt = repair ? `${base}

JSON schema repair: ${repair}` : base;
          rawReport = await callCoachAiForPlan(plan, [{ role: "user", content: reportPrompt }]);
          try {
            const parsed = parseJsonLoose(rawReport);
            const z3 = weeklyReportSchema.safeParse(parsed);
            if (!z3.success) {
              repair = z3.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
              continue;
            }
            report = z3.data;
            repair = "";
            break;
          } catch (e) {
            repair = e?.message || String(e);
          }
        }
        if (!report) {
          throw new Error(repair || "auto-advance report validation failed");
        }
        await pool.query(
          "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
          [req.params.id, plan.current_week, JSON.stringify(report)]
        );
      }
      const nextWeek = plan.current_week + 1;
      const existingNext = await pool.query(
        "SELECT week_number FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, nextWeek]
      );
      let nextSchedule;
      if (!existingNext.rows.length) {
        const nextStartYmd = addDaysYmd(startYmd, 7);
        const userCtx = await buildUserContextForCoach({
          pool,
          userId: req.userId,
          plan,
          scheduleWindow: { startYmd: nextStartYmd }
        });
        plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
        const ob = plan.onboarding_data;
        const constraints = {
          availableTrainingDays: Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [],
          allowDoubleSessions: ob.allowDoubleSessions !== false,
          injuriesPlain: String(ob.injuries || "")
        };
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => buildNutritionPrompt(plan, nextWeek, report, userCtx, hint),
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
          });
          nextSchedule = gen.week;
        } else {
          const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => buildWorkoutPrompt(plan, nextWeek, report, void 0, userCtx, hint, exerciseCatalog),
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope
          });
          nextSchedule = gen.week;
        }
        await pool.query(
          "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$4",
          [req.params.id, nextWeek, nextStartYmd, JSON.stringify(nextSchedule)]
        );
      }
      await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [req.params.id, nextWeek]);
      res.json({ advanced: true, newWeek: nextWeek, report, weeklyReportGenerated: !existingReport.rows.length });
    } catch (err) {
      console.error("auto-advance error:", err);
      res.status(500).json({ error: err.message || "Failed to auto-advance" });
    }
  });
  app.get("/api/coach/latest-report", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1 AND p.status='active'
         ORDER BY r.generated_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!result.rows.length) {
        res.json(null);
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/coach/reports", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1
         ORDER BY r.generated_at DESC`,
        [req.userId]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/admin/ai-config", requireAdmin, (_req, res) => {
    const caps = resolveAiCapabilities();
    res.json({
      active: caps.provider,
      geminiConfigured: caps.geminiConfigured,
      mistralConfigured: caps.mistralConfigured,
      keys: {
        mistral: { configured: caps.mistralConfigured },
        gemini: { configured: caps.geminiConfigured }
      },
      models: getAllAiModels(),
      recommendations: AI_MODEL_RECOMMENDATIONS,
      areas: AI_MODEL_AREAS.map((id) => {
        const models = getAllAiModels();
        return {
          id,
          label: AI_MODEL_AREA_LABELS[id],
          recommended: {
            mistral: AI_MODEL_RECOMMENDATIONS.mistral[id],
            gemini: AI_MODEL_RECOMMENDATIONS.gemini[id]
          },
          options: {
            mistral: getModelSelectOptions("mistral", id, models.mistral[id]),
            gemini: getModelSelectOptions("gemini", id, models.gemini[id])
          }
        };
      })
    });
  });
  app.post("/api/admin/ai-config", requireAdmin, async (req, res) => {
    const { provider } = req.body;
    if (provider !== "gemini" && provider !== "mistral") {
      res.status(400).json({ ok: false, error: "Ung\xFCltiger Provider (mistral|gemini)" });
      return;
    }
    const capsBefore = resolveAiCapabilities();
    const previousOverride = getActiveProviderOverride();
    const previousActive = previousOverride ?? (capsBefore.provider === "gemini" || capsBefore.provider === "mistral" ? capsBefore.provider : null);
    setActiveProviderOverride(provider);
    const envKey2 = provider === "mistral" ? process.env.MISTRAL_API_KEY : process.env.GEMINI_API_KEY;
    const test = provider === "mistral" ? await testMistralApiKey(envKey2 ?? "") : await testGeminiApiKey(envKey2 ?? "");
    if (!test.ok) {
      setActiveProviderOverride(previousOverride);
      const capsAfter = resolveAiCapabilities();
      res.status(400).json({
        ok: false,
        error: "error" in test ? test.error : "KI-Test fehlgeschlagen",
        active: capsAfter.provider === "gemini" || capsAfter.provider === "mistral" ? capsAfter.provider : previousActive,
        reverted: true
      });
      return;
    }
    try {
      upsertEnvVar("AI_ACTIVE_PROVIDER", provider);
      process.env.AI_ACTIVE_PROVIDER = provider;
    } catch (e) {
      setActiveProviderOverride(previousOverride);
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        reverted: true
      });
      return;
    }
    res.json({ ok: true, active: provider, tested: true });
  });
  app.post("/api/admin/ai-keys/test", requireAdmin, async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!apiKey?.trim() || provider !== "mistral" && provider !== "gemini") {
      res.status(400).json({ ok: false, error: "provider (mistral|gemini) und apiKey erforderlich" });
      return;
    }
    const result = provider === "mistral" ? await testMistralApiKey(apiKey) : await testGeminiApiKey(apiKey);
    if (result.ok) res.json({ ok: true, provider });
    else res.status(400).json({ ok: false, error: "error" in result ? result.error : "Unbekannter Fehler" });
  });
  app.post("/api/admin/ai-keys", requireAdmin, async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!apiKey?.trim() || provider !== "mistral" && provider !== "gemini") {
      res.status(400).json({ ok: false, error: "provider (mistral|gemini) und apiKey erforderlich" });
      return;
    }
    const test = provider === "mistral" ? await testMistralApiKey(apiKey) : await testGeminiApiKey(apiKey);
    if (!test.ok) {
      res.status(400).json({ ok: false, error: "error" in test ? test.error : "Unbekannter Fehler" });
      return;
    }
    const envKey2 = provider === "mistral" ? "MISTRAL_API_KEY" : "GEMINI_API_KEY";
    try {
      upsertEnvVar(envKey2, apiKey.trim());
      const caps = resolveAiCapabilities();
      res.json({
        ok: true,
        provider,
        geminiConfigured: caps.geminiConfigured,
        mistralConfigured: caps.mistralConfigured
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.get("/api/admin/exercisedb-key/status", requireAdmin, (_req, res) => {
    res.json(getExerciseDbEnvDiagnostics());
  });
  app.post("/api/admin/exercisedb-key/test", requireAdmin, async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      res.status(400).json({ ok: false, error: "apiKey erforderlich" });
      return;
    }
    const result = await testExerciseDbApiKey(apiKey);
    if (result.ok) res.json({ ok: true });
    else res.status(400).json({ ok: false, error: result.error ?? "Test fehlgeschlagen" });
  });
  app.post("/api/admin/exercisedb-key", requireAdmin, async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      res.status(400).json({ ok: false, error: "apiKey erforderlich" });
      return;
    }
    const test = await testExerciseDbApiKey(apiKey);
    if (!test.ok) {
      res.status(400).json({ ok: false, error: test.error ?? "Test fehlgeschlagen" });
      return;
    }
    try {
      upsertEnvVar("EXERCISEDB_RAPIDAPI_KEY", apiKey.trim());
      res.json({ ok: true, ...getExerciseDbEnvDiagnostics() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.put("/api/admin/ai-models", requireAdmin, (req, res) => {
    const { models } = req.body;
    if (!models || typeof models !== "object") {
      res.status(400).json({ ok: false, error: "models object required" });
      return;
    }
    try {
      for (const provider of ["mistral", "gemini"]) {
        const areaMap = models[provider];
        if (!areaMap) continue;
        for (const area of AI_MODEL_AREAS) {
          const value = areaMap[area]?.trim();
          if (value) upsertEnvVar(`AI_${provider.toUpperCase()}_MODEL_${area.toUpperCase()}`, value);
        }
      }
      res.json({ ok: true, models: getAllAiModels() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) res.json({ ok: true });
    else res.status(401).json({ error: "Invalid credentials" });
  });
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, first_name, last_name, email,
              CASE WHEN password_hash IS NOT NULL THEN TRUE ELSE FALSE END AS has_password,
              is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  });
  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    const resolvedFirst = String(firstName ?? "").trim();
    const resolvedLast = String(lastName ?? "").trim();
    if (!validateNameParts(resolvedFirst, resolvedLast)) {
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    const displayName = buildDisplayName2(resolvedFirst, resolvedLast);
    if (password?.length) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE users SET name=$2, display_name=$2, first_name=$3, last_name=$4, email=$5,
         password_hash=$6, updated_at=NOW() WHERE id=$1`,
        [req.params.id, displayName, resolvedFirst, resolvedLast, email, hash]
      );
    } else {
      await pool.query(
        `UPDATE users SET name=$2, display_name=$2, first_name=$3, last_name=$4, email=$5, updated_at=NOW() WHERE id=$1`,
        [req.params.id, displayName, resolvedFirst, resolvedLast, email]
      );
    }
    res.json({ ok: true });
  });
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path4.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path4.join(distPath, "index.html")));
  }
  const PORT = parseInt(process.env.PORT || "3000");
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} VRTX server \u2192 http://localhost:${PORT}`);
    console.log(`\u{1F510} Admin panel \u2192 http://localhost:${PORT}/admin`);
  });
}
startServer().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
