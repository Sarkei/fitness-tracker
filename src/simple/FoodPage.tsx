import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Dumbbell,
  Loader2,
  Moon,
  Plus,
  Sandwich,
  Sun,
  Trash2,
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
import MealEditRow from './EditRows';
import MealplannerRezeptSheet from './MealplannerRezeptSheet';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { BarcodeSheet } from './BarcodeSheet';
import { isValidPlan, liegtImFasten, type FastingPlan } from '../lib/fasting';
import {
  addFoodEntry,
  dayKeyOf,
  deleteFood,
  fetchActivePlan,
  fetchMealplannerGerichte,
  fetchMonth,
  formatDay,
  shiftYmd,
  todayYmd,
  totals,
  type FoodEntry,
  type MealplanerGericht,
} from './simpleApi';
import {
  dayLabelShort,
  erfassteTage,
  kcalByDay,
  kcalDurchschnitt,
  shiftYmdLocal,
  toYmd,
} from './analytics';

const MEALS = [
  { id: 'breakfast', label: 'Frühstück', hours: '06–10', icon: Coffee, match: /fr(ü|u)hst|breakfast/i },
  { id: 'lunch', label: 'Mittag', hours: '11–15', icon: Sun, match: /mittag|lunch/i },
  { id: 'dinner', label: 'Abend', hours: '17–21', icon: Utensils, match: /abend|dinner|abendessen/i },
  { id: 'snack', label: 'Snacks', hours: 'zwischendurch', icon: Sandwich, match: /snack|zwischen/i },
];

const CATEGORY_ALIASES: Record<string, string> = {
  breakfast: 'breakfast',
  fruehstueck: 'breakfast',
  lunch: 'lunch',
  mittag: 'lunch',
  dinner: 'dinner',
  abend: 'dinner',
  snack: 'snack',
};

function bucketOf(entry: FoodEntry): string {
  const category = CATEGORY_ALIASES[String(entry.category ?? '').toLowerCase()];
  if (category) return category;
  const meal = String(entry.meal ?? '');
  const hit = MEALS.find((item) => item.match.test(meal));
  return hit?.id ?? 'snack';
}

export default function FoodPage() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayYmd());
  /** Tagesleiste: darin wird der gewählte Tag automatisch in den Blick gescrollt. */
  const tageLeiste = useRef<HTMLDivElement | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [monat, setMonat] = useState<FoodEntry[]>([]);
  /** Kalorienverbrauch von der Uhr: Aktivkalorien des heutigen Tages. */
  const [verbrauch, setVerbrauch] = useState<{ aktiv: number } | null>(null);
  const [trainingDay, setTrainingDay] = useState(false);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  /** Eintrag, dessen Löschung bestätigt werden soll. */
  const [loeschKandidat, setLoeschKandidat] = useState<{ id: string; name: string } | null>(null);
  /** Offener Barcode-/QR-Scanner und die Mahlzeit, in die gescannt wird. */
  const [scanFor, setScanFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  /** Gerichte aus dem verbundenen Mealplanner für die Schnellerfassung. */
  const [gerichte, setGerichte] = useState<MealplanerGericht[]>([]);
  const [schnellBusy, setSchnellBusy] = useState<string | null>(null);
  /** Offene Rezeptkarte aus dem Mealplanner (Klick auf die Vorlage). */
  const [rezeptOffen, setRezeptOffen] = useState<{ gericht: MealplanerGericht; kategorie: string } | null>(null);

  const load = useCallback(async () => {
    setLaedt(true);
    try {
      // Ein Aufruf fuer 30 Tage statt 30 einzelne
      const [month, plan, mp] = await Promise.all([
        fetchMonth(),
        fetchActivePlan().catch(() => null),
        fetchMealplannerGerichte(),
      ]);
      setMonat(month);
      setEntries(month.filter((e) => toYmd(e.date) === date));
      setGerichte(mp);

      /*
       * Aktivkalorien der Uhr für heute holen. Das Tagesziel enthält den
       * Grundumsatz; die Aktivkalorien kommen obendrauf. Ohne diesen Abruf sieht
       * man an einem Lauftag nicht, warum mehr Kalorien offen sind.
       */
      api<{ aktivitaeten?: Array<Record<string, unknown>> }>('/api/integrations/garmin/activities?limit=20')
        .then((r) => {
          const liste = Array.isArray(r.aktivitaeten) ? r.aktivitaeten : [];
          const heutige = liste.filter(
            (e) => String(e.date ?? e.start_date_local ?? '').slice(0, 10) === todayYmd(),
          );
          const aktiv = heutige.reduce((a, e) => a + (Number(e.calories) || 0), 0);
          setVerbrauch(aktiv > 0 ? { aktiv: Math.round(aktiv) } : null);
        })
        .catch(() => {});

      const key = dayKeyOf(date);
      const day = (plan?.week?.schedule ?? []).find((d) => d.day === key);
      setTrainingDay(Boolean(day && !day.isRest));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht laden.');
    } finally {
      setLaedt(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = totals(entries);
  const goals = (profile?.goals ?? {}) as {
    dailyCalories?: number;
    macros?: { protein?: number; carbs?: number; fat?: number };
    fasting?: FastingPlan;
  };

  /**
   * Fastenplan → welche Mahlzeiten liegen außerhalb des Essensfensters?
   * Bei 20:4 (Essen 16–20 Uhr) sind Frühstück und Mittag gesperrt. Die Zeiten
   * kommen aus der MEALS-Liste, damit Markierung und Anzeige zusammenpassen.
   */
  const fastenSperre = useMemo(() => {
    const plan = goals.fasting;
    const leer = new Map<string, 'gesperrt' | 'teilweise'>();
    if (!plan || !isValidPlan(plan)) return leer;
    const zeitFenster: Record<string, [string, string]> = {
      breakfast: ['06:00', '10:00'],
      lunch: ['11:00', '15:00'],
      dinner: ['17:00', '21:00'],
      snack: ['15:00', '17:00'],
    };
    const karte = new Map<string, 'gesperrt' | 'teilweise'>();
    for (const [id, [von, bis]] of Object.entries(zeitFenster)) {
      const r = liegtImFasten(plan, von, bis);
      if (r.komplett) karte.set(id, 'gesperrt');
      else if (r.teilweise) karte.set(id, 'teilweise');
    }
    return karte;
  }, [goals.fasting]);
  // An Trainingstagen mehr Kalorien und Kohlenhydrate — wie bei MacroBurn.
  const kcalBoost = trainingDay ? 1.12 : 1;
  const carbBoost = trainingDay ? 55 : 0;
  const basisKcal = Math.round(Number(goals.dailyCalories) || 2400);
  const goalProtein = Number(goals.macros?.protein) || 180;
  const goalCarbs = (Number(goals.macros?.carbs) || 240) + carbBoost;
  const goalFat = Number(goals.macros?.fat) || 80;
  /**
   * Gemeinsames Tagesbudget: Ziel (inkl. Trainingszuschlag) plus die heute von der
   * Uhr verbrauchten Aktivkalorien. Ring, „noch übrig" und die Aufschlüsselung
   * müssen dieselbe Zahl verwenden — sonst widersprechen sie sich.
   */
  const goalKcal = Math.round(basisKcal * kcalBoost) + (verbrauch?.aktiv ?? 0);
  const remaining = Math.round(goalKcal - sum.kcal);
  const ueber = sum.kcal > goalKcal;
  const isToday = date === todayYmd();

  const grouped = MEALS.map((meal) => {
    const liste = entries.filter((entry) => bucketOf(entry) === meal.id);
    return {
      ...meal,
      entries: liste,
      kcal: liste.reduce((acc, entry) => acc + (Number(entry.calories) || 0), 0),
      protein: liste.reduce((acc, entry) => acc + (Number(entry.protein) || 0), 0),
    };
  });

  /**
   * Vorlage aus dem Mealplanner — nur für HEUTE und nur die passende Mahlzeit.
   *
   * Der Mealplanner kennt die Slots fruehstueck/mittag/abend/snack; hier heißen sie
   * breakfast/lunch/dinner/snack. Was an einem anderen Tag liegt, wird bewusst
   * ignoriert: die Vorlage gehört zum heutigen Tag.
   */
  const SLOT_ZU_MAHLZEIT: Record<string, string> = {
    fruehstueck: 'breakfast',
    mittag: 'lunch',
    abend: 'dinner',
    mahlzeit: 'dinner', // unspezifischer Eintrag landet beim Abendessen
    snack: 'snack',
  };

  const vorlageProMahlzeit = useMemo(() => {
    const karte = new Map<string, MealplanerGericht>();
    // Nur heute: das Datum der Seite muss der heutige Tag sein.
    if (date !== todayYmd()) return karte;
    // Der Mealplanner liefert tagIndex (Montag = 0); fehlt er, zählt der Wochentagsname.
    const heuteIndex = (new Date().getDay() + 6) % 7;
    const heuteName = new Date().toLocaleDateString('de-DE', { weekday: 'long' }).toLowerCase();
    for (const g of gerichte) {
      const index = (g as { tagIndex?: number }).tagIndex;
      const istHeute =
        typeof index === 'number'
          ? index === heuteIndex
          : String(g.tag ?? '').toLowerCase() === heuteName;
      if (!istHeute) continue;
      const ziel = SLOT_ZU_MAHLZEIT[String(g.mahlzeit ?? '').toLowerCase()] ?? 'dinner';
      if (!karte.has(ziel)) karte.set(ziel, g);
    }
    return karte;
  }, [gerichte, date]);

  // Gewählten Tag in den sichtbaren Bereich holen — auch wenn er weit hinten liegt.
  useEffect(() => {
    const leiste = tageLeiste.current;
    if (!leiste) return;
    const aktiv = leiste.querySelector<HTMLElement>('[data-aktiv="1"]');
    if (aktiv) {
      aktiv.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [date]);

  // Auswertungen über 30 Tage
  const map = useMemo(() => kcalByDay(monat), [monat]);
  const oKcal = kcalDurchschnitt(monat, 7);
  const erfasst7 = erfassteTage(monat, 7);
  const erfasst30 = erfassteTage(monat, 30);
  const verlauf = Array.from({ length: 14 }, (_, i) => {
    const ymd = shiftYmdLocal(date, -(13 - i));
    return { ymd, kcal: map.get(ymd) ?? 0 };
  });
  const hatVerlauf = verlauf.some((v) => v.kcal > 0);
  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const ymd = shiftYmdLocal(date, -(83 - i));
    return { ymd, value: map.get(ymd) ?? 0 };
  });

  // Mahlzeiten-Verteilung heute
  const verteilung = grouped
    .map((m) => ({ label: m.label, wert: m.kcal }))
    .filter((m) => m.wert > 0);
  const maxVerteilung = Math.max(1, ...verteilung.map((v) => v.wert));

  // Protein pro Kalorie — zeigt, ob genug Eiweiß drin ist
  const proteinProKcal = sum.kcal > 0 ? (sum.protein / sum.kcal) * 100 : 0;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={isToday ? 'Heute' : formatDay(date)}
        title="Ernährung"
        hint={`${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'} · ${trainingDay ? 'Trainingstag' : 'Ruhetag'} · Ziel ${goalKcal} kcal`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <GhostButton onClick={() => setDate(shiftYmd(date, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </GhostButton>
            <GhostButton onClick={() => setDate(shiftYmd(date, 1))} disabled={isToday}>
              <ChevronRight className="h-3.5 w-3.5" />
            </GhostButton>
            <PrimaryButton onClick={() => setSheetFor('lunch')}>
              <Camera className="h-4 w-4" /> Erfassen
            </PrimaryButton>
          </div>
        }
      />

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Gegessen"
          value={Math.round(sum.kcal)}
          unit="kcal"
          hint={
            ueber
              ? `${Math.round(sum.kcal - goalKcal).toLocaleString('de-DE')} über Budget`
              : `noch ${remaining.toLocaleString('de-DE')} übrig`
          }
          tone={ueber ? 'warn' : sum.kcal > 0 ? 'accent' : 'muted'}
        />
        <StatTile
          label="Ø 7 Tage"
          value={oKcal || '—'}
          unit={oKcal ? 'kcal' : undefined}
          hint={erfasst7 ? `${erfasst7} von 7 Tagen erfasst` : 'Keine Daten'}
          tone={oKcal > 0 ? 'default' : 'muted'}
        />
        <StatTile
          label="Protein"
          value={Math.round(sum.protein)}
          unit={`/ ${goalProtein} g`}
          hint={proteinProKcal > 0 ? `${proteinProKcal.toFixed(1)} g pro 100 kcal` : 'Noch nichts erfasst'}
          tone={sum.protein >= goalProtein ? 'accent' : sum.protein > 0 ? 'default' : 'muted'}
        />
        <StatTile
          label="Erfasste Tage"
          value={erfasst30}
          unit="von 30"
          hint={erfasst30 >= 25 ? 'Sehr konsequent' : erfasst30 >= 15 ? 'Gute Spur' : 'Luft nach oben'}
          tone={erfasst30 >= 25 ? 'accent' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* Tagesring */}
        <Card className="flex min-w-0 flex-col p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {ueber ? 'Über dem Ziel' : 'Noch übrig'}
              </p>
              <p
                className="text-3xl font-semibold leading-tight tabular-nums"
                style={{ color: ueber ? '#f87171' : undefined }}
              >
                {Math.abs(remaining)}
                <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">kcal</span>
              </p>
            </div>
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                trainingDay
                  ? 'bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                  : 'bg-[var(--border-muted)]/50 text-[var(--text-muted)]'
              }`}
            >
              {trainingDay ? <Dumbbell className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
              {trainingDay ? 'Trainingstag' : 'Ruhetag'}
            </span>
          </div>

          <div className="mt-2 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <Ring value={sum.kcal} max={goalKcal} label="gegessen" unit="kcal" size={132} />
            <div className="w-full flex-1 space-y-3">
              <MacroBar label="Protein" value={sum.protein} max={goalProtein} />
              <MacroBar label="Kohlenhydrate" value={sum.carbs} max={goalCarbs} />
              <MacroBar label="Fett" value={sum.fat} max={goalFat} />
            </div>
          </div>

          {/* Tagesbilanz offenlegen: Grundumsatz + Aktivkalorien = Bedarf, davon gegessen abziehen. */}
          {verbrauch && (
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2.5">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Grundumsatz
                </p>
                <p className="mt-0.5 text-[13.5px] font-semibold tabular-nums">
                  {basisKcal.toLocaleString('de-DE')}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--simple-accent)]">
                  + Aktivität
                </p>
                <p className="mt-0.5 text-[13.5px] font-semibold tabular-nums text-[var(--simple-accent)]">
                  {verbrauch.aktiv.toLocaleString('de-DE')}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Noch offen
                </p>
                <p className="mt-0.5 text-[13.5px] font-semibold tabular-nums">
                  {remaining.toLocaleString('de-DE')}
                </p>
              </div>
            </div>
          )}

          {trainingDay && (
            <p className="mt-3 rounded-lg bg-[var(--simple-accent-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--simple-accent)]">
              Trainingstag: Ziel um 12 % angehoben ({Math.round(goalKcal - (Number(goals.dailyCalories) || 2400))} kcal
              mehr) und {carbBoost} g mehr Kohlenhydrate.
            </p>
          )}

          {verteilung.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-[var(--border-muted)] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Verteilung heute
              </p>
              {verteilung.map((v) => (
                <BarRow key={v.label} label={v.label} value={v.wert} max={maxVerteilung} caption={`${Math.round(v.wert)}`} />
              ))}
            </div>
          )}
        </Card>

        {/* Woche */}
        <Card className="flex min-w-0 flex-col p-5">
          <SectionTitle action={<GhostButton onClick={() => setDate(todayYmd())}>Heute</GhostButton>}>
            Woche
          </SectionTitle>
          {/*
           * 30 Tage waagerecht scrollbar. Vorher waren es nur 7 Tage ab dem
           * gewählten Datum — sobald man einen älteren Tag öffnete, verschwand
           * die Möglichkeit zurückzugehen und man hing am „Heute"-Button.
           */}
          <div
            ref={tageLeiste}
            className="scrollbar-hide flex flex-1 items-stretch gap-1 overflow-x-auto pb-1"
          >
            {Array.from({ length: 30 }, (_, i) => shiftYmd(todayYmd(), -(29 - i))).map((ymd) => {
              const active = ymd === date;
              const kcal = map.get(ymd) ?? 0;
              const anteil = Math.min(1, kcal / Math.max(1, Number(goals.dailyCalories) || 2400));
              const istHeute = ymd === todayYmd();
              return (
                <button
                  key={ymd}
                  data-aktiv={active ? '1' : undefined}
                  onClick={() => setDate(ymd)}
                  className={`flex min-h-[104px] w-12 shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition ${
                    active ? 'bg-[var(--simple-accent-soft)]' : 'hover:bg-[var(--border-muted)]/40'
                  }`}
                  title={`${ymd}${kcal > 0 ? ` · ${Math.round(kcal)} kcal` : ' · nichts erfasst'}`}
                >
                  <span
                    className={`text-[10px] ${
                      active
                        ? 'font-semibold text-[var(--simple-accent)]'
                        : istHeute
                          ? 'font-semibold text-[var(--foreground)]'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {dayLabelShort(ymd)}
                  </span>
                  {/* Datum als dd.mm direkt über dem Balken */}
                  <span
                    className={`text-[9px] leading-none tabular-nums ${
                      active
                        ? 'text-[var(--simple-accent)]'
                        : 'text-[var(--text-muted)] opacity-80'
                    }`}
                  >
                    {ymd.slice(8, 10)}.{ymd.slice(5, 7)}.
                  </span>
                  {/* Balken füllt die restliche Kartenhöhe */}
                  <div className="flex w-full flex-1 items-end overflow-hidden rounded-md bg-[var(--border-muted)]">
                    <div
                      className="w-full rounded-md transition-[height] duration-500"
                      style={{
                        height: `${Math.max(kcal > 0 ? 6 : 0, anteil * 100)}%`,
                        background: 'var(--simple-accent)',
                        opacity: active ? 1 : 0.55,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Mahlzeiten */}
      <div className="grid gap-4 sm:grid-cols-2">
        {grouped.map((meal) => {
          const Icon = meal.icon;
          const anteil = goalKcal > 0 ? Math.round((meal.kcal / goalKcal) * 100) : 0;
          // Vorlage aus dem Mealplanner für genau diese Mahlzeit (nur heute).
          const vorlage = vorlageProMahlzeit.get(meal.id) ?? null;
          // Liegt diese Mahlzeit im Fastenfenster? Dann deutlich markieren.
          const fasten = fastenSperre.get(meal.id) ?? null;
          const gesperrt = fasten === 'gesperrt';
          return (
            <Card
              key={meal.id}
              className={`flex flex-col p-5 ${
                gesperrt ? 'border-[#f87171]/40 bg-[#f87171]/5' : ''
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    gesperrt
                      ? 'bg-[#f87171]/15 text-[#f87171]'
                      : 'bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${gesperrt ? 'text-[#f87171]' : ''}`}>
                    {meal.label}
                  </p>
                  <p className="text-[10.5px] text-[var(--text-muted)]">
                    {meal.hours}
                    {gesperrt ? ' · Fastenzeit' : fasten === 'teilweise' ? ' · teils Fastenzeit' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{Math.round(meal.kcal)}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {anteil ? `${anteil} %` : 'kcal'}
                  </p>
                </div>
              </div>

              {meal.entries.length === 0 ? (
                <div className="my-2 flex-1">
                  {vorlage ? (
                    <button
                      type="button"
                      disabled={Boolean(schnellBusy)}
                      onClick={() => setRezeptOffen({ gericht: vorlage, kategorie: meal.id })}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[var(--simple-accent)]/50 bg-[var(--simple-accent-soft)]/40 px-3 py-2.5 text-left transition hover:border-[var(--simple-accent)] disabled:opacity-50"
                      title="Rezept ansehen und eintragen"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--simple-accent)] text-white">
                        {schnellBusy === meal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{vorlage.titel}</span>
                        <span className="block text-[11px] text-[var(--text-muted)]">
                          aus dem Mealplanner
                          {vorlage.kcal ? ` · ${vorlage.kcal} kcal` : ''}
                          {vorlage.protein ? ` · ${Math.round(vorlage.protein)} P` : ''}
                          {vorlage.carbs ? ` · ${Math.round(vorlage.carbs)} KH` : ''}
                          {vorlage.fat ? ` · ${Math.round(vorlage.fat)} F` : ''}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <p className="py-3 text-center text-[11.5px] text-[var(--text-muted)]">
                      Noch nichts eingetragen
                    </p>
                  )}
                </div>
              ) : (
                <ul className="my-2 flex-1 divide-y divide-[var(--border-muted)]">
                  {meal.entries.map((entry) =>
                    editId === entry.id ? (
                      <MealEditRow
                        key={entry.id}
                        entry={entry}
                        onSaved={() => {
                          setEditId(null);
                          void load();
                        }}
                        onCancel={() => setEditId(null)}
                      />
                    ) : (
                    <li key={entry.id} className="flex items-center gap-2 py-2">
                      {/* Klick auf den Namen oeffnet die Karte zum Gericht (Zutaten, Portionen). */}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left transition hover:opacity-80"
                        onClick={() => {
                          const ausPlan = gerichte.find(
                            (g) => g.titel.trim().toLowerCase() === String(entry.meal).trim().toLowerCase(),
                          );
                          if (ausPlan) {
                            setRezeptOffen({ gericht: ausPlan, kategorie: meal.id });
                          } else {
                            setEditId(entry.id);
                          }
                        }}
                        aria-label={`${entry.meal} öffnen`}
                      >
                        <p className="truncate text-[13px]">{entry.meal}</p>
                        <p className="text-[10.5px] text-[var(--text-muted)]">
                          {Math.round(Number(entry.protein) || 0)} P · {Math.round(Number(entry.carbs) || 0)} K ·{' '}
                          {Math.round(Number(entry.fat) || 0)} F
                        </p>
                      </button>
                      <span className="text-[13px] font-semibold tabular-nums">
                        {Math.round(Number(entry.calories) || 0)}
                      </span>
                      <button
                        className="rounded-md p-1 text-[var(--text-muted)] transition hover:text-[var(--simple-clay)]"
                        onClick={() => setLoeschKandidat({ id: entry.id, name: entry.meal })}
                        aria-label="Löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                    ),
                  )}
                </ul>
              )}

              <GhostButton onClick={() => setSheetFor(meal.id)}>
                <Plus className="h-3.5 w-3.5" /> Hinzufügen
              </GhostButton>
            </Card>
          );
        })}
      </div>

      {/* Verlauf */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <Card className="flex min-w-0 flex-col p-5 lg:col-span-2">
          <SectionTitle
            action={
              <span className="text-[11px] text-[var(--text-muted)]">
                Ziel {goalKcal} kcal
                {verbrauch?.aktiv ? ` (inkl. ${verbrauch.aktiv} aktiv)` : ''}
              </span>
            }
          >
            Kalorien · 14 Tage
          </SectionTitle>
          {hatVerlauf ? (
            <>
              <Sparkline values={verlauf.map((v) => v.kcal)} goal={goalKcal} height={64} einheit="kcal" minY={0} />
              {/* Tag antippen, um ihn zu laden */}
              <div className="mt-1 flex gap-1 text-[9.5px] text-[var(--text-muted)]">
                {verlauf.map((v, i) => (
                  <button
                    key={v.ymd}
                    type="button"
                    onClick={() => setDate(v.ymd)}
                    className="flex-1 rounded transition hover:bg-[var(--surface-gray)]"
                  >
                    <span className={v.ymd === date ? 'font-semibold text-[var(--simple-accent)]' : ''}>
                      {i % 2 === 0 ? dayLabelShort(v.ymd) : ''}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Tippe einen Tag an, um ihn zu öffnen.
              </p>
            </>
          ) : (
            <EmptyState
              icon={<Utensils className="h-6 w-6" />}
              title="Noch kein Verlauf"
              hint="Erfasse ein paar Tage, dann siehst du hier deine Kurve."
            />
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Erfassung · 12 Wochen</SectionTitle>
          <Heatmap days={heatmap} weeks={12} />
          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            Je dunkler, desto mehr Kalorien an dem Tag.
          </p>
        </Card>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      <ConfirmDialog
        open={Boolean(loeschKandidat)}
        title="Eintrag löschen?"
        message={loeschKandidat ? `„${loeschKandidat.name}" wird aus dem Tag entfernt.` : undefined}
        confirmLabel="Löschen"
        variant="danger"
        onCancel={() => setLoeschKandidat(null)}
        onConfirm={() => loeschKandidat && void remove(loeschKandidat.id)}
      />

      {rezeptOffen && (
        <MealplannerRezeptSheet
          gericht={rezeptOffen.gericht}
          kategorie={rezeptOffen.kategorie}
          datum={date}
          onClose={() => setRezeptOffen(null)}
          onSaved={() => void load()}
        />
      )}

      {sheetFor && (
        <PhotoMealSheet
          date={date}
          initialCategory={sheetFor}
          onClose={() => setSheetFor(null)}
          onSaved={() => void load()}
          onScan={() => {
            const ziel = sheetFor;
            setSheetFor(null);
            setScanFor(ziel);
          }}
        />
      )}

      {scanFor && (
        <BarcodeSheet
          category={scanFor}
          date={date}
          onClose={() => setScanFor(null)}
          onSaved={() => {
            setScanFor(null);
            void load();
          }}
        />
      )}
    </div>
  );

  async function remove(id: string) {
    try {
      await deleteFood(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    } finally {
      setLoeschKandidat(null);
    }
  }
}
