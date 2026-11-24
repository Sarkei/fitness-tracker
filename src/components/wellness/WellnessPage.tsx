/**
 * Wellness-Bereich (`/wellness`) mit eigenen Unterseiten.
 *
 * Bewusst getrennt statt einer überladenen Seite:
 *   /wellness               Übersicht (Tageslage)
 *   /wellness/schlaf        Schlaf
 *   /wellness/bewegung      Schritte & Etagen
 *   /wellness/koerper       HRV, Ruhepuls, Gewicht
 *   /wellness/form          Trainingsbelastung (CTL/ATL/TSB)
 *   /wellness/aktivitaeten  Einheiten mit Detailansicht
 */

import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, ChevronLeft, Flame, Footprints, Heart, LayoutGrid, Moon } from 'lucide-react';
import { PageHeader } from '@/src/simple/ui';
import { WellnessProvider } from './WellnessProvider';
import WellnessUebersicht from './WellnessUebersicht';
import WellnessSchlaf from './WellnessSchlaf';
import WellnessBewegung from './WellnessBewegung';
import WellnessKoerper from './WellnessKoerper';
import WellnessForm from './WellnessForm';
import WellnessAktivitaeten from './WellnessAktivitaeten';
import WellnessKalorien from './WellnessKalorien';

/**
 * Titel und Beschreibung je Bereich. Die Kopfzeile zeigt, was man gerade
 * anschaut — vorher stand ueberall "Wellness", auch auf Schlaf oder Kalorien.
 */
const BEREICHE: Record<string, { titel: string; text: string }> = {
  '/wellness': {
    titel: 'Wellness',
    text: 'Schlaf, Bewegung, Herz und Garmin-Werte — automatisch von deiner Uhr.',
  },
  '/wellness/schlaf': {
    titel: 'Schlaf',
    text: 'Dauer, Phasen und Score je Nacht. Bei „Heute“ nur die reellen Werte der letzten Nacht.',
  },
  '/wellness/bewegung': {
    titel: 'Bewegung',
    text: 'Schritte, Etagen und Strecke aus dem Alltag.',
  },
  '/wellness/koerper': {
    titel: 'Herz & Körper',
    text: 'Ruhepuls, HRV, Blutsauerstoff, Atmung und Körperzusammensetzung.',
  },
  '/wellness/form': {
    titel: 'Form',
    text: 'Trainingsbelastung: Fitness (CTL), Ermüdung (ATL) und Form (TSB).',
  },
  '/wellness/aktivitaeten': {
    titel: 'Aktivitäten',
    text: 'Aufgezeichnete Einheiten von der Uhr, mit Puls, Tempo und Höhenprofil.',
  },
  '/wellness/kalorien': {
    titel: 'Kalorien',
    text: 'Verbrauch von Garmin und Gegessenes aus deinen Mahlzeiten — Tag für Tag.',
  },
};

const UNTERSEITEN = [
  { pfad: '/wellness', label: 'Übersicht', icon: LayoutGrid },
  { pfad: '/wellness/schlaf', label: 'Schlaf', icon: Moon },
  { pfad: '/wellness/bewegung', label: 'Bewegung', icon: Footprints },
  { pfad: '/wellness/koerper', label: 'Herz & Körper', icon: Heart },
  { pfad: '/wellness/form', label: 'Form', icon: BarChart3 },
  { pfad: '/wellness/aktivitaeten', label: 'Aktivitäten', icon: Activity },
  { pfad: '/wellness/kalorien', label: 'Kalorien', icon: Flame },
];

export default function WellnessPage() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5 pb-10">
      <PageHeader
        eyebrow="Wellness"
        title={(BEREICHE[location.pathname] ?? BEREICHE['/wellness']).titel}
        hint={(BEREICHE[location.pathname] ?? BEREICHE['/wellness']).text}
      />

      {/* Zurück-Leiste: nur auf Unterseiten, damit man aus einem Bereich herauskommt.
          Die Auswahl der Bereiche läuft über die Kacheln der Übersicht. */}
      {location.pathname !== '/wellness' && (
        <button
          type="button"
          onClick={() => navigate('/wellness')}
          className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--text-muted)] transition hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Übersicht
        </button>
      )}

      <WellnessProvider>
        <Routes>
          <Route index element={<WellnessUebersicht />} />
          <Route path="schlaf" element={<WellnessSchlaf />} />
          <Route path="bewegung" element={<WellnessBewegung />} />
          <Route path="koerper" element={<WellnessKoerper />} />
          <Route path="form" element={<WellnessForm />} />
          <Route path="aktivitaeten" element={<WellnessAktivitaeten />} />
          <Route path="kalorien" element={<WellnessKalorien />} />
          <Route path="*" element={<Navigate to="/wellness" replace />} />
        </Routes>
      </WellnessProvider>
    </div>
  );
}
