/**
 * Wellness: Übersicht: nur die Tageslage.
 * Schlaf der letzten Nacht, Schritte heute, Form — ein Bild, kein Detail.
 */

import { Moon, Footprints, Heart, Activity, ChevronRight, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, StatTile } from '@/src/simple/ui';
import { useWellness, WellnessToolbar } from './WellnessProvider';
import { formLabel, letzter, mittel, schlafBewertung, schlafStunden } from '@/src/lib/wellness';

export default function WellnessUebersicht() {
  const { daten } = useWellness();
  const tage = daten.tage;

  const schlafLetzte = schlafStunden(letzter(tage, 'sleepSecs'));
  const schlafScore = letzter(tage, 'sleepScore');
  const schritte = letzter(tage, 'steps');
  const hrv = letzter(tage, 'hrv');
  const puls = letzter(tage, 'restingHr');
  const tsb = letzter(tage, 'tsb');
  const form = formLabel(tsb);

  const formFarbe =
    form.tone === 'gut'
      ? 'var(--simple-accent)'
      : form.tone === 'mittel'
        ? '#d98a2b'
        : form.tone === 'schlecht'
          ? '#dc5a4a'
          : 'var(--text-muted)';

  const naechsteEinheit = daten.aktivitaeten[0];

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Schlaf"
          value={schlafLetzte ?? '—'}
          unit="h"
          hint={schlafScore != null ? `Score ${Math.round(schlafScore)} · ${schlafBewertung(schlafScore)}` : 'kein Score'}
          tone={schlafLetzte != null && schlafLetzte >= 7 ? 'accent' : 'default'}
        />
        <StatTile
          label="Schritte"
          value={schritte != null ? Math.round(schritte).toLocaleString('de-DE') : '—'}
          hint={`Ø ${Math.round(mittel(tage.map((t) => t.steps)) ?? 0).toLocaleString('de-DE')}`}
        />
        <StatTile
          label="HRV"
          value={hrv != null ? Math.round(hrv) : '—'}
          unit="ms"
          hint={`Ø ${Math.round(mittel(tage.map((t) => t.hrv)) ?? 0)}`}
        />
        <StatTile
          label="Ruhepuls"
          value={puls != null ? Math.round(puls) : '—'}
          unit="bpm"
          hint={`Ø ${Math.round(mittel(tage.map((t) => t.restingHr)) ?? 0)}`}
        />
      </div>

      <Card className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Trainingsform
          </p>
          <p className="mt-0.5 text-xl font-semibold capitalize" style={{ color: formFarbe }}>
            {form.text}
          </p>
        </div>
        <Link
          to="/wellness/form"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--simple-accent)]"
        >
          Details <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </Card>

      {naechsteEinheit && (
        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Letzte Einheit
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[var(--foreground)]">
              {naechsteEinheit.name ?? naechsteEinheit.type ?? 'Einheit'}
            </p>
            <p className="text-[11.5px] text-[var(--text-muted)]">
              {String(naechsteEinheit.start_date_local ?? '').slice(0, 10)} ·{' '}
              {naechsteEinheit.distance ? `${(naechsteEinheit.distance / 1000).toFixed(1)} km` : ''}{' '}
              {naechsteEinheit.moving_time ? `· ${Math.round(naechsteEinheit.moving_time / 60)} min` : ''}
            </p>
          </div>
          <Link
            to="/wellness/aktivitaeten"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--simple-accent)]"
          >
            Alle <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { to: '/wellness/schlaf', label: 'Schlaf', icon: Moon },
          { to: '/wellness/aktivitaeten', label: 'Aktivitäten', icon: Activity },
          { to: '/wellness/koerper', label: 'Herz & Körper', icon: Heart },
          { to: '/wellness/bewegung', label: 'Bewegung', icon: Footprints },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-xl border border-[var(--border-muted)] px-3 py-3 text-[12.5px] font-semibold text-[var(--foreground)] transition hover:border-[var(--simple-accent)]"
          >
            <Icon className="h-4 w-4 text-[var(--simple-accent)]" />
            {label}
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
          </Link>
        ))}
      </div>

      {daten.nichtVerfuegbar.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--surface-gray)] px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            Deine Quelle gibt {daten.nichtVerfuegbar.join(', ')} nicht über die Schnittstelle frei.
          </p>
        </div>
      )}
    </div>
  );
}
