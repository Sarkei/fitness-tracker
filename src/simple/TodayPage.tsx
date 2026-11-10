import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Dumbbell, Moon } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Card, GhostButton, MacroBar, PageHeader, PrimaryButton, Ring, SectionTitle } from './ui';
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
    setPlanDay((plan?.week?.schedule ?? []).find((d) => d.day === dayKeyOf(date)) ?? null);
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
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={firstName ? `Guten Tag, ${firstName}` : 'Heute'}
        hint={`${entries.length} Mahlzeiten erfasst · ${Math.max(0, Math.round(goalKcal - sum.kcal))} kcal übrig`}
        action={
          <PrimaryButton onClick={() => setShowPhoto(true)}>
            <Camera className="h-4 w-4" /> Essen erfassen
          </PrimaryButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card className="p-5">
          <SectionTitle>Heute</SectionTitle>
          <div className="flex items-center gap-6">
            <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={144} />
            <div className="flex-1 space-y-3">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle action={<GhostButton onClick={() => navigate('/training')}>Woche</GhostButton>}>Training</SectionTitle>
            {todayWorkout ? (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
                  <Dumbbell className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{todayWorkout.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">erledigt · {todayWorkout.duration} min</p>
                </div>
              </div>
            ) : planDay && !planDay.isRest ? (
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setShowSession(true)}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
                  <Dumbbell className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{planDay.title || DAY_LABELS[planDay.day] || 'Training'}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {(planDay.exercises ?? []).length} Übungen
                    {planDay.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--border-muted)]/60 text-[var(--text-muted)]">
                  <Moon className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{planDay?.isRest ? 'Ruhetag' : 'Kein Plan für heute'}</p>
                  <p className="text-xs text-[var(--text-muted)]">Training kannst du trotzdem erfassen.</p>
                </div>
                <GhostButton onClick={() => setShowSession(true)}>Erfassen</GhostButton>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle action={<GhostButton onClick={() => navigate('/foods')}>Alle</GhostButton>}>
              Zuletzt gegessen
            </SectionTitle>
            {entries.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Noch nichts eingetragen.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-muted)]">
                {entries.slice(-3).reverse().map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.meal}</span>
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">
                      {Math.round(Number(entry.calories) || 0)} kcal
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
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
