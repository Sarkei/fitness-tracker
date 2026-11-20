/**
 * KI-Coach-Chat: System-Prompt, Antwort-Parser und Ausfuehrung der Aktionen.
 *
 * Das Modell antwortet in Fliesstext und haengt - wenn eine Einstellung geaendert oder ein
 * Plan erstellt werden soll - genau einen JSON-Block an:
 *
 *   ```actions
 *   [{"type":"update_goals","goals":{"dailyCalories":2400}}]
 *   ```
 *
 * Der Block wird aus der Antwort entfernt, bevor sie in der Datenbank landet. Fehlerhafte
 * oder unbekannte Aktionen werden verworfen, nicht angewendet.
 */

import type { Pool } from "pg";

export type CoachChatAction =
  | { type: "update_goals"; goals: Record<string, unknown> }
  | { type: "update_measurements"; measurements: Record<string, unknown> }
  | { type: "update_coach_preferences"; preferences: Record<string, unknown> }
  | { type: "update_extras"; extras: Record<string, unknown> }
  | { type: "create_plan"; planType: "workout" | "nutrition"; discipline?: string }
  | { type: "set_coaching_active"; active: boolean };

export type AppliedAction = { type: string; ok: boolean; note?: string };

const ALLOWED_GOAL_KEYS = [
  "type",
  "dailyCalories",
  "dailySteps",
  "protein",
  "carbs",
  "fat",
  "targetWeight",
  "weeklyWeightChange",
  "trainingDaysPerWeek",
];

const ALLOWED_MEASUREMENT_KEYS = [
  "weight",
  "height",
  "bodyFat",
  "muscleMass",
  "waist",
  "chest",
  "arms",
  "legs",
  "neck",
  "hips",
];

const ALLOWED_EXTRA_KEYS = [
  "age",
  "sex",
  "gender",
  "experienceLevel",
  "activityLevel",
  "injuries",
  "equipment",
  "availableDays",
  "preferredTime",
  "sessionLength",
  "notes",
  "dietaryStyle",
  "allergies",
  "intolerances",
];

function pick(obj: unknown, keys: string[]): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};
  const source = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source && source[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out;
}

function fmt(obj: unknown): string {
  try {
    return JSON.stringify(obj ?? null);
  } catch {
    return "null";
  }
}

/** Baut den System-Prompt aus dem kompletten Fitnessprofil des Nutzers. */
export function buildCoachChatSystemPrompt(input: {
  profile: Record<string, unknown>;
  plans: Array<Record<string, unknown>>;
  workouts: Array<Record<string, unknown>>;
  nutrition: Array<Record<string, unknown>>;
  latestPlan: Record<string, unknown> | null;
}): string {
  const { profile, plans, workouts, nutrition, latestPlan } = input;
  const weightHistory = Array.isArray(profile.weight_history) ? profile.weight_history.slice(-10) : [];
  const lastWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1] : null;

  return [
    "Du bist der persoenliche Fitness- und Ernaehrungscoach in der App VRTX.",
    "Du sprichst Deutsch, per Du, freundlich und konkret. Antworte kurz und umsetzbar,",
    "keine langen Romane. Nutze hoechstens ein paar Absaetze oder kurze Listen.",
    "",
    "FORMATIERUNG (wird in der App dargestellt, nutze sie sparsam und gezielt):",
    "*fett* fuer wichtige Zahlen und Kernaussagen",
    "_kursiv_ fuer Betonungen",
    "Aufzaehlungen als Zeilen, die mit '- ' beginnen",
    "Kein Markdown mit Doppelsternchen (**), keine Tabellen, keine Ueberschriften mit #.",
    "Schreibe Zahlen direkt, nicht als Formel.",
    "",
    "Du kennst das komplette Profil des Nutzers (siehe unten) und darfst ALLES davon aendern:",
    "Ziele, Koerpermasse, Trainingspraeferenzen, Verletzungen, Equipment, Ernaehrungsweise.",
    "Du kannst ausserdem neue Trainings- oder Ernaehrungsplaene anlegen lassen.",
    "",
    "WICHTIG - so aenderst du Einstellungen:",
    "Antworte zuerst in normalem Text. Wenn du etwas aendern willst, haenge GENAU EINEN Block an:",
    "```actions",
    '[{"type":"update_goals","goals":{"dailyCalories":2400}}]',
    "```",
    "Moegliche Aktionen:",
    '- {"type":"update_goals","goals":{...}} - erlaubte Felder: ' + ALLOWED_GOAL_KEYS.join(", "),
    '- {"type":"update_measurements","measurements":{...}} - erlaubte Felder: ' + ALLOWED_MEASUREMENT_KEYS.join(", "),
    '- {"type":"update_extras","extras":{...}} - erlaubte Felder: ' + ALLOWED_EXTRA_KEYS.join(", "),
    '- {"type":"update_coach_preferences","preferences":{...}}',
    '- {"type":"create_plan","planType":"workout"|"nutrition"} - legt einen neuen Plan an',
    '- {"type":"set_coaching_active","active":true|false}',
    "Regeln dazu:",
    "- Aendere nur, was der Nutzer wirklich will. Frag bei Unklarheiten nach, statt zu raten.",
    "- Sorge fuer plausible, sichere Werte (kein Kaloriendefizit unter dem Grundumsatz).",
    "- Wenn du nichts aenderst, lass den actions-Block komplett weg.",
    "- Der Nutzer sieht den actions-Block nicht, der Text muss fuer sich stehen.",
    "",
    "=== PROFIL ===",
    `Name: ${fmt(profile.first_name || profile.name)}`,
    `Ziele: ${fmt(profile.goals)}`,
    `Koerpermasse: ${fmt(profile.measurements)}`,
    `Gewichtsverlauf (letzte Werte): ${fmt(lastWeight)}`,
    `Trainingspraeferenzen: ${fmt(profile.coach_preferences)}`,
    `Sonstige Angaben: ${fmt(profile.profile_extras)}`,
    `Coaching aktiv: ${profile.coaching_active ? "ja" : "nein"}`,
    "",
    "=== PLAENE ===",
    plans.length === 0
      ? "Noch kein Plan vorhanden."
      : plans
          .map(
            (p) =>
              `- ${fmt(p.type)} (${fmt(p.discipline)}), Status ${fmt(p.status)}, Woche ${fmt(p.current_week)}` +
              (p.event_name ? `, Ziel: ${fmt(p.event_name)} am ${fmt(p.event_date)}` : ""),
          )
          .join("\n"),
    "",
    "Aktiver Plan (Details):",
    latestPlan ? fmt(latestPlan.onboarding_data) : "keiner",
    "",
    "=== TRAININGS (letzte 20) ===",
    workouts.length === 0
      ? "Noch keine Trainings erfasst."
      : workouts.map((w) => `- ${fmt(w.date)}: ${fmt(w.name)} (${fmt(w.duration)} min)`).join("\n"),
    "",
    "=== ERNAEHRUNG (Summe pro Tag, letzte 14 Tage) ===",
    nutrition.length === 0
      ? "Noch keine Mahlzeiten erfasst."
      : nutrition.map((d) => `- ${fmt(d.date)}: ${fmt(d.kcal)} kcal, P ${fmt(d.protein)} / K ${fmt(d.carbs)} / F ${fmt(d.fat)}`).join("\n"),
  ].join("\n");
}

/** Trennt Fliesstext und actions-Block, prueft die Aktionen gegen die Whitelist. */
export function parseCoachChatReply(raw: string): { text: string; actions: CoachChatAction[] } {
  const cleaned = String(raw ?? "").trim();
  const match = cleaned.match(/```(?:actions|json|action)?\s*\n?([\s\S]*?)```/i);
  let actions: CoachChatAction[] = [];
  let text = cleaned;

  if (match) {
    const candidate = match[1].trim();
    text = (cleaned.slice(0, match.index) + cleaned.slice((match.index ?? 0) + match[0].length)).trim();
    actions = validateActions(candidate);
  } else {
    // Fallback: das Modell hat ohne Fences geliefert, aber der Rest ist reines JSON-Array.
    const bare = cleaned.match(/(\[[\s\S]*\])\s*$/);
    if (bare) {
      const parsed = validateActions(bare[1]);
      if (parsed.length > 0) {
        actions = parsed;
        text = cleaned.slice(0, bare.index).trim();
      }
    }
  }

  if (!text) text = "Erledigt.";
  return { text, actions };
}

function validateActions(candidate: string): CoachChatAction[] {
  try {
    const parsed = JSON.parse(candidate);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const out: CoachChatAction[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const type = String((item as Record<string, unknown>).type ?? "");
      switch (type) {
        case "update_goals": {
          const goals = pick((item as Record<string, unknown>).goals, ALLOWED_GOAL_KEYS);
          if (Object.keys(goals).length > 0) out.push({ type, goals });
          break;
        }
        case "update_measurements": {
          const measurements = pick((item as Record<string, unknown>).measurements, ALLOWED_MEASUREMENT_KEYS);
          if (Object.keys(measurements).length > 0) out.push({ type, measurements });
          break;
        }
        case "update_extras": {
          const extras = pick((item as Record<string, unknown>).extras, ALLOWED_EXTRA_KEYS);
          if (Object.keys(extras).length > 0) out.push({ type, extras });
          break;
        }
        case "update_coach_preferences": {
          const prefs = (item as Record<string, unknown>).preferences;
          if (prefs && typeof prefs === "object") out.push({ type, preferences: prefs as Record<string, unknown> });
          break;
        }
        case "create_plan": {
          const planType = String((item as Record<string, unknown>).planType ?? "");
          if (planType === "workout" || planType === "nutrition") {
            out.push({ type, planType, discipline: (item as Record<string, unknown>).discipline as string | undefined });
          }
          break;
        }
        case "set_coaching_active": {
          out.push({ type, active: Boolean((item as Record<string, unknown>).active) });
          break;
        }
        default:
          break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Fuehrt die Aktionen aus. Jede Aktion wird einzeln abgesichert: faellt eine aus,
 * laufen die uebrigen weiter und der Fehler landet im Ergebnis.
 *
 * create_plan legt bewusst nur den Plan-Datensatz an (Status `draft`) - die eigentliche
 * Wochen-Generierung laeuft ueber den bestehenden Coach-Flow im Trainingsbereich, damit
 * ein Chat-Kommentar nicht unbemerkt teure KI-Laeufe startet.
 */
export async function applyCoachChatActions(
  pool: Pool,
  userId: number,
  actions: CoachChatAction[],
): Promise<AppliedAction[]> {
  const applied: AppliedAction[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case "update_goals": {
          await pool.query(
            "UPDATE users SET goals = COALESCE(goals,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$1",
            [userId, JSON.stringify(action.goals)],
          );
          applied.push({ type: action.type, ok: true, note: Object.keys(action.goals).join(", ") });
          break;
        }
        case "update_measurements": {
          await pool.query(
            "UPDATE users SET measurements = COALESCE(measurements,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$1",
            [userId, JSON.stringify(action.measurements)],
          );
          applied.push({ type: action.type, ok: true, note: Object.keys(action.measurements).join(", ") });
          break;
        }
        case "update_extras": {
          await pool.query(
            "UPDATE users SET profile_extras = COALESCE(profile_extras,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$1",
            [userId, JSON.stringify(action.extras)],
          );
          applied.push({ type: action.type, ok: true, note: Object.keys(action.extras).join(", ") });
          break;
        }
        case "update_coach_preferences": {
          await pool.query(
            "UPDATE users SET coach_preferences = COALESCE(coach_preferences,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$1",
            [userId, JSON.stringify(action.preferences)],
          );
          applied.push({ type: action.type, ok: true });
          break;
        }
        case "set_coaching_active": {
          await pool.query("UPDATE users SET coaching_active=$2, updated_at=NOW() WHERE id=$1", [
            userId,
            action.active,
          ]);
          applied.push({ type: action.type, ok: true, note: action.active ? "an" : "aus" });
          break;
        }
        case "create_plan": {
          const discipline = action.discipline ?? (action.planType === "workout" ? "strength" : "balanced");
          const inserted = await pool.query(
            `INSERT INTO coach_plans (user_id, type, discipline, plan_mode, generation_status)
             VALUES ($1,$2,$3,'chat','idle')
             RETURNING id`,
            [userId, action.planType, discipline],
          );
          applied.push({
            type: action.type,
            ok: true,
            note: `Plan ${inserted.rows[0]?.id ?? ""} angelegt - im Trainingsbereich starten`,
          });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      applied.push({
        type: (action as { type: string }).type,
        ok: false,
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return applied;
}
