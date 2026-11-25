import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Award,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  BarRow,
  Card,
  EmptyState,
  Heatmap,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Sparkline,
  StatTile,
} from './ui';
import { fetchMonth, fetchWorkouts, formatDay, type FoodEntry, type WorkoutEntry } from './simpleApi';
import { aufSyncFertig } from '../lib/syncStatus';
import { TrainingTagesdetail, TagesZeileKlick } from '../components/training/TrainingTagesdetail';
import {
  bestleistungen,
  dayLabelShort,
  daysBetween,
  geglaettet,
  gesamtzahlen,
  gewichtsTrend,
  gewichtsverlauf,
  kcalByDay,
  muskelbalance,
  shiftYmdLocal,
  toYmd,
  todayYmdLocal,
  volumen,
  workoutStreak,
  workoutsThisMonth,
  wochenvergleich,
} from './analytics';

/** Vergleichszahl mit Pfeil und Farbe. */
function Entwicklung({
  jetzt,
  vorher,
  einheit,
  hoeherIstBesser = true,
}: {
  jetzt: number;
  vorher: number;
  einheit?: string;
  hoeherIstBesser?: boolean;
}) {
  const delta = jetzt - vorher;
  const gleich = delta === 0;
  const besser = hoeherIstBesser ? delta > 0 : delta < 0;

  const Icon = gleich ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown;
  const farbe = gleich ? 'var(--text-muted)' : besser ? 'var(--simple-accent)' : '#f87171';

  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums">{jetzt}</span>
      {einheit && <span className="text-[10.5px] text-[var(--text-muted)]">{einheit}</span>}
      <span className="flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color: farbe }}>
        <Icon className="h-3 w-3" />
        {gleich ? '–' : `${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}`}
      </span>
    </div>
  );
}

export default function ProgressPage() {
  const { profile } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [tagOffen, setTagOffen] = useState<string | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLaedt(true);
    try {
      const [w, f] = await Promise.all([fetchWorkouts(), fetchMonth()]);
      setWorkouts(w);
      setEntries(f);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht laden.');
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goals = (profile?.goals ?? {}) as {
    dailyCalories?: number;
    targetWeight?: number;
    weight?: number;
    macros?: { protein?: number };
  };
  const proteinZiel = Number(goals.macros?.protein) || 180;
  const zielGewicht = Number(goals.targetWeight) || 0;

  // Gewicht
  const historie = (profile as { weightHistory?: unknown } | null)?.weightHistory;
  const punkte = gewichtsverlauf(historie, 90);
  const trend = gewichtsTrend(punkte);
  const glatt = geglaettet(punkte, 7);
  const hatGewicht = punkte.length >= 1;

  // Training
  // Tage mit Training und/oder Mahlzeiten, neueste zuerst
  const tagListe = useMemo(() => {
    const map = new Map<string, { datum: string; workouts: WorkoutEntry[]; mahlzeiten: FoodEntry[]; volumen: number; kcal: number }>();

    const hole = (datum: string) => {
      const key = String(datum).slice(0, 10);
      let eintrag = map.get(key);
      if (!eintrag) {
        eintrag = { datum: key, workouts: [], mahlzeiten: [], volumen: 0, kcal: 0 };
        map.set(key, eintrag);
      }
      return eintrag;
    };

    for (const w of workouts) hole(w.date).workouts.push(w);
    for (const m of entries) hole(m.date).mahlzeiten.push(m);

    for (const e of map.values()) {
      e.volumen = e.workouts.reduce((sum, w) => {
        const uebungen = Array.isArray(w.exercises) ? (w.exercises as Array<{ sets?: unknown }>) : [];
        return (
          sum +
          uebungen.reduce((s, ex) => {
            const sets = Array.isArray(ex.sets) ? ex.sets : [];
            return (
              s +
              sets.reduce((ss, set) => {
                const s2 = set as { reps?: number; weight?: number; completed?: boolean };
                if (s2.completed === false) return ss;
                return ss + (Number(s2.reps) || 0) * (Number(s2.weight) || 0);
              }, 0)
            );
          }, 0)
        );
      }, 0);
      e.kcal = e.mahlzeiten.reduce((s, m) => s + (Number(m.calories) || 0), 0);
    }

    return [...map.values()].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 90);
  }, [workouts, entries]);

  const streak = workoutStreak(workouts);
  const monat = workoutsThisMonth(workouts);
  const zahlen = gesamtzahlen(workouts);
  const vol30 = volumen(workouts, 30);
  const rekorde = bestleistungen(workouts, 8);
  const muskel = muskelbalance(workouts, 30);
  const maxMuskel = Math.max(1, ...muskel.map((m) => m.saetze));

  // Wochenvergleich
  const vergleich = wochenvergleich(workouts, entries, proteinZiel);

  // Aktivität
  const kcalMap = kcalByDay(entries);
  const heute = todayYmdLocal();
  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const ymd = shiftYmdLocal(heute, -(83 - i));
    return { ymd, value: kcalMap.get(ymd) ?? 0 };
  });

  // Gewichts-Fortschritt zum Ziel
  const zielFortschritt =
    hatGewicht && zielGewicht > 0 && trend.start !== null && trend.aktuell !== null
      ? (() => {
          const start = trend.start;
          const jetzt = trend.aktuell;
          const gesamt = Math.abs(zielGewicht - start);
          const geschafft = Math.abs(jetzt - start);
          return gesamt > 0 ? Math.min(100, Math.round((geschafft / gesamt) * 100)) : 0;
        })()
      : 0;

  // Verlaufspunkte für die Linie: letzte 60 Tage
  const linie: number[] = [];
  const praktisch = punkte.slice(-60);
  if (praktisch.length >= 2) {
    const von = praktisch[0].ymd;
    const bis = praktisch[praktisch.length - 1].ymd;
    const tage = daysBetween(von, bis);
    const proTag = new Map(praktisch.map((p) => [p.ymd, p.weight]));
    let letzter = praktisch[0].weight;
    for (let i = 0; i <= tage; i += 1) {
      const ymd = shiftYmdLocal(von, i);
      const w = proTag.get(ymd);
      if (w !== undefined) letzter = w;
      linie.push(letzter);
    }
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Langzeit"
        title="Fortschritt"
        hint={
          hatGewicht
            ? `Gewicht ${trend.aktuell} kg${trend.delta !== null ? ` · ${trend.delta > 0 ? '+' : ''}${trend.delta} kg gesamt` : ''}`
            : `${workouts.length} Einheiten erfasst · noch kein Gewicht eingetragen`
        }
      />

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Gewicht"
          value={trend.aktuell ?? '—'}
          unit={trend.aktuell ? 'kg' : undefined}
          hint={
            trend.proWoche === null
              ? 'Noch kein Verlauf'
              : `${trend.proWoche > 0 ? '+' : ''}${trend.proWoche} kg pro Woche`
          }
          tone={trend.proWoche !== null ? (trend.proWoche < 0 ? 'accent' : 'default') : 'muted'}
          icon={<Scale className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Zum Ziel"
          value={zielGewicht > 0 && trend.aktuell !== null ? `${Math.abs(Math.round((zielGewicht - trend.aktuell) * 10) / 10)}` : '—'}
          unit={zielGewicht > 0 ? 'kg' : undefined}
          hint={zielGewicht > 0 ? `Ziel ${zielGewicht} kg` : 'Kein Zielgewicht gesetzt'}
          tone="default"
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Volumen 30 d"
          value={vol30 >= 1000 ? `${(vol30 / 1000).toFixed(1)}k` : vol30}
          unit="kg"
          hint={`${zahlen.saetze} Sätze gesamt`}
          tone={vol30 > 0 ? 'accent' : 'muted'}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Rekord"
          value={streak.laengste}
          unit="Tage"
          hint={`${monat} Einheiten diesen Monat`}
          tone={streak.laengste > 0 ? 'accent' : 'muted'}
          icon={<Trophy className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* Gewichtsverlauf */}
        <Card className="flex flex-col p-5 lg:col-span-2">
          <SectionTitle
            action={
              zielGewicht > 0 && hatGewicht ? (
                <span className="text-[11px] text-[var(--text-muted)]">Ziel {zielGewicht} kg</span>
              ) : undefined
            }
          >
            Gewicht · 90 Tage
          </SectionTitle>

          {!hatGewicht ? (
            <EmptyState
              icon={<Scale className="h-6 w-6" />}
              title="Noch kein Gewicht eingetragen"
              hint="Trag dein Gewicht im Profil ein — dann siehst du hier den Verlauf mit Trend und Ziel."
            />
          ) : punkte.length === 1 ? (
            <div className="py-6 text-center">
              <p className="text-3xl font-semibold tabular-nums">{trend.aktuell} kg</p>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                Erster Eintrag vom {formatDay(punkte[0].ymd)}. Ab dem zweiten siehst du den Trend.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold leading-none tabular-nums">
                    {trend.aktuell}
                    <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">kg</span>
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Start {trend.start} kg · {punkte.length} Messungen
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: trend.delta !== null && trend.delta < 0 ? 'var(--simple-accent)' : undefined }}
                  >
                    {trend.delta !== null && trend.delta > 0 ? '+' : ''}
                    {trend.delta} kg
                  </p>
                  <p className="text-[10.5px] text-[var(--text-muted)]">seit Start</p>
                </div>
              </div>

              <Sparkline values={linie} height={84} goal={zielGewicht > 0 ? zielGewicht : undefined} einheit="kg" />

              <div className="mt-1 flex justify-between text-[9.5px] text-[var(--text-muted)]">
                <span>{dayLabelShort(praktisch[0].ymd)} · {formatDay(praktisch[0].ymd)}</span>
                <span>{formatDay(praktisch[praktisch.length - 1].ymd)}</span>
              </div>

              {glatt.length >= 2 && (
                <p className="mt-3 border-t border-[var(--border-muted)] pt-2.5 text-[11px] text-[var(--text-muted)]">
                  Geglättet (7 Tage):{' '}
                  <span className="font-semibold text-[var(--foreground)]">
                    {Math.round(glatt[glatt.length - 1] * 10) / 10} kg
                  </span>
                  {trend.proWoche !== null && (
                    <>
                      {' '}· Tendenz{' '}
                      <span
                        className="inline-flex items-center gap-0.5 font-semibold"
                        style={{ color: trend.proWoche < 0 ? 'var(--simple-accent)' : 'var(--foreground)' }}
                      >
                        {trend.proWoche < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <TrendingUp className="h-3 w-3" />
                        )}
                        {trend.proWoche > 0 ? '+' : ''}
                        {trend.proWoche} kg/Woche
                      </span>
                    </>
                  )}
                </p>
              )}

              {zielGewicht > 0 && (
                <div className="mt-3">
                  <ProgressBar
                    value={zielFortschritt}
                    max={100}
                    label="Weg zum Ziel"
                    right={`${zielFortschritt} %`}
                  />
                </div>
              )}
            </>
          )}
        </Card>

        {/* Wochenvergleich */}
        <Card className="p-5">
          <SectionTitle>Diese Woche</SectionTitle>
          <p className="mb-3 text-[11px] text-[var(--text-muted)]">
            Im Vergleich zur Vorwoche
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Einheiten
              </p>
              <Entwicklung jetzt={vergleich.einheiten.jetzt} vorher={vergleich.einheiten.vorher} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Minuten
              </p>
              <Entwicklung jetzt={vergleich.minuten.jetzt} vorher={vergleich.minuten.vorher} einheit="min" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Volumen
              </p>
              <Entwicklung jetzt={vergleich.volumen.jetzt} vorher={vergleich.volumen.vorher} einheit="kg" />
            </div>
            <div className="border-t border-[var(--border-muted)] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Ø Kalorien
              </p>
              <Entwicklung
                jetzt={vergleich.kcalSchnitt.jetzt}
                vorher={vergleich.kcalSchnitt.vorher}
                einheit="kcal"
                hoeherIstBesser={false}
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Protein-Ziel erreicht
              </p>
              <Entwicklung jetzt={vergleich.proteinTreffer.jetzt} vorher={vergleich.proteinTreffer.vorher} einheit="Tage" />
            </div>
          </div>
        </Card>
      </div>

      {/* Bestleistungen + Muskelbalance */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <Card className="flex flex-col p-5 lg:col-span-2">
          <SectionTitle action={<span className="text-[11px] text-[var(--text-muted)]">schwerster Satz</span>}>
            Bestleistungen
          </SectionTitle>
          {rekorde.length === 0 ? (
            <EmptyState
              icon={<Award className="h-6 w-6" />}
              title="Noch keine Gewichte erfasst"
              hint="Trag beim Training Gewichte ein — dann siehst du hier deine Rekorde."
            />
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {rekorde.map((r) => (
                <li key={r.uebung} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--simple-accent-soft)] text-[10px] font-bold text-[var(--simple-accent)]">
                    {r.gewicht}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{r.uebung}</p>
                    <p className="text-[10.5px] text-[var(--text-muted)]">
                      {r.reps} Wdh · {formatDay(r.datum)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                    {r.gewicht}
                    <span className="ml-0.5 text-[10px] font-normal text-[var(--text-muted)]">kg</span>
                  </span>
                </li>
              ))}
            </ul>
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
              Erfasse Trainings, dann siehst du hier die Verteilung.
            </p>
          )}
        </Card>
      </div>

      {/* Aktivität */}
      <Card className="p-5">
        <SectionTitle>Erfassung · 12 Wochen</SectionTitle>
        <Heatmap days={heatmap} weeks={12} />
      </Card>

      {/* Tag für Tag: alles, was an einem Tag passiert ist */}
      <Card className="p-5">
        <SectionTitle action={<span className="text-[11px] text-[var(--text-muted)]">antippen für Details</span>}>
          Tag für Tag
        </SectionTitle>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--card-bg)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <tr>
                <th className="py-1.5 text-left font-semibold">Datum</th>
                <th className="py-1.5 text-right font-semibold">Training</th>
                <th className="py-1.5 text-right font-semibold">Volumen</th>
                <th className="py-1.5 text-right font-semibold">kcal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {tagListe.map((t) => (
                <TagesZeileKlick key={t.datum} onClick={() => setTagOffen(t.datum)}>
                  <td className="py-1.5 text-[var(--text-muted)]">{t.datum}</td>
                  <td className="py-1.5 text-right">
                    {t.workouts.length > 0 ? t.workouts.length : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.volumen > 0 ? `${Math.round(t.volumen).toLocaleString('de-DE')} kg` : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{t.kcal > 0 ? Math.round(t.kcal) : '—'}</td>
                </TagesZeileKlick>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {tagOffen && (() => {
        const t = tagListe.find((x) => x.datum === tagOffen);
        return t ? (
          <TrainingTagesdetail
            tag={{ datum: t.datum, workouts: t.workouts, mahlzeiten: t.mahlzeiten }}
            onClose={() => setTagOffen(null)}
          />
        ) : null;
      })()}

      {fehler && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{fehler}</p>}
    </div>
  );
}
