/**
 * Detailansicht einer Einheit — im Vollbild.
 *
 * Zeigt alles, was die Quelle zu dieser Einheit hat: Distanz, Dauer, Tempo bzw.
 * Schnitt, Puls (Ø, max, min), Kalorien, Aufstieg, Startzeit und Typ. Öffnet sich
 * als Vollbild-Overlay, weil Tim bei einer Einheit alle Werte auf einen Blick
 * sehen will und nicht in einem kleinen Sheet scrollen möchte.
 */

import { X, Activity, Clock, Zap, Mountain, Heart, MapPin, TrendingUp } from 'lucide-react';
import {
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

export type EinheitDaten = {
  id?: string;
  name?: string | null;
  type?: string | null;
  datum?: string | null;
  start_date_local?: string | null;
  date?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  duration?: number | null;
  average_hr?: number | null;
  averageHr?: number | null;
  max_hr?: number | null;
  maxHr?: number | null;
  min_hr?: number | null;
  calories?: number | null;
  elevation?: number | null;
  total_elevation_gain?: number | null;
  average_speed?: number | null;
  source?: string | null;
};

/** Deutsche Bezeichnung für Garmins Aktivitätstypen. */
function typLabel(typ?: string | null): string {
  const t = String(typ ?? '').toLowerCase();
  const tabelle: Record<string, string> = {
    running: 'Laufen',
    trail_running: 'Trailrunning',
    treadmill_running: 'Laufband',
    walking: 'Gehen',
    hiking: 'Wandern',
    cycling: 'Radfahren',
    indoor_cycling: 'Indoor-Rad',
    swimming: 'Schwimmen',
    strength_training: 'Krafttraining',
    cardio_training: 'Cardio',
    yoga: 'Yoga',
    rowing: 'Rudern',
    elliptical: 'Crosstrainer',
    other: 'Sonstige',
    run: 'Laufen',
    ride: 'Radfahren',
    swim: 'Schwimmen',
    weighttraining: 'Krafttraining',
    workout: 'Training',
  };
  return tabelle[t] ?? (typ ? String(typ) : 'Einheit');
}

function km(meter?: number | null): string | null {
  if (meter == null || !Number.isFinite(meter)) return null;
  return `${(meter / 1000).toFixed(2)} km`;
}

function dauer(sekunden?: number | null): string | null {
  if (sekunden == null || !Number.isFinite(sekunden) || sekunden <= 0) return null;
  const h = Math.floor(sekunden / 3600);
  const m = Math.round((sekunden % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function tempo(meter?: number | null, sekunden?: number | null): string | null {
  if (!meter || !sekunden || meter <= 0 || sekunden <= 0) return null;
  const sekProKm = sekunden / (meter / 1000);
  const m = Math.floor(sekProKm / 60);
  const s = Math.round(sekProKm % 60);
  return `${m}:${String(s).padStart(2, '0')} min/km`;
}

function geschwindigkeit(meter?: number | null, sekunden?: number | null): string | null {
  if (!meter || !sekunden || meter <= 0 || sekunden <= 0) return null;
  return `${((meter / 1000) / (sekunden / 3600)).toFixed(1)} km/h`;
}

function zeitpunkt(e: EinheitDaten): string | null {
  const roh = e.start_date_local ?? e.date ?? e.datum ?? null;
  if (!roh) return null;
  const d = new Date(String(roh).length <= 10 ? `${roh}T12:00:00` : String(roh));
  if (Number.isNaN(d.getTime())) return String(roh).slice(0, 10);
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function EinheitDetailModal({
  einheit,
  onClose,
}: {
  einheit: EinheitDaten | null;
  onClose: () => void;
}) {
  useMobileOverlaySheet(Boolean(einheit));
  if (!einheit) return null;

  const e = einheit;
  const distanz = km(e.distance);
  const dauerWert = dauer(e.moving_time ?? e.duration ?? e.elapsed_time);
  const pulsAvg = e.average_hr ?? e.averageHr ?? null;
  const pulsMax = e.max_hr ?? e.maxHr ?? null;
  const aufstieg = e.elevation ?? e.total_elevation_gain ?? null;
  const istLauf = /run|lauf|hiking|wandern|walk|geh/i.test(String(e.type ?? ''));
  const istRad = /cycl|rad|ride|bike/i.test(String(e.type ?? ''));

  const kacheln: Array<{ icon: typeof Clock; label: string; wert: string }> = [];
  if (distanz) kacheln.push({ icon: MapPin, label: 'Distanz', wert: distanz });
  if (dauerWert) kacheln.push({ icon: Clock, label: 'Dauer', wert: dauerWert });
  if (pulsAvg) kacheln.push({ icon: Heart, label: 'Puls Ø', wert: `${Math.round(pulsAvg)} bpm` });
  if (pulsMax) kacheln.push({ icon: Heart, label: 'Puls max.', wert: `${Math.round(pulsMax)} bpm` });
  if (e.calories) kacheln.push({ icon: Zap, label: 'Kalorien', wert: `${Math.round(e.calories)} kcal` });
  if (aufstieg) kacheln.push({ icon: Mountain, label: 'Aufstieg', wert: `${Math.round(aufstieg)} m` });
  const pulsMin = e.min_hr ?? null;
  if (pulsMin) kacheln.push({ icon: Heart, label: 'Puls min.', wert: `${Math.round(pulsMin)} bpm` });
  const netto = e.elapsed_time ?? null;
  if (netto && netto !== (e.moving_time ?? e.duration)) {
    kacheln.push({ icon: Clock, label: 'Gesamtzeit', wert: dauer(netto) ?? '—' });
  }

  const tempoWert = istLauf
    ? tempo(e.distance, e.moving_time ?? e.duration)
    : istRad
      ? geschwindigkeit(e.distance, e.moving_time ?? e.duration)
      : null;

  return overlayPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-[var(--background)]"
      role="dialog"
      aria-modal="true"
    >
      {/* Kopf: Name, Typ, Datum — schließt oben rechts */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-muted)] px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Activity className="h-3 w-3" />
            {typLabel(e.type)}
            {e.source === 'garmin' && <span className="normal-case tracking-normal">· von der Uhr</span>}
          </p>
          <h2 className="mt-1 truncate text-[19px] font-semibold text-[var(--foreground)]">
            {e.name || typLabel(e.type)}
          </h2>
          {zeitpunkt(e) && (
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{zeitpunkt(e)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xl border border-[var(--border-muted)] p-2 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Inhalt: scrollbar, alle Werte als gleich gebaute Kacheln */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tempoWert && (
          <div className="mb-4 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {istLauf ? 'Pace' : 'Schnitt'}
            </p>
            <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-[var(--simple-accent)]">
              {tempoWert}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {kacheln.map(({ icon: Icon, label, wert }) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3 py-3"
            >
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                <Icon className="h-3 w-3" /> {label}
              </p>
              <p className="mt-1 text-[17px] font-semibold tabular-nums">{wert}</p>
            </div>
          ))}
        </div>

        {kacheln.length === 0 && (
          <p className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-[12.5px] text-[var(--text-muted)]">
            Für diese Einheit liegen keine Messwerte vor. Die Uhr hat nur den Zeitpunkt
            aufgezeichnet.
          </p>
        )}
      </div>
    </div>,
  );
}
