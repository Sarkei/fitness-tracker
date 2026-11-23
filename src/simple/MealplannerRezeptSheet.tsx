/**
 * Rezeptkarte für die Schnellerfassung aus dem Mealplanner.
 *
 * Öffnet sich beim Antippen der Vorlage im Essen-Tab und zeigt Zutaten und
 * Zubereitung wie im Mealplanner. Die Portionenzahl ist einstellbar — getrackt wird
 * standardmäßig eine Portion, alle Nährwerte rechnen sich anteilig mit.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import {
  addFoodEntry,
  fetchMealplannerRezept,
  type MealplannerRezept,
  type MealplanerGericht,
} from './simpleApi';

type Props = {
  gericht: MealplanerGericht;
  /** Mahlzeit-Bucket im Fitness-Tracker: breakfast, lunch, dinner, snack. */
  kategorie: string;
  datum: string;
  onClose: () => void;
  onSaved: () => void;
};

function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : 0;
}

/** Zutat als lesbare Zeile („200 g Reis" oder nur „Salz"). */
function zutatZeile(zutat: { name?: string; amount?: number | string; unit?: string } | string): string {
  if (typeof zutat === 'string') return zutat;
  const teile = [
    zutat.amount != null ? String(zutat.amount) : '',
    zutat.unit ?? '',
    zutat.name ?? '',
  ].filter(Boolean);
  return teile.join(' ').trim();
}

function schrittText(schritt: { text?: string } | string): string {
  return typeof schritt === 'string' ? schritt : String(schritt?.text ?? '');
}

export default function MealplannerRezeptSheet({ gericht, kategorie, datum, onClose, onSaved }: Props) {
  const [rezept, setRezept] = useState<MealplannerRezept | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [portionen, setPortionen] = useState(1);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      if (!gericht.rezeptId) {
        setLaedt(false);
        return;
      }
      const r = await fetchMealplannerRezept(gericht.rezeptId);
      if (!abgebrochen) {
        setRezept(r);
        setLaedt(false);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [gericht.rezeptId]);

  /** Nährwerte je Portion — aus dem Rezept, sonst aus dem Planeintrag. */
  const proPortion = useMemo(() => {
    const n = rezept?.nutrition ?? null;
    return {
      kcal: zahl(n?.kcal) || zahl(gericht.kcal),
      protein: zahl(n?.protein) || zahl(gericht.protein),
      carbs: zahl(n?.carbs) || zahl(gericht.carbs),
      fat: zahl(n?.fat) || zahl(gericht.fat),
    };
  }, [rezept, gericht]);

  const gesamt = {
    kcal: Math.round(proPortion.kcal * portionen),
    protein: Math.round(proPortion.protein * portionen),
    carbs: Math.round(proPortion.carbs * portionen),
    fat: Math.round(proPortion.fat * portionen),
  };

  const speichern = async () => {
    setSpeichert(true);
    setFehler(null);
    try {
      await addFoodEntry({
        meal: gericht.titel,
        category: kategorie,
        calories: gesamt.kcal,
        protein: gesamt.protein,
        carbs: gesamt.carbs,
        fat: gesamt.fat,
        date: datum,
      });
      onSaved();
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Eintragen fehlgeschlagen.');
    } finally {
      setSpeichert(false);
    }
  };

  const zutaten = (rezept?.ingredients ?? []).map(zutatZeile).filter(Boolean);
  const schritte = (rezept?.steps ?? []).map(schrittText).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-muted)] p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Aus dem Mealplanner
            </p>
            <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">
              {rezept?.title ?? gericht.titel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--background)]"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {laedt && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Rezept wird geladen …
            </p>
          )}

          {!laedt && rezept?.description && (
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">{rezept.description}</p>
          )}

          {!laedt && (rezept?.prep_minutes || rezept?.total_minutes || rezept?.difficulty) && (
            <p className="text-[11px] text-[var(--text-muted)]">
              {[
                rezept?.prep_minutes ? `${rezept.prep_minutes} min Vorbereitung` : '',
                rezept?.total_minutes ? `${rezept.total_minutes} min gesamt` : '',
                rezept?.difficulty ?? '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {zutaten.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Zutaten
              </p>
              <ul className="space-y-1">
                {zutaten.map((z, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--simple-accent)]">•</span>
                    <span>{z}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {schritte.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Zubereitung
              </p>
              <ol className="space-y-2">
                {schritte.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--text-primary)]">
                    <span className="shrink-0 font-semibold text-[var(--simple-accent)]">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!laedt && !zutaten.length && !schritte.length && (
            <p className="text-[12px] text-[var(--text-muted)]">
              Für dieses Gericht sind im Mealplanner keine Zutaten hinterlegt.
            </p>
          )}
        </div>

        {/* Portionen + Nährwerte + Speichern */}
        <div className="shrink-0 space-y-3 border-t border-[var(--border-muted)] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Portionen
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPortionen((p) => Math.max(1, p - 1))}
                disabled={portionen <= 1 || speichert}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-muted)] text-[var(--text-primary)] transition disabled:opacity-40"
                aria-label="Eine Portion weniger"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{portionen}</span>
              <button
                type="button"
                onClick={() => setPortionen((p) => Math.min(10, p + 1))}
                disabled={portionen >= 10 || speichert}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-muted)] text-[var(--text-primary)] transition disabled:opacity-40"
                aria-label="Eine Portion mehr"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 rounded-xl bg-[var(--background)] p-2.5 text-center">
            <div>
              <p className="text-[13px] font-semibold tabular-nums">{gesamt.kcal}</p>
              <p className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">kcal</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold tabular-nums">{gesamt.protein}</p>
              <p className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Protein</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold tabular-nums">{gesamt.carbs}</p>
              <p className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">KH</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold tabular-nums">{gesamt.fat}</p>
              <p className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Fett</p>
            </div>
          </div>

          {fehler && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-600">{fehler}</p>
          )}

          <button
            type="button"
            onClick={() => void speichern()}
            disabled={speichert}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--simple-accent)] px-4 py-3 text-[12px] font-semibold text-white transition disabled:opacity-50"
          >
            {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {portionen === 1 ? '1 Portion eintragen' : `${portionen} Portionen eintragen`}
          </button>
        </div>
      </div>
    </div>
  );
}
