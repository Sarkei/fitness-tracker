import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  ChevronRight,
  Dumbbell,
  Flame,
  Moon,
  Scale,
  Target,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  BarRow,
  Card,
  EmptyState,
  GhostButton,
  Heatmap,
  MacroBar,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  Ring,
  SectionTitle,
  Sparkline,
  StatTile,
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
  shiftYmd,
  todayYmd,
  totals,
  type FoodEntry,
  type PlanDay,
  type WorkoutEntry,
} from './simpleApi';
import {
  dayLabelShort,
  kcalByDay,
  muskelbalance,
  shiftYmdLocal,
  tageSeitLetztemTraining,
  toYmd,
  durchschnittsdauer,
  kcalDurchschnitt,
  erfassteTage,
  workoutStreak,
  workoutsInLastDays,
  workoutsThisMonth,
} from './analytics';

export default function TodayPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const date = todayYmd();

  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [wocheEntries, setWocheEntries] = useState<FoodEntry[]>([]);
  const [planDay, setPlanDay] = useState<PlanDay | null>(null);
  const [weekPlan, setWeekPlan] = useState<PlanDay[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [laedt, setLaedt] = useState(true);

  const load = useCallback(async () => {
    setLaedt(true);
    // Ein Aufruf fuer 30 Tage statt 30 einzelne
    const [month, list, plan] = await Promise.all([
      fetchMonth().catch(() => []),
      fetchWorkouts().catch(() => []),
      fetchActivePlan().catch(() => null),
    ]);
    setWocheEntries(month);
    setEntries(month.filter((e) => toYmd(e.date) === date));
    setWorkouts(list);
    const schedule = plan?.week?.schedule ?? [];
    setWeekPlan(schedule);
    setPlanDay(schedule.find((d) => d.day === dayKeyOf(date)) ?? null);
    setLaedt(false);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goals = (profile?.goals ?? {}) as {
    dailyCalories?: number;
    macros?: { protein?: number; carbs?: number; fat?: number };
    weight?: number;
    targetWeight?: number;
  };
  const goalKcal = Number(goals.dailyCalories) || 2400;
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = Number(goals.macros?.carbs) || 240;
  const goalFat = Number(goals.macros?.fat) || 80;

  // Auswertungen
  const streak = workoutStreak(workouts);
  const diesenMonat = workoutsThisMonth(workouts);
  const letzte7 = workoutsInLastDays(workouts, 7);
  const seitLetztem = tageSeitLetztemTraining(workouts);
  const oDauer = durchschnittsdauer(workouts);
  const muskel = muskelbalance(workouts, 30).slice(0, 6);
  const maxMuskel = Math.max(1, ...muskel.map((m) => m.saetze));
  const oKcal = kcalDurchschnitt(wocheEntries, 7);
  const erfasst = erfassteTage(wocheEntries, 7);

  const kcalMap = kcalByDay(wocheEntries);
  const verlauf = Array.from({ length: 14 }, (_, i) => {
    const ymd = shiftYmdLocal(date, -(13 - i));
    return { ymd, kcal: kcalMap.get(ymd) ?? 0 };
  });
  const heatmapTage = Array.from({ length: 84 }, (_, i) => {
    const ymd = shiftYmdLocal(date, -(83 - i));
    return { ymd, value: kcalMap.get(ymd) ?? 0 };
  });
  const hatVerlauf = verlauf.some((v) => v.kcal > 0);

  const trainingToday = workouts.find((w) => toYmd(w.date) === date) ?? null;
  const geplantHeute = weekPlan.filter((d) => !d.isRest);
  const uebrig = Math.max(0, Math.round(goalKcal - sum.kcal));
  const ueber = sum.kcal > goalKcal;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        title="Heute"
        /* Persoenliche Anrede absichtlich weg: kostet eine Zeile, die die
           Kennzahlen besser nutzen. */

        hint={
          entries.length
            ? `${entries.length} Mahlzeiten · ${ueber ? `${Math.round(sum.kcal - goalKcal)} kcal über dem Ziel` : `${uebrig} kcal übrig`}`
            : 'Noch nichts erfasst — leg los'
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

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Serie"
          value={streak.aktuell}
          unit={streak.aktuell === 1 ? 'Tag' : 'Tage'}
          hint={streak.laengste > 0 ? `Rekord ${streak.laengste}` : 'Noch kein Training'}
          tone={streak.aktuell > 0 ? 'accent' : 'muted'}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Dieser Monat"
          value={diesenMonat}
          unit="Einheiten"
          hint={`${letzte7.length} in den letzten 7 Tagen`}
          tone={diesenMonat > 0 ? 'default' : 'muted'}
          icon={<Dumbbell className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Ø Dauer"
          value={oDauer || '—'}
          unit={oDauer ? 'min' : undefined}
          hint={seitLetztem === null ? 'Kein Training erfasst' : seitLetztem === 0 ? 'Heute trainiert' : `Zuletzt vor ${seitLetztem} ${seitLetztem === 1 ? 'Tag' : 'Tagen'}`}
          tone="default"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Ø Kalorien"
          value={oKcal || '—'}
          unit={oKcal ? 'kcal' : undefined}
          hint={erfasst ? `${erfasst} von 7 Tagen erfasst` : 'Keine Daten'}
          tone={oKcal > goalKcal ? 'warn' : oKcal > 0 ? 'accent' : 'muted'}
          icon={<Utensils className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* Ernährung heute */}
        <Card className="flex flex-col p-5 lg:col-span-2">
          <SectionTitle
            action={
              <GhostButton onClick={() => navigate('/foods')}>
                Tag öffnen <ChevronRight className="h-3 w-3" />
              </GhostButton>
            }
          >
            Heute gegessen
          </SectionTitle>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={148} />
            <div className="w-full flex-1 space-y-3.5">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
              <div className="flex items-center justify-between border-t border-[var(--border-muted)] pt-3 text-[11px] text-[var(--text-muted)]">
                <span>{entries.length} Mahlzeiten</span>
                <span className="tabular-nums">
                  {ueber ? (
                    <span className="font-semibold text-[#f87171]">+{Math.round(sum.kcal - goalKcal)} über Ziel</span>
                  ) : (
                    <>
                      noch <span className="font-semibold text-[var(--foreground)]">{uebrig}</span> kcal
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {entries.length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--border-muted)] border-t border-[var(--border-muted)] pt-1">
              {entries.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.meal}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {Math.round(Number(entry.protein) || 0)} P
                  </span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {Math.round(Number(entry.carbs) || 0)} KH
                  </span>
                  <span className="w-14 text-right text-sm font-semibold tabular-nums">
                    {Math.round(Number(entry.calories) || 0)}
                  </span>
                </li>
              ))}
              {entries.length > 5 && (
                <li className="pt-2 text-center">
                  <button
                    className="text-[11.5px] font-semibold text-[var(--simple-accent)]"
                    onClick={() => navigate('/foods')}
                  >
                    +{entries.length - 5} weitere ansehen
                  </button>
                </li>
              )}
            </ul>
          )}

          {entries.length === 0 && !laedt && (
            <EmptyState
              icon={<Utensils className="h-6 w-6" />}
              title="Noch nichts eingetragen"
              hint="Mach ein Foto vom Essen — die KI schätzt Portion und Nährwerte."
              action={
                <GhostButton onClick={() => setShowPhoto(true)}>
                  <Camera className="h-3.5 w-3.5" /> Foto aufnehmen
                </GhostButton>
              }
            />
          )}
        </Card>

        {/* Training heute */}
        <Card className="flex flex-col p-5">
          <SectionTitle action={<GhostButton onClick={() => navigate('/training')}>Woche</GhostButton>}>
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
              <span className="rounded-md bg-[var(--simple-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--simple-accent)]">
                ✓
              </span>
            </div>
          ) : planDay && !planDay.isRest ? (
            <button className="flex w-full items-start gap-3 text-left" onClick={() => setShowSession(true)}>
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
                  <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                    {(planDay.exercises ?? [])
                      .slice(0, 3)
                      .map((e) => e.name)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            </button>
          ) : (
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--border-muted)]/60 text-[var(--text-muted)]">
                <Moon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{planDay?.isRest ? 'Ruhetag' : 'Kein Plan für heute'}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {planDay?.isRest ? 'Erholung ist Teil des Plans.' : 'Training kannst du trotzdem erfassen.'}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2 border-t border-[var(--border-muted)] pt-3">
            <ProgressBar
              value={letzte7.length}
              max={Math.max(geplantHeute.length, 7)}
              label="Diese Woche"
              right={`${letzte7.length} / ${Math.max(geplantHeute.length, 7)}`}
            />
            <button
              className="w-full text-left text-[11px] font-semibold text-[var(--simple-accent)]"
              onClick={() => setShowSession(true)}
            >
              + Training erfassen
            </button>
          </div>
        </Card>

        {/* Kalorien-Verlauf */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle action={<span className="text-[11px] text-[var(--text-muted)]">Ziel {Math.round(goalKcal)}</span>}>
            Kalorien · 14 Tage
          </SectionTitle>
          {hatVerlauf ? (
            <>
              <Sparkline values={verlauf.map((v) => v.kcal)} goal={goalKcal} height={64} />
              <div className="mt-1 flex gap-1 text-[9.5px] text-[var(--text-muted)]">
                {verlauf.map((v, i) => (
                  <span
                    key={v.ymd}
                    className={`flex-1 text-center ${v.ymd === date ? 'font-semibold text-[var(--foreground)]' : ''}`}
                  >
                    {i % 2 === 0 ? dayLabelShort(v.ymd) : ''}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border-muted)] pt-2 text-[11px] text-[var(--text-muted)]">
                <span>
                  Ø <span className="font-semibold text-[var(--foreground)]">{oKcal}</span> kcal
                </span>
                <span>
                  Min {Math.round(Math.min(...verlauf.filter((v) => v.kcal > 0).map((v) => v.kcal), goalKcal))} · Max{' '}
                  {Math.round(Math.max(...verlauf.map((v) => v.kcal)))}
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-6 w-6" />}
              title="Noch kein Verlauf"
              hint="Sobald du ein paar Tage erfasst hast, siehst du hier deine Kurve."
            />
          )}
        </Card>

        {/* Muskelbalance */}
        <Card className="p-5">
          <SectionTitle>Muskelbalance · 30 Tage</SectionTitle>
          {muskel.length ? (
            <div className="space-y-2">
              {muskel.map((m) => (
                <BarRow key={m.gruppe} label={m.gruppe} value={m.saetze} max={maxMuskel} caption={`${m.saetze}`} />
              ))}
              <p className="pt-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
                Sätze pro Muskelgruppe. Alles unter 6 Sätzen bleibt ohne Reiz.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<Target className="h-6 w-6" />}
              title="Keine Trainingsdaten"
              hint="Erfasse Trainings, dann siehst du hier deine Verteilung."
            />
          )}
        </Card>

        {/* Aktivität */}
        <Card className="p-5 lg:col-span-3">
          <SectionTitle action={<GhostButton onClick={() => navigate('/training')}>Details</GhostButton>}>
            Aktivität · 12 Wochen
          </SectionTitle>
          <Heatmap days={heatmapTage} weeks={12} />
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border-muted)] pt-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Erfasste Tage</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{erfasst}</p>
              <p className="text-[10.5px] text-[var(--text-muted)]">von 7</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Einheiten</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{letzte7.length}</p>
              <p className="text-[10.5px] text-[var(--text-muted)]">letzte 7 Tage</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Rekord</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{streak.laengste}</p>
              <p className="text-[10.5px] text-[var(--text-muted)]">Tage in Folge</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Geplant</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{geplantHeute.length}</p>
              <p className="text-[10.5px] text-[var(--text-muted)]">Trainingstage/Woche</p>
            </div>
          </div>
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
