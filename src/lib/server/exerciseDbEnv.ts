/**
 * Nur Server: .env-Diagnose für ExerciseDB (nicht im Vite-Client-Bundle).
 */

import {
  exerciseDbHost,
  exerciseDbKeySource,
  exerciseDbApiKey,
  isExerciseDbConfigured,
  sanitizeEnvSecret,
  type ExerciseDbKeySource,
} from "../exerciseDb";
import {
  envVarLengthInFile,
  envVarStatusInFile,
  getEnvFilePath,
  getEnvFileProblem,
  reloadEnvFromFile,
} from "../envFileManager";

const ENV_KEY_CANDIDATES = [
  "EXERCISEDB_RAPIDAPI_KEY",
  "EXERCISEDB_API_KEY",
  "EXERCISE_DB_RAPIDAPI_KEY",
  "RAPIDAPI_KEY",
  "RAPIDAPI_EXERCISEDB_KEY",
  "VITE_EXERCISEDB_RAPIDAPI_KEY",
] as const;

function normalizeApiKeyFromRaw(raw: string | undefined): string | undefined {
  const k = sanitizeEnvSecret(raw);
  if (!k || k.length < 10) return undefined;
  const v = k.toLowerCase();
  const placeholders = new Set([
    "none",
    "null",
    "undefined",
    "changeme",
    "api_key_here",
    "your_exercisedb_rapidapi_key",
    "xxx",
  ]);
  if (placeholders.has(v)) return undefined;
  if (/^your[_-]/.test(v) && k.length < 36) return undefined;
  return k;
}

export function getExerciseDbEnvDiagnostics(): {
  configured: boolean;
  source: ExerciseDbKeySource | null;
  host: string;
  envFileHints: string[];
  envFilePath: string;
  envFileProblem: string | null;
  keyLength: number | null;
  envReloadApplied: number;
} {
  const { applied: envReloadApplied } = reloadEnvFromFile();
  const envFileProblem = getEnvFileProblem();
  const key = exerciseDbApiKey();
  const source = exerciseDbKeySource();
  const hints: string[] = [];
  if (envFileProblem) hints.unshift(envFileProblem);

  for (const name of ENV_KEY_CANDIDATES) {
    const inFile = envVarStatusInFile(name);
    const raw = sanitizeEnvSecret(process.env[name]);
    const valid = normalizeApiKeyFromRaw(raw);

    if (valid) {
      const where =
        inFile === "missing"
          ? "Server-Umgebung (Docker/Panel, nicht in .env-Datei)"
          : inFile === "empty"
            ? "Umgebung + leere Zeile in .env"
            : "Umgebung und .env-Datei";
      hints.push(`${name}: aktiv, ${raw.length} Zeichen (${where})`);
    } else if (raw.length > 0) {
      hints.push(
        `${name}: Wert vorhanden (${raw.length} Zeichen), wird abgelehnt — prüfe Leerzeichen/Zeilenumbruch`,
      );
    } else if (inFile === "set") {
      const fileLen = envVarLengthInFile(name);
      hints.push(
        `${name}: in .env (${fileLen ?? "?"} Zeichen), Prozess leer — „Aktualisieren“ klicken oder Server neu starten`,
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
    envReloadApplied,
  };
}
