import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  ChevronRight,
  Dumbbell,
  Flame,
  Moon,
  Play,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  BarRow,
  Card,
  EmptyState,
  GhostButton,
  Heatmap,
  PageHeader,
  ProgressBar,
  SectionTitle,
  StatTile,
} from './ui';
import WorkoutSheet from './WorkoutSheet';
import {
  DAY_LABELS,
  dayKeyOf,
  deleteWorkout,
  fetchActivePlan,
  fetchWorkouts,
  formatDay,
  todayYmd,
  type CoachWeek,
  type PlanDay,
  type WorkoutEntry,
} from './simpleApi';
import {
  dayLabelShort,
  durchschnittsdauer,
  gesamtzahlen,
  muskelbalance,
  shiftYmdLocal,
  tageSeitLetztemTraining,
  toYmd,
  volumen,
  workoutStreak,
  workoutsInLastDays,
  workoutsThisMonth,
} from './analytics';

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dateOfDayKey(key: string): string {
  const today = new Date();
  const todayIndex = WEEK_ORDER.indexOf(dayKeyOf(todayYmd()));
  const offset = WEEK_ORDER.indexOf(key) - todayIndex;
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function TrainingPage() {
  const today = todayYmd();
  const [week, setWeek] = useState<CoachWeek>(null);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [selected, setSelected] = useState<string>(dayKeyOf(today));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLaedt(true);
    try {
      const [plan, list] = await Promise.all([fetchActivePlan().catch(() => null), fetchWorkouts().catch(() => [])]);
      setWeek(plan?.week ?? null);
      setWorkouts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht laden.');
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo<PlanDay[]>(() => {
    const schedule = week?.schedule ?? [];
    return WEEK_ORDER.map((key) => schedule.find((d) => d.day === key) ?? { day: key, isRest: true, title: 'Ruhetag' });
  }, [week]);

  const planDay = days.find((d) => d.day === selected) ?? null;
  const selectedYmd = dateOfDayKey(selected);
  const trainingAmTag = workouts.find((w) => toYmd(w.date) === selectedYmd) ?? null;

  // Auswertungen
  const streak = workoutStreak(workouts);
  const diesenMonat = workoutsThisMonth(workouts);
  const letzte7 = workoutsInLastDays(workouts, 7);
  const oDauer = durchschnittsdauer(workouts);
  const seitLetztem = tageSeitLetztemTraining(workouts);
  const zahlen = gesamtzahlen(workouts);
  const vol30 = volumen(workouts, 30);
  const muskel = muskelbalance(workouts, 30).slice(0, 7);
  const maxMuskel = Math.max(1, ...muskel.map((m) => m.saetze));
  const geplanteTage = days.filter((d) => !d.isRest).length;

  // Heatmap: 12 Wochen Trainings
  const heatmapTage = useMemo(() => {
    const gesetzt = new Set(workouts.map((w) => toYmd(w.date)));
    return Array.from({ length: 84 }, (_, i) => {
      const ymd = shiftYmdLocal(today, -(83 - i));
      return { ymd, value: gesetzt.has(ymd) ? 1 : 0 };
    });
  }, [workouts, today]);

  // Volumen-Verlauf 8 Wochen (Sätze pro Woche)
  const wochenVolumen = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const start = shiftYmdLocal(today, -(7 - i) * 7 - 6);
      const ende = shiftYmdLocal(today, -(7 - i) * 7);
      const inWoche = workouts.filter((w) => {
        const ymd = toYmd(w.date);
        return ymd >= start && ymd <= ende;
      });
      const saetze = inWoche.reduce((s, w) => {
        const ex = Array.isArray(w.exercises) ? w.exercises : [];
        return (
          s +
          ex.reduce((ss, e) => {
            const v = (e as { sets?: unknown })?.sets;
            return ss + (Array.isArray(v) ? v.length : Number(v) || 0);
          }, 0)
        );
      }, 0);
      return { label: `KW ${i + 1}`, saetze, einheiten: inWoche.length };
    });
  }, [workouts, today]);
  const maxWochenVolumen = Math.max(1, ...wochenVolumen.map((w) => w.saetze));

  const remove = async (id: string) => {
    if (!window.confirm('Training löschen?')) return;
    try {
      await deleteWorkout(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Dein Plan"
        title="Training"
        hint={week?.weekFocus || 'Wähle einen Tag und starte die Einheit.'}
        action={
          <div className="flex gap-2">
            <GhostButton onClick={() => setRunning(true)}>
              <Play className="h-3.5 w-3.5" /> Sofort starten
            </GhostButton>
          </div>
        }
      />

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Serie"
          value={streak.aktuell}
          unit={streak.aktuell === 1 ? 'Tag' : 'Tage'}
          hint={streak.laengste > 0 ? `Rekord ${streak.laengste} Tage` : 'Noch kein Training'}
          tone={streak.aktuell > 0 ? 'accent' : 'muted'}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Dieser Monat"
          value={diesenMonat}
          unit="Einheiten"
          hint={`${letzte7.length} in 7 Tagen`}
          tone={diesenMonat > 0 ? 'default' : 'muted'}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Sätze gesamt"
          value={zahlen.saetze}
          hint={`${zahlen.uebungen} Übungen absolviert`}
          tone="default"
          icon={<Dumbbell className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Volumen 30 d"
          value={vol30 >= 1000 ? `${(vol30 / 1000).toFixed(1)}k` : vol30}
          unit="kg"
          hint={oDauer ? `Ø ${oDauer} min pro Einheit` : 'Keine Dauer erfasst'}
          tone={vol30 > 0 ? 'accent' : 'muted'}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Wochenleiste */}
      <Card className="p-3">
        <div className="flex gap-1.5">
          {days.map((day) => {
            const active = day.day === selected;
            const isToday = day.day === dayKeyOf(today);
            const ymd = dateOfDayKey(day.day);
            const erledigt = workouts.some((w) => toYmd(w.date) === ymd);
            const nummer = Number(ymd.slice(8, 10));
            return (
              <button
                key={day.day}
                onClick={() => setSelected(day.day)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
                  active
                    ? 'border-[var(--simple-accent)] bg-[var(--simple-accent-soft)]'
                    : 'border-transparent hover:border-[var(--border-muted)]'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {DAY_LABELS[day.day].slice(0, 2)}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                    isToday
                      ? 'text-[var(--simple-accent-ink)]'
                      : active
                        ? 'text-[var(--simple-accent)]'
                        : 'text-[var(--foreground)]'
                  }`}
                  style={isToday ? { background: 'var(--simple-accent)' } : undefined}
                >
                  {nummer}
                </span>
                {erledigt ? (
                  <span className="text-[9px] font-bold leading-none text-[var(--simple-accent)]">✓</span>
                ) : (
                  <span
                    className={`h-1 w-1 rounded-full ${
                      day.isRest
                        ? 'bg-transparent'
                        : active || isToday
                          ? 'bg-[var(--simple-accent)]'
                          : 'bg-[var(--text-muted)]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Tageskarte */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
              {planDay?.isRest ? <Moon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {DAY_LABELS[selected]} · {Number(selectedYmd.slice(8, 10))}. {Number(selectedYmd.slice(5, 7))}.
              </p>
              <p className="text-lg font-semibold leading-tight">
                {trainingAmTag?.name || planDay?.title || (planDay?.isRest ? 'Ruhetag' : 'Training')}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {trainingAmTag
                  ? `erledigt · ${trainingAmTag.duration} min`
                  : planDay?.isRest
                    ? 'Erholung — kein Training geplant.'
                    : `${(planDay?.exercises ?? []).length} Übungen${planDay?.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}`}
              </p>
            </div>
            <button
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--simple-accent)', color: 'var(--simple-accent-ink)' }}
              onClick={() => setRunning(true)}
            >
              <Play className="h-4 w-4" /> {trainingAmTag ? 'Nochmal' : 'Start'}
            </button>
          </div>

          {planDay?.description && (
            <p className="mt-3 rounded-lg bg-[var(--border-muted)]/30 px-3 py-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
              {planDay.description}
            </p>
          )}

          {(planDay?.exercises ?? []).length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--border-muted)] border-t border-[var(--border-muted)]">
              {(planDay?.exercises ?? []).map((exercise, index) => (
                <li key={`${exercise.name}-${index}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="w-4 shrink-0 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{exercise.name}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                    {[exercise.sets && `${exercise.sets}×`, exercise.reps && `${exercise.reps}`, exercise.weight]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {planDay?.cardio && (
            <div className="mt-3 rounded-lg border border-[var(--border-muted)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Cardio</p>
              <p className="mt-0.5 text-sm">
                {planDay.cardio.type || 'Cardio'}
                {planDay.cardio.duration ? ` · ${planDay.cardio.duration} min` : ''}
              </p>
              {planDay.cardio.details && (
                <p className="text-[11px] text-[var(--text-muted)]">{planDay.cardio.details}</p>
              )}
            </div>
          )}

          {planDay?.isRest && (
            <EmptyState
              icon={<Moon className="h-6 w-6" />}
              title="Ruhetag"
              hint="Muskeln wachsen in der Pause. Wenn du trotzdem trainieren willst, erfass es einfach."
              action={
                <GhostButton onClick={() => setRunning(true)}>
                  <Play className="h-3.5 w-3.5" /> Trotzdem trainieren
                </GhostButton>
              }
            />
          )}
        </Card>

        {/* Rechte Spalte */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Diese Woche</SectionTitle>
            <div className="space-y-2.5">
              <ProgressBar
                value={letzte7.length}
                max={Math.max(geplanteTage, 1)}
                label="Einheiten"
                right={`${letzte7.length} / ${geplanteTage}`}
              />
              <ProgressBar
                value={letzte7.reduce((s, w) => s + (Number(w.duration) || 0), 0)}
                max={Math.max(geplanteTage * 60, 60)}
                label="Minuten"
                right={`${letzte7.reduce((s, w) => s + (Number(w.duration) || 0), 0)}`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border-muted)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" /> {seitLetztem === null ? '—' : seitLetztem === 0 ? 'heute' : `vor ${seitLetztem} T`}
              </span>
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3" /> {streak.laengste} Tage Rekord
              </span>
            </div>
            {!week && (
              <p className="mt-2 rounded-lg bg-[#fbbf24]/10 px-2.5 py-2 text-[11px] leading-relaxed text-[#a16207]">
                Noch kein aktiver Plan — unter <b>Mehr → Coach &amp; Pläne</b> erzeugen lassen.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Muskelbalance · 30 Tage</SectionTitle>
            {muskel.length ? (
              <div className="space-y-2">
                {muskel.map((m) => (
                  <BarRow key={m.gruppe} label={m.gruppe} value={m.saetze} max={maxMuskel} caption={`${m.saetze}`} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[11.5px] text-[var(--text-muted)]">
                Sobald du Trainings erfasst, siehst du hier die Verteilung.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Volumen-Verlauf */}
      <Card className="p-5">
        <SectionTitle action={<span className="text-[11px] text-[var(--text-muted)]">Sätze pro Woche</span>}>
          Trainingsvolumen · 8 Wochen
        </SectionTitle>
        <div className="flex items-end gap-2" style={{ height: 96 }}>
          {wochenVolumen.map((w, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9.5px] font-semibold tabular-nums text-[var(--text-muted)]">
                {w.saetze > 0 ? w.saetze : ''}
              </span>
              <div
                className="w-full rounded-t-md transition-[height] duration-500"
                style={{
                  height: `${Math.max(3, (w.saetze / maxWochenVolumen) * 100)}%`,
                  background:
                    i === wochenVolumen.length - 1
                      ? 'var(--simple-accent)'
                      : 'color-mix(in srgb, var(--simple-accent) 32%, transparent)',
                }}
                title={`${w.saetze} Sätze · ${w.einheiten} Einheiten`}
              />
              <span className="text-[9px] text-[var(--text-muted)]">{w.label.replace('KW ', '')}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Aktivität + Verlauf */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle>Aktivität · 12 Wochen</SectionTitle>
          <Heatmap days={heatmapTage} weeks={12} />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle action={<span className="text-[11px] text-[var(--text-muted)]">{workouts.length} gesamt</span>}>
            Verlauf
          </SectionTitle>
          {workouts.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-6 w-6" />}
              title="Noch kein Training erfasst"
              hint="Starte oben deine erste Einheit — sie erscheint dann hier."
            />
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {workouts.slice(0, 10).map((workout) => {
                const uebungen = Array.isArray(workout.exercises) ? workout.exercises.length : 0;
                return (
                  <li key={workout.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{workout.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {formatDay(toYmd(workout.date))} · {workout.duration} min
                        {uebungen ? ` · ${uebungen} Übungen` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {dayLabelShort(toYmd(workout.date))}
                    </span>
                    <button
                      className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--simple-clay)]"
                      onClick={() => void remove(workout.id)}
                      aria-label="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
              {workouts.length > 10 && (
                <li className="pt-2 text-center">
                  <Link to="/stats" className="text-[11.5px] font-semibold text-[var(--simple-accent)]">
                    Alle {workouts.length} Einheiten in der Statistik
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { to: '/coach', title: 'Trainingsplan erzeugen', hint: 'KI baut eine Woche nach deinen Zielen' },
          { to: '/workouts', title: 'Vorlagen & Verlauf', hint: 'Eigene Einheiten und Historie' },
          { to: '/stats', title: 'Statistik', hint: 'Volumen, Fortschritt, Bestleistungen' },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--simple-accent)]"
          >
            <p className="flex items-center justify-between text-sm font-semibold">
              {item.title}
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition group-hover:text-[var(--simple-accent)]" />
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.hint}</p>
          </Link>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {running && (
        <WorkoutSheet
          day={planDay}
          name={trainingAmTag?.name || planDay?.title || `Training ${formatDay(today)}`}
          date={today}
          onClose={() => setRunning(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
