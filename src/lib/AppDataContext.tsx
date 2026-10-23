/**
 * Zentraler App-Daten-Cache: Workouts, Nutrition und Coach-Pläne werden einmal
 * nach Login parallel geladen — Tab-Wechsel nutzt gecachte Daten statt neu zu fetchen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import type { Nutrition, MealTemplate, Workout, WorkoutTemplate } from '../types';
import {
  dequeueOfflineWorkout,
  enqueueOfflineWorkout,
  loadOfflineWorkoutQueue,
} from './offlineWorkoutQueue';
import { setExerciseGermanNameCache } from './exerciseNameLocalizationCache';
import { reconcileSessionDraft } from './sessionDraft';
import { tryCoachAutoAdvanceForActivePlans } from './coach/coachAutoAdvance';
import { ensureUserWeeklyReport } from '@/src/services/userWeeklyReportService';

export type CoachPlanSummary = {
  id: string;
  type: 'workout' | 'nutrition';
  status: string;
  discipline: string;
  plan_mode?: string;
  current_week?: number;
  onboarding_data?: unknown;
  created_at?: string;
  current_schedule?: {
    schedule?: { schedule?: Array<Record<string, unknown>> };
    week_number?: number;
    start_date?: string;
  };
  [key: string]: unknown;
};

type AppDataContextValue = {
  workouts: Workout[];
  templates: WorkoutTemplate[];
  workoutsLoading: boolean;
  workoutsReady: boolean;
  nutritionEntries: Nutrition[];
  mealTemplates: MealTemplate[];
  nutritionLoading: boolean;
  nutritionReady: boolean;
  coachPlans: CoachPlanSummary[];
  coachPlansLoading: boolean;
  coachPlansReady: boolean;
  bootstrapLoading: boolean;
  bootstrapError: boolean;
  retryBootstrap: () => Promise<void>;
  addWorkout: (workout: Omit<Workout, 'id'>) => Promise<string>;
  updateWorkout: (id: string, data: Partial<Workout>) => Promise<void>;
  deleteWorkout: (id: string) => Promise<void>;
  addTemplate: (template: Omit<WorkoutTemplate, 'id'>) => Promise<void>;
  updateTemplate: (id: string, data: Partial<WorkoutTemplate>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  refetchWorkouts: () => Promise<void>;
  flushOfflineQueue: () => Promise<void>;
  offlinePending: number;
  addMeal: (data: Partial<Nutrition>) => Promise<void>;
  updateMeal: (data: Nutrition) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  saveTemplate: (template: Partial<MealTemplate>) => Promise<void>;
  updateMealTemplate: (
    payload: Partial<MealTemplate> & {
      id: string;
      name: string;
      category: MealTemplate['category'];
      ingredients: MealTemplate['ingredients'];
      totalCalories: number;
      totalProtein: number;
      totalCarbs: number;
      totalFat: number;
      yieldsPortions?: number;
    },
  ) => Promise<void>;
  deleteMealTemplate: (id: string) => Promise<void>;
  refetchNutrition: () => Promise<void>;
  refetchCoachPlans: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

const BOOTSTRAP_FETCH_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const dataEnabled = !!user && !!profile?.onboarded;

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [workoutsReady, setWorkoutsReady] = useState(false);
  const [workoutsLoading, setWorkoutsLoading] = useState(false);

  const [nutritionEntries, setNutritionEntries] = useState<Nutrition[]>([]);
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [nutritionReady, setNutritionReady] = useState(false);
  const [nutritionLoading, setNutritionLoading] = useState(false);

  const [coachPlans, setCoachPlans] = useState<CoachPlanSummary[]>([]);
  const [coachPlansReady, setCoachPlansReady] = useState(false);
  const [coachPlansLoading, setCoachPlansLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);

  const resetAll = useCallback(() => {
    setWorkouts([]);
    setTemplates([]);
    setWorkoutsReady(false);
    setWorkoutsLoading(false);
    setNutritionEntries([]);
    setMealTemplates([]);
    setNutritionReady(false);
    setNutritionLoading(false);
    setCoachPlans([]);
    setCoachPlansReady(false);
    setCoachPlansLoading(false);
    setBootstrapError(false);
  }, []);

  const fetchWorkouts = useCallback(async () => {
    if (!user) return;
    let workouts: Workout[] = [];
    try {
      const [w, t] = await withTimeout(
        Promise.all([
          api<Workout[]>('/api/workouts'),
          api<WorkoutTemplate[]>('/api/workout-templates'),
        ]),
        BOOTSTRAP_FETCH_TIMEOUT_MS,
        'workouts bootstrap',
      );
      workouts = w;
      setWorkouts(w);
      setTemplates(t);
    } catch (err) {
      console.error('AppData: workouts fetch error:', err);
      throw err;
    } finally {
      setWorkoutsReady(true);
      setWorkoutsLoading(false);
    }
    void reconcileSessionDraft(workouts).catch(err => {
      console.warn('AppData: session draft reconcile skipped:', err);
    });
  }, [user]);

  const fetchNutrition = useCallback(async () => {
    if (!user) return;
    try {
      const [n, t] = await withTimeout(
        Promise.all([
          api<Nutrition[]>('/api/nutrition'),
          api<MealTemplate[]>('/api/meal-templates'),
        ]),
        BOOTSTRAP_FETCH_TIMEOUT_MS,
        'nutrition bootstrap',
      );
      setNutritionEntries(n);
      setMealTemplates(t);
    } catch (err) {
      console.error('AppData: nutrition fetch error:', err);
      throw err;
    } finally {
      setNutritionReady(true);
      setNutritionLoading(false);
    }
  }, [user]);

  const fetchExerciseNameLocalizations = useCallback(async () => {
    if (!user) return;
    if (profile?.uiLocale === 'en') return;
    try {
      const res = await api<{ names?: Record<string, string> }>('/api/exercise-name-localizations');
      if (res.names && typeof res.names === 'object') {
        setExerciseGermanNameCache(res.names);
      }
    } catch (err) {
      console.warn('AppData: exercise name localizations fetch error:', err);
    }
  }, [user, profile?.uiLocale]);

  const runCoachMaintenance = useCallback(async (plans: CoachPlanSummary[]) => {
    try {
      const [advance] = await Promise.all([
        tryCoachAutoAdvanceForActivePlans(plans),
        ensureUserWeeklyReport().catch(() => null),
      ]);
      if (advance?.advanced) {
        const refreshed = await api<CoachPlanSummary[]>('/api/coach/plans');
        setCoachPlans(refreshed);
      }
    } catch (err) {
      console.warn('AppData: coach maintenance skipped:', err);
    }
  }, []);

  const fetchCoachPlans = useCallback(async () => {
    if (!user) return;
    let plans: CoachPlanSummary[] = [];
    try {
      plans = await withTimeout(
        api<CoachPlanSummary[]>('/api/coach/plans'),
        BOOTSTRAP_FETCH_TIMEOUT_MS,
        'coach plans bootstrap',
      );
      setCoachPlans(plans);
    } catch (err) {
      console.error('AppData: coach plans fetch error:', err);
      throw err;
    } finally {
      setCoachPlansReady(true);
      setCoachPlansLoading(false);
    }
    void runCoachMaintenance(plans);
  }, [user, runCoachMaintenance]);

  const bootstrap = useCallback(async () => {
    if (!dataEnabled) return;
    setBootstrapError(false);
    setWorkoutsLoading(true);
    setNutritionLoading(true);
    setCoachPlansLoading(true);
    setWorkoutsReady(false);
    setNutritionReady(false);
    setCoachPlansReady(false);
    const results = await Promise.allSettled([
      fetchWorkouts(),
      fetchNutrition(),
      fetchCoachPlans(),
    ]);
    if (results.some(r => r.status === 'rejected')) {
      setBootstrapError(true);
    }
    void fetchExerciseNameLocalizations();
  }, [dataEnabled, fetchWorkouts, fetchNutrition, fetchCoachPlans, fetchExerciseNameLocalizations]);

  const bootstrapRef = useRef(bootstrap);
  bootstrapRef.current = bootstrap;

  const userId = user?.id;
  const onboarded = profile?.onboarded;

  useEffect(() => {
    if (!userId || !onboarded) {
      resetAll();
      return;
    }
    void bootstrapRef.current();
  }, [userId, onboarded, resetAll]);

  const refetchWorkouts = useCallback(async () => {
    if (!user) return;
    await fetchWorkouts();
  }, [user, fetchWorkouts]);

  const refetchNutrition = useCallback(async () => {
    if (!user) return;
    await fetchNutrition();
  }, [user, fetchNutrition]);

  const refetchCoachPlans = useCallback(async () => {
    if (!user) return;
    setCoachPlansLoading(true);
    await Promise.all([fetchCoachPlans(), fetchExerciseNameLocalizations()]);
  }, [user, fetchCoachPlans, fetchExerciseNameLocalizations]);

  const flushOfflineQueue = useCallback(async () => {
    if (!user) return;
    const queue = loadOfflineWorkoutQueue();
    for (const item of queue) {
      try {
        const { id } = await api<{ id: string }>('/api/workouts', {
          method: 'POST',
          body: JSON.stringify(item),
        });
        dequeueOfflineWorkout(item.localId);
        setWorkouts(prev =>
          prev.map(w => (w.id === item.localId ? { ...item, id } as Workout : w)),
        );
      } catch {
        break;
      }
    }
    if (queue.length) await refetchWorkouts();
  }, [user, refetchWorkouts]);

  useEffect(() => {
    if (!dataEnabled) return;
    void flushOfflineQueue();
  }, [dataEnabled, flushOfflineQueue]);

  useEffect(() => {
    const onRefresh = () => {
      void refetchWorkouts();
    };
    window.addEventListener('vrtx-workout-templates-changed', onRefresh);
    return () => window.removeEventListener('vrtx-workout-templates-changed', onRefresh);
  }, [refetchWorkouts]);

  const addWorkout = async (workout: Omit<Workout, 'id'>) => {
    try {
      const { id } = await api<{ id: string }>('/api/workouts', {
        method: 'POST',
        body: JSON.stringify(workout),
      });
      await refetchWorkouts();
      return id;
    } catch (err) {
      console.error('addWorkout failed, queueing offline:', err);
      const localId = enqueueOfflineWorkout(workout);
      setWorkouts(prev => [...prev, { ...workout, id: localId } as Workout]);
      return localId;
    }
  };

  const updateWorkout = async (id: string, data: Partial<Workout>) => {
    await api(`/api/workouts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    await refetchWorkouts();
  };

  const deleteWorkout = async (id: string) => {
    await api(`/api/workouts/${id}`, { method: 'DELETE' });
    setWorkouts(prev => prev.filter(w => w.id !== id));
  };

  const addTemplate = async (template: Omit<WorkoutTemplate, 'id'>) => {
    await api('/api/workout-templates', { method: 'POST', body: JSON.stringify(template) });
    await refetchWorkouts();
  };

  const updateTemplate = async (id: string, data: Partial<WorkoutTemplate>) => {
    await api(`/api/workout-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    await refetchWorkouts();
  };

  const deleteTemplate = async (id: string) => {
    await api(`/api/workout-templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const addMeal = async (data: Partial<Nutrition>) => {
    await api('/api/nutrition', { method: 'POST', body: JSON.stringify(data) });
    await refetchNutrition();
  };

  const updateMeal = async (data: Nutrition) => {
    await api(`/api/nutrition/${data.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    await refetchNutrition();
  };

  const deleteMeal = async (id: string) => {
    await api(`/api/nutrition/${id}`, { method: 'DELETE' });
    setNutritionEntries(prev => prev.filter(e => e.id !== id));
  };

  const saveTemplate = async (template: Partial<MealTemplate>) => {
    await api('/api/meal-templates', { method: 'POST', body: JSON.stringify(template) });
    await refetchNutrition();
  };

  const updateMealTemplate = async (
    payload: Partial<MealTemplate> & {
      id: string;
      name: string;
      category: MealTemplate['category'];
      ingredients: MealTemplate['ingredients'];
      totalCalories: number;
      totalProtein: number;
      totalCarbs: number;
      totalFat: number;
      yieldsPortions?: number;
    },
  ) => {
    const { id, ...body } = payload;
    await api(`/api/meal-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    await refetchNutrition();
  };

  const deleteMealTemplate = async (id: string) => {
    await api(`/api/meal-templates/${id}`, { method: 'DELETE' });
    setMealTemplates(prev => prev.filter(t => t.id !== id));
  };

  const bootstrapLoading =
    dataEnabled && (!workoutsReady || !nutritionReady || !coachPlansReady);

  const value = useMemo<AppDataContextValue>(
    () => ({
      workouts,
      templates,
      workoutsLoading: dataEnabled && workoutsLoading && !workoutsReady,
      workoutsReady,
      nutritionEntries,
      mealTemplates,
      nutritionLoading: dataEnabled && nutritionLoading && !nutritionReady,
      nutritionReady,
      coachPlans,
      coachPlansLoading: dataEnabled && coachPlansLoading && !coachPlansReady,
      coachPlansReady,
      bootstrapLoading,
      bootstrapError,
      retryBootstrap: bootstrap,
      addWorkout,
      updateWorkout,
      deleteWorkout,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      refetchWorkouts,
      flushOfflineQueue,
      offlinePending: loadOfflineWorkoutQueue().length,
      addMeal,
      updateMeal,
      deleteMeal,
      saveTemplate,
      updateMealTemplate,
      deleteMealTemplate,
      refetchNutrition,
      refetchCoachPlans,
    }),
    [
      workouts,
      templates,
      workoutsLoading,
      workoutsReady,
      nutritionEntries,
      mealTemplates,
      nutritionLoading,
      nutritionReady,
      coachPlans,
      coachPlansLoading,
      coachPlansReady,
      bootstrapLoading,
      bootstrapError,
      dataEnabled,
      bootstrap,
      refetchWorkouts,
      flushOfflineQueue,
      refetchNutrition,
      refetchCoachPlans,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return ctx;
}

export function useWorkouts() {
  const d = useAppData();
  return {
    workouts: d.workouts,
    templates: d.templates,
    loading: d.workoutsLoading,
    addWorkout: d.addWorkout,
    updateWorkout: d.updateWorkout,
    deleteWorkout: d.deleteWorkout,
    addTemplate: d.addTemplate,
    updateTemplate: d.updateTemplate,
    deleteTemplate: d.deleteTemplate,
    refetch: d.refetchWorkouts,
    flushOfflineQueue: d.flushOfflineQueue,
    offlinePending: d.offlinePending,
  };
}

export function useNutrition() {
  const d = useAppData();
  return {
    nutritionEntries: d.nutritionEntries,
    mealTemplates: d.mealTemplates,
    loading: d.nutritionLoading,
    addMeal: d.addMeal,
    updateMeal: d.updateMeal,
    deleteMeal: d.deleteMeal,
    saveTemplate: d.saveTemplate,
    updateTemplate: d.updateMealTemplate,
    deleteTemplate: d.deleteMealTemplate,
    refetch: d.refetchNutrition,
    addNutritionEntry: d.addMeal,
  };
}

export function useCoachPlans() {
  const d = useAppData();
  return {
    coachPlans: d.coachPlans,
    loading: d.coachPlansLoading,
    ready: d.coachPlansReady,
    refetch: d.refetchCoachPlans,
  };
}

export function useAppBootstrap() {
  const d = useAppData();
  return {
    loading: d.bootstrapLoading,
    error: d.bootstrapError,
    retry: d.retryBootstrap,
  };
}
