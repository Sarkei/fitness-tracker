/**
 * Strukturierte Verletzungs-Chips für Coach-Onboarding + Constraint-/Substitute-Map.
 */

export type CoachInjuryId =
  | 'knee'
  | 'shoulder'
  | 'lower_back'
  | 'wrist'
  | 'ankle'
  | 'hip'
  | 'elbow';

export const COACH_INJURY_IDS: CoachInjuryId[] = [
  'knee',
  'shoulder',
  'lower_back',
  'wrist',
  'ankle',
  'hip',
  'elbow',
];

/** Canonical tokens stored in injuries plain text for reliable parsing. */
const TOKEN_RE = /\[(knee|shoulder|lower_back|wrist|ankle|hip|elbow)\]/gi;

const KEYWORD_MAP: Record<CoachInjuryId, RegExp> = {
  knee: /\b(knie|knee|patella|acl|menisk)\b/i,
  shoulder: /\b(schulter|shoulder|rotator|impingement)\b/i,
  lower_back: /\b(unterer?\s*rücken|lower\s*back|lumbal|bandscheibe|disc)\b/i,
  wrist: /\b(handgelenk|wrist)\b/i,
  ankle: /\b(knöchel|ankle|sprunggelenk)\b/i,
  hip: /\b(hüfte|hip|impingement\s*hüfte)\b/i,
  elbow: /\b(ellenbogen|elbow|tennisarm|golfarm)\b/i,
};

export function injuryLabelKey(id: CoachInjuryId): string {
  return `coach.onb.injury.${id}`;
}

export function parseInjuryIds(plain: string): CoachInjuryId[] {
  const s = String(plain || '');
  const found = new Set<CoachInjuryId>();
  for (const m of s.matchAll(TOKEN_RE)) {
    found.add(m[1].toLowerCase() as CoachInjuryId);
  }
  for (const id of COACH_INJURY_IDS) {
    if (KEYWORD_MAP[id].test(s)) found.add(id);
  }
  return COACH_INJURY_IDS.filter(id => found.has(id));
}

export function injuryNotesFromPlain(plain: string): string {
  return String(plain || '')
    .replace(TOKEN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatInjuriesPlain(ids: CoachInjuryId[], notes?: string): string {
  const tokens = COACH_INJURY_IDS.filter(id => ids.includes(id)).map(id => `[${id}]`);
  const note = String(notes || '').trim();
  return [...tokens, note].filter(Boolean).join(' ').trim();
}

export function toggleInjuryId(ids: CoachInjuryId[], id: CoachInjuryId): CoachInjuryId[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

export function injuryActive(plain: string, id: CoachInjuryId): boolean {
  return parseInjuryIds(plain).includes(id);
}

/** Patterns that conflict with a given injury (validation + substitute trigger). */
export const INJURY_BLOCKED_PATTERNS: Record<CoachInjuryId, RegExp> = {
  knee: /squat|lunge|bulgarian|step.?up|leg.?press|jump|box jump|pistol/i,
  shoulder: /overhead|ohp|military press|shoulder press|push press|handstand|kettlebell snatch|kettlebell swing|dip\b/i,
  lower_back: /deadlift|good morning|back extension|roman.?ian|rdl|bent.?over.?row|superman/i,
  wrist: /handstand|planche|wrist.?curl|front.?lever|push.?up|liegestütz|burpee/i,
  ankle: /jump|box jump|calf raise|running|sprint|plyo/i,
  hip: /deep.?squat|pistol|hip.?thrust|sumo|butterfly|pigeon/i,
  elbow: /skull.?crusher|tricep.?extension|curl|chin.?up|pull.?up|klimmzug/i,
};
