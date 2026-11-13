/**
 * Nutri-Score + OFF-Nährstoff-Ampel (grün/gelb/rot) wie auf Open Food Facts.
 */

import { cn } from '@/src/lib/utils';
import type { Food, NutrientLevelGrade, OffNutritionGrades } from '@/src/lib/foodDatabase';
import { useI18n } from '@/src/lib/i18n';

function levelColor(level: NutrientLevelGrade | undefined): string {
  switch (level) {
    case 'low':
      return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40';
    case 'moderate':
      return 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40';
    case 'high':
      return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40';
    default:
      return 'bg-[var(--background)] text-[var(--text-muted)] border-[var(--border-muted)]';
  }
}

function nutriScoreColor(grade: string | undefined): string {
  switch (grade?.toLowerCase()) {
    case 'a':
      return 'bg-accent text-on-accent';
    case 'b':
      return 'bg-lime-600 text-white';
    case 'c':
      return 'bg-amber-500 text-black';
    case 'd':
      return 'bg-orange-600 text-white';
    case 'e':
      return 'bg-red-600 text-white';
    default:
      return 'bg-[var(--border-muted)] text-[var(--text-muted)]';
  }
}

type LevelKey = keyof NonNullable<OffNutritionGrades['levels']>;

const LEVEL_KEYS: { key: LevelKey; labelKey: string }[] = [
  { key: 'fat', labelKey: 'nut.grades.fat' },
  { key: 'saturatedFat', labelKey: 'nut.grades.satFat' },
  { key: 'sugars', labelKey: 'nut.grades.sugars' },
  { key: 'salt', labelKey: 'nut.grades.salt' },
];

export default function FoodNutrientGrades({
  food,
  compact = false,
  className,
}: {
  food: Food;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const grades = food.offGrades;
  if (!grades?.nutriScore && !grades?.levels) return null;

  const levels = grades.levels;
  const hasLevels = levels && LEVEL_KEYS.some(({ key }) => levels[key]);

  return (
    <div className={cn('space-y-2', className)}>
      {grades.nutriScore ? (
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t('nut.grades.nutriScore')}
          </span>
          <span
            className={cn(
              'inline-flex min-w-[1.75rem] justify-center rounded-md px-2 py-0.5 text-xs font-black uppercase',
              nutriScoreColor(grades.nutriScore),
            )}
          >
            {grades.nutriScore}
          </span>
        </div>
      ) : null}

      {hasLevels ? (
        <div className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
          {LEVEL_KEYS.map(({ key, labelKey }) => {
            const lv = levels?.[key];
            if (!lv) return null;
            return (
              <span
                key={key}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                  levelColor(lv),
                  compact && 'px-1.5 text-[8px]',
                )}
              >
                <span className="opacity-80">{t(labelKey)}</span>
                <span>{t(`nut.grades.level.${lv}`)}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
