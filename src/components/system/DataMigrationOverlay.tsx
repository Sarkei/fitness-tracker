import { useState } from 'react';
import { Loader2, Database } from 'lucide-react';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/lib/AuthContext';
import { DATA_MIGRATION_VERSION } from '@/src/lib/dataMigration';
import { mobileSheetOverlayClass, overlayPortal, useMobileOverlaySheet } from '@/src/lib/mobileViewport';

type MigrationResponse = {
  ok: boolean;
  exercisesUpdated: number;
  nutritionUpdated: number;
  coachWeeksUpdated: number;
  errors: string[];
  profile?: Record<string, unknown>;
};

export default function DataMigrationOverlay() {
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [detail, setDetail] = useState('');
  const [started, setStarted] = useState(false);

  const skipMigration = async () => {
    setStatus('running');
    setDetail('Migration wird übersprungen…');
    try {
      await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          dataMigrationVersion: DATA_MIGRATION_VERSION,
          migrationRequired: false,
        }),
      });
      await refreshProfile();
      window.location.reload();
    } catch (e: unknown) {
      setStatus('error');
      setDetail(e instanceof Error ? e.message : 'Überspringen fehlgeschlagen');
    }
  };

  const run = async () => {
    if (started) return;
    setStarted(true);
    setStatus('running');
    setDetail('Übungen, Pläne und Ernährung werden auf ExerciseDB & Open Food Facts umgestellt…');
    try {
      const res = await api<MigrationResponse>('/api/migration/run', { method: 'POST' });
      await refreshProfile();
      const errNote =
        res.errors?.length > 0 ? ` (${res.errors.length} Hinweise — App ist nutzbar.)` : '';
      setDetail(
        `Fertig: ${res.exercisesUpdated} Workout/Vorlagen, ${res.nutritionUpdated} Mahlzeiten, ${res.coachWeeksUpdated} Coach-Wochen.${errNote}`,
      );
      setStatus('done');
      window.setTimeout(() => window.location.reload(), 800);
    } catch (e: unknown) {
      setStatus('error');
      setDetail(e instanceof Error ? e.message : 'Migration fehlgeschlagen');
      setStarted(false);
    }
  };

  if (!started) {
    void run();
  }

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <div className="w-full max-w-md rounded-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-8 shadow-2xl text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          {status === 'running' ? <Loader2 size={32} className="animate-spin" /> : <Database size={32} />}
        </div>
        <div>
          <h2 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)]">
            Daten werden aktualisiert
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">
            Wir stellen deine bestehenden Workouts, Coach-Pläne und Mahlzeiten auf die neue Übungs- und
            Lebensmittel-Datenbank um (Version {DATA_MIGRATION_VERSION}).
          </p>
        </div>
        <p className="text-xs font-bold text-[var(--text-primary)] min-h-[2.5rem]">{detail}</p>
        {status === 'error' && (
          <div className="flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={() => void run()}
              className="w-full min-h-[52px] rounded-2xl ui-btn-brand font-black uppercase tracking-widest text-[10px]"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={() => void skipMigration()}
              className="w-full min-h-[48px] rounded-2xl border border-[var(--border-muted)] text-[var(--text-muted)] font-black uppercase tracking-widest text-[9px]"
            >
              Überspringen und fortfahren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
