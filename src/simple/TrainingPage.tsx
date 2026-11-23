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
  Plus,
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
import PlanBereich from '../components/coach/CoachPage';
import { useAiCapabilities } from '../lib/AiCapabilitiesContext';
import { TrainingTagesdetail } from '../components/training/TrainingTagesdetail';
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
  type PlanWeek,
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

/** Montag der Kalenderwoche von `ymd` (Montag-basiert, lokale Zeit). */
function mondayOfYmd(ymd: string): Date {
  const d = new Date(`${ymd}T12:00:00`);
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoWeekNumberSafe(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function ymdOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Datum eines Wochentags innerhalb der Woche, die an `weekMonday` beginnt. */
function dateOfDayKey(key: string, weekMonday: string = ymdOf(mondayOfYmd(todayYmd()))): string {
  const monday = new Date(`${weekMonday}T12:00:00`);
  const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + WEEK_ORDER.indexOf(key));
  return ymdOf(date);
}

export default function TrainingPage() {
  const today = todayYmd();
  const [week, setWeek] = useState<CoachWeek>(null);
  /** Alle Wochen des aktiven Plans (mit Startdatum) — Grundlage für die Wochenansicht. */
  const [planWochen, setPlanWochen] = useState<PlanWeek[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [selected, setSelected] = useState<string>(dayKeyOf(today));
  /** 0 = diese Woche, 1 = nächste Woche, -1 = letzte Woche … */
  const [weekOffset, setWeekOffset] = useState(0);
  const [wischStart, setWischStart] = useState<{ x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [tagOffen, setTagOffen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  /** Zähler für den äußeren "Neuer Plan"-Button; CoachPage öffnet bei jeder Erhöhung den Wizard. */
  const [neuerPlanToken, setNeuerPlanToken] = useState(0);
  const aiCaps = useAiCapabilities();

  const load = useCallback(async () => {
    setError(null);
    setLaedt(true);
    try {
      const [plan, list] = await Promise.all([fetchActivePlan().catch(() => null), fetchWorkouts().catch(() => [])]);
      setWeek(plan?.week ?? null);
      setPlanWochen(plan?.weeks ?? []);
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

  const mondayToday = useMemo(() => mondayOfYmd(today), [today]);
  const shownMonday = useMemo(() => {
    const d = new Date(mondayToday);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [mondayToday, weekOffset]);
  const shownMondayYmd = ymdOf(shownMonday);

  /**
   * Woche wechseln und dabei immer den Montag auswählen.
   * Wer eine Woche aufschlägt, will deren Anfang sehen — nicht den Wochentag von vorher.
   */
  const wechsleWoche = useCallback((naechsterOffset: number) => {
    const ziel = Math.max(-8, Math.min(8, naechsterOffset));
    setWeekOffset(ziel);
    setSelected(WEEK_ORDER[0]);
  }, []);

  /**
   * Planwoche zur angezeigten Kalenderwoche.
   * Eine Woche ohne Eintrag im Plan gibt es nicht — dann bleibt `schedule` leer und die
   * Tage erscheinen als Ruhetage. Vorher wurde für jede Woche derselbe Plan gezeigt.
   */
  const angezeigtePlanWoche = useMemo<PlanWeek | null>(() => {
    if (!planWochen.length) return null;
    const treffer = planWochen.find((w) => w.start_date === shownMondayYmd);
    if (treffer) return treffer;
    // Kein exaktes Startdatum: die Woche nehmen, in die der Montag fällt.
    return (
      planWochen.find((w) => {
        if (!w.start_date) return false;
        const ende = shiftYmdLocal(w.start_date, 6);
        return shownMondayYmd >= w.start_date && shownMondayYmd <= ende;
      }) ?? null
    );
  }, [planWochen, shownMondayYmd]);

  const days = useMemo<PlanDay[]>(() => {
    const schedule = angezeigtePlanWoche?.schedule?.schedule ?? [];
    return WEEK_ORDER.map((key) => schedule.find((d) => d.day === key) ?? { day: key, isRest: true, title: 'Ruhetag' });
  }, [angezeigtePlanWoche]);

  const planDay = days.find((d) => d.day === selected) ?? null;
  const selectedYmd = dateOfDayKey(selected, shownMondayYmd);
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
        hint={angezeigtePlanWoche?.schedule?.weekFocus || 'Wähle einen Tag und starte die Einheit.'}
        action={
          <div className="flex gap-2">
            <GhostButton onClick={() => setRunning(true)}>
              <Play className="h-3.5 w-3.5" /> Sofort starten
            </GhostButton>
            <GhostButton
              onClick={() => aiCaps.enabled && setNeuerPlanToken((n) => n + 1)}
              disabled={aiCaps.loading || !aiCaps.enabled}
            >
              <Plus className="h-3.5 w-3.5" /> Neuer Plan
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
        <div
          className="mb-2 flex items-center justify-between gap-2 select-none"
          onTouchStart={(e) => {
            const t = e.touches[0];
            setWischStart({ x: t.clientX, y: t.clientY });
          }}
          onTouchEnd={(e) => {
            if (!wischStart) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - wischStart.x;
            const dy = t.clientY - wischStart.y;
            setWischStart(null);
            // Nur deutliche, waagrechte Wische werten — sonst blättert Scrollen die Woche um
            if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
            wechsleWoche(weekOffset + (dx < 0 ? 1 : -1));
          }}
          role="group"
          aria-label="Woche wählen — wischen oder Pfeile"
        >
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-muted)] text-[var(--text-muted)] disabled:opacity-30"
            onClick={() => wechsleWoche(weekOffset - 1)}
            disabled={weekOffset <= -8}
            aria-label="Woche zurück"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {weekOffset === 0 ? 'Diese Woche' : weekOffset === 1 ? 'Nächste Woche' : weekOffset === -1 ? 'Letzte Woche' : weekOffset > 0 ? `In ${weekOffset} Wochen` : `Vor ${Math.abs(weekOffset)} Wochen`}
            </p>
            <p className="truncate text-xs font-bold tabular-nums text-[var(--foreground)]">
              {shownMonday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} –{' '}
              {new Date(shownMonday.getFullYear(), shownMonday.getMonth(), shownMonday.getDate() + 6).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              {weekOffset !== 0 && <span className="text-[var(--text-muted)]"> · KW {isoWeekNumberSafe(shownMonday)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {weekOffset !== 0 && (
              <button
                type="button"
                className="h-8 rounded-lg px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--simple-accent)]"
                onClick={() => {
                  setWeekOffset(0);
                  setSelected(dayKeyOf(today));
                }}
              >
                Heute
              </button>
            )}
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-muted)] text-[var(--text-muted)] disabled:opacity-30"
              onClick={() => wechsleWoche(weekOffset + 1)}
              disabled={weekOffset >= 8}
              aria-label="Nächste Woche"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5">
          {days.map((day) => {
            const active = day.day === selected;
            const isToday = day.day === dayKeyOf(today);
            const ymd = dateOfDayKey(day.day, shownMondayYmd);
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

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* Tageskarte */}
        <Card className="flex flex-col p-5 lg:col-span-2">
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
            {week && !angezeigtePlanWoche && (
              <p className="mt-2 rounded-lg bg-[var(--border-muted)]/30 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                Für diese Woche ist nichts geplant — der Plan deckt sie nicht ab.
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
      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <Card className="flex flex-col p-5">
          <SectionTitle>Aktivität · 12 Wochen</SectionTitle>
          <Heatmap days={heatmapTage} weeks={12} />
        </Card>

        <Card className="flex flex-col p-5 lg:col-span-2">
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
                    <button
                      type="button"
                      onClick={() => setTagOffen(String(workout.date).slice(0, 10))}
                      className="min-w-0 flex-1 text-left transition hover:opacity-80"
                    >
                      <p className="truncate text-sm font-medium">{workout.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {formatDay(toYmd(workout.date))} · {workout.duration} min
                        {uebungen ? ` · ${uebungen} Übungen` : ''}
                      </p>
                    </button>
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



      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {/* Trainingspläne: direkt unter dem Verlauf, ohne eigene Überschrift/Button —
          "Neuer Plan" sitzt oben in der Kopfzeile. */}
      <section className="mt-2 border-t border-[var(--border-muted)] pt-6">
        <PlanBereich hideHeader openOnboardingToken={neuerPlanToken} />
      </section>

      {tagOffen && (() => {
        const tagesWorkouts = workouts.filter((w) => String(w.date).slice(0, 10) === tagOffen);
        return (
          <TrainingTagesdetail
            tag={{ datum: tagOffen, workouts: tagesWorkouts, mahlzeiten: [] }}
            fokus="training"
            onClose={() => setTagOffen(null)}
          />
        );
      })()}

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
