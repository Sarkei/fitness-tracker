/**
 * Wellness: Aktivitäten. Liste der Einheiten + Detailansicht mit den
 * Feldern, die Intervals durchreicht (HF-Zonen, Kadenz, Schrittlänge,
 * GAP, TRIMP, RPE). Ein Thema pro Karte.
 */

import { useState } from 'react';
import { Activity, ChevronRight, Clock, MapPin, Flame, Heart, Zap } from 'lucide-react';
import { Card, StatTile } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';

const ZONEN_NAMEN = ['Z1 locker', 'Z2 ruhig', 'Z3 mittel', 'Z4 hart', 'Z5 maximal', 'Z6 anaerob', 'Z7 max'];

function dauer(sek?: number | null): string {
  if (!sek) return '—';
  const min = Math.floor(sek / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function tempo(mps?: number | null): string {
  if (!mps || mps <= 0) return '—';
  const sekProKm = 1000 / mps;
  const min = Math.floor(sekProKm / 60);
  return `${min}:${String(Math.round(sekProKm % 60)).padStart(2, '0')} /km`;
}

export default function WellnessAktivitaeten() {
  const { daten } = useWellness();
  const [offen, setOffen] = useState<string | null>(null);
  const liste = daten.aktivitaeten;

  if (liste.length === 0) {
    return (
      <div className="space-y-4">
        <WellnessToolbar />
        <Card className="p-5">
          <p className="text-sm text-[var(--text-muted)]">Keine Aktivitäten im Zeitraum.</p>
        </Card>
      </div>
    );
  }

  if (offen) {
    const a = liste.find((x) => x.id === offen);
    if (a) return <Detail aktivitaet={a} zurueck={() => setOffen(null)} />;
  }

  const gesamtDistanz = liste.reduce((s, a) => s + (a.distance ?? 0), 0);
  const gesamtZeit = liste.reduce((s, a) => s + (a.moving_time ?? 0), 0);
  const gesamtLast = liste.reduce((s, a) => s + (a.icu_training_load ?? 0), 0);

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Einheiten" value={liste.length} hint="im Zeitraum" />
        <StatTile label="Distanz" value={(gesamtDistanz / 1000).toFixed(1)} unit="km" hint="gesamt" />
        <StatTile label="Zeit" value={Math.round(gesamtZeit / 60)} unit="min" hint="in Bewegung" />
        <StatTile label="Trainingslast" value={Math.round(gesamtLast)} hint="Summe" />
      </div>

      <div className="space-y-2">
        {liste.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOffen(a.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-left transition hover:border-[var(--simple-accent)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
              <Activity className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--foreground)]">
                {a.name ?? a.type ?? 'Einheit'}
              </span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                {String(a.start_date_local ?? '').slice(0, 10)} · {dauer(a.moving_time)}
                {a.distance ? ` · ${(a.distance / 1000).toFixed(1)} km` : ''}
                {a.icu_training_load ? ` · Last ${Math.round(a.icu_training_load)}` : ''}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Detail({
  aktivitaet: a,
  zurueck,
}: {
  aktivitaet: NonNullable<ReturnType<typeof useWellness>['daten']['aktivitaeten'][number]>;
  zurueck: () => void;
}) {
  const zonen = a.icu_hr_zone_times ?? [];
  const zonenGrenzen = a.icu_hr_zones ?? [];
  const zonenSumme = zonen.reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={zurueck}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--simple-accent)]"
      >
        ← zurück zur Liste
      </button>

      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{a.name ?? a.type ?? 'Einheit'}</h2>
        <p className="text-[12px] text-[var(--text-muted)]">
          {String(a.start_date_local ?? '').slice(0, 10)}
          {a.type ? ` · ${a.type}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Distanz" value={a.distance ? (a.distance / 1000).toFixed(2) : '—'} unit="km" />
        <StatTile label="Zeit" value={dauer(a.moving_time)} />
        <StatTile label="Tempo" value={tempo(a.average_speed)} hint="Ø" />
        <StatTile label="Last" value={a.icu_training_load ? Math.round(a.icu_training_load) : '—'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <Heart className="h-3 w-3" /> Herzfrequenz
          </p>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-[var(--text-muted)]">Schnitt</span>
            <span className="font-semibold tabular-nums">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : '—'}</span>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-[var(--text-muted)]">Maximum</span>
            <span className="font-semibold tabular-nums">{a.max_hr ? `${Math.round(a.max_hr)} bpm` : '—'}</span>
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <Zap className="h-3 w-3" /> Laufstil
          </p>
          {[
            { label: 'Kadenz', wert: a.average_cadence ? `${Math.round(a.average_cadence * 2)} spm` : '—' },
            { label: 'Schrittlänge', wert: a.average_stride ? `${a.average_stride.toFixed(2)} m` : '—' },
            { label: 'Bodenkontakt', wert: a.average_stance_time_percent ? `${a.average_stance_time_percent.toFixed(0)} %` : '—' },
          ].map((z) => (
            <div key={z.label} className="flex justify-between text-[12.5px]">
              <span className="text-[var(--text-muted)]">{z.label}</span>
              <span className="font-semibold tabular-nums">{z.wert}</span>
            </div>
          ))}
        </Card>

        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <MapPin className="h-3 w-3" /> Gelände
          </p>
          {[
            { label: 'Anstieg', wert: a.total_elevation_gain ? `${Math.round(a.total_elevation_gain)} m` : '—' },
            { label: 'Tempo bergauf (GAP)', wert: tempo(a.gap) },
            { label: 'Temperatur', wert: a.average_temp ? `${a.average_temp.toFixed(0)} °C` : '—' },
          ].map((z) => (
            <div key={z.label} className="flex justify-between text-[12.5px]">
              <span className="text-[var(--text-muted)]">{z.label}</span>
              <span className="font-semibold tabular-nums">{z.wert}</span>
            </div>
          ))}
        </Card>

        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <Flame className="h-3 w-3" /> Belastung
          </p>
          {[
            { label: 'Intensität', wert: a.icu_intensity ? `${Math.round(a.icu_intensity)} %` : '—' },
            { label: 'TRIMP', wert: a.trimp ? Math.round(a.trimp) : '—' },
            { label: 'Kalorien', wert: a.calories ? `${Math.round(a.calories)} kcal` : '—' },
          ].map((z) => (
            <div key={z.label} className="flex justify-between text-[12.5px]">
              <span className="text-[var(--text-muted)]">{z.label}</span>
              <span className="font-semibold tabular-nums">{z.wert}</span>
            </div>
          ))}
        </Card>
      </div>

      {zonen.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <Clock className="h-3 w-3" /> Zeit in Herzfrequenz-Zonen
          </p>
          {zonen.map((sek, i) => {
            const anteil = (sek / zonenSumme) * 100;
            if (sek <= 0) return null;
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[var(--text-muted)]">
                    {ZONEN_NAMEN[i] ?? `Zone ${i + 1}`}
                    {zonenGrenzen[i] ? ` (${zonenGrenzen[i]} bpm)` : ''}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">
                    {dauer(sek)} · {anteil.toFixed(0)} %
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${anteil}%`, background: 'var(--simple-accent)' }}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {(a.icu_rpe != null || a.feel != null) && (
        <Card className="flex gap-4 p-4 text-[12.5px]">
          {a.icu_rpe != null && (
            <p>
              <span className="text-[var(--text-muted)]">Anstrengung: </span>
              <span className="font-semibold">{a.icu_rpe}/10</span>
            </p>
          )}
          {a.feel != null && (
            <p>
              <span className="text-[var(--text-muted)]">Gefühl: </span>
              <span className="font-semibold">{a.feel}/5</span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
