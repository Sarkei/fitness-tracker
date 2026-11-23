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

const DISCIPLINE_LABEL: Record<string, string> = {
  strength: 'Krafttraining',
  cardio: 'Ausdauer',
  run: 'Lauftraining',
  running: 'Lauftraining',
  bike: 'Radtraining',
  swim: 'Schwimmtraining',
  hiit: 'HIIT',
  mobility: 'Mobility',
  balanced: 'Ausgewogene Ernährung',
  lose: 'Abnehmen',
  gain: 'Muskelaufbau',
  maintain: 'Gewicht halten',
};

/** Sinnvoller Name aus Typ und Disziplin, z. B. "Krafttraining – 4 Wochen ab 23.11.". */
export function sinnvollerPlanName(
  planType: 'workout' | 'nutrition',
  discipline?: string | null,
  opts: { weeks?: number; startYmd?: string } = {},
): string {
  const basis =
    DISCIPLINE_LABEL[String(discipline ?? '').toLowerCase()] ??
    (planType === 'workout' ? 'Trainingsplan' : 'Ernährungsplan');
  const teile = [basis];
  if (opts.weeks && opts.weeks > 0) {
    teile.push(opts.weeks === 1 ? '1 Woche' : `${opts.weeks} Wochen`);
  }
  if (opts.startYmd) {
    const [, m, d] = opts.startYmd.split('-');
    if (m && d) teile.push(`ab ${d}.${m}.`);
  }
  return teile.join(' – ');
}

/** Plan auswählen: nach Name (Teiltreffer, ohne Groß/klein) oder den neuesten. */
async function waehlePlan(
  pool: Pool,
  userId: number,
  planType: 'workout' | 'nutrition' | undefined,
  opts: { name?: string; newest?: boolean },
): Promise<{ id: string; type: string; discipline: string | null; name: string | null; status: string } | null> {
  const typFilter = planType ? 'AND type=$2' : '';
  const params: unknown[] = planType ? [userId, planType] : [userId];
  if (opts.name && opts.name.trim()) {
    params.push(`%${opts.name.trim()}%`);
    const r = await pool.query(
      `SELECT id, type, discipline, name, status FROM coach_plans
        WHERE user_id=$1 ${typFilter} AND coalesce(name,'') ILIKE $${params.length}
        ORDER BY updated_at DESC LIMIT 1`,
      params,
    );
    if (r.rows.length) return r.rows[0];
  }
  const r = await pool.query(
    `SELECT id, type, discipline, name, status FROM coach_plans
      WHERE user_id=$1 ${typFilter}
      ORDER BY updated_at DESC LIMIT 1`,
    planType ? [userId, planType] : [userId],
  );
  return r.rows[0] ?? null;
}

function targetLabel(plan: { name?: string | null; discipline?: string | null; type?: string }): string {
  return (
    plan.name?.trim() ||
    sinnvollerPlanName((plan.type as 'workout' | 'nutrition') ?? 'workout', plan.discipline)
  );
}

export type CoachChatAction =
  | { type: "update_goals"; goals: Record<string, unknown> }
  | { type: "update_measurements"; measurements: Record<string, unknown> }
  | { type: "update_coach_preferences"; preferences: Record<string, unknown> }
  | { type: "update_extras"; extras: Record<string, unknown> }
  | {
      type: "create_plan";
      planType: "workout" | "nutrition";
      discipline?: string;
      /** Trainingsplan: freie Vorgaben, damit der Coach alles selbst festlegen kann. */
      weeks?: number;
      daysPerWeek?: number;
      sessionMinutes?: number;
      /** Zwei Einheiten an einem Tag erlauben (z. B. Kraft morgens, Cardio abends). */
      doubleSessions?: boolean;
      /** Zwei Einheiten pro Tag für genau diese Tage (Mo–So). */
      doubleDays?: string[];
      trainingDays?: string[];
      equipment?: string[];
    }
  | { type: "set_coaching_active"; active: boolean }
  | { type: "rename_plan"; planType: "workout" | "nutrition"; name: string }
  | { type: "activate_plan"; planType: "workout" | "nutrition"; name?: string; newest?: boolean }
  | { type: "deactivate_plans"; planType?: "workout" | "nutrition" }
  | { type: "delete_plan"; planType?: "workout" | "nutrition"; name?: string; newest?: boolean }
  | {
      type: "create_schedule";
      /** Was ausgeloest werden soll. */
      trigger: "nach_training" | "taeglich" | "waechentlich" | "monatlich";
      /** Wochentag 1-7 (Mo-So) bei waechentlich. */
      weekday?: number;
      /** Tag im Monat 1-28 bei monatlich. */
      dayOfMonth?: number;
      /** Uhrzeit HH:MM fuer taeglich/waechentlich/monatlich. */
      time?: string;
      /** Aufgabe in einem Satz - das ist der Auftrag an den Coach. */
      task: string;
      /** Titel fuer die Anzeige. */
      title?: string;
    };

/** Erlaubte Ausloeser, damit das Modell nichts anderes erfinden kann. */
const ERLAUBTE_TRIGGER = ["nach_training", "taeglich", "waechentlich", "monatlich"] as const;

/**
 * Untergrenzen gegen versehentlich teure Zeitplaene.
 * Jede Ausfuehrung kostet einen KI-Aufruf - ein "jede Stunde"-Auftrag waere teuer
 * und liefert kaum Mehrwert, deshalb wird er abgelehnt statt still angelegt.
 */
const MIN_ABSTAND_STUNDEN: Record<string, number> = {
  nach_training: 0,
  taeglich: 20,
  waechentlich: 0,
  monatlich: 0,
};

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
  /** Bereits eingerichtete eigene Zeitplaene, damit keine Dubletten entstehen. */
  schedules?: Array<Record<string, unknown>>;
}): string {
  const { profile, plans, workouts, nutrition, latestPlan } = input;
  const schedules = input.schedules ?? [];
  const weightHistory = Array.isArray(profile.weight_history) ? profile.weight_history.slice(-10) : [];
  const lastWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1] : null;

  return [
    "Du bist der persoenliche Fitness- und Ernaehrungscoach in der Fitness-App.",
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
    '  Optional beim Trainingsplan: "weeks" (1-52), "daysPerWeek" (1-14), "sessionMinutes" (30-180),' +
      ' "trainingDays":["Montag",...], "equipment":["barbell",...],' +
      ' "doubleSessions":true und "doubleDays":["Dienstag"] - damit sind ZWEI Einheiten an einem Tag moeglich.' +
    '- {"type":"set_coaching_active","active":true|false}',
    '- {"type":"activate_plan","planType":"workout"|"nutrition","name":"..."} - Plan aktivieren (loest im Chat KEINE Generierung aus)',
    '- {"type":"deactivate_plans","planType":"workout"|"nutrition"} - alle Plaene dieses Typs pausieren (bleiben erhalten)',
    '- {"type":"delete_plan","planType":"workout"|"nutrition","name":"..."} - Plan loeschen (endgueltig)',
    '- {"type":"rename_plan","planType":"workout"|"nutrition","name":"..."} - Plan umbenennen',
    '- {"type":"create_schedule","trigger":"nach_training"|"taeglich"|"waechentlich"|"monatlich",' +
      '"time":"HH:MM","weekday":1-7,"dayOfMonth":1-28,"title":"...","task":"..."} - legt einen eigenen Zeitplan an',
    "  Zeitplaene: der Nutzer sagt z.B. 'mach nach jedem Training eine Analyse'. Dann:",
    '  {"type":"create_schedule","trigger":"nach_training","title":"Analyse nach dem Training",',
    '   "task":"Analysiere die letzte Einheit: Belastung, Form, Auffaelligkeiten, Empfehlung fuer morgen."}',
    "  - trigger 'nach_training' laeuft automatisch, sobald ein neues Training importiert wurde (Empfehlung dafuer).",
    "  - 'taeglich'/'waechentlich'/'monatlich' brauchen eine Uhrzeit; waechentlich zusaetzlich weekday (1=Montag), monatlich dayOfMonth.",
    "  - 'task' ist der Auftrag an dich selbst, praezise und in einem Satz.",
    "  - Nie oefter als taeglich anlegen - jede Ausfuehrung kostet Geld.",
    "Regeln dazu:",
    "- Aendere NUR, was der Nutzer in dieser Nachricht ausdruecklich verlangt. Keine Nebenwirkungen:",
    "  Wer einen Zeitplan will, bekommt einen Zeitplan - nicht zusaetzlich neue Kalorien, Gewicht oder Plaene.",
    "  Aeltere Wuensche aus dem Verlauf gelten als erledigt und werden nicht erneut angewendet.",
    "- Aendere nur, was der Nutzer wirklich will. Frag bei Unklarheiten nach, statt zu raten.",
    "- WICHTIG: Wenn du im Text sagst 'ich richte das ein' oder 'ich kuemmere mich darum',",
    "  MUSS der actions-Block dabei sein. Sonst stimmt deine Zusage nicht - es passiert nichts.",
    "  Lieber ohne Zusage antworten als eine Zusage ohne Aktion geben.",
    "- ZEITPLAENE: Was im Abschnitt ZEITPLAENE steht, ist die einzige Wahrheit ueber bestehende",
    "  Zeitplaene. Der Chatverlauf kann veraltete Zusagen enthalten - ignorier die und pruefe",
    "  stattdessen diesen Abschnitt. Steht dort 'noch keine', gibt es keine, auch wenn du",
    "  frueher mal geschrieben hast, einer sei eingerichtet.",
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
    "=== ZEITPLAENE (Stand jetzt, verbindlich) ===",
    schedules.length === 0
      ? "Noch KEINE eigenen Zeitplaene eingerichtet."
      : schedules
          .map((s) => `- #${s.id} ${s.title}: ${s.task} (${s.trigger}${s.time_of_day ? " " + s.time_of_day : ""})`)
          .join("\n"),
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
          const raw = item as Record<string, unknown>;
          const planType = String(raw.planType ?? "");
          if (planType === "workout" || planType === "nutrition") {
            // Trainingsvorgaben durchreichen: der Coach darf den Plan frei aufbauen,
            // inklusive zweier Einheiten an einem Tag.
            const alsText = (v: unknown): string[] | undefined =>
              Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;
            out.push({
              type,
              planType,
              discipline: raw.discipline as string | undefined,
              weeks: Number(raw.weeks) > 0 ? Math.min(52, Number(raw.weeks)) : undefined,
              daysPerWeek:
                Number(raw.daysPerWeek) > 0 ? Math.min(14, Number(raw.daysPerWeek)) : undefined,
              sessionMinutes:
                Number(raw.sessionMinutes) > 0 ? Math.min(180, Number(raw.sessionMinutes)) : undefined,
              doubleSessions: raw.doubleSessions === true,
              doubleDays: alsText(raw.doubleDays),
              trainingDays: alsText(raw.trainingDays),
              equipment: alsText(raw.equipment),
            });
          }
          break;
        }
        case "set_coaching_active": {
          out.push({ type, active: Boolean((item as Record<string, unknown>).active) });
          break;
        }
        case "create_schedule": {
          const raw = item as Record<string, unknown>;
          const trigger = String(raw.trigger ?? "");
          const task = String(raw.task ?? "").trim();
          if (!(ERLAUBTE_TRIGGER as readonly string[]).includes(trigger)) break;
          if (task.length < 10) break;

          const zeit = typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : undefined;
          const weekday = Number(raw.weekday);
          const dayOfMonth = Number(raw.dayOfMonth);

          // Pflichtfelder je Ausloeser pruefen - sonst lieber verwerfen.
          if (trigger === "waechentlich" && !(weekday >= 1 && weekday <= 7)) break;
          if (trigger === "monatlich" && !(dayOfMonth >= 1 && dayOfMonth <= 28)) break;
          if (trigger !== "nach_training" && !zeit) break;

          out.push({
            type,
            trigger: trigger as CoachChatAction extends { type: "create_schedule"; trigger: infer T } ? T : never,
            weekday: trigger === "waechentlich" ? weekday : undefined,
            dayOfMonth: trigger === "monatlich" ? dayOfMonth : undefined,
            time: zeit,
            title: String(raw.title ?? "").slice(0, 80) || "Eigener Zeitplan",
            task: task.slice(0, 600),
          });
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

/** Kurze, lesbare Beschreibung eines Zeitplans fuer die Rueckmeldung im Chat. */
export function beschreibeZeitplan(s: {
  trigger: string;
  weekday?: number;
  dayOfMonth?: number;
  time?: string;
}): string {
  switch (s.trigger) {
    case "nach_training":
      return "jedes Mal, wenn ein neues Training importiert wird";
    case "taeglich":
      return `taeglich um ${s.time}`;
    case "waechentlich": {
      const tage = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
      return `jeden ${tage[s.weekday ?? 1] ?? "Montag"} um ${s.time}`;
    }
    case "monatlich":
      return `am ${s.dayOfMonth}. jeden Monats um ${s.time}`;
    default:
      return s.trigger;
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
        case "create_schedule": {
          const mindest = MIN_ABSTAND_STUNDEN[action.trigger] ?? 0;
          if (mindest > 0) {
            const zuViel = await pool.query(
              `SELECT 1 FROM coach_schedules
                WHERE user_id=$1 AND trigger=$2 AND active=true
                  AND created_at > NOW() - ($3 || ' hours')::interval
                LIMIT 1`,
              [userId, action.trigger, String(mindest)],
            );
            if (zuViel.rowCount) {
              applied.push({
                type: action.type,
                ok: false,
                note: "So einen Zeitplan gibt es schon - bitte den bestehenden aendern statt einen zweiten anzulegen.",
              });
              break;
            }
          }

          const neu = await pool.query<{ id: number }>(
            `INSERT INTO coach_schedules
               (user_id, trigger, weekday, day_of_month, time_of_day, title, task)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING id`,
            [
              userId,
              action.trigger,
              action.weekday ?? null,
              action.dayOfMonth ?? null,
              action.time ?? null,
              action.title ?? "Eigener Zeitplan",
              action.task,
            ],
          );
          applied.push({
            type: action.type,
            ok: true,
            note: `${action.title ?? "Zeitplan"} (#${neu.rows[0]?.id}) - ${beschreibeZeitplan(action)}`,
          });
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
          const name = sinnvollerPlanName(action.planType, discipline);
          const onboarding = {
            ...(action.weeks ? { weeks: action.weeks } : {}),
            ...(action.daysPerWeek ? { daysPerWeek: action.daysPerWeek } : {}),
            ...(action.sessionMinutes ? { sessionDuration: action.sessionMinutes } : {}),
            ...(action.trainingDays?.length ? { availableTrainingDays: action.trainingDays } : {}),
            ...(action.equipment?.length ? { equipment: action.equipment } : {}),
            ...(action.doubleSessions ? { allowDoubleSessions: true } : {}),
            ...(action.doubleDays?.length ? { doubleDays: action.doubleDays } : {}),
          };
          const inserted = await pool.query(
            `INSERT INTO coach_plans (user_id, type, discipline, plan_mode, name, generation_status, onboarding_data, current_week)
             VALUES ($1,$2,$3,'chat',$4,'idle',$5::jsonb,1)
             RETURNING id`,
            [userId, action.planType, discipline, name, JSON.stringify(onboarding)],
          );
          applied.push({
            type: action.type,
            ok: true,
            note: `„${name}" angelegt – die Einheiten entstehen im Trainingsbereich über „Woche generieren"`,
          });
          break;
        }
        case "rename_plan": {
          const target = await waehlePlan(pool, userId, action.planType, { name: undefined, newest: true });
          if (!target) {
            applied.push({ type: action.type, ok: false, note: "Kein Plan dieses Typs gefunden." });
            break;
          }
          const neuerName = String(action.name ?? "").trim().slice(0, 120) || sinnvollerPlanName(action.planType, target.discipline);
          await pool.query("UPDATE coach_plans SET name=$2, updated_at=NOW() WHERE id=$1", [target.id, neuerName]);
          applied.push({ type: action.type, ok: true, note: `Plan umbenannt in „${neuerName}".` });
          break;
        }
        case "activate_plan": {
          const target = await waehlePlan(pool, userId, action.planType, { name: action.name, newest: action.newest });
          if (!target) {
            applied.push({ type: action.type, ok: false, note: "Kein passender Plan gefunden." });
            break;
          }
          // Genau ein aktiver Plan pro Typ: die anderen desselben Typs werden pausiert.
          await pool.query(
            "UPDATE coach_plans SET status='active', updated_at=NOW() WHERE id=$1",
            [target.id],
          );
          await pool.query(
            "UPDATE coach_plans SET status='paused', updated_at=NOW() WHERE user_id=$1 AND type=$2 AND id<>$3 AND status='active'",
            [userId, target.type, target.id],
          );
          applied.push({
            type: action.type,
            ok: true,
            note: `„${targetLabel(target)}" ist jetzt der aktive ${target.type === "workout" ? "Trainings" : "Ernährungs"}-Plan; andere wurden pausiert.`,
          });
          break;
        }
        case "deactivate_plans": {
          const r = await pool.query(
            `UPDATE coach_plans SET status='paused', updated_at=NOW()
              WHERE user_id=$1 AND status='active' ${action.planType ? "AND type=$2" : ""}
              RETURNING id`,
            action.planType ? [userId, action.planType] : [userId],
          );
          applied.push({
            type: action.type,
            ok: true,
            note: r.rowCount ? `${r.rowCount} Plan/Pläne pausiert (bleiben erhalten).` : "Es war kein Plan aktiv.",
          });
          break;
        }
        case "delete_plan": {
          const target = await waehlePlan(pool, userId, action.planType, { name: action.name, newest: action.newest });
          if (!target) {
            applied.push({ type: action.type, ok: false, note: "Kein passender Plan gefunden." });
            break;
          }
          await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [target.id, userId]);
          applied.push({ type: action.type, ok: true, note: `„${targetLabel(target)}" gelöscht.` });
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
