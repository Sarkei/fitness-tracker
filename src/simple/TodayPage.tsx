import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Dumbbell, Moon } from 'lucide-react';
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
import BilanzChart from './BilanzChart';
import {
  fastenSerie,
  kcalBilanz,
  trainingsSerie,
  verschiebeTage,
  zielTypAusProfil,
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
  /**
   * Garmin-Verbrauch von heute: `gesamt` = Grundumsatz + Aktivitaet, waechst ueber
   * den Tag. Damit steigt das Kalorienbudget auf der Startseite mit.
   */
  const [garminHeute, setGarminHeute] = useState<{
    gesamt: number | null;
    aktiv: number | null;
    passiv: number | null;
    schnitt: number | null;
  } | null>(null);
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

  /**
   * Verbrauch der Uhr holen und alle 15 Minuten auffrischen, damit das Budget
   * ueber den Tag mitwaechst - ohne dass die Seite neu geladen werden muss.
   */
  /**
   * Garmin-Tageswerte holen.
   *
   * Als eigene Funktion, weil sie an zwei Stellen gebraucht wird: im Takt unten
   * und nach einem manuellen Abgleich (Aktualisieren-Knopf).
   */
  const holeGarmin = useCallback(async () => {
    try {
      const r = await api<{
        verbunden?: boolean;
        gesamt?: number | null;
        aktiv?: number | null;
        passiv?: number | null;
        schnitt?: { gesamt?: number | null };
        verlauf?: Array<{ date: string; total: number }>;
      }>('/api/integrations/garmin/heute');
      if (!r.verbunden) return;
      if (Array.isArray(r.verlauf)) {
        setGarminTage(r.verlauf.map((v) => ({ date: String(v.date), total: Number(v.total) || 0 })));
      }
      setGarminHeute({
        gesamt: r.gesamt ?? null,
        aktiv: r.aktiv ?? null,
        passiv: r.passiv ?? null,
        schnitt: r.schnitt?.gesamt ?? null,
      });
    } catch {
      /* Aussetzer: die Seite behaelt den letzten Stand. */
    }
  }, []);

  useEffect(() => {
    void holeGarmin();
    /* Alle 5 Minuten nachziehen — im Takt des Hintergrund-Abgleichs. */
    const timer = window.setInterval(() => void holeGarmin(), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [holeGarmin]);

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
    type?: string;
  };
  const goalKcal = Number(goals.dailyCalories) || 2400;
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = Number(goals.macros?.carbs) || 240;
  const goalFat = Number(goals.macros?.fat) || 80;
  /** Zielrichtung aus dem Profil — bestimmt die Farbzonen der Bilanzgrafik. */
  const zielTyp = zielTypAusProfil(goals.type);

  /**
   * Heute von der Uhr verbrauchte Kalorien. Sie erhöhen das Tagesbudget, damit die
   * Bilanz auf Aktivitäten reagiert. Nur heute — die Historie bleibt unangetastet.
   */
  const aktivKcalHeute = useMemo(
    () =>
      einheiten.reduce((sum, e) => {
        const kcal = Number(e.calories ?? e.kcal ?? 0);
        return sum + (Number.isFinite(kcal) && kcal > 0 ? kcal : 0);
      }, 0),
    [einheiten],
  );
  /*
   * Budget des Tages.
   *
   * Mit Garmin: Der Gesamtverbrauch der Uhr (Grundumsatz + Aktivitaet) ist das
   * Budget und waechst ueber den Tag mit. Das Profilziel ist dann nur noch die
   * Markierung, an der man sich orientiert.
   *
   * Ohne Garmin: wie bisher Profilziel plus Aktivkalorien aus den Einheiten.
   */
  const garminGesamt = garminHeute?.gesamt != null && garminHeute.gesamt > 0 ? Math.round(garminHeute.gesamt) : null;

  /**
   * Verbrauch je Tag aus der Garmin-Historie — damit auch die Balken der
   * Kalorienbilanz den echten Verbrauch zeigen und dynamisch ausschlagen.
   */
  const [garminTage, setGarminTage] = useState<Array<{ date: string; total: number }>>([]);
  const garminBilanzMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of garminTage) {
      if (t.total > 0) m.set(t.date.slice(0, 10), t.total);
    }
    return m;
  }, [garminTage]);
  const budgetHeute = garminGesamt ?? Math.round(goalKcal + aktivKcalHeute);
  /** Profilziel als reine Markierung. */
  const zielMarke = Math.round(goalKcal);
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

  /*
   * Der Wochenplan (Seite /plan) gehört auf die Startseite: Man plant am
   * Sonntag und will morgens sehen, was ansteht. Vorher zeigte die Karte nur
   * den Coach-Plan — selbst gebaute Pläne blieben unsichtbar.
   */
  /** Garmin-Tageswerte für die „Tagesform"-Karte. */
  const [tagesform, setTagesform] = useState<null | {
    schlafStunden: number | null;
    schlafScore: number | null;
    hrv: number | null;
    ruhepuls: number | null;
    bodyBattery: number | null;
    hrvSchnitt: number | null;
  }>(null);

  useEffect(() => {
    let ab = false;
    api<{
      reihe?: Array<{
        date: string;
        schlafStunden?: number | null;
        schlafScore?: number | null;
        hrv?: number | null;
        ruhepuls?: number | null;
        bodyBatteryMax?: number | null;
      }>;
    }>('/api/integrations/garmin/stats')
      .then((r) => {
        if (ab) return;
        const reihe = (r.reihe ?? []).filter((x) => x.date && x.date.slice(0, 10) <= date);
        const heute = reihe[reihe.length - 1];
        if (!heute) return;
        const hrvWerte = reihe
          .slice(-8, -1)
          .map((x) => x.hrv)
          .filter((x): x is number => typeof x === 'number' && x > 0);
        setTagesform({
          schlafStunden: heute.schlafStunden ?? null,
          schlafScore: heute.schlafScore ?? null,
          hrv: heute.hrv ?? null,
          ruhepuls: heute.ruhepuls ?? null,
          bodyBattery: heute.bodyBatteryMax ?? null,
          hrvSchnitt: hrvWerte.length ? Math.round(hrvWerte.reduce((a, b) => a + b, 0) / hrvWerte.length) : null,
        });
      })
      .catch(() => { if (!ab) setTagesform(null); });
    return () => { ab = true; };
  }, [date]);

  const [planWocheHeute, setPlanWocheHeute] = useState<
    Array<{ id: string; name: string; dauer_min: number | null; inhalt?: { uebungen?: unknown[] } }>
  >([]);

  useEffect(() => {
    let ab = false;
    api<{ eintraege?: Array<{ id: string; name: string; dauer_min: number | null; inhalt?: { uebungen?: unknown[] } }> }>(
      `/api/trainings/plan?von=${date}&bis=${date}`,
    )
      .then((r) => { if (!ab) setPlanWocheHeute(Array.isArray(r.eintraege) ? r.eintraege : []); })
      .catch(() => { if (!ab) setPlanWocheHeute([]); });
    return () => { ab = true; };
  }, [date]);
  // Offenes Budget: Tagesziel plus Aktivkalorien minus Gegessenes.
  const offen = Math.round(budgetHeute - sum.kcal);
  const ueber = offen < 0;

  /** Serien und Bilanz */
  const fasten = useMemo(
    () => (goals.fasting ? fastenSerie(goals.fastingSince, date) : { tage: 0, seit: null }),
    [goals.fasting, goals.fastingSince, date],
  );
  const serie = useMemo(() => trainingsSerie(workouts, planWochen, date), [workouts, planWochen, date]);
  const bilanz = useMemo(
    () => kcalBilanz(monatEntries, workouts, goalKcal, 14, date, koerpergewicht, aktivKcalHeute, garminBilanzMap),
    [monatEntries, workouts, goalKcal, date, koerpergewicht, aktivKcalHeute, garminBilanzMap],
  );
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
      />

      {/* Fasten läuft dauerhaft mit */}
      <FastingCard />

      {/*
       * Tagesform: Schlaf, HRV, Ruhepuls und Body Battery von der Uhr, in einem
       * Satz bewertet. Das verbindet Health mit Training — ohne die Zahlen
       * irgendwo nachzuschlagen.
       */}
      {tagesform && (() => {
        const schlafText =
          tagesform.schlafStunden != null
            ? `${Math.floor(tagesform.schlafStunden)}:${String(Math.round((tagesform.schlafStunden % 1) * 60)).padStart(2, '0')} h`
            : '—';
        const hrvHoch = tagesform.hrv != null && tagesform.hrvSchnitt != null && tagesform.hrv >= tagesform.hrvSchnitt;
        const schlecht =
          (tagesform.schlafScore != null && tagesform.schlafScore < 60) ||
          (tagesform.hrv != null && tagesform.hrvSchnitt != null && tagesform.hrv < tagesform.hrvSchnitt * 0.85);
        const urteil = schlecht
          ? 'Heute lieber locker — der Körper braucht Erholung.'
          : hrvHoch && (tagesform.schlafScore ?? 0) >= 70
            ? 'Gute Basis für eine harte Einheit.'
            : 'Normale Belastung passt heute.';
        const farbe = schlecht ? 'var(--warn, #e8b25f)' : hrvHoch ? 'var(--simple-accent)' : 'var(--text-muted)';
        return (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tagesform</p>
              <span className="text-[10px] font-semibold" style={{ color: farbe }}>von der Uhr</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[
                { label: 'Schlaf', wert: schlafText },
                { label: 'Score', wert: tagesform.schlafScore != null ? String(tagesform.schlafScore) : '—' },
                { label: 'HRV', wert: tagesform.hrv != null ? String(tagesform.hrv) : '—' },
                { label: 'Puls', wert: tagesform.ruhepuls != null ? String(tagesform.ruhepuls) : '—' },
              ].map((k) => (
                <div key={k.label}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{k.label}</p>
                  <p className="text-[15px] font-bold leading-none tabular-nums">{k.wert}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug" style={{ color: farbe }}>{urteil}</p>
          </Card>
        );
      })()}

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

      {/* Serien auf einen Blick — nur die nackten Zahlen, ohne Erklärtext */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Fasten-Serie"
          value={fasten.tage}
          unit={fasten.tage === 1 ? 'Tag' : 'Tage'}
          tone={fasten.tage > 0 ? 'accent' : 'muted'}
          icon={<Moon className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Trainings-Serie"
          value={serie.aktuell}
          unit={serie.aktuell === 1 ? 'Einheit' : 'Einheiten'}
          tone={serie.aktuell > 0 ? 'accent' : 'muted'}
          icon={<Dumbbell className="h-3.5 w-3.5" />}
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
            <Ring value={sum.kcal} max={budgetHeute} label="Kalorien" unit="kcal" size={148} />
            <div className="w-full flex-1 space-y-3.5">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} color={MAKRO_FARBEN.protein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} color={MAKRO_FARBEN.carbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} color={MAKRO_FARBEN.fat} />

              {/* Offenes Budget groß, die Herleitung klein daneben. */}
              <div className="flex items-end justify-between gap-3 border-t border-[var(--border-muted)] pt-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {ueber ? 'über dem Budget' : 'noch übrig'}
                  </p>
                  <p
                    className="text-2xl font-black leading-tight tabular-nums"
                    style={{ color: ueber ? '#ef4444' : 'var(--text-primary)' }}
                  >
                    {Math.abs(offen).toLocaleString('de-DE')}
                    <span className="ml-1 text-xs font-bold text-[var(--text-muted)]">kcal</span>
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight tabular-nums text-[var(--text-muted)]">
                    {Math.round(budgetHeute).toLocaleString('de-DE')} Budget
                    {garminGesamt != null ? (
                      <>
                        {' · Uhr '}
                        {garminGesamt.toLocaleString('de-DE')}
                        {garminHeute?.passiv != null && garminHeute?.aktiv != null
                          ? ` (${garminHeute.passiv} + ${garminHeute.aktiv})`
                          : ''}
                      </>
                    ) : (
                      aktivKcalHeute > 0 && (
                        <> · {zielMarke.toLocaleString('de-DE')} + {Math.round(aktivKcalHeute)} Aktivität</>
                      )
                    )}
                    {' − '}
                    {Math.round(sum.kcal).toLocaleString('de-DE')} gegessen
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                  {entries.length} {entries.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'}
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
          ) : planWocheHeute.length > 0 ? (
            <button
              type="button"
              className="flex-1 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 text-left transition hover:border-[var(--simple-accent)]/50"
              onClick={() => navigate('/training')}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
                  <Dumbbell className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{planWocheHeute[0].name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    aus deinem Wochenplan
                    {planWocheHeute[0].inhalt?.uebungen?.length
                      ? ` · ${planWocheHeute[0].inhalt.uebungen.length} Übungen`
                      : ''}
                    {planWocheHeute[0].dauer_min ? ` · ${planWocheHeute[0].dauer_min} min` : ''}
                  </p>
                  {planWocheHeute.length > 1 && (
                    <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
                      + {planWocheHeute.length - 1} weitere Einheit{planWocheHeute.length > 2 ? 'en' : ''}
                    </p>
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

        <BilanzChart bilanz={bilanz} heute={date} />

        {hatBilanz && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[10px] text-[var(--text-muted)]">
            <span>
              {zielTyp === 'lose' ? 'Ziel: abnehmen' : zielTyp === 'gain' ? 'Ziel: zunehmen' : 'Ziel: halten'}
            </span>
          </div>
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
