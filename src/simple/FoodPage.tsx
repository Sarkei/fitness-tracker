import { useCallback, useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Dumbbell, Moon, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Card, GhostButton, MacroBar, PageHeader, PrimaryButton, Ring, SectionTitle } from './ui';
import PhotoMealSheet from './PhotoMealSheet';
import {
  dayKeyOf,
  deleteFood,
  fetchActivePlan,
  fetchDay,
  formatDay,
  shiftYmd,
  todayYmd,
  totals,
  type FoodEntry,
} from './simpleApi';

const MEALS = [
  { id: 'breakfast', label: 'Frühstück', match: /fr(ü|u)hst|breakfast/i },
  { id: 'lunch', label: 'Mittag', match: /mittag|lunch/i },
  { id: 'dinner', label: 'Abend', match: /abend|dinner|abendessen/i },
  { id: 'snack', label: 'Snacks', match: /snack|zwischen/i },
];

function bucketOf(entry: FoodEntry): string {
  const meal = String(entry.meal ?? '');
  const hit = MEALS.find((item) => item.match.test(meal));
  return hit?.id ?? 'snack';
}

export default function FoodPage() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayYmd());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [trainingDay, setTrainingDay] = useState(false);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [food, plan] = await Promise.all([fetchDay(date), fetchActivePlan().catch(() => null)]);
      setEntries(food);
      const key = dayKeyOf(date);
      const day = (plan?.week?.schedule ?? []).find((d) => d.day === key);
      setTrainingDay(Boolean(day && !day.isRest));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht laden.');
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goals = (profile?.goals ?? {}) as { dailyCalories?: number; macros?: { protein?: number; carbs?: number; fat?: number } };
  // An Trainingstagen mehr Kohlenhydrate und etwas mehr Kalorien — wie bei MacroBurn.
  const kcalBoost = trainingDay ? 1.12 : 1;
  const carbBoost = trainingDay ? 55 : 0;
  const goalKcal = Math.round((Number(goals.dailyCalories) || 2400) * kcalBoost);
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = (Number(goals.macros?.carbs) || 240) + carbBoost;
  const goalFat = Number(goals.macros?.fat) || 80;
  const remaining = Math.round(goalKcal - sum.kcal);
  const isToday = date === todayYmd();

  const grouped = MEALS.map((meal) => ({
    ...meal,
    entries: entries.filter((entry) => bucketOf(entry) === meal.id),
    kcal: entries.filter((entry) => bucketOf(entry) === meal.id).reduce((acc, entry) => acc + (Number(entry.calories) || 0), 0),
  }));

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={isToday ? 'Heute' : formatDay(date)}
        title="Ernährung"
        hint={`${entries.length} Einträge · ${trainingDay ? 'Trainingstag' : 'Ruhetag'}`}
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => setDate(shiftYmd(date, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Zurück
            </GhostButton>
            <GhostButton onClick={() => setDate(shiftYmd(date, 1))} disabled={isToday}>
              Vor <ChevronRight className="h-3.5 w-3.5" />
            </GhostButton>
            <PrimaryButton onClick={() => setSheetFor('lunch')}>
              <Camera className="h-4 w-4" /> Erfassen
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Noch übrig</p>
              <p className="text-3xl font-semibold leading-tight tabular-nums">
                {remaining}
                <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">kcal</span>
              </p>
            </div>
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                trainingDay
                  ? 'bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                  : 'bg-[var(--border-muted)]/50 text-[var(--text-muted)]'
              }`}
            >
              {trainingDay ? <Dumbbell className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
              Ziel {goalKcal} kcal
            </span>
          </div>

          <div className="mt-4 flex items-center gap-6">
            <Ring value={sum.kcal} max={goalKcal} label="gegessen" unit="kcal" size={124} />
            <div className="flex-1 space-y-3">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            </div>
          </div>

          {trainingDay && (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Trainingstag: Ziel um 12 % angehoben und {carbBoost} g mehr Kohlenhydrate als an Ruhetagen.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Woche</SectionTitle>
          <div className="flex items-end gap-1.5">
            {Array.from({ length: 7 }, (_, i) => shiftYmd(date, -6 + i)).map((ymd) => {
              const active = ymd === date;
              return (
                <button
                  key={ymd}
                  onClick={() => setDate(ymd)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition ${
                    active ? 'bg-[var(--simple-accent-soft)]' : 'hover:bg-[var(--border-muted)]/40'
                  }`}
                >
                  <span className={`text-[10px] ${active ? 'font-semibold text-[var(--simple-accent)]' : 'text-[var(--text-muted)]'}`}>
                    {new Date(`${ymd}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}
                  </span>
                  <span className="h-1 w-1 rounded-full" style={{ background: active ? 'var(--simple-accent)' : 'transparent' }} />
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Mahlzeiten nach Bereichen — plus je Bereich die Kalorien.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {grouped.map((meal) => (
          <Card key={meal.id} className="flex flex-col p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">{meal.label}</p>
              <span className="text-xs tabular-nums text-[var(--text-muted)]">{Math.round(meal.kcal)} kcal</span>
            </div>
            {meal.entries.length === 0 ? (
              <p className="mt-2 flex-1 text-xs text-[var(--text-muted)]">Noch nichts eingetragen.</p>
            ) : (
              <ul className="mt-2 flex-1 divide-y divide-[var(--border-muted)]">
                {meal.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{entry.meal}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {Math.round(Number(entry.protein) || 0)} P · {Math.round(Number(entry.carbs) || 0)} K ·{' '}
                        {Math.round(Number(entry.fat) || 0)} F
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{Math.round(Number(entry.calories) || 0)}</span>
                    <button
                      className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--simple-clay)]"
                      onClick={() => void remove(entry.id)}
                      aria-label="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <GhostButton onClick={() => setSheetFor(meal.id)}>
              <Plus className="h-3.5 w-3.5" /> Hinzufügen
            </GhostButton>
          </Card>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {sheetFor && (
        <PhotoMealSheet
          date={date}
          initialCategory={sheetFor}
          onClose={() => setSheetFor(null)}
          onSaved={() => void load()}
        />
      )}
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
