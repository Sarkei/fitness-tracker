/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { useAiCapabilities } from '@/src/lib/AiCapabilitiesContext';
import { ArrowRight, ArrowLeft, Loader2, Brain, Dumbbell, Apple, Moon, Sun, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { uiBtnPrimary, uiChoice } from '@/src/lib/uiChoices';
import { forceReleaseAllOverlayScrollLocks, resetMobileChromeAfterOverlay } from '@/src/lib/mobileViewport';
import CoachPlanGenerationModal from '@/src/components/coach/CoachPlanGenerationModal';
import {
  abortCoachPlanCreation,
  createCoachPlanAndWait,
} from '@/src/lib/coachPlanCreation';
import type { CoachPlanGenerationPhase } from '@/src/services/coachPlanService';
import type { NavigationFocus } from '@/src/lib/navigationFocus';
import type { UiLocale } from '@/src/lib/i18n';
import type { CoachSetupKind } from '@/src/lib/coachSetupQueue';
import { getStoredTheme, persistTheme, resolveTheme, type ThemeMode } from '@/src/lib/themePreference';
import CoachOnboarding, { type OnboardingData } from '@/src/components/coach/CoachOnboarding';
import { DATA_MIGRATION_VERSION } from '@/src/lib/dataMigration';
import { format } from 'date-fns';
import { formatUserError } from '@/src/lib/formatUserError';
import { api } from '@/src/lib/api';
import type { UserProfile } from '@/src/types';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog';

type StepId = 'prefs' | 'basics' | 'measurements' | 'goals' | 'coach';

type FormData = {
  age: number | '';
  gender: string;
  height: number | '';
  weight: number | '';
  activityLevel: string;
  goalType: 'lose' | 'maintain' | 'gain';
};

const EMPTY_FORM: FormData = {
  age: '',
  gender: '',
  height: '',
  weight: '',
  activityLevel: '',
  goalType: 'maintain',
};

const STEPS: StepId[] = ['prefs', 'basics', 'measurements', 'goals', 'coach'];

export default function OnboardingFlow() {
  const { user, profile, updateProfile, refreshProfile, cancelRegistration, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const aiCaps = useAiCapabilities();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'steps' | 'coach-wizard'>('steps');
  const [step, setStep] = useState(0);
  const [uiPick, setUiPick] = useState<UiLocale>(() => locale);
  const [themePick, setThemePick] = useState<ThemeMode>(() => getStoredTheme());
  const [navPick, setNavPick] = useState<NavigationFocus>('hybrid');
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [coachWorkout, setCoachWorkout] = useState(false);
  const [coachNutrition, setCoachNutrition] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [coachQueue, setCoachQueue] = useState<CoachSetupKind[]>([]);
  const [coachIndex, setCoachIndex] = useState(0);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [genPhase, setGenPhase] = useState<CoachPlanGenerationPhase | null>('queued');
  const [genError, setGenError] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [cancellingGen, setCancellingGen] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [cancelRegConfirmOpen, setCancelRegConfirmOpen] = useState(false);
  const [coachCloseConfirmOpen, setCoachCloseConfirmOpen] = useState(false);
  const genAbortRef = useRef<AbortController | null>(null);

  const stepId = STEPS[step] ?? 'prefs';
  const coachAiAvailable = aiCaps.enabled && !aiCaps.loading;

  useEffect(() => {
    if (!coachAiAvailable) {
      setCoachWorkout(false);
      setCoachNutrition(false);
    }
  }, [coachAiAvailable]);

  useEffect(() => {
    const mode = resolveTheme(profile?.themePreference ?? getStoredTheme());
    setThemePick(mode);
    persistTheme(mode);
  }, [profile?.themePreference]);

  const pickLanguage = async (l: UiLocale) => {
    setUiPick(l);
    await setLocale(l);
  };

  const pickTheme = (mode: ThemeMode) => {
    setThemePick(mode);
    persistTheme(mode);
  };

  const buildProfilePayload = (onboarded: boolean) => {
    const age = typeof formData.age === 'number' ? formData.age : 0;
    const gender = formData.gender || 'other';
    const height = Math.min(250, Math.max(100, Number(formData.height) || 170));
    const weight = Math.min(300, Math.max(30, Number(formData.weight) || 70));
    const activityLevel = formData.activityLevel || 'moderate';

    let bmr = 10 * weight + 6.25 * height - 5 * age;
    if (gender === 'male') bmr += 5;
    else bmr -= 161;

    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };

    const multiplier =
      activityMultipliers[activityLevel as keyof typeof activityMultipliers] || 1.2;
    const tdee = bmr * multiplier;

    let targetCalories = tdee;
    if (formData.goalType === 'lose') targetCalories -= 500;
    if (formData.goalType === 'gain') targetCalories += 500;

    const safeCalories = Number.isFinite(targetCalories) ? targetCalories : 2000;
    const proteinCount = (safeCalories * 0.3) / 4;
    const carbsCount = (safeCalories * 0.4) / 4;
    const fatCount = (safeCalories * 0.3) / 9;

    const weightEntry = { date: format(new Date(), 'yyyy-MM-dd'), value: weight };

    return {
      onboarded,
      uiLocale: uiPick,
      navigationFocus: navPick,
      themePreference: themePick,
      measurements: {
        age,
        gender: gender as 'male' | 'female' | 'other',
        height,
        weight,
        weightHistory: [weightEntry],
        activityLevel: activityLevel as
          | 'sedentary'
          | 'light'
          | 'moderate'
          | 'active'
          | 'very_active',
      },
      weightHistory: [weightEntry],
      goals: {
        type: formData.goalType,
        dailyCalories: Math.round(safeCalories),
        dailySteps: 10000,
        dailyWaterMl: 2500,
        macros: {
          protein: Math.round(proteinCount),
          carbs: Math.round(carbsCount),
          fat: Math.round(fatCount),
        },
      },
    } as Record<string, unknown>;
  };

  const migrationExtras = () =>
    ({
      dataMigrationVersion: DATA_MIGRATION_VERSION,
      migrationRequired: false,
    }) as Record<string, unknown>;

  const finishOnboarding = async () => {
    if (!user || completing) return;
    setProfileError('');
    setCompleting(true);
    try {
      await updateProfile({ ...buildProfilePayload(true), ...migrationExtras() });
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      let recovered = false;
      try {
        const latest = await api<UserProfile>('/api/profile');
        recovered = latest.onboarded === true;
        if (recovered) await refreshProfile();
      } catch {
        /* ignore */
      }
      if (recovered) {
        navigate('/', { replace: true });
        return;
      }
      setProfileError(formatUserError(error, t, 'onb.finishError'));
      setCompleting(false);
    }
  };

  const startCoachWizard = async () => {
    if (!user || completing) return;
    setProfileError('');
    setCompleting(true);
    try {
      await updateProfile(buildProfilePayload(false));
      forceReleaseAllOverlayScrollLocks();
      resetMobileChromeAfterOverlay();
      setPhase('coach-wizard');
      setCoachIndex(0);
    } catch (error) {
      console.error('Error saving profile before coach:', error);
      setProfileError(t('onb.finishError'));
    } finally {
      setCompleting(false);
    }
  };

  const handleCoachPlanComplete = async (onboardingData: OnboardingData, discipline: string) => {
    genAbortRef.current?.abort();
    const ac = new AbortController();
    genAbortRef.current = ac;
    setCreatingPlan(true);
    setGenError(null);
    setGenPhase('queued');
    let planId: string | null = null;
    
    const nextIndex = coachIndex + 1;
    const hasMoreCoachQueue = nextIndex < coachQueue.length;

    // Immer blocking erstellen, damit der Lade-/Status-Popup sichtbar bleibt.
    try {
      planId = await createCoachPlanAndWait(
        {
          type: onboardingData.type,
          discipline,
          planMode: (onboardingData as { planMode?: string }).planMode ?? 'ongoing',
          eventName: (onboardingData as { eventName?: string }).eventName,
          eventDate: (onboardingData as { eventDate?: string }).eventDate,
          eventDistance: (onboardingData as { eventDistance?: string }).eventDistance,
          onboardingData,
        },
        {
          signal: ac.signal,
          onPlanCreated: id => setActivePlanId(id),
          onTick: state => {
            if (state.phase) setGenPhase(state.phase);
            if (state.status === 'ready') setGenPhase('ready');
          },
        },
      );
      setActivePlanId(null);
      if (hasMoreCoachQueue) {
        setCoachIndex(nextIndex);
        setCreateMsg('');
        setGenPhase('queued');
      } else {
        await updateProfile({ ...buildProfilePayload(true), ...migrationExtras() });
        navigate('/', { replace: true });
        return;
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setCreateMsg(t('coach.gen.cancelled'));
      } else {
        const raw = err instanceof Error ? err.message : String(err);
        const msg =
          raw === 'COACH_GEN_TIMEOUT'
            ? t('coach.gen.timeout')
            : t('coach.msg.err', { msg: raw });
        setGenError(msg);
        setCreateMsg(msg);
      }
      if (planId) await abortCoachPlanCreation(planId);
    } finally {
      setCreatingPlan(false);
      setCancellingGen(false);
      genAbortRef.current = null;
      forceReleaseAllOverlayScrollLocks();
    }
  };

  const handleCancelGeneration = async () => {
    setCancellingGen(true);
    genAbortRef.current?.abort();
    await abortCoachPlanCreation(activePlanId);
    setActivePlanId(null);
    setCreatingPlan(false);
    setGenError(null);
    setCancellingGen(false);
  };

  const canProceed = (): boolean => {
    if (stepId === 'basics') {
      const age = typeof formData.age === 'number' ? formData.age : 0;
      return age >= 10 && age <= 99 && !!formData.gender;
    }
    if (stepId === 'measurements') {
      const h = typeof formData.height === 'number' ? formData.height : 0;
      const w = typeof formData.weight === 'number' ? formData.weight : 0;
      return h >= 100 && h <= 250 && w >= 30 && w <= 300 && !!formData.activityLevel;
    }
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) return;

    if (stepId === 'coach') {
      const queue: CoachSetupKind[] = [
        ...(coachWorkout ? (['workout'] as const) : []),
        ...(coachNutrition ? (['nutrition'] as const) : []),
      ];
      if (queue.length && aiCaps.enabled) {
        setCoachQueue(queue);
        void startCoachWizard();
        return;
      }
      void finishOnboarding();
      return;
    }

    if (step < STEPS.length - 1) setStep(s => s + 1);
    else void finishOnboarding();
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const handleCancelRegistration = () => {
    if (completing || creatingPlan) return;
    setCancelRegConfirmOpen(true);
  };

  const confirmCancelRegistration = () => {
    setCancelRegConfirmOpen(false);
    void (async () => {
      setProfileError('');
      try {
        await cancelRegistration();
      } catch (err) {
        console.error('Cancel registration failed:', err);
        logout();
        setProfileError(t('onb.cancelFailed'));
      }
    })();
  };

  const titles: Record<StepId, string> = {
    prefs: t('onb.step.basics'),
    basics: t('onb.step.demographics'),
    measurements: t('onb.step.measurements'),
    goals: t('onb.step.goals'),
    coach: t('onb.step.coach'),
  };

  const subs: Record<StepId, string> = {
    prefs: t('onb.step.basicsDesc'),
    basics: t('onb.step.demographicsDesc'),
    measurements: t('onb.step.measurementsDesc'),
    goals: t('onb.step.goalsDesc'),
    coach: t('onb.step.coachDesc'),
  };

  const inputClass =
    'w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-2xl p-4 font-bold text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-brand';
  const progressSteps = STEPS;

  if (phase === 'coach-wizard' && coachQueue.length > 0) {
    const currentKind = coachQueue[coachIndex];
    return (
      <>
        <CoachOnboarding
          key={`${currentKind}-${coachIndex}`}
          planType={currentKind}
          onComplete={handleCoachPlanComplete}
          onClose={() => {
            if (creatingPlan) return;
            setCoachCloseConfirmOpen(true);
          }}
        />
        <CoachPlanGenerationModal
          open={creatingPlan}
          planLabel={
            currentKind === 'workout' ? t('coach.onb.brand.workout') : t('coach.onb.brand.nutrition')
          }
          queueHint={
            coachQueue.length > 1
              ? t('onb.coach.progress', { current: coachIndex + 1, total: coachQueue.length })
              : undefined
          }
          phase={genPhase}
          message={createMsg}
          error={genError}
          cancelling={cancellingGen}
          onCancel={() => {
            if (genError) {
              setCreatingPlan(false);
              setGenError(null);
              return;
            }
            void handleCancelGeneration();
          }}
        />
        <ConfirmDialog
          open={coachCloseConfirmOpen}
          title={t('onb.cancel')}
          message={t('onb.coach.cancelConfirm')}
          variant="danger"
          confirmLabel={t('onb.cancel')}
          onCancel={() => setCoachCloseConfirmOpen(false)}
          onConfirm={() => {
            setCoachCloseConfirmOpen(false);
            setPhase('steps');
            setStep(STEPS.indexOf('coach'));
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--text-primary)] flex items-center justify-center p-4 transition-colors duration-300">
      <div className="max-w-xl w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-[2.5rem] shadow-2xl p-8 md:p-12">
        <div className="mb-12">
          <div className="flex gap-2 mb-8">
            {progressSteps.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors duration-300',
                  i <= step ? 'bg-brand' : 'bg-[var(--border-muted)]',
                )}
              />
            ))}
          </div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-2 text-[var(--text-primary)]">
            {titles[stepId]}
          </h1>
          {subs[stepId] ? <p className="text-[var(--text-muted)] font-medium">{subs[stepId]}</p> : null}
        </div>

        <div className="min-h-[300px]">
          {stepId === 'prefs' && (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-3">
                  {t('onb.language')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(['de', 'en'] as const).map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => void pickLanguage(l)}
                      className={cn(
                        'p-4 rounded-2xl font-black uppercase tracking-widest text-sm',
                        uiChoice(uiPick === l),
                      )}
                    >
                      {l === 'de' ? t('auth.langDe') : t('auth.langEn')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-3">
                  {t('profile.theme')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => pickTheme('light')}
                    className={cn(
                      'p-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2',
                      uiChoice(themePick === 'light'),
                    )}
                  >
                    <Sun size={16} />
                    {t('profile.theme.light')}
                  </button>
                  <button
                    type="button"
                    onClick={() => pickTheme('dark')}
                    className={cn(
                      'p-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2',
                      uiChoice(themePick === 'dark'),
                    )}
                  >
                    <Moon size={16} />
                    {t('profile.theme.dark')}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-3">
                  {t('onb.focus')}
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      ['hybrid', t('onb.focus.hybrid')],
                      ['workout', t('onb.focus.workout')],
                      ['nutrition', t('onb.focus.nutrition')],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setNavPick(id)}
                      className={cn(
                        'p-4 rounded-2xl font-black uppercase tracking-widest text-xs text-left',
                        uiChoice(navPick === id),
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-muted)] font-medium mt-3">{t('onb.focusHelp')}</p>
              </div>
            </div>
          )}

          {stepId === 'basics' && (
            <div className="space-y-6">
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 block">
                  {t('onb.age')}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={99}
                  required
                  placeholder={t('onb.placeholder.age')}
                  value={formData.age === '' ? '' : formData.age}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      age: e.target.value === '' ? '' : parseInt(e.target.value, 10) || '',
                    }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 block">
                  {t('auth.gender')}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {(['male', 'female'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, gender: g }))}
                      className={cn(
                        'p-4 rounded-2xl font-bold uppercase tracking-widest text-sm',
                        uiChoice(formData.gender === g),
                      )}
                    >
                      {g === 'male' ? t('onb.gender.male') : t('onb.gender.female')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepId === 'measurements' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 block">
                    {t('onb.height')}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    required
                    placeholder={t('onb.placeholder.height')}
                    value={formData.height === '' ? '' : formData.height}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        height: e.target.value === '' ? '' : parseInt(e.target.value, 10) || '',
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 block">
                    {t('onb.weight')}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    required
                    placeholder={t('onb.placeholder.weight')}
                    value={formData.weight === '' ? '' : formData.weight}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        weight: e.target.value === '' ? '' : parseInt(e.target.value, 10) || '',
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 block">
                  {t('onb.activity')}
                </label>
                <select
                  value={formData.activityLevel}
                  onChange={e => setFormData(prev => ({ ...prev, activityLevel: e.target.value }))}
                  className={cn(inputClass, !formData.activityLevel && 'text-[var(--text-placeholder)]')}
                >
                  <option value="">{t('onb.placeholder.activity')}</option>
                  <option value="sedentary">{t('onb.activity.sedentary')}</option>
                  <option value="light">{t('onb.activity.light')}</option>
                  <option value="moderate">{t('onb.activity.moderate')}</option>
                  <option value="active">{t('onb.activity.active')}</option>
                  <option value="very_active">{t('onb.activity.very_active')}</option>
                </select>
              </div>
            </div>
          )}

          {stepId === 'goals' && (
            <div className="space-y-6">
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-2 block">
                  {t('onb.primaryGoal')}
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { id: 'lose' as const, label: t('onb.goal.lose.label'), sub: t('onb.goal.lose.sub') },
                      { id: 'maintain' as const, label: t('onb.goal.maintain.label'), sub: t('onb.goal.maintain.sub') },
                      { id: 'gain' as const, label: t('onb.goal.gain.label'), sub: t('onb.goal.gain.sub') },
                    ]
                  ).map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, goalType: g.id }))}
                      className={cn(
                        'p-6 rounded-2xl text-left flex flex-col gap-1',
                        uiChoice(formData.goalType === g.id),
                      )}
                    >
                      <span
                        className={cn(
                          'font-black uppercase tracking-widest text-sm',
                          formData.goalType === g.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
                        )}
                      >
                        {g.label}
                      </span>
                      <span className="text-[10px] font-medium opacity-60 uppercase tracking-widest">{g.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepId === 'coach' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">{t('onb.coach.sub')}</p>
              {!aiCaps.loading && !aiCaps.enabled && (
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 font-medium">
                  {t('onb.coach.aiDisabled')}
                </p>
              )}
              <label
                className={cn(
                  'flex items-center gap-3 p-4 rounded-2xl border-2 transition-all',
                  coachAiAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                  coachWorkout ? 'border-brand bg-brand/15' : 'border-[var(--border-muted)] bg-[var(--background)]',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  disabled={!coachAiAvailable}
                  checked={coachWorkout}
                  onChange={e => coachAiAvailable && setCoachWorkout(e.target.checked)}
                />
                <Dumbbell size={18} className={coachWorkout ? 'text-brand' : 'text-[var(--text-muted)]'} />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('onb.coach.workout')}</span>
              </label>
              <label
                className={cn(
                  'flex items-center gap-3 p-4 rounded-2xl border-2 transition-all',
                  coachAiAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                  coachNutrition ? 'border-brand bg-brand/15' : 'border-[var(--border-muted)] bg-[var(--background)]',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  disabled={!coachAiAvailable}
                  checked={coachNutrition}
                  onChange={e => coachAiAvailable && setCoachNutrition(e.target.checked)}
                />
                <Apple size={18} className={coachNutrition ? 'text-brand' : 'text-[var(--text-muted)]'} />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('onb.coach.nutrition')}</span>
              </label>
              <label
                className={cn(
                  'flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all',
                  !coachWorkout && !coachNutrition
                    ? 'border-brand/50 bg-brand/5'
                    : 'border-[var(--border-muted)] bg-[var(--background)]',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={!coachWorkout && !coachNutrition}
                  onChange={() => {
                    setCoachWorkout(false);
                    setCoachNutrition(false);
                  }}
                />
                <Brain size={18} className="text-[var(--text-muted)]" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('onb.coach.skip')}</span>
              </label>
              {(coachWorkout || coachNutrition) && aiCaps.enabled && (
                <p className="text-[10px] text-brand font-medium bg-brand/10 border border-brand/25 rounded-xl p-3">
                  {t('onb.coach.wizardHint')}
                </p>
              )}
            </div>
          )}
        </div>

        {profileError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-4 text-sm font-bold text-red-700 dark:text-red-300">
            {profileError}
          </div>
        )}

        <div className="flex justify-between items-center mt-12">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={completing || creatingPlan}
              className="px-6 py-4 rounded-2xl font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <ArrowLeft size={20} />
              {t('onb.back')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelRegistration}
              disabled={completing || creatingPlan}
              className="px-6 py-4 rounded-2xl font-bold text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              aria-label={t('onb.cancel')}
            >
              <X size={20} />
              {t('onb.cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={completing || !canProceed()}
            className={cn(uiBtnPrimary, 'px-10 py-4 text-sm hover:translate-x-0.5 disabled:opacity-50')}
          >
            {completing
              ? t('onb.completing')
              : stepId === 'coach' && (coachWorkout || coachNutrition) && aiCaps.enabled
                ? t('onb.coach.continue')
                : step === STEPS.length - 1
                  ? t('onb.finish')
                  : t('onb.next')}
            {completing ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={20} />}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={cancelRegConfirmOpen}
        title={t('onb.cancel')}
        message={t('onb.cancelConfirm')}
        variant="danger"
        confirmLabel={t('onb.cancel')}
        onCancel={() => setCancelRegConfirmOpen(false)}
        onConfirm={confirmCancelRegistration}
      />
    </div>
  );
}



