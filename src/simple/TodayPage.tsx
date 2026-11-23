import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Dumbbell, Flame, Moon, Target } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { FastingCard } from '../components/dashboard/FastingCard';
import EinheitDetailModal, { type EinheitDaten } from '../components/wellness/EinheitDetailModal';
import { api } from '../lib/api';
import {
  Card,
  GhostButton,
  MacroBar,
  MAKRO_FARBEN,
  PageHeader,
  PrimaryButton,
  Ring,
  SectionTitle,
  StatTile,
} from './ui';
import PhotoMealSheet from './PhotoMealSheet';
import SessionSheet from './SessionSheet';
import { BarcodeSheet } from './BarcodeSheet';
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
import { toYmd } from './analytics';
import {
  bilanzDurchschnitt,
  fastenSerie,
  kcalBilanz,
  trainingsSerie,
  verschiebeTage,
  wochentagKurz,
} from './serien';

/**
 * Startseite „Heute" — Tagesfokus statt zweitem Dashboard.
 *
 * Auf einen Blick: Fasten-Phase, Fasten-Serie, Trainings-Serie, das heutige Training,
 * die Mahlzeiten als Tabelle und die Kalorienbilanz der letzten 14 Tage.
 */
export default function TodayPage() {
  /*
   * Aktivitaeten von der Uhr. Trainings, die Tim ohne geplante Einheit aufzeichnet,
   * tauchen sonst nirgends auf — genau die fehlten hier.
   */
  const [einheiten, setEinheiten] = useState<Array<Record<string, unknown>>>([]);
  const [einheitOffen, setEinheitOffen] = useState<EinheitDaten | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    api<{ aktivitaeten?: Array<Record<string, unknown>> }>('/api/integrations/garmin/activities?limit=20')
      .then((r) => {
        if (abgebrochen) return;
        const liste = Array.isArray(r.aktivitaeten) ? r.aktivitaeten : [];
        // Nur heute — auf der Heute-Seite gehören keine alten Einheiten hin.
        const heuteYmd = new Date().toISOString().slice(0, 10);
        setEinheiten(
          liste.filter((e) => String(e.date ?? e.start_date_local ?? '').slice(0, 10) === heuteYmd),
        );
      })
      .catch(() => {});
    return () => {
      abgebrochen = true;
    };
  }, []);

  const { profile } = useAuth();
  const navigate = useNavigate();
  const date = todayYmd();

  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [monatEntries, setMonatEntries] = useState<FoodEntry[]>([]);
  const [planWochen, setPlanWochen] = useState<PlanWeek[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSession, setShowSession] = useState(false);
  /** Barcode-/QR-Scanner aus dem Erfassungs-Sheet. */
  const [showScan, setShowScan] = useState(false);
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
    fasting?: unknown;
    fastingSince?: string;
  };
  const goalKcal = Number(goals.dailyCalories) || 2400;
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = Number(goals.macros?.carbs) || 240;
  const goalFat = Number(goals.macros?.fat) || 80;
  const koerpergewicht = Number(
    (profile as unknown as { measurements?: { weight?: number } } | null)?.measurements?.weight,
  );

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
  const uebrig = Math.max(0, Math.round(goalKcal - sum.kcal));
  const ueber = sum.kcal > goalKcal;

  /** Serien und Bilanz */
  const fasten = useMemo(
    () => (goals.fasting ? fastenSerie(goals.fastingSince, date) : { tage: 0, seit: null }),
    [goals.fasting, goals.fastingSince, date],
  );
  const serie = useMemo(() => trainingsSerie(workouts, planWochen, date), [workouts, planWochen, date]);
  const bilanz = useMemo(
    () => kcalBilanz(monatEntries, workouts, goalKcal, 14, date, koerpergewicht),
    [monatEntries, workouts, goalKcal, date, koerpergewicht],
  );
  const oBilanz = useMemo(() => bilanzDurchschnitt(bilanz), [bilanz]);
  const maxBilanz = Math.max(1, ...bilanz.map((t) => Math.abs(t.bilanz)));
  const hatBilanz = bilanz.some((t) => t.hatDaten);

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

      {/* Fasten läuft dauerhaft mit */}
      <FastingCard />

      {/* Einheiten von der Uhr — auch ohne geplantes Training */}
      {einheiten.length > 0 && (
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Dumbbell className="h-3 w-3" /> Einheiten von der Uhr
          </p>
          <ul className="mt-2 divide-y divide-[var(--border-muted)]">
            {einheiten.map((e, i) => {
              const datum = String(e.date ?? e.start_date_local ?? '').slice(0, 10);
              const distanz = e.distance != null ? Number(e.distance) / 1000 : null;
              const dauer = e.moving_time != null ? Number(e.moving_time) : e.duration != null ? Number(e.duration) : null;
              return (
                <li key={`${String(e.id ?? i)}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/einheit/${encodeURIComponent(String(e.id ?? ''))}`)}
                    className="flex w-full items-baseline justify-between gap-3 py-2 text-left transition hover:text-[var(--simple-accent)]"
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="w-11 shrink-0 text-[10.5px] tabular-nums text-[var(--text-muted)]">
                        {datum ? `${datum.slice(8, 10)}.${datum.slice(5, 7)}.` : '—'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {String(e.name ?? e.type ?? 'Einheit')}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--text-muted)]">
                      {[distanz != null ? `${distanz.toFixed(2)} km` : null, dauer != null ? `${Math.round(dauer / 60)} min` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Serien auf einen Blick */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Fasten-Serie"
          value={fasten.tage}
          unit={fasten.tage === 1 ? 'Tag' : 'Tage'}
          hint={
            goals.fasting
              ? fasten.tage > 0
                ? `am Stück seit ${fmtKurz(fasten.seit)}`
                : 'startet heute'
              : 'kein Fastenplan aktiv'
          }
          tone={fasten.tage > 0 ? 'accent' : 'muted'}
          icon={<Moon className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Trainings-Serie"
          value={serie.aktuell}
          unit={serie.aktuell === 1 ? 'Einheit' : 'Einheiten'}
          hint={serie.geplant > 0 ? `ohne Auslassen · ${serie.absolviert}/${serie.geplant} in 30 Tagen` : 'kein Plan hinterlegt'}
          tone={serie.aktuell > 0 ? 'accent' : 'muted'}
          icon={<Dumbbell className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Beste Serie"
          value={serie.laengste}
          unit="am Stück"
          hint="längste Kette ohne Auslassen"
          tone="default"
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Ø Bilanz"
          value={oBilanz === null ? '—' : `${oBilanz > 0 ? '+' : ''}${oBilanz}`}
          unit={oBilanz === null ? undefined : 'kcal'}
          hint={
            oBilanz === null
              ? 'noch keine Mahlzeiten erfasst'
              : oBilanz < 0
                ? 'im Defizit'
                : oBilanz > 0
                  ? 'im Überschuss'
                  : 'genau im Ziel'
          }
          tone={oBilanz === null ? 'muted' : oBilanz > 0 ? 'warn' : 'accent'}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:items-stretch">
        {/* Gegessen: nur die Tabelle */}
        <Card className="flex h-full flex-col p-5 lg:col-span-3">
          <SectionTitle
            action={
              <GhostButton onClick={() => navigate('/foods')}>
                Tag öffnen <ChevronRight className="h-3 w-3" />
              </GhostButton>
            }
          >
            Gegessen
          </SectionTitle>

          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <Ring value={sum.kcal} max={goalKcal} label="Kalorien" unit="kcal" size={148} />
            <div className="w-full flex-1 space-y-3.5">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} color={MAKRO_FARBEN.protein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} color={MAKRO_FARBEN.carbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} color={MAKRO_FARBEN.fat} />
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
          )}
        </Card>

        {/* Training: eine Box mit der heutigen Einheit */}
        <Card className="flex h-full flex-col p-5 lg:col-span-2">
          <SectionTitle action={<GhostButton onClick={() => navigate('/training')}>Plan</GhostButton>}>
            Heutiges Training
          </SectionTitle>

          {trainingToday ? (
            <div className="flex-1 rounded-xl border border-[color-mix(in_srgb,var(--simple-accent)_40%,transparent)] bg-[var(--simple-accent-soft)]/50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent)] text-[var(--simple-accent-ink)]">
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
            </div>
          ) : planDay && !planDay.isRest ? (
            <button
              type="button"
              className="flex-1 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 text-left transition hover:border-[var(--simple-accent)]/50"
              onClick={() => setShowSession(true)}
            >
              <div className="flex items-start gap-3">
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
                    <ul className="mt-2 space-y-1">
                      {(planDay.exercises ?? []).slice(0, 4).map((e, i) => (
                        <li key={`${e.name}-${i}`} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                          <span className="min-w-0 truncate text-[var(--text-muted)]">{e.name}</span>
                          <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                            {[e.sets && `${e.sets}×`, e.reps && `${e.reps}`].filter(Boolean).join(' ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </div>
            </button>
          ) : (
            <div className="flex-1 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
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
            </div>
          )}

          <button
            type="button"
            className="mt-auto w-full pt-3 text-left text-[11px] font-semibold text-[var(--simple-accent)]"
            onClick={() => setShowSession(true)}
          >
            + Training erfassen
          </button>
        </Card>
      </div>

      {/* Kalorienbilanz */}
      <Card className="p-5">
        <SectionTitle
          action={<span className="text-[11px] text-[var(--text-muted)]">Ziel {goalKcal} kcal · 14 Tage</span>}
        >
          Kalorienbilanz
        </SectionTitle>

        {hatBilanz ? (
          <>
            <div className="relative flex items-stretch gap-1.5" style={{ height: 116 }}>
              {/* Nulllinie */}
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--border-muted)]"
                style={{ top: '50%' }}
              />
              {bilanz.map((tag) => {
                const anteil = Math.min(1, Math.abs(tag.bilanz) / maxBilanz);
                const defizit = tag.bilanz < 0;
                const hoehe = tag.hatDaten ? Math.max(3, anteil * 50) : 0;
                return (
                  <div
                    key={tag.ymd}
                    className="relative flex-1"
                    title={
                      tag.hatDaten
                        ? `${fmtDatum(tag.ymd)}: ${tag.kcal} gegessen · ${tag.verbrannt} Training · Bilanz ${
                            tag.bilanz > 0 ? '+' : ''
                          }${tag.bilanz} kcal`
                        : `${fmtDatum(tag.ymd)}: nichts erfasst`
                    }
                  >
                    {hoehe > 0 && (
                      <div
                        className="absolute inset-x-0 rounded-sm transition-[height] duration-500"
                        style={{
                          height: `${hoehe}%`,
                          [defizit ? 'bottom' : 'top']: '50%',
                          background: defizit
                            ? 'color-mix(in srgb, var(--simple-accent) 75%, transparent)'
                            : 'color-mix(in srgb, #f87171 70%, transparent)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1.5">
              {bilanz.map((tag) => (
                <span
                  key={tag.ymd}
                  className={`flex-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] ${
                    tag.ymd === date ? 'text-[var(--simple-accent)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {wochentagKurz(tag.ymd)}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-muted)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--simple-accent)' }} /> Defizit
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: '#f87171' }} /> Überschuss
                </span>
              </span>
              <span className="tabular-nums">
                Ø{' '}
                <span
                  className="font-semibold"
                  style={{ color: (oBilanz ?? 0) > 0 ? '#f87171' : 'var(--foreground)' }}
                >
                  {oBilanz === null ? '—' : `${oBilanz > 0 ? '+' : ''}${oBilanz}`}
                </span>{' '}
                kcal
              </span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
              Bilanz = Gegessen − Tagesziel − geschätzter Trainingsverbrauch (7 kcal/min bei 80 kg, anteilig
              zum Körpergewicht). Der Durchschnitt zählt nur Tage, an denen mindestens die Hälfte des Ziels
              erfasst wurde — sonst wirkt jeder halb dokumentierte Tag wie ein riesiges Defizit.
            </p>
          </>
        ) : (
          <p className="py-6 text-center text-[11.5px] text-[var(--text-muted)]">
            Sobald du ein paar Tage Essen erfasst hast, siehst du hier Defizit und Überschuss.
          </p>
        )}
      </Card>

      {showPhoto && (
        <PhotoMealSheet
          date={date}
          onClose={() => setShowPhoto(false)}
          onSaved={() => void load()}
          onScan={() => {
            setShowPhoto(false);
            setShowScan(true);
          }}
        />
      )}
      {showScan && (
        <BarcodeSheet
          category="lunch"
          date={date}
          onClose={() => setShowScan(false)}
          onSaved={() => {
            setShowScan(false);
            void load();
          }}
        />
      )}
      {showSession && (
        <SessionSheet
          day={planDay}
          title={planDay?.title || `Training ${formatDay(date)}`}
          date={date}
          onClose={() => setShowSession(false)}
          onSaved={() => void load()}
        />
      )}

      <EinheitDetailModal einheit={einheitOffen} onClose={() => setEinheitOffen(null)} />
    </div>
  );
}

/** 23.11.2026 → 23.11. */
function fmtKurz(ymd: string | null): string {
  if (!ymd) return '—';
  const [, m, d] = ymd.split('-');
  return m && d ? `${d}.${m}.` : ymd;
}

/** 2026-11-23 → 23.11. */
function fmtDatum(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return m && d ? `${d}.${m}.` : ymd;
}
