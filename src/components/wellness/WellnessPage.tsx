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
import { Activity, BarChart3, Footprints, Heart, LayoutGrid, Moon } from 'lucide-react';
import { PageHeader } from '@/src/simple/ui';
import { WellnessProvider } from './WellnessProvider';
import WellnessUebersicht from './WellnessUebersicht';
import WellnessSchlaf from './WellnessSchlaf';
import WellnessBewegung from './WellnessBewegung';
import WellnessKoerper from './WellnessKoerper';
import WellnessForm from './WellnessForm';
import WellnessAktivitaeten from './WellnessAktivitaeten';

const UNTERSEITEN = [
  { pfad: '/wellness', label: 'Übersicht', icon: LayoutGrid },
  { pfad: '/wellness/schlaf', label: 'Schlaf', icon: Moon },
  { pfad: '/wellness/bewegung', label: 'Bewegung', icon: Footprints },
  { pfad: '/wellness/koerper', label: 'Herz & Körper', icon: Heart },
  { pfad: '/wellness/form', label: 'Form', icon: BarChart3 },
  { pfad: '/wellness/aktivitaeten', label: 'Aktivitäten', icon: Activity },
];

export default function WellnessPage() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5 pb-10">
      <PageHeader
        eyebrow="Wellness"
        title="Wellness"
        hint="Schlaf, Bewegung, Herz und Trainingsform — automatisch über Intervals.icu."
      />

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {UNTERSEITEN.map(({ pfad, label, icon: Icon }) => {
          const aktiv = location.pathname === pfad;
          return (
            <button
              key={pfad}
              type="button"
              onClick={() => navigate(pfad)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition ${
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
          <Route path="*" element={<Navigate to="/wellness" replace />} />
        </Routes>
      </WellnessProvider>
    </div>
  );
}
