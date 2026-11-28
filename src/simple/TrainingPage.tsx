import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExerciseDetailOptional } from '@/src/lib/exerciseDetailContext';
import { api } from '../lib/api';
import EinheitDetailModal, { type EinheitDaten } from '../components/wellness/EinheitDetailModal';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
import { TrainingTagesdetail } from '../components/training/TrainingTagesdetail';
import { aufSyncFertig } from '../lib/syncStatus';
import {
  DAY_LABELS,
  dayKeyOf,
  dauerMinuten,
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

/** Ein Eintrag aus dem Wochenplan (`/plan`) — Workout an einem Datum. */
type WochenPlanZeile = {
  id: string;
  datum: string;
  trainings_id: string;
  name: string;
  art: string;
  dauer_min: number | null;
  inhalt?: { uebungen?: Array<{ name: string; saetze: Array<{ wiederholungen: number | null; gewicht: number | null }> }> };
};

/** Wochenplan-Eintrag in die Form bringen, die der Trainingsbildschirm erwartet. */
function planDayAusTraining(z: WochenPlanZeile): PlanDay {
  const uebungen = z.inhalt?.uebungen ?? [];
  return {
    day: '',
    title: z.name,
    estimatedDuration: z.dauer_min ?? undefined,
    exercises: uebungen.map((u) => ({
      name: u.name,
      sets: u.saetze.length,
      reps: u.saetze[0]?.wiederholungen ?? undefined,
      weight: u.saetze[0]?.gewicht != null ? String(u.saetze[0].gewicht) : undefined,
    })),
  };
}

export default function TrainingPage() {
  const navigate = useNavigate();
  const ort = useLocation();
  // Uebungen antippbar machen: Erklaerung, Video und eigener Verlauf.
  const exerciseDetail = useExerciseDetailOptional();
  const today = todayYmd();
  const [week, setWeek] = useState<CoachWeek>(null);
  /** Alle Wochen des aktiven Plans (mit Startdatum) — Grundlage für die Wochenansicht. */
  const [planWochen, setPlanWochen] = useState<PlanWeek[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  /** Aktivitaeten von der Uhr — Einheiten ohne geplantes Workout. */
  const [uhrEinheiten, setUhrEinheiten] = useState<Array<Record<string, unknown>>>([]);
  const [einheitOffen2, setEinheitOffen2] = useState<EinheitDaten | null>(null);
  /** Seite der Uhr-Einheiten: 5 pro Seite, damit man durch alle blättern kann. */
  const [uhrSeite, setUhrSeite] = useState(0);
  const [selected, setSelected] = useState<string>(dayKeyOf(today));
  /** 0 = diese Woche, 1 = nächste Woche, -1 = letzte Woche … */
  const [weekOffset, setWeekOffset] = useState(0);
  const [wischStart, setWischStart] = useState<{ x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);
  /** Einträge aus dem Wochenplan für die angezeigte Woche. */
  const [wochenPlan, setWochenPlan] = useState<WochenPlanZeile[]>([]);
  /** Manuell gestartetes Workout aus dem Wochenplan (statt Coach-Plan). */
  const [manuell, setManuell] = useState<WochenPlanZeile | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  /** Zähler für den Coach-Wizard; von der Plan-Seite aus über den State ausgelöst. */
  const [neuerPlanToken, setNeuerPlanToken] = useState(0);
  /**
   * Persönliche Wochenziele aus dem Profil.
   *
   * Vorher richtete sich der Fortschritt nach dem Plan (`geplanteTage`). Ohne
   * aktiven Plan stand dort "2 / 0" — die Einheiten wurden gezählt, das Ziel war
   * null. Jetzt gelten eigene Zahlen aus dem Profil, unabhängig vom Plan.
   */
  const [wochenZiel, setWochenZiel] = useState<{ einheiten: number; minuten: number } | null>(null);
  /**
   * Vorhandene Pläne für die Auswahl unten.
   * `art` unterscheidet Coach-Plan (aus der KI) und manuellen Wochenplan.
   */
  const [plaene, setPlaene] = useState<
    Array<{ id: string; name: string; art: 'coach' | 'manuell'; info?: string }>
  >([]);
  const [aktiverPlanId, setAktiverPlanId] = useState<string | null>(null);
  /**
   * Verlauf: erst 10 Einträge, auf Wunsch alle.
   * Tim will jede Einheit öffnen können — früher verwies der Link auf die
   * Statistik, wo man keine Details sieht.
   */
  const [verlaufAlle, setVerlaufAlle] = useState(false);

  /*
   * „Neuer Plan" führt jetzt in die manuelle Planung (/plan). Wer den Plan lieber
   * vom Coach bauen lässt, kommt von dort mit `state.coachWizard` zurück — dann
   * öffnet sich der Wizard wie früher über den Zähler.
   */
  useEffect(() => {
    if (!(ort.state as { coachWizard?: boolean } | null)?.coachWizard) return;
    setNeuerPlanToken((n) => n + 1);
    navigate('/training', { replace: true });
  }, [ort.state, navigate]);

  const load = useCallback(async () => {
    setError(null);
    setLaedt(true);
    try {
      const [plan, list] = await Promise.all([fetchActivePlan().catch(() => null), fetchWorkouts().catch(() => [])]);
      // Ohne Plan ausdrücklich leeren: sonst bleibt die zuletzt geladene Woche stehen,
      // auch wenn der Plan inzwischen gelöscht wurde.
      setWeek(plan?.week ?? null);
      setPlanWochen(plan?.weeks ?? []);
      setWorkouts(list);
      // Einheiten von der Uhr dazuladen — die stehen nicht in den Workouts.
      api<{ aktivitaeten?: Array<Record<string, unknown>> }>('/api/integrations/garmin/activities?limit=8')
        .then((r) => setUhrEinheiten(Array.isArray(r.aktivitaeten) ? r.aktivitaeten : []))
        .catch(() => setUhrEinheiten([]));
      /*
       * Pläne laden: Coach-Pläne aus /api/coach/plans, dazu der manuelle
       * Wochenplan, sofern einer existiert (erkannt an vorhandenen Einträgen).
       */
      void (async () => {
        try {
          const [coach, wp] = await Promise.all([
            api<Array<{ id: string; type?: string; status?: string; name?: string | null; current_week?: number }>>(
              '/api/coach/plans',
            ).catch(() => []),
            api<{ eintraege?: Array<{ name?: string | null }> }>(
              `/api/trainings/plan?von=${shiftYmdLocal(today, -28)}&bis=${shiftYmdLocal(today, 28)}`,
            ).catch(() => ({ eintraege: [] as Array<{ name?: string | null }> })),
          ]);
          const liste: Array<{ id: string; name: string; art: 'coach' | 'manuell'; info?: string }> = [];
          let aktiv: string | null = null;
          for (const c of coach ?? []) {
            if (c.type !== 'workout') continue;
            liste.push({
              id: c.id,
              name: String(c.name ?? 'Coach-Plan'),
              art: 'coach',
              info: c.current_week ? `Woche ${c.current_week}` : undefined,
            });
            if (c.status === 'active') aktiv = c.id;
          }
          /* Manueller Wochenplan: ein Eintrag = ein Plan. */
          const wpListe: Array<{ name?: string | null }> = Array.isArray(wp?.eintraege) ? wp.eintraege : [];
          if (wpListe.length) {
            const namen = [...new Set(wpListe.map((z) => String(z.name ?? '')).filter(Boolean))];
            liste.push({
              id: 'manuell',
              name: namen.length === 1 ? namen[0] : 'Manueller Wochenplan',
              art: 'manuell',
              info: `${wpListe.length} Einheiten`,
            });
            if (!aktiv) aktiv = 'manuell';
          }
          setPlaene(liste);
          setAktiverPlanId(aktiv);
        } catch {
          setPlaene([]);
          setAktiverPlanId(null);
        }
      })();

      // Persönliche Wochenziele — unabhängig davon, ob ein Plan aktiv ist.
      api<{ goals?: { weeklySessions?: number; weeklyMinutes?: number } }>('/api/profile')
        .then((p) =>
          setWochenZiel({
            einheiten: Number(p?.goals?.weeklySessions) || 3,
            minuten: Number(p?.goals?.weeklyMinutes) || 150,
          }),
        )
        .catch(() => setWochenZiel({ einheiten: 3, minuten: 150 }));
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

  /*
   * Der Wochenplan (Seite /plan) war bisher nur dort sichtbar. Jetzt lädt die
   * Trainingsseite ihn mit — sonst plant man und sieht am Trainingstag nichts.
   */
  useEffect(() => {
    let ab = false;
    api<{ eintraege?: WochenPlanZeile[] }>(
      `/api/trainings/plan?von=${shownMondayYmd}&bis=${shiftYmdLocal(shownMondayYmd, 6)}`,
    )
      .then((r) => { if (!ab) setWochenPlan(Array.isArray(r.eintraege) ? r.eintraege : []); })
      .catch(() => { if (!ab) setWochenPlan([]); });
    return () => { ab = true; };
  }, [shownMondayYmd]);

  const planDay = days.find((d) => d.day === selected) ?? null;
  const selectedYmd = dateOfDayKey(selected, shownMondayYmd);
  const trainingAmTag = workouts.find((w) => toYmd(w.date) === selectedYmd) ?? null;
  /** Wochenplan-Einträge des gewählten Tages. */
  const planHeute = wochenPlan.filter((z) => z.datum === selectedYmd);

  /*
   * Einheit von der Uhr am gewählten Tag.
   *
   * Tims Vorgabe: Wer an einem Ruhetag trainiert hat, soll hier dieselbe Ansicht
   * sehen wie auf der Startseite — Aktivität mit Kennzahlen, keine Ruhetag-Box.
   */
  const uhrAmTag =
    uhrEinheiten.find((e) => String(e.date ?? e.start_date_local ?? '').slice(0, 10) === selectedYmd) ??
    null;
  /** Ist an diesem Tag überhaupt etwas passiert? */
  const tagHatAktivitaet = Boolean(trainingAmTag || uhrAmTag || planHeute.length > 0);

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

  /**
   * Wurde in den letzten 7 Tagen Krafttraining aufgezeichnet?
   *
   * Nur dann haben Muskelbalance und Trainingsvolumen eine Aussage. Läufe und
   * Radfahrten von der Uhr haben keine Sätze — dort stünde in beiden Boxen
   * nichts als Leere.
   */
  const hatKraftLetzteWoche = useMemo(() => {
    const ymdVon = shiftYmdLocal(today, -6);
    return workouts.some((w) => {
      const ymd = toYmd(w.date);
      if (!ymd || ymd < ymdVon) return false;
      /* Eigene Workouts mit Übungen sind Kraft; Uhr-Einheiten ohne Übungen nicht. */
      if (!Array.isArray(w.exercises) || w.exercises.length === 0) return false;
      const typ = String(w.type ?? '').toLowerCase();
      if (typ && !/strength|kraft|gym|bodyweight|calisthenics/.test(typ) && typ !== 'other') {
        return false;
      }
      return true;
    });
  }, [workouts, today]);

  /*
   * Wochenfortschritt gegen die persönlichen Ziele.
   *
   * Gezählt wird alles, was in den letzten 7 Tagen passiert ist: eigene Workouts
   * UND Einheiten von der Uhr. Vorher zählten nur die Workouts — ein Lauf von der
   * Uhr fehlte in der Einheiten- und Minuten-Zahl.
   */
  const zielEinheiten = wochenZiel?.einheiten ?? 3;
  const zielMinuten = wochenZiel?.minuten ?? 150;
  const { wocheEinheiten, wocheMinuten } = useMemo(() => {
    const ymdVon = shiftYmdLocal(today, -6);
    let einheiten = 0;
    let minuten = 0;
    const tageGezaehlt = new Set<string>();

    for (const w of workouts) {
      const ymd = toYmd(w.date);
      if (!ymd || ymd < ymdVon) continue;
      einheiten += 1;
      minuten += dauerMinuten(w);
      tageGezaehlt.add(ymd);
    }
    for (const e of uhrEinheiten) {
      const ymd = String(e.date ?? e.start_date_local ?? '').slice(0, 10);
      if (!ymd || ymd < ymdVon) continue;
      // Ein Tag mit Uhr-Einheit und erfasstem Workout zählt nur einmal.
      if (tageGezaehlt.has(ymd)) continue;
      const sek =
        e.moving_time != null ? Number(e.moving_time) : e.elapsed_time != null ? Number(e.elapsed_time) : null;
      if (sek == null || !Number.isFinite(sek) || sek <= 0) continue;
      einheiten += 1;
      minuten += Math.round(sek / 60);
    }
    return { wocheEinheiten: einheiten, wocheMinuten: Math.round(minuten) };
  }, [workouts, uhrEinheiten, today]);

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

  /**
   * Einen Plan aktiv schalten — oder mit `null` alle aus.
   *
   * Coach-Pläne laufen über den Status in `coach_plans`; es darf immer nur einer
   * aktiv sein, deshalb werden die anderen zuerst deaktiviert.
   */
  const setzePlanAktiv = async (id: string | null) => {
    try {
      for (const pl of plaene) {
        if (pl.art !== 'coach') continue;
        const sollAktiv = pl.id === id;
        if (sollAktiv) {
          await api(`/api/coach/plans/${pl.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'active' }),
          });
        } else if (pl.id === aktiverPlanId) {
          await api(`/api/coach/plans/${pl.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'paused' }),
          });
        }
      }
      setAktiverPlanId(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan konnte nicht umgeschaltet werden.');
    }
  };

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
            <GhostButton onClick={() => navigate('/plan')}>
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
              {!tagHatAktivitaet && planDay?.isRest ? <Moon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {DAY_LABELS[selected]} · {Number(selectedYmd.slice(8, 10))}. {Number(selectedYmd.slice(5, 7))}.
              </p>
              <p className="text-lg font-semibold leading-tight">
                {trainingAmTag?.name || String(uhrAmTag?.name ?? '') || (planHeute.length > 0 && planHeute[0].name) || planDay?.title || (planDay?.isRest ? 'Ruhetag' : 'Training')}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {trainingAmTag?.source === 'garmin' || uhrAmTag
                  ? 'erledigt · von der Uhr'
                  : trainingAmTag
                    ? 'erledigt'
                    : planHeute.length > 0
                      ? `aus deinem Wochenplan · ${planHeute.reduce((a, z) => a + (z.inhalt?.uebungen?.length ?? 0), 0)} Übungen`
                      : planDay?.isRest
                        ? 'Erholung — kein Training geplant.'
                        : `${(planDay?.exercises ?? []).length} Übungen${planDay?.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}`}
              </p>
            </div>
          </div>

          {/*
            * Kennzahlen der Einheit — dieselbe Ansicht wie auf der Startseite.
            * Vorher stand hier nur „erledigt · undefined min", weil Garmin-Einheiten
            * kein `duration`-Feld haben, sondern `duration_min`.
            */}
          {(() => {
            const e = uhrAmTag;
            const istGarmin = trainingAmTag?.source === 'garmin';
            let distanz: number | null = null;
            let minuten: number | null = null;
            let pulsOe: number | null = null;
            let pulsMax: number | null = null;
            let kcal: number | null = null;

            if (istGarmin && trainingAmTag) {
              distanz = trainingAmTag.distance_km != null ? Number(trainingAmTag.distance_km) : null;
              minuten = trainingAmTag.duration_min != null ? Number(trainingAmTag.duration_min) : null;
              pulsOe = trainingAmTag.avg_hr != null ? Number(trainingAmTag.avg_hr) : null;
              pulsMax = trainingAmTag.max_hr != null ? Number(trainingAmTag.max_hr) : null;
              kcal = trainingAmTag.calories != null ? Number(trainingAmTag.calories) : null;
            } else if (e) {
              distanz = e.distance != null ? Number(e.distance) / 1000 : null;
              const sek =
                e.moving_time != null ? Number(e.moving_time) : e.elapsed_time != null ? Number(e.elapsed_time) : null;
              minuten = sek != null && sek > 0 ? Math.round(sek / 60) : null;
              pulsOe = e.avg_hr != null ? Number(e.avg_hr) : null;
              pulsMax = e.max_hr != null ? Number(e.max_hr) : null;
              kcal = e.calories != null ? Number(e.calories) : null;
            } else if (trainingAmTag) {
              minuten = dauerMinuten(trainingAmTag) || null;
            }

            const zeilen: Array<{ label: string; wert: string }> = [];
            if (distanz != null && distanz > 0) zeilen.push({ label: 'Distanz', wert: `${distanz.toFixed(2)} km` });
            if (minuten != null && minuten > 0) zeilen.push({ label: 'Dauer', wert: `${Math.round(minuten)} min` });
            if (pulsOe != null) zeilen.push({ label: 'Ø Puls', wert: `${Math.round(pulsOe)} bpm` });
            if (pulsMax != null) zeilen.push({ label: 'Max', wert: `${Math.round(pulsMax)} bpm` });
            if (kcal != null) zeilen.push({ label: 'Kalorien', wert: `${Math.round(kcal)} kcal` });
            if (distanz != null && distanz > 0 && minuten != null && minuten > 0) {
              const pace = (minuten * 60) / distanz;
              zeilen.push({
                label: 'Ø Pace',
                wert: `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')} min/km`,
              });
            }
            if (!zeilen.length) return null;

            /* Uhr-Einheiten öffnen ihre Detailseite mit Zonen und Diagrammen. */
            const garminId = istGarmin ? trainingAmTag?.id : uhrAmTag ? String(uhrAmTag.id ?? '') : null;
            const inhalt = (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {zeilen.map((z) => (
                    <div key={z.label} className="rounded-lg bg-[var(--border-muted)]/30 px-3 py-2">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                        {z.label}
                      </p>
                      <p className="text-[13.5px] font-semibold tabular-nums">{z.wert}</p>
                    </div>
                  ))}
                </div>
                {garminId && (
                  <p className="mt-2 text-[10.5px] font-semibold text-[var(--simple-accent)]">
                    Antippen für Zonen, Effekt und Verlauf
                  </p>
                )}
              </>
            );

            if (!garminId) return inhalt;

            return (
              <button
                type="button"
                onClick={() => navigate(`/einheit/${encodeURIComponent(garminId)}`)}
                className="w-full text-left"
              >
                {inhalt}
              </button>
            );
          })()}

          {planDay?.description && (
            <p className="mt-3 rounded-lg bg-[var(--border-muted)]/30 px-3 py-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
              {planDay.description}
            </p>
          )}

          {(planDay?.exercises ?? []).length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--border-muted)] border-t border-[var(--border-muted)]">
              {(planDay?.exercises ?? []).map((exercise, index) => (
                <li key={`${exercise.name}-${index}`}>
                  {/* Anklickbar: oeffnet Erklaerung, Video, haeufige Fehler und den eigenen Verlauf. */}
                  <button
                    type="button"
                    onClick={() =>
                      exerciseDetail?.openExerciseDetail({
                        exerciseKey: (exercise as { exerciseKey?: string }).exerciseKey,
                        name: exercise.name,
                      })
                    }
                    className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left transition hover:text-[var(--simple-accent)]"
                  >
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
                  </button>
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

          {/* Was im Wochenplan für diesen Tag steht — mit Startknopf */}
          {planHeute.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--simple-accent)]/40 bg-[var(--simple-accent-soft)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--simple-accent)]">
                Aus deinem Wochenplan
              </p>
              <ul className="mt-1 divide-y divide-[var(--border-muted)]">
                {planHeute.map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold">{z.name}</span>
                      <span className="block text-[10px] text-[var(--text-muted)]">
                        {z.inhalt?.uebungen?.length ?? 0} Übungen{z.dauer_min ? ` · ${z.dauer_min} min` : ''}
                      </span>
                    </span>
                    <GhostButton
                      onClick={() => {
                        setManuell(z);
                        setRunning(true);
                      }}
                    >
                      Starten
                    </GhostButton>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            * Ruhetag nur, wenn an dem Tag wirklich nichts passiert ist — und als
            * schmale Zeile. Die große Box mit Mond, Titel und Erklärsatz nahm den
            * halben Bildschirm ein, auch wenn die Uhr eine Einheit hatte.
            */}
          {!tagHatAktivitaet && planDay?.isRest && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--border-muted)] px-3 py-2">
              <Moon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <p className="min-w-0 flex-1 text-[11.5px] text-[var(--text-muted)]">
                Ruhetag — Erholung ist Teil des Plans.
              </p>
              <GhostButton onClick={() => setRunning(true)}>Trotzdem trainieren</GhostButton>
            </div>
          )}
        </Card>

        {/* Rechte Spalte: füllt die Höhe der linken Karte, damit beide Unterkanten abschließen */}
        <div className="flex h-full flex-col gap-4">
          <Card className="p-5">
            <SectionTitle>Diese Woche</SectionTitle>
            <div className="space-y-2.5">
              <ProgressBar
                value={wocheEinheiten}
                max={Math.max(zielEinheiten, 1)}
                label="Einheiten"
                right={`${wocheEinheiten} / ${zielEinheiten}`}
              />
              <ProgressBar
                value={wocheMinuten}
                max={Math.max(zielMinuten, 1)}
                label="Minuten"
                right={`${wocheMinuten} / ${zielMinuten}`}
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
              <p className="mt-2 rounded-lg bg-[var(--border-muted)]/30 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                Kein Plan aktiv — die Ziele oben gelten trotzdem. Für einen Plan: <b>„Neuer Plan"</b> oben
                oder <b>„Von Coach erstellen lassen"</b>.
              </p>
            )}
            {week && !angezeigtePlanWoche && (
              <p className="mt-2 rounded-lg bg-[var(--border-muted)]/30 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                Für diese Woche ist nichts geplant — der Plan deckt sie nicht ab.
              </p>
            )}
          </Card>

          {/*
            * Muskelbalance nur zeigen, wenn in den letzten 7 Tagen Krafttraining
            * aufgezeichnet wurde. Eine leere Box mit „sobald du Trainings erfasst"
            * ist unnötig — sie sagt nur, dass keine Daten da sind.
            */}
          {hatKraftLetzteWoche && (
            <Card className="flex flex-1 flex-col p-5">
              <SectionTitle>Muskelbalance · 30 Tage</SectionTitle>
              <div className="space-y-2">
                {muskel.map((m) => (
                  <BarRow key={m.gruppe} label={m.gruppe} value={m.saetze} max={maxMuskel} caption={`${m.saetze}`} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Volumen-Verlauf — nur bei Krafttraining, sonst steht dort 8x eine Null. */}
      {hatKraftLetzteWoche && (
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
      )}

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
              {(verlaufAlle ? workouts : workouts.slice(0, 10)).map((workout) => {
                const uebungen = Array.isArray(workout.exercises) ? workout.exercises.length : 0;
                const istGarmin = workout.source === 'garmin';
                const minuten = Math.round(dauerMinuten(workout));
                return (
                  <li key={workout.id} className="flex items-center justify-between gap-3 py-2.5">
                    <button
                      type="button"
                      /*
                       * Uhr-Einheiten öffnen die volle Detailseite (/einheit/<id>):
                       * dort stehen Route, Zonen, Trainings-Effekt, Leistung und die
                       * Diagramme. eigene Workouts haben diese Werte nicht — für sie
                       * bleibt das Tagesdetail mit Übungen und Sätzen.
                       */
                      onClick={() =>
                        istGarmin
                          ? navigate(`/einheit/${encodeURIComponent(workout.id)}`)
                          : setTagOffen(String(workout.date).slice(0, 10))
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:opacity-80"
                    >
                      <span className="min-w-0 flex-1">
                        {/* Zweizeilig statt abgeschnitten: Trainingsnamen wie
                            „Stephanskirchen - Coach: Mittag" sind sonst unlesbar. */}
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{workout.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {formatDay(toYmd(workout.date))}
                          {minuten > 0 ? ` · ${minuten} min` : ''}
                          {uebungen ? ` · ${uebungen} Übungen` : ''}
                          {istGarmin ? ' · von der Uhr' : ''}
                        </p>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    </button>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {dayLabelShort(toYmd(workout.date))}
                    </span>
                    {/* Uhr-Einheiten lassen sich nicht in der App löschen — sie gehören Garmin. */}
                    {!istGarmin && (
                      <button
                        className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--simple-clay)]"
                        onClick={() => void remove(workout.id)}
                        aria-label="Löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
              {workouts.length > 10 && !verlaufAlle && (
                <li className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setVerlaufAlle(true)}
                    className="text-[11.5px] font-semibold text-[var(--simple-accent)]"
                  >
                    Alle {workouts.length} Einheiten anzeigen
                  </button>
                </li>
              )}
              {verlaufAlle && workouts.length > 10 && (
                <li className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setVerlaufAlle(false)}
                    className="text-[11.5px] font-semibold text-[var(--text-muted)]"
                  >
                    Weniger anzeigen
                  </button>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>



      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {/*
        * Plan-Auswahl: zeigt nur vorhandene Pläne mit Kennzeichnung (Coach oder
        * manuell) und lässt genau einen aktiv schalten — oder alle aus.
        * Ohne Pläne erscheint hier nichts; der Coach-Bereich (CoachPage) ist raus.
        */}
      {plaene.length > 0 && (
        <section className="mt-2 border-t border-[var(--border-muted)] pt-6">
          <SectionTitle
            action={
              aktiverPlanId ? (
                <GhostButton onClick={() => void setzePlanAktiv(null)}>Alle aus</GhostButton>
              ) : undefined
            }
          >
            Deine Trainingspläne
          </SectionTitle>
          <ul className="mt-2 divide-y divide-[var(--border-muted)]">
            {plaene.map((pl) => {
              const aktiv = pl.id === aktiverPlanId;
              return (
                <li key={pl.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      aktiv
                        ? 'bg-[var(--simple-accent)] text-[var(--simple-accent-ink)]'
                        : 'bg-[var(--border-muted)]/50 text-[var(--text-muted)]'
                    }`}
                  >
                    {pl.art === 'coach' ? <TrendingUp className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{pl.name}</span>
                    <span className="block text-[10.5px] text-[var(--text-muted)]">
                      {pl.art === 'coach' ? 'Coach-Plan' : 'Manueller Plan'}
                      {pl.info ? ` · ${pl.info}` : ''}
                      {aktiv ? ' · aktiv' : ''}
                    </span>
                  </span>
                  <GhostButton onClick={() => void setzePlanAktiv(aktiv ? null : pl.id)}>
                    {aktiv ? 'Deaktivieren' : 'Aktivieren'}
                  </GhostButton>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          day={manuell ? planDayAusTraining(manuell) : planDay}
          name={manuell?.name || trainingAmTag?.name || planDay?.title || `Training ${formatDay(today)}`}
          date={today}
          onClose={() => {
            setRunning(false);
            setManuell(null);
          }}
          onSaved={() => void load()}
        />
      )}
      <EinheitDetailModal einheit={einheitOffen2} onClose={() => setEinheitOffen2(null)} />
    </div>
  );
}