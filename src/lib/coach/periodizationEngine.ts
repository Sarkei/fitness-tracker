import type { AthleteWeekSnapshot, CoachPlanState, CoachRecommendation, WeekDirective } from './coachTypes';

function clampRating(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

function deriveOverallRating(snapshot: AthleteWeekSnapshot, completionRate: number): number {
  let score = completionRate / 10;
  if (snapshot.training?.fatigueLabelKey === 'fatigue.critical') score -= 2;
  else if (snapshot.training?.fatigueLabelKey === 'fatigue.high') score -= 1;
  if (snapshot.flags.includes('low_adherence') || snapshot.flags.includes('low_meal_logging')) score -= 1;
  if ((snapshot.training?.topPrs.length ?? 0) > 0 && completionRate >= 70) score += 0.5;
  if (snapshot.nutrition?.calorieAdherencePct != null) {
    const dev = Math.abs(snapshot.nutrition.calorieAdherencePct - 100);
    if (dev > 20) score -= 0.5;
  }
  return clampRating(score);
}

function pickRecommendation(
  snapshot: AthleteWeekSnapshot,
  state: CoachPlanState,
  weeksUntilEvent: number | null,
): CoachRecommendation {
  const rate = snapshot.adherence.completionRate;
  if (weeksUntilEvent != null && weeksUntilEvent <= 2) return 'reduce_volume';
  if (state.deloadNextWeek || state.phase === 'deload') return 'deload';
  if (snapshot.flags.includes('high_fatigue') || snapshot.training?.fatigueLabelKey === 'fatigue.critical') {
    return rate < 50 ? 'deload' : 'reduce_volume';
  }
  if (rate < 55) return 'reduce_volume';
  if (rate >= 88 && !snapshot.flags.includes('high_fatigue')) {
    if (state.weekInBlock >= state.blockLength - 1) return 'deload';
    return 'increase_volume';
  }
  return 'continue';
}

export function computeWeekDirective(params: {
  snapshot: AthleteWeekSnapshot;
  planState: CoachPlanState;
  weeksUntilEvent?: number | null;
}): WeekDirective {
  const { snapshot, planState } = params;
  const completionRate = snapshot.adherence.completionRate;
  const recommendation = pickRecommendation(snapshot, planState, params.weeksUntilEvent ?? null);
  const taperWeek = (params.weeksUntilEvent ?? 99) <= 2;

  let volumeMultiplier = planState.volumeMultiplier;
  let intensityTargetRpe = planState.intensityTargetRpe;
  const bullets: string[] = [];
  const progressionNotes: string[] = [];

  if (recommendation === 'deload') {
    volumeMultiplier = 0.6;
    intensityTargetRpe = Math.max(5, intensityTargetRpe - 2);
    bullets.push('Deload week: reduce total sets by ~40% and keep technique crisp.');
  } else if (recommendation === 'reduce_volume') {
    volumeMultiplier = Math.max(0.75, volumeMultiplier * 0.88);
    intensityTargetRpe = Math.max(6, intensityTargetRpe - 1);
    bullets.push('Reduce weekly volume ~10–15% until adherence and recovery improve.');
  } else if (recommendation === 'increase_volume') {
    volumeMultiplier = Math.min(1.12, volumeMultiplier * 1.08);
    intensityTargetRpe = Math.min(8, intensityTargetRpe + 0.5);
    bullets.push('Progression week: add ~5–8% volume on primary lifts if sessions felt manageable.');
  } else {
    bullets.push('Maintain structure; fix weak adherence days before adding load.');
  }

  if (taperWeek) {
    volumeMultiplier = 0.55;
    intensityTargetRpe = 6;
    bullets.push('Event taper: short, sharp sessions; no new soreness.');
  }

  const hardFeedback = (planState.sessionFeedback ?? []).filter((f) => f.rating === 'hard').length;
  if (hardFeedback >= 2 && snapshot.planType === 'workout') {
    volumeMultiplier = Math.min(volumeMultiplier, planState.volumeMultiplier * 0.92);
    bullets.push('Multiple sessions felt too hard — keep load steady before adding volume.');
  }

  if (snapshot.planType === 'nutrition' && snapshot.flags.includes('low_meal_logging')) {
    bullets.push('Log each planned meal slot this week so adherence can be measured.');
  }
  if (snapshot.planType === 'nutrition' && snapshot.flags.includes('calorie_off_target')) {
    bullets.push('Align daily calories with the generated week targets (±15%).');
  }

  if (snapshot.planType === 'workout' && snapshot.training) {
    if (snapshot.training.volumeWoWDeltaPct != null) {
      progressionNotes.push(`Volume WoW: ${snapshot.training.volumeWoWDeltaPct > 0 ? '+' : ''}${snapshot.training.volumeWoWDeltaPct}%`);
    }
    if (snapshot.training.avgRpe != null) {
      progressionNotes.push(`Average logged RPE: ${snapshot.training.avgRpe}`);
    }
    for (const pr of snapshot.training.topPrs.slice(0, 3)) {
      progressionNotes.push(`PR estimate: ${pr.exercise} ~${pr.e1rmKg} kg e1RM`);
    }
  }

  if (snapshot.planType === 'nutrition' && snapshot.nutrition) {
    if (snapshot.nutrition.calorieAdherencePct != null) {
      progressionNotes.push(`Calorie adherence vs target: ${snapshot.nutrition.calorieAdherencePct}%`);
    }
    progressionNotes.push(`Logged ${snapshot.nutrition.entriesLogged} meals across ${snapshot.nutrition.daysWithLogs} days`);
  }

  return {
    recommendation,
    completionRate,
    volumeMultiplier: Math.round(volumeMultiplier * 100) / 100,
    intensityTargetRpe: Math.round(intensityTargetRpe * 10) / 10,
    deloadWeek: recommendation === 'deload',
    taperWeek,
    overallRating: deriveOverallRating(snapshot, completionRate),
    coachDirectiveBullets: bullets,
    progressionNotes,
  };
}

export function advancePlanStateAfterWeek(
  state: CoachPlanState,
  directive: WeekDirective,
  weekNumber: number,
): CoachPlanState {
  let phase = state.phase;
  let weekInBlock = state.weekInBlock + 1;
  const blockLength = state.blockLength;

  if (weekNumber === 1) {
    phase = 'baseline';
    weekInBlock = 1;
  } else if (directive.deloadWeek) {
    phase = 'deload';
    weekInBlock = 1;
  } else if (directive.recommendation === 'increase_volume' && phase === 'baseline') {
    phase = 'accumulation';
  } else if (weekInBlock > blockLength) {
    phase = directive.recommendation === 'increase_volume' ? 'intensification' : 'accumulation';
    weekInBlock = 1;
  }

  let nutritionMacroMultiplier = state.nutritionMacroMultiplier;
  if (directive.recommendation === 'reduce_volume' || directive.deloadWeek) {
    nutritionMacroMultiplier = Math.max(0.9, nutritionMacroMultiplier * 0.97);
  } else if (directive.recommendation === 'increase_volume') {
    nutritionMacroMultiplier = Math.min(1.08, nutritionMacroMultiplier * 1.02);
  }

  return {
    ...state,
    phase,
    weekInBlock,
    blockLength,
    volumeMultiplier: directive.volumeMultiplier,
    intensityTargetRpe: directive.intensityTargetRpe,
    deloadNextWeek: weekInBlock >= blockLength && directive.recommendation !== 'deload',
    nutritionMacroMultiplier,
    lastRecommendation: directive.recommendation,
  };
}
