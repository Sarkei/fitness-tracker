import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Dumbbell, Flame, Moon, Target, Utensils } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { FastingCard } from '../components/dashboard/FastingCard';
import {
  Card,
  EmptyState,
  GhostButton,
  MacroBar,
  PageHeader,
  PrimaryButton,
  Ring,
  SectionTitle,
} from './ui';
import PhotoMealSheet from './PhotoMealSheet';
import SessionSheet from './SessionSheet';
import {
  DAY_LABELS,
  dayKeyOf,
  fetchActivePlan,
  fetchMonth,
  fetchWorkouts,
  formatDay,
  todayYmd,
  totals,
  type FoodEntry,
  type PlanDay,
  type PlanWeek,
  type WorkoutEntry,
} from './simpleApi';
import { tageSeitLetztemTraining, toYmd, workoutStreak, workoutsInLastDays } from './analytics';

/**
 * Startseite „Heute" — bewusst kein zweites Dashboard.
 *
 * Im Mittelpunkt steht, was heute ansteht: Fasten-Phase, die geplante Einheit, die
 * Mahlzeiten und ein schmaler Wochenbalken. Kennzahlen, Heatmap und Muskelbalance
 * bleiben im Training und in den Statistiken — sie hier zu wiederholen war der Grund,
 * warum sich „Heute" vorher wie eine Kopie der Übersicht angefühlt hat.
 */
export default function TodayPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const date = todayYmd();

  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [monatEntries, setMonatEntries] = useState<FoodEntry[]>([]);
  const [planWochen, setPlanWochen] = useState<PlanWeek[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [laedt, setLaedt] = useState(true);

  const load = useCallback(async () => {
    setLaedt(true);
    const [month, list, plan] = await Promise.all([
      fetchMonth().catch(() => []),
      fetchWorkouts().catch(() => []),
      fetchActivePlan().catch(() => null),
    ]);
    setMonatEntries(month);
    setEntries(month.filter((e) => toYmd(e.date) === date));
    setWorkouts(list);
    setPlanWochen(plan?.weeks ?? []);
    setLaedt(false);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goals = (profile?.goals ?? {}) as {
    dailyCalories?: number;
    macros?: { protein?: number; carbs?: number; fat?: number };
  };
  const goalKcal = Number(goals.dailyCalories) || 2400;
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = Number(goals.macros?.carbs) || 240;
  const goalFat = Number(goals.macros?.fat) || 80;

  /** Die Planwoche, in die heute fällt. */
  const heutePlanWoche = useMemo<PlanWeek | null>(() => {
    if (!planWochen.length) return null;
    return (
      planWochen.find((w) => {
        if (!w.start_date) return false;
        return date >= w.start_date && date <= verschiebeTage(w.start_date, 6);
      }) ?? null
    );
  }, [planWochen, date]);

  const planDay: PlanDay | null = useMemo(() => {
    const schedule = heutePlanWoche?.schedule?.schedule ?? [];
    return schedule.find((d) => d.day === dayKeyOf(date)) ?? null;
  }, [heutePlanWoche, date]);

  const trainingToday = workouts.find((w) => toYmd(w.date) === date) ?? null;
  const streak = workoutStreak(workouts);
  const letzte7 = workoutsInLastDays(workouts, 7);
  const seitLetztem = tageSeitLetztemTraining(workouts);
  const uebrig = Math.max(0, Math.round(goalKcal - sum.kcal));
  const ueber = sum.kcal > goalKcal;

  /** Sieben Tage als schmaler Balken — Tagesfortschritt, keine Statistikwand. */
  const woche = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const ymd = verschiebeTage(date, -(6 - i));
      const kcal = monatEntries
        .filter((e) => toYmd(e.date) === ymd)
        .reduce((s, e) => s + (Number(e.calories) || 0), 0);
      const hatTraining = workouts.some((w) => toYmd(w.date) === ymd);
      return { ymd, kcal, hatTraining, heute: ymd === date, label: tagKuerzel(ymd) };
    });
  }, [date, monatEntries, workouts]);

  /** Eine Zeile, die den Tag zusammenfasst. */
  const naechsterSchritt = useMemo(() => {
    if (trainingToday) return { text: `Training erledigt: ${trainingToday.name}`, tone: 'done' as const };
    if (planDay && !planDay.isRest) {
      return {
        text: `Heute geplant: ${planDay.title || DAY_LABELS[planDay.day] || 'Training'}`,
        tone: 'open' as const,
      };
    }
    if (planDay?.isRest) return { text: 'Ruhetag — Erholung ist eingeplant', tone: 'rest' as const };
    if (entries.length === 0) return { text: 'Noch nichts gegessen eingetragen', tone: 'open' as const };
    return { text: 'Kein Training für heute geplant', tone: 'rest' as const };
  }, [trainingToday, planDay, entries.length]);

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('de-DE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        title="Heute"
        hint={
          entries.length
            ? `${entries.length} Mahlzeiten · ${
                ueber ? `${Math.round(sum.kcal - goalKcal)} kcal über dem Ziel` : `${uebrig} kcal übrig`
              }`
            : 'Noch nichts erfasst'
        }
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

      {/* Fasten läuft dauerhaft mit, deshalb ganz oben */}
      <FastingCard />

      {/* Der Tag in einer Zeile */}
      <Card className="flex items-center gap-3 p-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background:
              naechsterSchritt.tone === 'rest' ? 'var(--border-muted)' : 'var(--simple-accent-soft)',
            color: naechsterSchritt.tone === 'rest' ? 'var(--text-muted)' : 'var(--simple-accent)',
          }}
        >
          {naechsterSchritt.tone === 'rest' ? (
            <Moon className="h-4 w-4" />
          ) : naechsterSchritt.tone === 'done' ? (
            <Flame className="h-4 w-4" />
          ) : (
            <Target className="h-4 w-4" />
          )}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">{naechsterSchritt.text}</p>
        <button
          type="button"
          onClick={() => navigate('/training')}
          className="shrink-0 text-[11px] font-semibold text-[var(--simple-accent)]"
        >
          Woche
        </button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        {/* Ernährung heute */}
        <Card className="flex flex-col p-5 lg:col-span-3">
          <SectionTitle
            action={
              <GhostButton onClick={() => navigate('/foods')}>
                Tag öffnen <ChevronRight className="h-3 w-3" />
              </GhostButton>
            }
          >
            Gegessen
          </SectionTitle>

          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <Ring value={sum.kcal} max={goalKcal} label="kcal" unit="" size={132} />
            <div className="w-full flex-1 space-y-3">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            </div>
          </div>

          {entries.length > 0 ? (
            <ul className="mt-4 divide-y divide-[var(--border-muted)] border-t border-[var(--border-muted)]">
              {entries.slice(0, 4).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.meal}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {Math.round(Number(entry.calories) || 0)}
                  </span>
                </li>
              ))}
              {entries.length > 4 && (
                <li className="pt-2">
                  <button
                    type="button"
                    className="text-[11.5px] font-semibold text-[var(--simple-accent)]"
                    onClick={() => navigate('/foods')}
                  >
                    +{entries.length - 4} weitere
                  </button>
                </li>
              )}
            </ul>
          ) : (
            !laedt && (
              <EmptyState
                icon={<Utensils className="h-6 w-6" />}
                title="Noch nichts eingetragen"
                hint="Foto vom Essen — die KI schätzt Portion und Nährwerte."
                action={
                  <GhostButton onClick={() => setShowPhoto(true)}>
                    <Camera className="h-3.5 w-3.5" /> Foto aufnehmen
                  </GhostButton>
                }
              />
            )
          )}
        </Card>

        {/* Training heute */}
        <Card className="flex flex-col p-5 lg:col-span-2">
          <SectionTitle action={<GhostButton onClick={() => navigate('/training')}>Plan</GhostButton>}>
            Training
          </SectionTitle>

          {trainingToday ? (
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{trainingToday.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  erledigt · {trainingToday.duration} min
                  {Array.isArray(trainingToday.exercises) ? ` · ${trainingToday.exercises.length} Übungen` : ''}
                </p>
              </div>
            </div>
          ) : planDay && !planDay.isRest ? (
            <button
              type="button"
              className="flex w-full items-start gap-3 text-left"
              onClick={() => setShowSession(true)}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {planDay.title || DAY_LABELS[planDay.day] || 'Training'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {(planDay.exercises ?? []).length} Übungen
                  {planDay.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}
                </p>
                {(planDay.exercises ?? []).length > 0 && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                    {(planDay.exercises ?? [])
                      .slice(0, 3)
                      .map((e) => e.name)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            </button>
          ) : (
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--border-muted)]/60 text-[var(--text-muted)]">
                <Moon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {planDay?.isRest ? 'Ruhetag' : laedt ? '…' : 'Kein Plan für heute'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {planDay?.isRest ? 'Erholung ist Teil des Plans.' : 'Training kannst du trotzdem erfassen.'}
                </p>
              </div>
            </div>
          )}

          <div className="mt-auto space-y-2 border-t border-[var(--border-muted)] pt-3">
            <div className="flex items-baseline justify-between text-[11px] text-[var(--text-muted)]">
              <span>7 Tage</span>
              <span className="tabular-nums">
                <span className="font-semibold text-[var(--foreground)]">{letzte7.length}</span> Einheiten
                {streak.aktuell > 0
                  ? ` · ${streak.aktuell} ${streak.aktuell === 1 ? 'Tag' : 'Tage'} Serie`
                  : ''}
              </span>
            </div>
            <button
              type="button"
              className="w-full text-left text-[11px] font-semibold text-[var(--simple-accent)]"
              onClick={() => setShowSession(true)}
            >
              + Training erfassen
            </button>
          </div>
        </Card>
      </div>

      {/* Diese Woche: ein Balken, keine Kacheln */}
      <Card className="p-5">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => navigate('/stats')}
              className="text-[11px] font-semibold text-[var(--simple-accent)]"
            >
              Statistiken
            </button>
          }
        >
          Diese Woche
        </SectionTitle>
        <div className="grid grid-cols-7 gap-2">
          {woche.map((tag) => {
            const relativ = tag.kcal > 0 ? Math.min(1, tag.kcal / goalKcal) : 0;
            return (
              <div key={tag.ymd} className="flex flex-col items-center gap-1.5">
                <div className="flex h-16 w-full items-end overflow-hidden rounded-lg bg-[var(--border-muted)]/40">
                  <div
                    className="w-full rounded-lg transition-[height] duration-500"
                    style={{
                      height: `${relativ * 100}%`,
                      background: tag.heute
                        ? 'var(--simple-accent)'
                        : 'color-mix(in srgb, var(--simple-accent) 45%, transparent)',
                    }}
                  />
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    tag.heute ? 'text-[var(--simple-accent)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {tag.label}
                </span>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: tag.hatTraining ? 'var(--simple-accent)' : 'transparent' }}
                  aria-label={tag.hatTraining ? 'Training erfasst' : undefined}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3 border-t border-[var(--border-muted)] pt-2 text-[11px] text-[var(--text-muted)]">
          Balken: Kalorien gegen dein Tagesziel. Punkt darunter: Training erfasst.
          {seitLetztem !== null && seitLetztem > 1
            ? ` Letztes Training vor ${seitLetztem} Tagen.`
            : seitLetztem === 1
              ? ' Letztes Training gestern.'
              : ''}
        </p>
      </Card>

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

/** Lokale Datumsarithmetik — kein Zeitzonen-Versatz über UTC. */
function verschiebeTage(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Wochentagskürzel für den Balken (Mo, Di …). */
function tagKuerzel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const keys = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
  const key = keys[dt.getDay()] as keyof typeof DAY_LABELS;
  return String(DAY_LABELS[key] ?? '').slice(0, 2);
}
