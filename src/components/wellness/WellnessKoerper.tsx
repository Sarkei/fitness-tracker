/**
 * Wellness: Herz & Körper. Nur physiologische Tageswerte: HRV, Ruhepuls, Gewicht.
 * Trainingsbelastung steht bewusst woanders (eigener Form-Bereich).
 */

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Card, Sparkline } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { KennzahlSheet, KlickKachel } from './KennzahlSheet';
import { Tagesdetail, TagesZeile } from './Tagesdetail';
import { letzter, mittel } from '@/src/lib/wellness';

export default function WellnessKoerper() {
  const { daten } = useWellness();
  const tage = daten.tage;

  // Garmin-Werte, die Intervals nicht liefert.
  const spo2Reihe = tage.filter((t) => t.spo2 != null).map((t) => t.spo2 as number);
  const spo2Jetzt = [...tage].reverse().find((t) => t.spo2 != null)?.spo2 ?? null;
  const spo2Schnitt = spo2Reihe.length ? mittel(spo2Reihe) : null;
  const vo2Jetzt = [...tage].reverse().find((t) => t.vo2max != null)?.vo2max ?? null;
  const alterJetzt = [...tage].reverse().find((t) => t.fitnessAge != null)?.fitnessAge ?? null;
  const hrvStatus = [...tage].reverse().find((t) => t.hrvStatus)?.hrvStatus ?? null;
  const [detail, setDetail] = useState<'hrv' | 'puls' | 'gewicht' | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);

  const hrv = tage.map((t) => t.hrv ?? 0);
  const puls = tage.map((t) => t.restingHr ?? 0);
  const gewicht = tage.map((t) => t.weight ?? 0).filter((g) => g > 0);

  const hrvSchnitt = mittel(tage.map((t) => t.hrv));
  const pulsSchnitt = mittel(tage.map((t) => t.restingHr));
  const hrvJetzt = letzter(tage, 'hrv');
  const pulsJetzt = letzter(tage, 'restingHr');

  // Trend: letzte 7 Tage gegen die 7 davor
  const letzteWoche = tage.slice(-7);
  const davor = tage.slice(-14, -7);
  const hrvTrend = (() => {
    const a = mittel(letzteWoche.map((t) => t.hrv));
    const b = mittel(davor.map((t) => t.hrv));
    if (a == null || b == null) return null;
    return a - b;
  })();

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KlickKachel
          label="HRV"
          value={hrvJetzt != null ? Math.round(hrvJetzt) : '—'}
          unit="ms"
          hint={hrvTrend != null ? `${hrvTrend >= 0 ? '+' : ''}${hrvTrend.toFixed(1)} zu Vorwoche` : 'kein Trend'}
          onClick={() => setDetail('hrv')}
        />
        <KlickKachel
          label="HRV im Schnitt"
          value={hrvSchnitt != null ? Math.round(hrvSchnitt) : '—'}
          unit="ms"
          hint="im Zeitraum"
          onClick={() => setDetail('hrv')}
        />
        <KlickKachel
          label="Ruhepuls"
          value={pulsJetzt != null ? Math.round(pulsJetzt) : '—'}
          unit="bpm"
          hint={pulsSchnitt != null ? `Ø ${Math.round(pulsSchnitt)}` : 'keine Daten'}
          onClick={() => setDetail('puls')}
        />
        <KlickKachel
          label="Gewicht"
          value={gewicht.length ? gewicht[gewicht.length - 1].toFixed(1) : '—'}
          unit="kg"
          hint={gewicht.length ? `${gewicht.length} Messungen` : 'keine Daten'}
          onClick={() => setDetail('gewicht')}
        />
        {spo2Jetzt != null && (
          <KlickKachel
            label="Sauerstoff"
            value={Math.round(spo2Jetzt)}
            unit="%"
            hint={spo2Schnitt != null ? `Ø ${Math.round(spo2Schnitt)}` : undefined}
            onClick={() => setDetail('hrv')}
          />
        )}
        {vo2Jetzt != null && (
          <KlickKachel
            label="VO₂max"
            value={Math.round(vo2Jetzt)}
            hint={alterJetzt != null ? `Alter ${Math.round(alterJetzt)}` : undefined}
            onClick={() => setDetail('puls')}
          />
        )}
        {hrvStatus && (
          <KlickKachel
            label="HRV-Status"
            value={hrvStatus === 'BALANCED' ? 'Balance' : hrvStatus === 'LOW' ? 'Tief' : hrvStatus === 'HIGH' ? 'Hoch' : hrvStatus}
            
            onClick={() => setDetail('hrv')}
          />
        )}
      </div>

      <MapCard
        titel="HRV pro Tag"
        werte={hrv}
        schnitt={hrvSchnitt}
        einheit="ms"
        hinweis="Sinkt die HRV über mehrere Tage, ist das oft ein Zeichen für zu wenig Erholung."
      />

      <MapCard
        titel="Ruhepuls pro Tag"
        werte={puls}
        schnitt={pulsSchnitt}
        einheit="bpm"
        hinweis="Ein steigender Ruhepuls bei gleicher Belastung spricht für Ermüdung oder beginnende Krankheit."
      />

      {gewicht.length > 1 && (
        <MapCard
          titel="Gewicht"
          werte={gewicht}
          schnitt={mittel(gewicht)}
          einheit="kg"
          hinweis="Nur Tage mit Wiegedaten — die Kurve springt deshalb zwischen den Messungen."
        />
      )}

      <Card className="p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Tag für Tag
        </p>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--card-bg)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <tr>
                <th className="py-1.5 text-left font-semibold">Datum</th>
                <th className="py-1.5 text-right font-semibold">HRV</th>
                <th className="py-1.5 text-right font-semibold">Puls</th>
                <th className="py-1.5 text-right font-semibold">SpO₂</th>
                <th className="py-1.5 text-right font-semibold">Gewicht</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...tage].reverse().map((t) => (
                <TagesZeile key={t.date} onClick={() => setTagOffen(t.date)}>
                  <td className="py-1.5 text-[var(--text-muted)]">{t.date}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.hrv != null ? Math.round(t.hrv) : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.restingHr != null ? Math.round(t.restingHr) : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{t.spo2 != null ? Math.round(t.spo2) : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.weight != null && t.weight > 0 ? t.weight.toFixed(1) : '—'}
                  </td>
                </TagesZeile>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {tagOffen && (() => {
        const t = tage.find((x) => x.date === tagOffen);
        return t ? (
          <Tagesdetail tag={t} aktivitaeten={daten.aktivitaeten} fokus="koerper" onClose={() => setTagOffen(null)} />
        ) : null;
      })()}

      {detail === 'hrv' && (
        <KennzahlSheet
          def={{ key: 'hrv', titel: 'HRV', einheit: 'ms', hoeherBesser: true,
            hinweis: 'Herzfrequenzvariabilität. Sinkt sie über Tage, fehlt Erholung.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.hrv ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}
      {detail === 'puls' && (
        <KennzahlSheet
          def={{ key: 'puls', titel: 'Ruhepuls', einheit: 'bpm', hoeherBesser: false,
            hinweis: 'Steigt er bei gleicher Belastung, ist das ein Ermüdungszeichen.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.restingHr ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}
      {detail === 'gewicht' && (
        <KennzahlSheet
          def={{ key: 'gewicht', titel: 'Gewicht', einheit: 'kg', format: (v) => v.toFixed(1),
            hinweis: 'Nur an Tagen mit Wiegedaten.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.weight ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function MapCard({
  titel,
  werte,
  schnitt,
  einheit,
  hinweis,
}: {
  titel: string;
  werte: number[];
  schnitt: number | null;
  einheit: string;
  hinweis: string;
}) {
  return (
    <Card className="space-y-2 p-5">
      <div className="flex items-center gap-2">
        <Heart className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
        <p className="text-[12.5px] font-semibold text-[var(--foreground)]">{titel}</p>
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">
          Ø {schnitt != null ? Math.round(schnitt) : '—'} {einheit}
        </span>
      </div>
      <Sparkline values={werte} height={80} einheit={einheit} />
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{hinweis}</p>
    </Card>
  );
}
