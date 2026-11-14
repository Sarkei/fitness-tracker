/**
 * ActiveWorkoutSessionContext: Globales Tracking von laufenden Workout-Sessions.
 * - Speichert Session-Meta beim Start sofort in localStorage + Server
 * - Ermöglicht automatisches Restore bei Page Reload
 * - Bietet global verfügbare Session-Info (Timer, Status)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  ACTIVE_SESSION_STORAGE_KEY,
  hasResumableSessionDraft,
  loadSessionDraft,
  reconcileSessionDraft,
  SESSION_DRAFT_CHANGED_EVENT,
} from '@/src/lib/sessionDraft';

export interface ActiveWorkoutSessionData {
  workoutId?: string;
  workoutName?: string;
  startedAt: string; // ISO timestamp
  elapsedSeconds: number;
  /** Letzter Draft-Save – für Timer-Fortschritt nach Navigation */
  lastSavedAt?: string;
}

type ActiveWorkoutSessionContextValue = {
  session: ActiveWorkoutSessionData | null;
  isActive: boolean;
  startSession: (
    data: Omit<ActiveWorkoutSessionData, 'startedAt' | 'elapsedSeconds'> & {
      startedAt?: string;
      elapsedSeconds?: number;
      lastSavedAt?: string;
    },
  ) => void;
  updateElapsedSeconds: (seconds: number) => void;
  clearSession: () => void;
};

const ActiveWorkoutSessionContext = createContext<ActiveWorkoutSessionContextValue | null>(null);

export function ActiveWorkoutSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveWorkoutSessionData | null>(null);

  const syncFromDraftStorage = useCallback(() => {
    try {
      const draft = loadSessionDraft();
      if (hasResumableSessionDraft(draft)) {
        setSession({
          workoutId: draft!.workoutMeta.id,
          workoutName: draft!.workoutMeta.name,
          startedAt: draft!.startedAt ?? draft!.savedAt,
          elapsedSeconds: draft!.elapsedSeconds ?? 0,
          lastSavedAt: draft!.savedAt,
        });
        return;
      }
      setSession(null);
      try {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    syncFromDraftStorage();
    const onDraftChange = () => syncFromDraftStorage();
    window.addEventListener(SESSION_DRAFT_CHANGED_EVENT, onDraftChange);
    return () => window.removeEventListener(SESSION_DRAFT_CHANGED_EVENT, onDraftChange);
  }, [syncFromDraftStorage]);

  const startSession = useCallback(
    (
      data: Omit<ActiveWorkoutSessionData, 'startedAt' | 'elapsedSeconds'> & {
        startedAt?: string;
        elapsedSeconds?: number;
        lastSavedAt?: string;
      },
    ) => {
    const now = new Date().toISOString();
    const newSession: ActiveWorkoutSessionData = {
      ...data,
      startedAt: data.startedAt ?? now,
      elapsedSeconds: data.elapsedSeconds ?? 0,
      lastSavedAt: data.lastSavedAt ?? now,
    };
    setSession(newSession);
    try {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(newSession));
    } catch {
      // quota exceeded
    }
  }, []);

  const updateElapsedSeconds = useCallback((seconds: number) => {
    setSession(prev => {
      if (!prev) return null;
      const updated = { ...prev, elapsedSeconds: seconds };
      try {
        localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // quota exceeded
      }
      return updated;
    });
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Nach Tab-Fokus: Server-Entwurf prüfen (Abschluss auf anderem Gerät)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void reconcileSessionDraft().then(() => syncFromDraftStorage());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncFromDraftStorage]);

  const value: ActiveWorkoutSessionContextValue = {
    session,
    isActive: session !== null,
    startSession,
    updateElapsedSeconds,
    clearSession,
  };

  return (
    <ActiveWorkoutSessionContext.Provider value={value}>
      {children}
    </ActiveWorkoutSessionContext.Provider>
  );
}

export function useActiveWorkoutSession(): ActiveWorkoutSessionContextValue {
  const ctx = useContext(ActiveWorkoutSessionContext);
  if (!ctx) {
    throw new Error('useActiveWorkoutSession must be used within ActiveWorkoutSessionProvider');
  }
  return ctx;
}

/** Shell/Bar: kein Crash wenn Provider fehlt (z. B. kaputtes AppRoot-Deploy). */
export function useActiveWorkoutSessionOptional(): ActiveWorkoutSessionContextValue | null {
  return useContext(ActiveWorkoutSessionContext);
}
