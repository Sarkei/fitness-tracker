/**
 * Wellness: Herz & Körper. Nur physiologische Tageswerte: HRV, Ruhepuls, Gewicht.
 * Trainingsbelastung steht bewusst woanders (eigener Form-Bereich).
 */

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Card, Sparkline } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { KennzahlSheet, KlickKachel } from './KennzahlSheet';
import { letzter, mittel } from '@/src/lib/wellness';

export default function WellnessKoerper() {
  const { daten } = useWellness();
  const tage = daten.tage;
  const [detail, setDetail] = useState<'hrv' | 'puls' | 'gewicht' | null>(null);

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
      <Sparkline values={werte} height={80} />
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{hinweis}</p>
    </Card>
  );
}
