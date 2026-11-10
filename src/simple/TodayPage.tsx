import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Dumbbell, Moon } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Card, MacroBar, Ring, SectionTitle } from './ui';
import PhotoMealSheet from './PhotoMealSheet';
import SessionSheet from './SessionSheet';
import {
  DAY_LABELS,
  dayKeyOf,
  fetchActivePlan,
  fetchDay,
  fetchWorkouts,
  formatDay,
  todayYmd,
  totals,
  type FoodEntry,
  type PlanDay,
  type WorkoutEntry,
} from './simpleApi';

export default function TodayPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const date = todayYmd();

  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [planDay, setPlanDay] = useState<PlanDay | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutEntry | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSession, setShowSession] = useState(false);

  const load = useCallback(async () => {
    const [food, workouts, plan] = await Promise.all([
      fetchDay(date).catch(() => []),
      fetchWorkouts().catch(() => []),
      fetchActivePlan().catch(() => null),
    ]);
    setEntries(food);
    setTodayWorkout(workouts.find((w) => String(w.date).slice(0, 10) === date) ?? null);
    const key = dayKeyOf(date);
    setPlanDay((plan?.week?.schedule ?? []).find((d) => d.day === key) ?? null);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goalKcal = Number(profile?.goals?.dailyCalories) || 2400;
  const goalProtein = Number(profile?.goals?.macros?.protein) || 180;
  const goalCarbs = Number(profile?.goals?.macros?.carbs) || 240;
  const goalFat = Number(profile?.goals?.macros?.fat) || 80;
  const firstName = (profile?.displayName ?? '').split(' ')[0];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
      <header className="pt-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-3xl font-black tracking-tighter">
          {firstName ? `Hi ${firstName}` : 'Heute'}
        </h1>
      </header>

      <Card>
        <div className="flex items-center gap-5">
          <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={132} />
          <div className="flex-1 space-y-2.5">
            <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
            <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
            <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            <p className="pt-1 text-[11px] text-[var(--text-muted)]">
              noch {Math.max(0, Math.round(goalKcal - sum.kcal))} kcal offen
            </p>
          </div>
        </div>
      </Card>

      <div>
        <SectionTitle action={<button className="text-xs font-semibold text-brand" onClick={() => navigate('/training')}>Woche</button>}>
          Training
        </SectionTitle>
        <Card className="!p-4">
          {todayWorkout ? (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{todayWorkout.name}</p>
                <p className="text-xs text-[var(--text-muted)]">erledigt · {todayWorkout.duration} min</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
          ) : planDay && !planDay.isRest ? (
            <button className="flex w-full items-center gap-3 text-left" onClick={() => setShowSession(true)}>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{planDay.title || DAY_LABELS[planDay.day] || 'Training'}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {(planDay.exercises ?? []).length} Übungen
                  {planDay.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}
                </p>
              </div>
              <span className="rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-white">Start</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-gray)] text-[var(--text-muted)]">
                <Moon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold">{planDay?.isRest ? 'Ruhetag' : 'Kein Plan für heute'}</p>
                <p className="text-xs text-[var(--text-muted)]">Du kannst trotzdem ein Training eintragen.</p>
              </div>
              <button className="rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-xs font-bold" onClick={() => setShowSession(true)}>
                Erfassen
              </button>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle action={<button className="text-xs font-semibold text-brand" onClick={() => navigate('/foods')}>Alle</button>}>
          Gegessen heute
        </SectionTitle>
        <Card className="!p-4">
          {entries.length === 0 ? (
            <p className="py-2 text-sm text-[var(--text-muted)]">Noch nichts eingetragen.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {entries.slice(-4).reverse().map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.meal}</span>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{Math.round(Number(entry.calories) || 0)} kcal</span>
                </li>
              ))}
            </ul>
          )}
          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-white"
            onClick={() => setShowPhoto(true)}
          >
            <Camera className="h-4 w-4" /> Foto vom Essen
          </button>
        </Card>
      </div>

      {showPhoto && <PhotoMealSheet date={date} onClose={() => setShowPhoto(false)} onSaved={() => void load()} />}
      {showSession && (
        <SessionSheet
          day={planDay}
          title={planDay?.title || `Training ${formatDay(date)}`}
          date={date}
          onClose={() => setShowSession(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
