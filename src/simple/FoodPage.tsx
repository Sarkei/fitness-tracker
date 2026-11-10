import { useCallback, useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Card, GhostButton, MacroBar, PageHeader, PrimaryButton, Ring, SectionTitle } from './ui';
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
  const isToday = date === todayYmd();

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={isToday ? 'Heute' : formatDay(date)}
        title="Ernährung"
        hint={`${entries.length} Einträge · ${Math.round(sum.kcal)} kcal`}
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => setDate(shiftYmd(date, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Zurück
            </GhostButton>
            <GhostButton onClick={() => setDate(shiftYmd(date, 1))} disabled={isToday}>
              Vor <ChevronRight className="h-3.5 w-3.5" />
            </GhostButton>
            <PrimaryButton onClick={() => setShowPhoto(true)}>
              <Camera className="h-4 w-4" /> Foto
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-5">
          <SectionTitle>Übersicht</SectionTitle>
          <div className="flex items-center gap-6">
            <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={132} />
            <div className="flex-1 space-y-3">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>{entries.length} Einträge</SectionTitle>
          {entries.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Für diesen Tag ist nichts eingetragen.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.meal}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {Math.round(Number(entry.protein) || 0)} g P · {Math.round(Number(entry.carbs) || 0)} g K ·{' '}
                      {Math.round(Number(entry.fat) || 0)} g F
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{Math.round(Number(entry.calories) || 0)}</span>
                  <button
                    className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--simple-clay)]"
                    onClick={() => void remove(entry.id)}
                    aria-label="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {showPhoto && <PhotoMealSheet date={date} onClose={() => setShowPhoto(false)} onSaved={() => void load()} />}
    </div>
  );

  async function remove(id: string) {
    try {
      await deleteFood(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  }
}
