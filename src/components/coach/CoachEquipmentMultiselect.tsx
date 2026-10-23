/**
 * Kategorisierter Equipment-Multiselect für Coach-Onboarding.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { uiChoice } from '@/src/lib/uiChoices';
import {
  COACH_DEFAULT_EQUIPMENT,
  COACH_EQUIPMENT_CATEGORY_ORDER,
  COACH_EQUIPMENT_CATALOG,
  applyBodyweightOnlyEquipmentRule,
  normalizeCoachEquipmentSelection,
  toggleCoachEquipment,
  type CoachEquipmentCategory,
} from '@/src/lib/coachEquipment';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Liste direkt geöffnet (Coach Kraft-Setup). */
  initialOpen?: boolean;
};

function groupByCategory() {
  const map: Record<CoachEquipmentCategory, string[]> = {
    calisthenics: [],
    free_weights: [],
    machines: [],
    cardio: [],
    bundles: [],
  };
  for (const item of COACH_EQUIPMENT_CATALOG) {
    map[item.category].push(item.id);
  }
  return map;
}

const GROUPED = groupByCategory();

export default function CoachEquipmentMultiselect({ value, onChange, t, initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const selected = useMemo(() => new Set(normalizeCoachEquipmentSelection(value)), [value]);

  const summary =
    selected.size === 0
      ? t('coach.onb.equip.none')
      : [...selected]
          .map(id => t(`coach.onb.equip.${id}` as 'coach.onb.equip.bodyweight'))
          .join(', ');

  const setSelection = (next: string[]) => {
    const normalized = applyBodyweightOnlyEquipmentRule(normalizeCoachEquipmentSelection(next));
    onChange(normalized.length ? normalized : [...COACH_DEFAULT_EQUIPMENT]);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full min-h-[52px] rounded-2xl border-2 px-4 py-3 text-left transition-all flex items-center justify-between gap-3',
          open
            ? 'border-brand bg-brand/5'
            : 'border-[var(--border-muted)] bg-[var(--background)] hover:border-brand/50',
        )}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t('coach.onb.equip.selected')}
          </p>
          <p className="text-[11px] font-bold text-[var(--text-primary)] mt-0.5 line-clamp-2">{summary}</p>
        </div>
        <ChevronDown
          size={18}
          className={cn('text-[var(--text-muted)] shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-3 sm:p-4 space-y-4 pb-10">
          {COACH_EQUIPMENT_CATEGORY_ORDER.map(cat => {
            const ids = GROUPED[cat];
            if (!ids.length) return null;
            return (
              <div key={cat}>
                <p className="text-[9px] font-black uppercase tracking-widest text-brand mb-2">
                  {t(`coach.onb.equip.cat.${cat}` as 'coach.onb.equip.cat.calisthenics')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ids.map(id => {
                    const sel = selected.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelection(toggleCoachEquipment([...selected], id))}
                        className={cn(
                          'min-h-[44px] rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-left flex items-center justify-between gap-2',
                          uiChoice(sel),
                        )}
                      >
                        <span className="line-clamp-2">
                          {t(`coach.onb.equip.${id}` as 'coach.onb.equip.bodyweight')}
                        </span>
                        {sel ? <Check size={14} className="shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[9px] font-medium text-[var(--text-muted)] leading-relaxed">
            {t('coach.onb.equip.bodyweightHint')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
