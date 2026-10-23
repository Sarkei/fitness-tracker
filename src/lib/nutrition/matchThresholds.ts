/** Match-Schwellen für Auto-Auswahl und Review-Pflicht. */
export const MATCH_AUTO_HIGH = 0.85;
export const MATCH_AUTO_MEDIUM = 0.7;
export const MATCH_BLOCK_SAVE = 0.7;
export const MATCH_EXPERT_AUTO = 0.92;

export type MatchUncertainty = 'high' | 'medium' | 'low' | 'blocked';

export function matchUncertaintyFromScore(score: number, expertMode = false): MatchUncertainty {
  if (score >= MATCH_EXPERT_AUTO) return 'high';
  if (expertMode && score >= MATCH_AUTO_MEDIUM) return 'high';
  if (score >= MATCH_AUTO_HIGH) return 'high';
  if (score >= MATCH_AUTO_MEDIUM) return 'medium';
  if (score > 0) return 'blocked';
  return 'low';
}

/** Auto-Match-Schwelle (Expertenmodus lockert UI, nicht die Datenbank-Schwelle). */
export function pickThresholdAuto(_expertMode = false): number {
  return MATCH_AUTO_HIGH;
}

export function requiresCandidatePick(score: number, hasCandidates: boolean): boolean {
  return hasCandidates && score < MATCH_BLOCK_SAVE;
}

export function canSaveWithoutCandidatePick(score: number): boolean {
  return score >= MATCH_BLOCK_SAVE;
}
