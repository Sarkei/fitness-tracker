import type { PortionOption } from '@/src/lib/nutrition/schemas';
import { cn } from '@/src/lib/utils';

type Props = {
  options: PortionOption[];
  selectedId: string;
  quantity: number;
  onSelect: (option: PortionOption) => void;
  onQuantityChange: (q: number) => void;
  totalGrams: number;
  totalKcal?: number;
};

export default function PortionPicker({
  options,
  selectedId,
  quantity,
  onSelect,
  onQuantityChange,
  totalGrams,
  totalKcal,
}: Props) {
  const selected = options.find((o) => o.id === selectedId) ?? options[0];
  const visibleOptions = options.reduce<PortionOption[]>((acc, opt) => {
    const seenUnit = acc.some((v) => v.logUnit === opt.logUnit);
    if (!seenUnit || opt.id === selectedId) {
      if (!seenUnit) acc.push(opt);
      else {
        const idx = acc.findIndex((v) => v.logUnit === opt.logUnit);
        if (idx >= 0) acc[idx] = opt;
      }
    }
    return acc;
  }, []);
  const isDirectGramUnit = selected?.logUnit === 'g' || selected?.logUnit === 'ml';
  const quantityStep = isDirectGramUnit ? 5 : 0.25;
  const normalizeQuantity = (value: number) => {
    if (!Number.isFinite(value)) return isDirectGramUnit ? 1 : 0.25;
    if (isDirectGramUnit) return Math.max(1, Math.round(value));
    return Math.max(0.25, Math.round(value * 100) / 100);
  };
  const optionLabel = (opt: PortionOption) => {
    if (opt.logUnit === 'g') return 'Gramm';
    if (opt.logUnit === 'stk') return `Stück, ${Math.round(opt.grams)}g`;
    return opt.label;
  };
  const displayQuantity = isDirectGramUnit
    ? `${Math.round(quantity)}`
    : (Math.round(quantity * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visibleOptions.slice(0, 6).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs border transition-colors',
              opt.id === selectedId
                ? 'border-brand bg-brand/15 text-brand'
                : 'border-white/10 text-white/70 hover:border-white/25',
            )}
          >
            {optionLabel(opt)}
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2.5 space-y-2">
          <p className="text-[11px] text-white/60">
            Menge ({selected.logUnit === 'stk' ? 'Stück' : selected.logUnit})
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-9 h-9 rounded-lg border border-white/15 text-lg"
              onClick={() => onQuantityChange(normalizeQuantity(Math.max(quantityStep, quantity - quantityStep)))}
            >
              −
            </button>
            {isDirectGramUnit ? (
              <input
                type="number"
                min={1}
                step={selected.logUnit === 'ml' ? 10 : 5}
                value={Math.round(totalGrams)}
                onChange={(e) => onQuantityChange(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-lg bg-black/35 border border-white/15 px-2 py-1.5 text-sm text-center tabular-nums"
              />
            ) : (
              <span className="text-sm font-medium tabular-nums min-w-[3rem] text-center">{displayQuantity}</span>
            )}
            <button
              type="button"
              className="w-9 h-9 rounded-lg border border-white/15 text-lg"
              onClick={() => onQuantityChange(normalizeQuantity(quantity + quantityStep))}
            >
              +
            </button>
            <span className="ml-auto text-xs text-white/50">
              {Math.round(totalGrams)} g{totalKcal != null ? ` · ${totalKcal} kcal` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
