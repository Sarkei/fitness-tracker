import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Dumbbell, Moon, Plus } from 'lucide-react';
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

/**
 * Eintrag aus dem Wochenplan (`/api/trainings/plan`), so wie ihn die Startseite
 * braucht: Name, Dauer und die ersten Übungen. Bewusst schlank gehalten — die
 * volle Form steht in TrainingPage.
 */
type PlanHeuteZeile = {
  id: string;
  name: string;
  dauer_min: number | null;
  inhalt?: { uebungen?: unknown[] };
};
import { aufSyncFertig } from '../lib/syncStatus';
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
   *
   * Der Startwert kommt aus dem lokalen Speicher — der zuletzt bekannte Stand
   * aus der Datenbank. Tims Vorgabe: „ich will das bitte instant der letzte wert
   * angezeigt wird". Ohne das stünde beim Öffnen kurz das Profilziel (2.300) da,
   * bis die Server-Antwort eintrifft.
   */
  const garminStartwert = (): {
    gesamt: number | null; aktiv: number | null; passiv: number | null; schnitt: number | null;
  } | null => {
    try {
      const roh = localStorage.getItem('vrtx_garmin_heute');
      if (!roh) return null;
      const d = JSON.parse(roh) as { gesamt?: number; aktiv?: number; passiv?: number; gemerkt?: number };
      if (!d?.gesamt || d.gesamt <= 0) return null;
      /*
       * Nur verwenden, wenn der Wert von heute ist. Ein Stand von gestern wäre
       * irreführend — morgens beginnt der Verbrauch wieder klein.
       */
      const gemerktTag = new Date(d.gemerkt ?? 0).toLocaleDateString('sv-SE');
      const heuteTag = new Date().toLocaleDateString('sv-SE');
      if (gemerktTag !== heuteTag) return null;
      return {
        gesamt: d.gesamt,
        aktiv: d.aktiv ?? null,
        passiv: d.passiv ?? null,
        schnitt: null,
      };
    } catch {
      return null;
    }
  };

  const [garminHeute, setGarminHeute] = useState<{
    gesamt: number | null;
    aktiv: number | null;
    passiv: number | null;
    schnitt: number | null;
  } | null>(garminStartwert);
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
        standSek?: number | null;
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

      /*
       * Den Wert lokal merken.
       *
       * Tims Vorgabe: „ich will das bitte instant der letzte wert aus der
       * datenbank angezeigt wird." Beim nächsten Öffnen der App steht der
       * zuletzt bekannte Verbrauch sofort da, bevor die Antwort vom Server
       * eintrifft — kein Sprung von 2.300 auf den echten Wert mehr.
       */
      try {
        if (r.gesamt != null && r.gesamt > 0) {
          localStorage.setItem('vrtx_garmin_heute', JSON.stringify({
            gesamt: r.gesamt, aktiv: r.aktiv ?? null, passiv: r.passiv ?? null,
            stand: r.standSek ?? null, gemerkt: Date.now(),
          }));
        }
      } catch { /* privater Modus — dann gibt es eben keinen Startwert */ }
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
    /* Nach einem Abgleich (Pull oder Profil-Knopf) neu laden. */
    const ab = aufSyncFertig(() => {
      void load();
      void holeGarmin();
    });
    return ab;
  }, [load, holeGarmin]);

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
  /**
   * Heutige Einheit von der Uhr.
   *
   * `/api/workouts` liefert Aktivitäten der Uhr bereits mit (`source: 'garmin'`)
   * — deshalb steht die heutige Einheit schon in `trainingToday`. Die separate
   * Liste `einheiten` wird für die Karte nur als Rückfallebene gebraucht, falls
   * die Zusammenführung mal ausfällt.
   */
  const uhrHeute = useMemo(() => {
    if (trainingToday && trainingToday.source === 'garmin') return null;
    return (
      einheiten.find((e) => String(e.date ?? e.start_date_local ?? '').slice(0, 10) === date) ?? null
    );
  }, [einheiten, date, trainingToday]);

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

  const [planWocheHeute, setPlanWocheHeute] = useState<PlanHeuteZeile[]>([]);

  useEffect(() => {
    let ab = false;
    api<{ eintraege?: PlanHeuteZeile[] }>(
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

      {/* Heutiges Training — anklickbar, volle Breite */}
      <TrainingHeuteKarte
        trainingToday={trainingToday}
        planDay={planDay}
        planWocheHeute={planWocheHeute}
        uhrEinheit={uhrHeute}
        laedt={laedt}
        onErfassen={() => setShowSession(true)}
        onOeffnen={(ziel) => navigate(ziel)}
      />

      {/* Gegessen: nur die Tabelle */}
      <Card className="flex flex-col p-5">
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

/**
 * Heutiges Training als eigene Karte — die erste, die man nach den Serien sieht.
 *
 * Anklickbar: öffnet die volle Detailansicht. Was geöffnet wird, hängt davon ab,
 * was es gibt:
 *  - erfasste Einheit     -> /training (dort stehen Übungen und Verlauf)
 *  - Einheit von der Uhr  -> /einheit/<id> (Diagramme, Kennzahlen)
 *  - geplante Einheit     -> startet die Session direkt
 */
function TrainingHeuteKarte({
  trainingToday,
  planDay,
  planWocheHeute,
  uhrEinheit,
  laedt,
  onErfassen,
  onOeffnen,
}: {
  trainingToday: WorkoutEntry | null;
  planDay: PlanDay | null;
  planWocheHeute: PlanHeuteZeile[];
  uhrEinheit: Record<string, unknown> | null;
  laedt: boolean;
  onErfassen: () => void;
  onOeffnen: (ziel: string) => void;
}) {
  /**
   * Kennzahlen der heutigen Einheit.
   *
   * Zwei Quellen, gleiche Anzeige:
   *  - Einheit von der Uhr: steckt in `trainingToday` (source 'garmin') mit
   *    `distance_km`, `duration_min`, `avg_hr`, `calories`
   *  - reine Garmin-Aktivität: kommt als `uhrEinheit` mit Sekunden und Metern
   */
  const kennzahlen = (() => {
    const quelleUhr = uhrEinheit;
    const istGarmin = trainingToday?.source === 'garmin';

    let distanz: number | null = null;
    let minuten: number | null = null;
    let puls: number | null = null;
    let kcal: number | null = null;

    if (istGarmin) {
      distanz = trainingToday!.distance_km != null ? Number(trainingToday!.distance_km) : null;
      minuten = trainingToday!.duration_min != null ? Number(trainingToday!.duration_min) : null;
      puls = trainingToday!.avg_hr != null ? Number(trainingToday!.avg_hr) : null;
      kcal = trainingToday!.calories != null ? Number(trainingToday!.calories) : null;
    } else if (quelleUhr) {
      distanz = quelleUhr.distance != null ? Number(quelleUhr.distance) / 1000 : null;
      const sek =
        quelleUhr.moving_time != null
          ? Number(quelleUhr.moving_time)
          : quelleUhr.elapsed_time != null
            ? Number(quelleUhr.elapsed_time)
            : null;
      minuten = sek != null && sek > 0 ? Math.round(sek / 60) : null;
      puls = quelleUhr.avg_hr != null ? Number(quelleUhr.avg_hr) : null;
      kcal = quelleUhr.calories != null ? Number(quelleUhr.calories) : null;
    } else {
      return [];
    }

    const zeilen: Array<{ label: string; wert: string }> = [];
    if (distanz != null && distanz > 0) zeilen.push({ label: 'Distanz', wert: `${distanz.toFixed(2)} km` });
    if (minuten != null && minuten > 0) zeilen.push({ label: 'Dauer', wert: `${Math.round(minuten)} min` });
    if (puls != null) zeilen.push({ label: 'Ø Puls', wert: `${Math.round(puls)} bpm` });
    if (kcal != null) zeilen.push({ label: 'Kalorien', wert: `${Math.round(kcal)} kcal` });
    if (distanz != null && distanz > 0 && minuten != null && minuten > 0) {
      const pace = (minuten * 60) / distanz;
      zeilen.push({
        label: 'Ø Pace',
        wert: `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')} min/km`,
      });
    }
    return zeilen;
  })();

  const titel =
    trainingToday?.name ||
    (uhrEinheit ? String(uhrEinheit.name ?? uhrEinheit.type ?? 'Einheit') : '') ||
    planWocheHeute[0]?.name ||
    planDay?.title ||
    (planDay?.isRest ? 'Ruhetag' : laedt ? '…' : 'Kein Training geplant');

  const untertitel = trainingToday
    ? 'erledigt'
    : uhrEinheit
      ? 'von der Uhr'
      : planWocheHeute.length > 0
        ? `aus deinem Wochenplan${planWocheHeute[0].inhalt?.uebungen?.length ? ` · ${planWocheHeute[0].inhalt.uebungen.length} Übungen` : ''}`
        : planDay && !planDay.isRest
          ? `${(planDay.exercises ?? []).length} Übungen geplant`
          : planDay?.isRest
            ? 'Erholung ist Teil des Plans.'
            : 'Training kannst du trotzdem erfassen.';

  /*
   * Wohin der Klick führt.
   *
   * Eine Einheit von der Uhr hat ihre eigenen Kennzahlen und Diagramme — die
   * stehen auf /einheit/<id>. Für sie wäre /training die falsche Seite: dort
   * gäbe es Übungen, die es bei einer Radfahrt nicht gibt.
   */
  const garminId = trainingToday?.source === 'garmin' ? trainingToday.id : null;
  const ziel = garminId
    ? `/einheit/${encodeURIComponent(garminId)}`
    : uhrEinheit
      ? `/einheit/${encodeURIComponent(String(uhrEinheit.id ?? ''))}`
      : trainingToday
        ? '/training'
        : null;

  const uebungen = planDay && !planDay.isRest ? (planDay.exercises ?? []) : [];

  return (
    <Card className="p-5">
      <SectionTitle
        action={
          <GhostButton onClick={onErfassen}>
            <Plus className="h-3 w-3" /> Erfassen
          </GhostButton>
        }
      >
        Heutiges Training
      </SectionTitle>

      <button
        type="button"
        disabled={!ziel}
        onClick={() => ziel && onOeffnen(ziel)}
        className={`w-full rounded-xl border p-4 text-left transition ${
          ziel
            ? 'border-[color-mix(in_srgb,var(--simple-accent)_40%,transparent)] bg-[var(--simple-accent-soft)]/50 hover:border-[var(--simple-accent)]'
            : 'border-[var(--border-muted)] bg-[var(--card-bg)]'
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              planDay?.isRest && !uhrEinheit && !trainingToday
                ? 'bg-[var(--border-muted)]/60 text-[var(--text-muted)]'
                : 'bg-[var(--simple-accent)] text-[var(--simple-accent-ink)]'
            }`}
          >
            {planDay?.isRest && !uhrEinheit && !trainingToday ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Dumbbell className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{titel}</p>
            <p className="text-xs text-[var(--text-muted)]">{untertitel}</p>
          </div>
          {ziel && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" />}
        </div>

        {kennzahlen.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kennzahlen.map((z) => (
              <div key={z.label} className="rounded-lg bg-[var(--card-bg)]/70 px-2.5 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {z.label}
                </p>
                <p className="text-[12.5px] font-semibold tabular-nums">{z.wert}</p>
              </div>
            ))}
          </div>
        )}

        {uebungen.length > 0 && (
          <ul className="mt-3 space-y-1">
            {uebungen.slice(0, 4).map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="min-w-0 truncate text-[var(--text-muted)]">{e.name}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                  {[e.sets && `${e.sets}×`, e.reps && `${e.reps}`].filter(Boolean).join(' ')}
                </span>
              </li>
            ))}
            {uebungen.length > 4 && (
              <li className="text-[10.5px] text-[var(--text-muted)]">+{uebungen.length - 4} weitere</li>
            )}
          </ul>
        )}

        {ziel && (
          <p className="mt-3 text-[10.5px] font-semibold text-[var(--simple-accent)]">
            Antippen für alle Details
          </p>
        )}
      </button>
    </Card>
  );
}
