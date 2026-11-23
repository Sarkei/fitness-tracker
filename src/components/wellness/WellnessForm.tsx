/**
 * Wellness: Form. Trainingsbelastung: Fitness, Ermüdung, Form (TSB).
 */

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, Sparkline } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { KennzahlSheet, KlickKachel } from './KennzahlSheet';
import { Tagesdetail, TagesZeile } from './Tagesdetail';
import { formLabel, letzter } from '@/src/lib/wellness';

/** Farbe je Formzustand - gleiche Skala wie in der Übersicht. */
function formFarbe(tone: string): string {
  if (tone === 'gut') return 'var(--simple-accent)';
  if (tone === 'mittel') return '#d98a2b';
  if (tone === 'schlecht') return '#dc5a4a';
  return 'var(--text-muted)';
}

export default function WellnessForm() {
  const { daten } = useWellness();
  const tage = daten.tage;
  const [detail, setDetail] = useState<'form' | 'fitness' | 'ermuedung' | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);

  const ctl = tage.map((t) => t.ctl ?? 0);
  const atl = tage.map((t) => t.atl ?? 0);
  const tsb = tage.map((t) => t.tsb ?? 0);

  const ctlJetzt = letzter(tage, 'ctl');
  const atlJetzt = letzter(tage, 'atl');
  const tsbJetzt = letzter(tage, 'tsb');
  const form = formLabel(tsbJetzt);
  const ramp = letzter(tage, 'rampRate');

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KlickKachel label="Fitness (CTL)" value={ctlJetzt != null ? Math.round(ctlJetzt) : '—'} hint="langfristige Belastung" onClick={() => setDetail('fitness')} />
        <KlickKachel label="Ermüdung (ATL)" value={atlJetzt != null ? Math.round(atlJetzt) : '—'} hint="kurzfristig" onClick={() => setDetail('ermuedung')} />
        <KlickKachel
          label="Form (TSB)"
          value={tsbJetzt != null ? Math.round(tsbJetzt) : '—'}
          hint={form.text}
          onClick={() => setDetail('form')}
        />
        <KlickKachel
          label="Rampenrate"
          value={ramp != null ? ramp.toFixed(1) : '—'}
          hint="Veränderung pro Woche"
          onClick={() => setDetail('fitness')}
        />
      </div>

      <Card className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Form (TSB)</p>
          <span className="ml-auto text-[11px] font-semibold" style={{ color: formFarbe(form.tone) }}>
            {form.text}
          </span>
        </div>
        <Sparkline values={tsb} height={90} />
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          Form = Fitness − Ermüdung. Über 5 heißt frisch, unter −30 heißt überlastet.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="space-y-2 p-5">
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Fitness (CTL)</p>
          <Sparkline values={ctl} height={70} minY={0} />
        </Card>
        <Card className="space-y-2 p-5">
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Ermüdung (ATL)</p>
          <Sparkline values={atl} height={70} minY={0} />
        </Card>
      </div>

      {tagOffen && (() => {
        const t = tage.find((x) => x.date === tagOffen);
        return t ? (
          <Tagesdetail tag={t} aktivitaeten={daten.aktivitaeten} fokus="form" onClose={() => setTagOffen(null)} />
        ) : null;
      })()}

      {detail === 'form' && (
        <KennzahlSheet
          def={{ key: 'form', titel: 'Trainingsform (TSB)', format: (v) => String(Math.round(v)), hoeherBesser: true,
            hinweis: 'Fitness minus Ermüdung. Über 5 heißt frisch, unter -30 überlastet.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.tsb ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}
      {detail === 'fitness' && (
        <KennzahlSheet
          def={{ key: 'fitness', titel: 'Fitness (CTL)', format: (v) => String(Math.round(v)), hoeherBesser: true,
            hinweis: 'Langfristige Trainingsbelastung. Steigt langsam, fällt langsam.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.ctl ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}
      {detail === 'ermuedung' && (
        <KennzahlSheet
          def={{ key: 'ermuedung', titel: 'Ermüdung (ATL)', format: (v) => String(Math.round(v)), hoeherBesser: false,
            hinweis: 'Kurzfristige Belastung. Steigt nach harten Einheiten schnell, fällt schnell.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.atl ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}

      <Card className="p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Tageswerte
        </p>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--card-bg)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <tr>
                <th className="py-1.5 text-left font-semibold">Datum</th>
                <th className="py-1.5 text-right font-semibold">Fitness</th>
                <th className="py-1.5 text-right font-semibold">Ermüdung</th>
                <th className="py-1.5 text-right font-semibold">Form</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...tage].reverse().map((t) => (
                <TagesZeile key={t.date} onClick={() => setTagOffen(t.date)}>
                  <td className="py-1.5 text-[var(--text-muted)]">{t.date}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.ctl != null ? Math.round(t.ctl) : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.atl != null ? Math.round(t.atl) : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.tsb != null ? Math.round(t.tsb) : '—'}</td>
                </TagesZeile>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
