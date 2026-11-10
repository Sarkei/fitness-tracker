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
  shiftYmd,
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
  const [history, setHistory] = useState<{ ymd: string; kcal: number }[]>([]);
  const [planDay, setPlanDay] = useState<PlanDay | null>(null);
  const [weekPlan, setWeekPlan] = useState<PlanDay[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSession, setShowSession] = useState(false);

  const load = useCallback(async () => {
    const [food, list, plan] = await Promise.all([
      fetchDay(date).catch(() => []),
      fetchWorkouts().catch(() => []),
      fetchActivePlan().catch(() => null),
    ]);
    setEntries(food);
    setWorkouts(list);
    const schedule = plan?.week?.schedule ?? [];
    setWeekPlan(schedule);
    setPlanDay(schedule.find((d) => d.day === dayKeyOf(date)) ?? null);

    const past = await Promise.all(
      Array.from({ length: 7 }, (_, i) => shiftYmd(date, -6 + i)).map(async (ymd) => {
        if (ymd === date) return { ymd, kcal: totals(food).kcal };
        const day = await fetchDay(ymd).catch(() => []);
        return { ymd, kcal: totals(day).kcal };
      }),
    );
    setHistory(past);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goals = (profile?.goals ?? {}) as { dailyCalories?: number; macros?: { protein?: number; carbs?: number; fat?: number } };
  const goalKcal = Number(goals.dailyCalories) || 2400;
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = Number(goals.macros?.carbs) || 240;
  const goalFat = Number(goals.macros?.fat) || 80;
  const firstName = (profile?.displayName ?? '').split(' ')[0];
  const plannedToday = weekPlan.filter((d) => !d.isRest).length;
  const maxHistory = Math.max(goalKcal, ...history.map((h) => h.kcal), 1);
  const trainingToday = workouts.find((w) => String(w.date).slice(0, 10) === date) ?? null;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={firstName ? `Guten Tag, ${firstName}` : 'Heute'}
        hint={`${entries.length} Mahlzeiten erfasst · ${Math.max(0, Math.round(goalKcal - sum.kcal))} kcal übrig`}
        action={
          <div className="flex gap-2">
            <GhostButton onClick={() => setShowSession(true)}>
              <Dumbbell className="h-3.5 w-3.5" /> Training
            </GhostButton>
            <PrimaryButton onClick={() => setShowPhoto(true)}>
              <Camera className="h-4 w-4" /> Essen erfassen
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle>Heute</SectionTitle>
          <div className="flex items-center gap-8">
            <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={148} />
            <div className="flex-1 space-y-3.5">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            </div>
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <SectionTitle action={<GhostButton onClick={() => navigate('/training')}>Woche</GhostButton>}>Training</SectionTitle>
          {trainingToday ? (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{trainingToday.name}</p>
                <p className="text-xs text-[var(--text-muted)]">erledigt · {trainingToday.duration} min</p>
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
            </div>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-[var(--border-muted)] pt-3 text-xs text-[var(--text-muted)]">
            <span>{plannedToday} Trainingstage geplant</span>
            <button className="font-semibold text-[var(--simple-accent)]" onClick={() => setShowSession(true)}>
              Erfassen
            </button>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle action={<GhostButton onClick={() => navigate('/foods')}>Tag öffnen</GhostButton>}>
            Gegessen heute
          </SectionTitle>
          {entries.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-sm text-[var(--text-muted)]">
                Noch nichts eingetragen — Foto machen, die KI schätzt Portion und Nährwerte.
              </p>
              <GhostButton onClick={() => setShowPhoto(true)}>
                <Camera className="h-3.5 w-3.5" /> Foto aufnehmen
              </GhostButton>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.meal}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {Math.round(Number(entry.protein) || 0)} g P
                  </span>
                  <span className="w-16 text-right text-sm font-semibold tabular-nums">
                    {Math.round(Number(entry.calories) || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Letzte 7 Tage</SectionTitle>
          <div className="relative flex h-28 items-end gap-1.5">
            {history.map((day) => {
              const ratio = Math.min(1, day.kcal / maxHistory);
              const isToday = day.ymd === date;
              return (
                <div key={day.ymd} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex w-full flex-1 items-end overflow-hidden rounded-md bg-[var(--border-muted)]/45">
                    <div
                      className="w-full rounded-t-md transition-[height] duration-500"
                      style={{
                        height: `${Math.max(6, ratio * 100)}%`,
                        background: isToday ? 'var(--simple-accent)' : 'var(--border-muted)',
                      }}
                      title={`${Math.round(day.kcal)} kcal`}
                    />
                  </div>
                  <span className={`text-[10px] ${isToday ? 'font-semibold text-[var(--foreground)]' : 'text-[var(--text-muted)]'}`}>
                    {new Date(`${day.ymd}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Ø {Math.round(history.reduce((acc, d) => acc + d.kcal, 0) / Math.max(1, history.length))} kcal pro Tag
            <span className="mx-1.5 opacity-40">·</span>
            Ziel {Math.round(goalKcal)}
          </p>
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
