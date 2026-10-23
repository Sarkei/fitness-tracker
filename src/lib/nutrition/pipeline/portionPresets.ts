const DEFAULT = [50, 75, 100, 150, 200, 250];

/** Smarte Gramm-Presets je Komponenten-Rolle (Foto-Review). */
export function portionPresetsForRole(role: string, mealCategory?: string): number[] {
  const r = role.toLowerCase();
  if (r.includes('protein') || r.includes('meat') || r.includes('fish') || r.includes('egg')) {
    return [100, 125, 150, 200, 250];
  }
  if (r.includes('carb') || r.includes('starch') || r.includes('rice') || r.includes('pasta') || r.includes('bread')) {
    return [80, 120, 150, 200, 250];
  }
  if (r.includes('vegetable') || r.includes('salad') || r.includes('veg')) {
    return [50, 80, 100, 150, 200];
  }
  if (r.includes('sauce') || r.includes('dressing') || r.includes('oil')) {
    return [10, 15, 20, 30, 50];
  }
  if (r.includes('drink') || mealCategory?.startsWith('drink')) {
    return [200, 250, 330, 400, 500];
  }
  if (r.includes('dessert') || mealCategory === 'dessert') {
    return [50, 80, 100, 120, 150];
  }
  if (r.includes('cheese') || r.includes('dairy')) {
    return [30, 50, 75, 100, 150];
  }
  return DEFAULT;
}
