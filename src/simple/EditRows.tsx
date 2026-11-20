import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { updateFood, type FoodEntry } from './simpleApi';

/**
 * Mahlzeit bearbeiten — inline in der Liste, ohne eigenes Fenster.
 * Aendert Name, Kategorie und die vier Naehrwerte.
 */
export default function MealEditRow({
  entry,
  onSaved,
  onCancel,
}: {
  entry: FoodEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [meal, setMeal] = useState(entry.meal ?? '');
  const [kcal, setKcal] = useState(Number(entry.calories) || 0);
  const [protein, setProtein] = useState(Number(entry.protein) || 0);
  const [carbs, setCarbs] = useState(Number(entry.carbs) || 0);
  const [fat, setFat] = useState(Number(entry.fat) || 0);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = async () => {
    if (!meal.trim()) {
      setFehler('Name fehlt');
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await updateFood(entry.id, {
        meal: meal.trim(),
        calories: kcal,
        protein,
        carbs,
        fat,
      });
      onSaved();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <li className="space-y-2 border-b border-[var(--border-muted)] py-2.5">
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg bg-[var(--surface-gray)] px-2 py-1 text-[13px] font-medium outline-none focus:ring-1 focus:ring-[var(--simple-accent)]"
          value={meal}
          onChange={(e) => setMeal(e.target.value)}
          placeholder="Name"
          autoFocus
        />
        <button
          className="rounded-lg p-1 text-[var(--simple-accent)] transition hover:opacity-70"
          onClick={() => void speichern()}
          disabled={speichert}
          aria-label="Speichern"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          className="rounded-lg p-1 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
          onClick={onCancel}
          aria-label="Abbrechen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'kcal', wert: kcal, setzen: setKcal, schritt: 10 },
          { label: 'P', wert: protein, setzen: setProtein, schritt: 1 },
          { label: 'K', wert: carbs, setzen: setCarbs, schritt: 1 },
          { label: 'F', wert: fat, setzen: setFat, schritt: 1 },
        ].map((feld) => (
          <label key={feld.label} className="rounded-lg bg-[var(--surface-gray)] px-1.5 py-1 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {feld.label}
            </span>
            <input
              type="number"
              min={0}
              step={feld.schritt}
              className="w-full bg-transparent text-center text-[13px] font-semibold outline-none"
              value={feld.wert}
              onChange={(e) => feld.setzen(Number(e.target.value) || 0)}
            />
          </label>
        ))}
      </div>

      {fehler && <p className="text-[11px] font-semibold text-red-600">{fehler}</p>}
    </li>
  );
}
