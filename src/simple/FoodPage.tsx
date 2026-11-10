import { useCallback, useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Card, MacroBar, Ring, SectionTitle } from './ui';
import PhotoMealSheet from './PhotoMealSheet';
import { deleteFood, fetchDay, formatDay, shiftYmd, todayYmd, totals, type FoodEntry } from './simpleApi';

export default function FoodPage() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayYmd());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await fetchDay(date));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht laden.');
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goalKcal = Number(profile?.goals?.dailyCalories) || 2400;
  const goalProtein = Number(profile?.goals?.macros?.protein) || 180;
  const goalCarbs = Number(profile?.goals?.macros?.carbs) || 240;
  const goalFat = Number(profile?.goals?.macros?.fat) || 80;

  const remove = async (id: string) => {
    try {
      await deleteFood(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
      <header className="flex items-center justify-between pt-2">
        <button className="rounded-full p-2 text-[var(--text-muted)]" onClick={() => setDate(shiftYmd(date, -1))} aria-label="Tag zurück">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {date === todayYmd() ? 'Heute' : formatDay(date)}
          </p>
          <h1 className="text-2xl font-black tracking-tighter">Essen</h1>
        </div>
        <button
          className="rounded-full p-2 text-[var(--text-muted)] disabled:opacity-30"
          onClick={() => setDate(shiftYmd(date, 1))}
          disabled={date >= todayYmd()}
          aria-label="Tag vor"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </header>

      <Card>
        <div className="flex items-center gap-5">
          <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={124} />
          <div className="flex-1 space-y-2.5">
            <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
            <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
            <MacroBar label="Fett" value={sum.fat} max={goalFat} />
          </div>
        </div>
      </Card>

      <button
        onClick={() => setShowPhoto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-brand py-4 text-sm font-bold text-white"
      >
        <Camera className="h-4 w-4" /> Foto vom Essen
      </button>

      <div>
        <SectionTitle>{entries.length} Einträge</SectionTitle>
        <Card className="!p-4">
          {entries.length === 0 ? (
            <p className="py-2 text-sm text-[var(--text-muted)]">Für diesen Tag ist nichts eingetragen.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{entry.meal}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {Math.round(Number(entry.protein) || 0)} g P · {Math.round(Number(entry.carbs) || 0)} g K ·{' '}
                      {Math.round(Number(entry.fat) || 0)} g F
                    </p>
                  </div>
                  <span className="text-sm font-bold">{Math.round(Number(entry.calories) || 0)}</span>
                  <button className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-500" onClick={() => void remove(entry.id)} aria-label="Löschen">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">{error}</p>}

      {showPhoto && <PhotoMealSheet date={date} onClose={() => setShowPhoto(false)} onSaved={() => void load()} />}
    </div>
  );
}
