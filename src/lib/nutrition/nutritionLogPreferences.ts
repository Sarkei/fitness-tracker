const EXPERT_KEY = 'nutrition_log_expert_mode_v1';

export function isNutritionExpertMode(): boolean {
  try {
    return localStorage.getItem(EXPERT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNutritionExpertMode(enabled: boolean): void {
  try {
    localStorage.setItem(EXPERT_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode */
  }
}
