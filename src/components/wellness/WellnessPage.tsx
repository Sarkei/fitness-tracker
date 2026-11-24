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

      {/*
        Bereichsleiste — auf jeder Wellness-Seite sichtbar.

        Vorher stand hier nur ein "Zurueck"-Knopf; die Bereiche waren allein ueber
        die Kacheln der Uebersicht erreichbar. Kalorien, Schlaf und die anderen
        Unterseiten waren damit praktisch versteckt.
      */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {UNTERSEITEN.map(({ pfad, label, icon: Icon }) => {
          const aktiv = location.pathname === pfad;
          return (
            <button
              key={pfad}
              type="button"
              onClick={() => navigate(pfad)}
              aria-current={aktiv ? 'page' : undefined}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition ${
                aktiv
                  ? 'border-[var(--simple-accent)] bg-[var(--simple-accent)] text-white'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

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
