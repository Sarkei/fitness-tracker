import { useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { PrimaryButton } from './ui';
import { analyzeFood, fileToDataUrl, saveAnalyzedMeal, type V3Result } from './simpleApi';

/** Essen fotografieren → KI erkennt das Gericht → kurz prüfen → speichern. */
export default function PhotoMealSheet({
  date,
  initialCategory,
  onClose,
  onSaved,
}: {
  date: string;
  initialCategory?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'pick' | 'working' | 'review'>('pick');
  const [result, setResult] = useState<V3Result | null>(null);
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [category, setCategory] = useState(initialCategory ?? 'lunch');
  const [error, setError] = useState<string | null>(null);

  const analyze = async (payload: { imageDataUrl?: string; text?: string }) => {
    setPhase('working');
    setError(null);
    try {
      const data = await analyzeFood(payload);
      setResult(data);
      setGrams(Object.fromEntries((data.components ?? []).map((c) => [c.component_id, Math.round(c.grams)])));
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse fehlgeschlagen.');
      setPhase('pick');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      await analyze({ imageDataUrl: dataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bild konnte nicht verarbeitet werden.');
      setPhase('pick');
    }
  };

  const save = async () => {
    if (!result) return;
    setPhase('working');
    setError(null);
    try {
      await saveAnalyzedMeal({ result, grams, date, category });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
      setPhase('review');
    }
  };

  const totalKcal = (result?.components ?? []).reduce((sum, c) => {
    const factor = (grams[c.component_id] ?? c.grams) / Math.max(1, c.grams);
    return sum + c.kcal * factor;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-muted)] px-4 py-3">
          <p className="text-sm font-black uppercase tracking-tighter">Essen erfassen</p>
          <button className="rounded-full p-1.5 text-[var(--text-muted)]" onClick={onClose} aria-label="Schließen">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {phase === 'pick' && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-[var(--border-muted)] py-10"
              >
                <Camera className="h-8 w-8 text-brand" />
                <span className="text-sm font-bold">Foto machen</span>
                <span className="text-xs text-[var(--text-muted)]">Die KI erkennt das Gericht und rechnet die Nährwerte</span>
              </button>

              <div className="space-y-2">
                <textarea
                  className="w-full rounded-2xl border border-[var(--border-muted)] bg-transparent px-3 py-2 text-sm"
                  rows={2}
                  placeholder="…oder kurz beschreiben: „2 Brötchen mit Käse und ein Kaffee mit Milch“"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <PrimaryButton full disabled={text.trim().length < 3} onClick={() => void analyze({ text: text.trim() })}>
                  Aus Text schätzen
                </PrimaryButton>
              </div>
            </>
          )}

          {phase === 'working' && (
            <div className="flex flex-col items-center gap-3 py-14 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
              {preview ? 'Gericht wird erkannt …' : 'Nährwerte werden geschätzt …'}
            </div>
          )}

          {phase === 'review' && result && (
            <>
              {preview && <img src={preview} alt="" className="max-h-40 w-full rounded-2xl object-cover" />}
              <div>
                <p className="text-base font-bold">{result.analysis?.meal_name ?? 'Mahlzeit'}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {Math.round(totalKcal)} kcal · {Math.round(result.totals?.protein ?? 0)} g Protein ·{' '}
                  {result.analysis?.confidence_overall === 'low' ? 'unsichere Schätzung' : 'geschätzt'}
                </p>
              </div>

              <div className="space-y-2">
                {result.components.map((component) => (
                  <div key={component.component_id} className="flex items-center gap-2 rounded-2xl border border-[var(--border-muted)] px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{component.component_name}</span>
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded-lg bg-[var(--surface-gray)] px-2 py-1 text-center text-sm font-bold outline-none"
                      value={grams[component.component_id] ?? Math.round(component.grams)}
                      onChange={(e) => setGrams((prev) => ({ ...prev, [component.component_id]: Number(e.target.value) || 0 }))}
                    />
                    <span className="text-xs text-[var(--text-muted)]">g</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {[
                  { id: 'breakfast', label: 'Frühstück' },
                  { id: 'lunch', label: 'Mittag' },
                  { id: 'dinner', label: 'Abend' },
                  { id: 'snack', label: 'Snack' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCategory(option.id)}
                    className={`flex-1 rounded-xl border px-2 py-1.5 text-[11px] font-semibold ${
                      category === option.id ? 'border-brand bg-brand/10 text-brand' : 'border-[var(--border-muted)] text-[var(--text-muted)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">{error}</p>}
        </div>

        {phase === 'review' && (
          <div className="border-t border-[var(--border-muted)] p-3">
            <PrimaryButton full onClick={() => void save()}>
              <span className="inline-flex items-center justify-center gap-2">
                <Check className="h-4 w-4" /> Eintragen
              </span>
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
