/**
 * Server-side .env read/write helpers (never expose secret values to clients).
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {
  ENV_FILE_PATH,
  applyEnvFileToProcess,
  getEnvFileDiagnostic,
  getMergedEnvFromFiles,
  listReadableEnvFiles,
} from "../../envBootstrap.ts";

function isEnvFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function assertNotDirectory(targetPath: string): void {
  if (!fs.existsSync(targetPath)) return;
  if (fs.statSync(targetPath).isDirectory()) {
    throw new Error(
      getEnvFileDiagnostic().problem ??
        `${targetPath} ist ein Ordner — auf dem NAS: rm -rf .env && cp .env.example .env`,
    );
  }
}

export function getEnvFilePath(): string {
  return ENV_FILE_PATH;
}

export function getEnvFileProblem(): string | null {
  return getEnvFileDiagnostic().problem;
}

export function envFileExists(): boolean {
  return listReadableEnvFiles().length > 0 || isEnvFile(ENV_FILE_PATH);
}

export function readEnvFile(): string {
  const files = listReadableEnvFiles();
  if (files.length) return fs.readFileSync(files[0], "utf8");
  assertNotDirectory(ENV_FILE_PATH);
  if (!fs.existsSync(ENV_FILE_PATH)) return "";
  return fs.readFileSync(ENV_FILE_PATH, "utf8");
}

function parsedEnvFile(): Record<string, string> {
  return getMergedEnvFromFiles();
}

/** Liest .env erneut ein (z. B. nach manueller Bearbeitung ohne Neustart). */
export function reloadEnvFromFile(): { path: string; applied: number } {
  let applied = 0;
  for (const envPath of listReadableEnvFiles()) {
    applied += applyEnvFileToProcess(envPath);
  }
  return { path: ENV_FILE_PATH, applied };
}

/** Ob die Variable in der .env-Datei vorkommt (ohne Wert zu lesen). */
export function envVarStatusInFile(key: string): "missing" | "empty" | "set" {
  const val = parsedEnvFile()[key];
  if (val === undefined) return "missing";
  if (!String(val).trim()) return "empty";
  return "set";
}

export function envVarLengthInFile(key: string): number | null {
  const val = parsedEnvFile()[key];
  if (val === undefined || !String(val).trim()) return null;
  return String(val).trim().length;
}

/** Upsert KEY=value in .env (creates file from example if missing). */
export function upsertEnvVar(key: string, value: string): void {
  const diag = getEnvFileDiagnostic();
  const writePath = ENV_FILE_PATH;

  if (diag.envPathIsDirectory) {
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
  } else {
    assertNotDirectory(writePath);
  }

  const line = `${key}=${escapeEnvValue(value)}`;
  let content = "";
  const readable = listReadableEnvFiles();
  if (readable.length) {
    content = fs.readFileSync(readable[0], "utf8");
  } else if (isEnvFile(writePath)) {
    content = fs.readFileSync(writePath, "utf8");
  }

  const examplePath = path.join(path.dirname(writePath), ".env.example");
  if (!content.trim() && isEnvFile(examplePath)) {
    content = fs.readFileSync(examplePath, "utf8");
  }

  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = content.trimEnd() + (content.endsWith("\n") || !content ? "" : "\n") + line + "\n";
  }

  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  fs.writeFileSync(writePath, content, "utf8");
  process.env[key] = value;

  if (key === "AI_ACTIVE_PROVIDER") {
    for (const extraPath of listReadableEnvFiles()) {
      if (extraPath === writePath) continue;
      try {
        let extra = fs.readFileSync(extraPath, "utf8");
        const extraRe = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
        if (extraRe.test(extra)) extra = extra.replace(extraRe, line);
        else extra = extra.trimEnd() + (extra.endsWith("\n") || !extra ? "" : "\n") + line + "\n";
        fs.writeFileSync(extraPath, extra, "utf8");
      } catch {
        /* ignore secondary env files */
      }
    }
  }

  if (diag.envPathIsDirectory && process.env.NODE_ENV !== "test") {
    console.warn(
      `[env] ${key} nach ${writePath} geschrieben — Host-Mount .env ist ein Ordner. ` +
        `Bitte echte .env-Datei auf dem NAS anlegen und Container neu starten.`,
    );
  }
}

function escapeEnvValue(value: string): string {
  if (/[\s#"']/.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return value;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskConfiguredKey(configured: boolean): { configured: boolean; hint: string | null } {
  if (!configured) return { configured: false, hint: null };
  return { configured: true, hint: "••••••••••••" };
}
