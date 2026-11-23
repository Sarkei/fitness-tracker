/**
 * Wellness: Bewegung. Nur Alltagsbewegung: Schritte und Etagen.
 */

import { useState } from 'react';
import { Footprints, Mountain } from 'lucide-react';
import { Card, Sparkline } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { KennzahlSheet, KlickKachel } from './KennzahlSheet';
import { Tagesdetail, TagesZeile } from './Tagesdetail';
import { mittel, summe } from '@/src/lib/wellness';

export default function WellnessBewegung() {
  const { daten } = useWellness();
  const tage = daten.tage;
  const [detail, setDetail] = useState<'schritte' | 'etagen' | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);

  const schritte = tage.map((t) => t.steps ?? 0);
  const etagen = tage.map((t) => t.floors ?? 0);
  const hatSchritte = daten.verfuegbar.schritte;

  const heuteSchritte = [...tage].reverse().find((t) => t.steps != null)?.steps ?? null;
  const schnittSchritte = mittel(tage.map((t) => t.steps));
  const summeSchritte = summe(tage.map((t) => t.steps));
  const summeEtagen = summe(tage.map((t) => t.floors));

  const besteTag = [...tage]
    .filter((t) => t.steps != null)
    .sort((a, b) => (b.steps ?? 0) - (a.steps ?? 0))[0];

  if (!hatSchritte) {
    return (
      <div className="space-y-4">
        <WellnessToolbar />
        <Card className="p-5">
          <p className="text-sm text-[var(--text-muted)]">Für diesen Zeitraum liegen keine Schrittdaten vor.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KlickKachel
          label="Letzter Tag"
          value={heuteSchritte != null ? Math.round(heuteSchritte).toLocaleString('de-DE') : '—'}
          hint="Schritte"
          onClick={() => setDetail('schritte')}
        />
        <KlickKachel
          label="Schnitt pro Tag"
          value={schnittSchritte != null ? Math.round(schnittSchritte).toLocaleString('de-DE') : '—'}
          hint="Schritte"
          onClick={() => setDetail('schritte')}
        />
        <KlickKachel
          label="Gesamt"
          value={summeSchritte != null ? Math.round(summeSchritte).toLocaleString('de-DE') : '—'}
          hint="im Zeitraum"
          onClick={() => setDetail('schritte')}
        />
        <KlickKachel
          label="Etagen"
          value={summeEtagen != null ? Math.round(summeEtagen).toLocaleString('de-DE') : '—'}
          hint="im Zeitraum"
          onClick={() => setDetail('etagen')}
        />
      </div>

      <Card className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <Footprints className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Schritte pro Tag</p>
        </div>
        <Sparkline values={schritte} height={90} minY={0} />
        {besteTag?.steps && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Bester Tag: {besteTag.date} mit {Math.round(besteTag.steps).toLocaleString('de-DE')} Schritten
          </p>
        )}
      </Card>

      {daten.verfuegbar.etagen && (
        <Card className="space-y-2 p-5">
          <div className="flex items-center gap-2">
            <Mountain className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Etagen pro Tag</p>
          </div>
          <Sparkline values={etagen} height={70} minY={0} />
        </Card>
      )}

      {tagOffen && (() => {
        const t = tage.find((x) => x.date === tagOffen);
        return t ? (
          <Tagesdetail tag={t} aktivitaeten={daten.aktivitaeten} fokus="bewegung" onClose={() => setTagOffen(null)} />
        ) : null;
      })()}

      {detail === 'schritte' && (
        <KennzahlSheet
          def={{ key: 'schritte', titel: 'Schritte', format: (v) => Math.round(v).toLocaleString('de-DE'), hoeherBesser: true,
            hinweis: 'Alltagsbewegung pro Tag.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.steps ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}
      {detail === 'etagen' && (
        <KennzahlSheet
          def={{ key: 'etagen', titel: 'Etagen', hoeherBesser: true, hinweis: 'Erstiegene Etagen pro Tag.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.floors ?? null }))}
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
                <th className="py-1.5 text-right font-semibold">Schritte</th>
                <th className="py-1.5 text-right font-semibold">Etagen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...tage].reverse().map((t) => (
                <TagesZeile key={t.date} onClick={() => setTagOffen(t.date)}>
                  <td className="py-1.5 text-[var(--text-muted)]">{t.date}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.steps != null ? Math.round(t.steps).toLocaleString('de-DE') : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.floors != null ? Math.round(t.floors) : '—'}
                  </td>
                </TagesZeile>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
