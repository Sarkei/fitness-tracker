/**
 * Tagesdetail: ein einzelner Tag mit allem, was dazu vorliegt.
 *
 * Wird von allen Wellness-Unterseiten genutzt — Klick auf einen Tag in einer
 * Tabelle oder auf einen Balken öffnet diese Ansicht. Je nach Bereich wird nur
 * gezeigt, was dort hingehört (Schlaf-Seite → Schlafdetails usw.).
 */

import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { formLabel, schlafBewertung, schlafStunden, type WellnessAktivitaet, type WellnessTag } from '@/src/lib/wellness';

/** Zeile mit Bezeichnung links und Wert rechts. Nur zeigen, wenn ein Wert da ist. */
function Zeile({ label, wert, einheit }: { label: string; wert: string | number | null | undefined; einheit?: string }) {
  if (wert == null || wert === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-muted)] py-1.5 last:border-0">
      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
        {wert}
        {einheit ? <span className="ml-1 text-[10.5px] font-normal text-[var(--text-muted)]">{einheit}</span> : null}
      </span>
    </div>
  );
}

function Block({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-muted)] p-3">
      <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{titel}</p>
      {children}
    </div>
  );
}

function datumLang(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export type TagesdetailFokus = 'alle' | 'schlaf' | 'bewegung' | 'koerper' | 'form';

export function Tagesdetail({
  tag,
  aktivitaeten,
  fokus = 'alle',
  onClose,
}: {
  tag: WellnessTag;
  aktivitaeten: WellnessAktivitaet[];
  fokus?: TagesdetailFokus;
  onClose: () => void;
}) {
  const schlaf = schlafStunden(tag.sleepSecs);
  const form = formLabel(tag.tsb);
  const tagAktivitaeten = aktivitaeten.filter((a) => String(a.start_date_local ?? '').slice(0, 10) === tag.date);

  const zeigeSchlaf = fokus === 'alle' || fokus === 'schlaf';
  const zeigeBewegung = fokus === 'alle' || fokus === 'bewegung';
  const zeigeKoerper = fokus === 'alle' || fokus === 'koerper';
  const zeigeForm = fokus === 'alle' || fokus === 'form';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-hidden rounded-t-[1.75rem] bg-[var(--card-bg)] shadow-2xl sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-muted)] p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tag</p>
            <h2 className="text-base font-semibold text-[var(--foreground)]">{datumLang(tag.date)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92dvh-4.5rem)] space-y-3 overflow-y-auto p-4">
          {zeigeSchlaf && (schlaf != null || tag.sleepScore != null) && (
            <Block titel="Schlaf">
              <Zeile label="Dauer" wert={schlaf != null ? schlaf.toFixed(1) : null} einheit="h" />
              <Zeile label="Score" wert={tag.sleepScore != null ? Math.round(tag.sleepScore) : null} />
              <Zeile
                label="Bewertung"
                wert={tag.sleepScore != null ? schlafBewertung(tag.sleepScore) : null}
              />
            </Block>
          )}

          {zeigeBewegung && (tag.steps != null || tag.floors != null) && (
            <Block titel="Bewegung">
              <Zeile label="Schritte" wert={tag.steps != null ? Math.round(tag.steps).toLocaleString('de-DE') : null} />
              <Zeile label="Etagen" wert={tag.floors != null ? Math.round(tag.floors) : null} />
            </Block>
          )}

          {zeigeKoerper && (tag.hrv != null || tag.restingHr != null || (tag.weight != null && tag.weight > 0)) && (
            <Block titel="Herz & Körper">
              <Zeile label="HRV" wert={tag.hrv != null ? Math.round(tag.hrv) : null} einheit="ms" />
              <Zeile label="Ruhepuls" wert={tag.restingHr != null ? Math.round(tag.restingHr) : null} einheit="bpm" />
              {tag.weight != null && tag.weight > 0 && (
                <Zeile label="Gewicht" wert={tag.weight.toFixed(1)} einheit="kg" />
              )}
            </Block>
          )}

          {zeigeForm && (tag.ctl != null || tag.atl != null || tag.tsb != null) && (
            <Block titel="Trainingsbelastung">
              <Zeile label="Fitness (CTL)" wert={tag.ctl != null ? Math.round(tag.ctl) : null} />
              <Zeile label="Ermüdung (ATL)" wert={tag.atl != null ? Math.round(tag.atl) : null} />
              <Zeile label="Form (TSB)" wert={tag.tsb != null ? Math.round(tag.tsb) : null} />
              <Zeile label="Zustand" wert={form.text} />
            </Block>
          )}

          {tagAktivitaeten.length > 0 && (
            <Block titel="Einheiten an diesem Tag">
              <div className="space-y-2">
                {tagAktivitaeten.map((a) => (
                  <div key={a.id} className="rounded-lg bg-[var(--surface-gray)] px-2.5 py-2">
                    <p className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {a.name ?? a.type ?? 'Einheit'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {a.distance ? `${(a.distance / 1000).toFixed(2)} km` : ''}
                      {a.moving_time ? ` · ${Math.round(a.moving_time / 60)} min` : ''}
                      {a.icu_training_load ? ` · Last ${Math.round(a.icu_training_load)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {!zeigeSchlaf && !zeigeBewegung && !zeigeKoerper && !zeigeForm && tagAktivitaeten.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-[var(--text-muted)]">
              Für diesen Tag liegen keine Werte vor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Zeile in einer Tagestabelle: klickbar, mit Hover. */
export function TagesZeile({
  onClick,
  aktiv,
  children,
}: {
  onClick: () => void;
  aktiv?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'cursor-pointer transition hover:bg-[var(--surface-gray)]',
        aktiv && 'bg-[var(--surface-gray)]',
      )}
    >
      {children}
    </tr>
  );
}
