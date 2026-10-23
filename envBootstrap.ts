/**
 * Lädt .env vom Projektroot (nicht nur process.cwd()).
 * Muss als erstes Modul in server.ts importiert werden.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export function candidateEnvPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(projectRoot, ".env"),
    path.join(cwd, ".env"),
    path.join(projectRoot, "data", ".env"),
    path.join(cwd, "data", ".env"),
    path.join(projectRoot, "..", ".env"),
    path.join(cwd, "..", ".env"),
  ].filter((p, i, arr) => arr.indexOf(p) === i);
}

function isEnvFile(envPath: string): boolean {
  try {
    return fs.existsSync(envPath) && fs.statSync(envPath).isFile();
  } catch {
    return false;
  }
}

function isEnvDirectory(envPath: string): boolean {
  try {
    return fs.existsSync(envPath) && fs.statSync(envPath).isDirectory();
  } catch {
    return false;
  }
}

/** Alle vorhandenen .env-Dateien (keine Verzeichnisse). */
export function listReadableEnvFiles(): string[] {
  return candidateEnvPaths().filter(isEnvFile);
}

function resolveWritableEnvFilePath(): string {
  for (const envPath of candidateEnvPaths()) {
    if (isEnvFile(envPath)) return envPath;
    if (!fs.existsSync(envPath)) return envPath;
    if (isEnvDirectory(envPath)) continue;
  }
  const fallback = path.join(projectRoot, "data", ".env");
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

/** Pfad für Admin-Schreibzugriff (Datei, kein Verzeichnis). */
export const ENV_FILE_PATH = resolveWritableEnvFilePath();

export function getEnvFileDiagnostic(): {
  writePath: string;
  readablePaths: string[];
  envPathIsDirectory: boolean;
  problem: string | null;
} {
  const mountPath = path.join(projectRoot, ".env");
  const envPathIsDirectory = candidateEnvPaths().some(isEnvDirectory);
  const readablePaths = listReadableEnvFiles();
  let problem: string | null = null;

  if (isEnvDirectory(mountPath)) {
    problem =
      `${mountPath} ist ein Ordner statt einer Datei. Docker legt das an, wenn auf dem Host keine .env-Datei existiert. ` +
      `Auf dem NAS im Projektordner: rm -rf .env && cp .env.example .env — Keys eintragen — docker compose up -d.`;
  } else if (!readablePaths.length && !process.env.EXERCISEDB_RAPIDAPI_KEY?.trim()) {
    problem =
      "Keine lesbare .env-Datei gefunden. Keys in docker-compose.yaml (env_file) oder als echte Datei .env auf dem Host anlegen.";
  }

  return { writePath: ENV_FILE_PATH, readablePaths, envPathIsDirectory, problem };
}

/** Admin-gespeicherte Werte haben Vorrang vor leeren Docker-Compose-Platzhaltern. */
const ENV_KEYS_ALWAYS_FROM_FILE = new Set(["AI_ACTIVE_PROVIDER"]);

/** Alle lesbaren .env-Dateien mergen (spätere Dateien überschreiben gleiche Keys). */
export function getMergedEnvFromFiles(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const envPath of listReadableEnvFiles()) {
    try {
      Object.assign(merged, dotenv.parse(fs.readFileSync(envPath, "utf8")));
    } catch {
      /* skip */
    }
  }
  return merged;
}

export function getPersistedEnvValue(key: string): string | undefined {
  const v = getMergedEnvFromFiles()[key];
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length > 0 ? t : undefined;
}

/** Werte aus .env in process.env — auch wenn Docker leere Strings gesetzt hat. */
export function applyEnvFileToProcess(envPath: string): number {
  if (!isEnvFile(envPath)) return 0;
  let parsed: Record<string, string>;
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
    if (ENV_KEYS_ALWAYS_FROM_FILE.has(key) || cur === undefined || cur.trim() === "") {
      if (process.env[key] !== v) n += 1;
      process.env[key] = v;
    }
  }
  return n;
}

function bootstrapAllEnvFiles(): number {
  const merged = getMergedEnvFromFiles();
  let n = 0;
  for (const [key, value] of Object.entries(merged)) {
    const v = String(value).trim();
    if (!v) continue;
    const cur = process.env[key];
    if (ENV_KEYS_ALWAYS_FROM_FILE.has(key) || cur === undefined || cur.trim() === "") {
      if (process.env[key] !== v) n += 1;
      process.env[key] = v;
    }
  }
  return n;
}

const diag = getEnvFileDiagnostic();
if (diag.envPathIsDirectory && process.env.NODE_ENV !== "test") {
  console.error(`[env] ${diag.problem}`);
}

const applied = bootstrapAllEnvFiles();
if (process.env.NODE_ENV !== "test") {
  const aiProv = process.env.AI_ACTIVE_PROVIDER?.trim();
  if (applied > 0 || aiProv) {
    const edb = process.env.EXERCISEDB_RAPIDAPI_KEY?.trim();
    console.info(
      `[env] ${applied} Wert(e) aus ${diag.readablePaths.join(", ") || "—"} geladen` +
        (edb ? ` · EXERCISEDB_RAPIDAPI_KEY: ${edb.length} Zeichen` : " · EXERCISEDB_RAPIDAPI_KEY: fehlt in Datei") +
        (aiProv ? ` · AI_ACTIVE_PROVIDER: ${aiProv}` : " · AI_ACTIVE_PROVIDER: nicht gesetzt (Fallback: Mistral wenn beide Keys da)"),
    );
  }
}
