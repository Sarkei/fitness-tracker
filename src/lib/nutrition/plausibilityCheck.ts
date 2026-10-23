export type PlausibilityIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
};

export type MacroTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Grobe kcal aus Makros (4/4/9). */
export function impliedKcalFromMacros(m: MacroTotals): number {
  return m.protein * 4 + m.carbs * 4 + m.fat * 9;
}

export function checkMealPlausibility(totals: MacroTotals): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const { kcal, protein, carbs, fat } = totals;

  if (kcal <= 0 && (protein > 0 || carbs > 0 || fat > 0)) {
    issues.push({
      code: 'missing_kcal',
      severity: 'warning',
      message: 'Kalorien fehlen, obwohl Makros gesetzt sind.',
    });
  }

  if (kcal > 0 && kcal < 30) {
    issues.push({
      code: 'meal_too_low',
      severity: 'warning',
      message: 'Sehr wenig Kalorien für eine Mahlzeit — Portion prüfen.',
    });
  }

  if (kcal > 3500) {
    issues.push({
      code: 'meal_too_high',
      severity: 'warning',
      message: 'Ungewöhnlich viele Kalorien — Mengen prüfen.',
    });
  }

  if (kcal > 50) {
    const implied = impliedKcalFromMacros(totals);
    const ratio = implied > 0 ? kcal / implied : 1;
    if (ratio < 0.65 || ratio > 1.45) {
      issues.push({
        code: 'macro_kcal_mismatch',
        severity: 'warning',
        message: 'Makros passen nicht gut zu den Kalorien — Nährwerte prüfen.',
      });
    }
  }

  if (protein > 250 || carbs > 400 || fat > 200) {
    issues.push({
      code: 'macro_extreme',
      severity: 'warning',
      message: 'Ein Makronährstoff wirkt unrealistisch hoch.',
    });
  }

  return issues;
}

export function checkLineGrams(grams: number, displayName: string): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  if (grams > 2500) {
    issues.push({
      code: 'grams_extreme',
      severity: 'warning',
      message: `${displayName}: ${grams} g wirkt sehr hoch.`,
    });
  }
  if (grams < 1) {
    issues.push({
      code: 'grams_tiny',
      severity: 'error',
      message: `${displayName}: Menge zu klein.`,
    });
  }
  return issues;
}
