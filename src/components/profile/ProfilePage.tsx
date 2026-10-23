/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/src/lib/AuthContext';
import { User, LogOut, Loader2, Plus, Target, Moon, Sun, X, FileText, Camera, Image, ArrowUpRight, ArrowDownRight, Trash2, Download } from 'lucide-react';
import { useWorkouts } from '@/src/lib/useWorkouts';
import { useNutrition } from '@/src/lib/useNutrition';
import { generatePeriodFitnessReport, allowedReportRangeKeys, type ReportRangeKey } from '@/src/lib/periodReport';
import { api } from '@/src/lib/api';
import { formatUserError } from '@/src/lib/formatUserError';
import ErrorBanner from '@/src/components/ui/ErrorBanner';
import type { Post } from '@/src/lib/useSocial';
import { cn } from '@/src/lib/utils';
import ReportHistoryView from './ReportHistoryView';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { useI18n } from '@/src/lib/i18n';
import type { NavigationFocus } from '@/src/lib/navigationFocus';
import { buildExportBundle, downloadCsvExport, downloadJsonExport } from '@/src/lib/dataExport';
import { persistTheme } from '@/src/lib/themePreference';
import { resolveUserNameFields, validateNameParts } from '@/src/lib/userName';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

// ─── TDEE Calculator (Mifflin-St-Jeor) ───────────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calcTDEE(weight: number, height: number, age: number, gender: string, activity: string): number {
  const bmr =
    gender === 'female'
      ? 10 * weight + 6.25 * height - 5 * age - 161
      : 10 * weight + 6.25 * height - 5 * age + 5;
  return Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity] ?? 1.55));
}

function calcProtocolCalories(
  tdee: number,
  protocol: 'lose' | 'maintain' | 'gain'
): number {
  if (protocol === 'lose') return Math.max(1200, tdee - 500);
  if (protocol === 'gain') return tdee + 300;
  return tdee;
}

function deriveProtocol(
  currentWeight: number | undefined,
  targetWeight: number | null | undefined
): 'lose' | 'maintain' | 'gain' {
  if (!targetWeight || !currentWeight) return 'maintain';
  if (targetWeight < currentWeight - 0.5) return 'lose';
  if (targetWeight > currentWeight + 0.5) return 'gain';
  return 'maintain';
}

const PROTOCOL_COLORS = {
  lose: 'text-orange-500',
  maintain: 'text-brand',
  gain: 'text-green-500',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const location = useLocation();
  const { profile, logout, deleteAccount, updateProfile } = useAuth();
  const { t, setLocale, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const { workouts } = useWorkouts();
  const { nutritionEntries } = useNutrition();
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [isAddingWeight, setIsAddingWeight] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [socialMeta, setSocialMeta] = useState<{ followers: number; following: number } | null>(null);
  const [archive, setArchive] = useState<'transformation' | 'liked' | 'posts' | null>(null);
  const [archivePosts, setArchivePosts] = useState<Post[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const archivePanelRef = useRef<HTMLElement>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const checkInGalleryRef = useRef<HTMLInputElement>(null);
  const checkInCameraRef = useRef<HTMLInputElement>(null);
  const [checkInPhoto, setCheckInPhoto] = useState<{ preview: string; file: File } | null>(null);
  const [reportRange, setReportRange] = useState<ReportRangeKey>('7d');
  const [reportCustomDate, setReportCustomDate] = useState('');
  const [reportError, setReportError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<'confirm' | 'password'>('confirm');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [nameFirst, setNameFirst] = useState('');
  const [nameLast, setNameLast] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);

  useMobileOverlaySheet(isAddingWeight || deleteAccountOpen || showCheckIn);

  useEffect(() => {
    const st = location.state as { quickAction?: string; tab?: string } | null;
    if (st?.quickAction === 'weight') {
      setIsAddingWeight(true);
      window.history.replaceState({}, document.title);
    }
    if (st?.tab === 'reports') {
      requestAnimationFrame(() => {
        document.getElementById('profile-weekly-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (!profile) return;
    const names = resolveUserNameFields({
      first_name: profile.firstName,
      last_name: profile.lastName,
      display_name: profile.displayName,
    });
    setNameFirst(names.firstName);
    setNameLast(names.lastName);
    setNameError(null);
  }, [profile?.uid, profile?.firstName, profile?.lastName, profile?.displayName]);

  const handleSaveName = async () => {
    if (!profile) return;
    const first = nameFirst.trim();
    const last = nameLast.trim();
    if (!validateNameParts(first, last)) {
      setNameError(t('profile.settings.nameInvalid'));
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      await updateProfile({ firstName: first, lastName: last });
    } catch (error) {
      console.error(error);
      setNameError(formatUserError(error, t, 'profile.saveError'));
    } finally {
      setNameSaving(false);
    }
  };

  useEffect(() => {
    if (!profile?.uid) return;
    api<{ followers: number; following: number }>(`/api/users/${profile.uid}/social`)
      .then(d => setSocialMeta({ followers: d.followers, following: d.following }))
      .catch(() => setSocialMeta(null));
  }, [profile?.uid]);

  const clearCheckInPhoto = useCallback(() => {
    setCheckInPhoto(p => {
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return null;
    });
    if (checkInGalleryRef.current) checkInGalleryRef.current.value = '';
    if (checkInCameraRef.current) checkInCameraRef.current.value = '';
  }, []);

  const closeCheckIn = useCallback(() => {
    clearCheckInPhoto();
    setShowCheckIn(false);
  }, [clearCheckInPhoto]);

  const onCheckInImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setCheckInPhoto(prev => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return { preview: URL.createObjectURL(file), file };
    });
  };

  const openArchive = async (kind: 'transformation' | 'liked' | 'posts') => {
    if (!profile) return;
    setArchive(kind);
    if (kind === 'transformation') {
      setArchivePosts([]);
      return;
    }
    setArchivePosts([]);
    setArchiveLoading(true);
    try {
      if (kind === 'liked') {
        const p = await api<Post[]>('/api/posts/liked');
        setArchivePosts(p);
      } else {
        const p = await api<Post[]>(`/api/users/${profile.uid}/posts`);
        setArchivePosts(p);
      }
    } catch {
      setArchivePosts([]);
    } finally {
      setArchiveLoading(false);
    }
  };

  useEffect(() => {
    if (!archive) return;
    requestAnimationFrame(() => {
      archivePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [archive]);

  const setThemeMode = async (mode: 'light' | 'dark') => {
    if (!profile || profile.themePreference === mode) return;
    persistTheme(mode);
    try {
      await updateProfile({ themePreference: mode });
    } catch (error) {
      console.error(error);
    }
  };

  // ── Derived protocol & TDEE ────────────────────────────────────────────────

  const currentWeight = profile?.measurements?.weight;
  const targetWeight = profile?.goals?.weight ?? null;
  const derivedProtocol = useMemo(
    () => deriveProtocol(currentWeight, targetWeight),
    [currentWeight, targetWeight]
  );

  const weightTrendVsLastLog = useMemo((): 'up' | 'down' | null => {
    const w = profile?.measurements?.weight;
    const hist = profile?.weightHistory ?? profile?.measurements?.weightHistory;
    if (w == null || !hist?.length) return null;
    const sorted = [...hist].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastLog = sorted[sorted.length - 1]?.value;
    if (lastLog == null) return null;
    const d = w - lastLog;
    if (Math.abs(d) < 0.05) return null;
    return d > 0 ? 'up' : 'down';
  }, [profile?.measurements?.weight, profile?.weightHistory, profile?.measurements?.weightHistory]);

  const tdee = useMemo(() => {
    const m = profile?.measurements;
    if (!m?.weight || !m?.height || !m?.age) return null;
    return calcTDEE(m.weight, m.height, m.age, m.gender || 'male', m.activityLevel || 'moderate');
  }, [profile?.measurements]);

  // ── Goals form state ───────────────────────────────────────────────────────

  const [goalsForm, setGoalsForm] = useState({
    weight: profile?.goals?.weight ?? null as number | null,
    dailyCalories: profile?.goals?.dailyCalories || (tdee ?? 2400),
    dailySteps: profile?.goals?.dailySteps ?? 10000,
    dailyWaterMl: profile?.goals?.dailyWaterMl ?? 2500,
  });

  // Whenever user changes target weight, auto-update the calorie field
  const handleTargetWeightChange = (val: string) => {
    const parsed = val === '' ? null : parseFloat(val);
    const newProtocol = deriveProtocol(currentWeight, parsed);
    const newCalories = tdee ? calcProtocolCalories(tdee, newProtocol) : goalsForm.dailyCalories;
    setGoalsForm(prev => ({ ...prev, weight: parsed, dailyCalories: newCalories }));
  };

  const handleUpdateGoals = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveError('');
    try {
      const newProtocol = deriveProtocol(currentWeight, goalsForm.weight);
      await updateProfile({
        goals: {
          ...profile.goals,
          weight: goalsForm.weight ?? undefined,
          type: newProtocol,
          dailyCalories: goalsForm.dailyCalories,
          dailySteps: Math.max(1000, Math.round(goalsForm.dailySteps)),
          dailyWaterMl: Math.max(500, Math.round(goalsForm.dailyWaterMl)),
        },
      });
      setIsEditingGoals(false);
    } catch (error) {
      console.error(error);
      setSaveError(formatUserError(error, t, 'profile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwdNew.length < 8) {
      setPwdMsg(t('auth.passwordTooWeak'));
      return;
    }
    setPwdBusy(true);
    setPwdMsg('');
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew }),
      });
      setPwdCurrent('');
      setPwdNew('');
      setPwdMsg(t('profile.changePassword.ok'));
    } catch (err: unknown) {
      setPwdMsg(formatUserError(err, t, 'profile.saveError'));
    } finally {
      setPwdBusy(false);
    }
  };

  const handleAddWeight = async () => {
    if (!profile || !newWeight) return;
    setSaving(true);
    try {
      const newWeightVal = parseFloat(newWeight);
      const entry = { date: format(new Date(), 'yyyy-MM-dd'), value: newWeightVal };
      const currentHistory = profile.weightHistory ?? profile.measurements?.weightHistory ?? [];

      // Recalculate calories with new weight
      const m = profile.measurements;
      let newCalories = profile.goals?.dailyCalories;
      if (m?.height && m?.age) {
        const newTDEE = calcTDEE(newWeightVal, m.height, m.age, m.gender || 'male', m.activityLevel || 'moderate');
        const protocol = deriveProtocol(newWeightVal, targetWeight);
        newCalories = calcProtocolCalories(newTDEE, protocol);
      }

      await updateProfile({
        measurements: { ...(profile.measurements || {}), weight: newWeightVal },
        weightHistory: [...currentHistory, entry],
        goals: {
          ...profile.goals,
          type: deriveProtocol(newWeightVal, targetWeight),
          dailyCalories: newCalories,
        },
      } as any);
      setIsAddingWeight(false);
      setNewWeight('');
    } catch (error) {
      console.error(error);
      setSaveError(formatUserError(error, t, 'profile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onPhotoChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        try {
          await updateProfile({ photoURL: base64 });
        } catch (error) {
          console.error(error);
          setSaveError(formatUserError(error, t, 'profile.saveError'));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => logout();

  if (!profile) return (
    <div className="flex justify-center py-24">
      <Loader2 className="animate-spin text-brand" size={48} />
    </div>
  );

  const protocol = derivedProtocol;

  return (
    <div className="w-full space-y-10 pb-8 md:pb-16">

      {/* ── Avatar ── */}
      <div className="flex flex-col items-center gap-6 w-full">
        <label className="cursor-pointer group relative">
          <div className="w-40 h-40 bg-[var(--card-bg)] rounded-[3rem] overflow-hidden border-4 border-white shadow-2xl relative">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                <User size={64} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Plus size={32} />
            </div>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={onPhotoChange} />
        </label>
        <div className="text-center w-full">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">
            {profile?.displayName ||
              [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
              t('profile.elite')}
          </h2>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className={cn("text-[10px] font-black uppercase tracking-widest", PROTOCOL_COLORS[protocol])}>
              {t(`profile.protocol.${protocol}`)}
            </span>
          </div>
          <div className="flex items-center justify-center gap-8 mt-4">
            {socialMeta && (
              <>
                <div className="text-center">
                  <p className="text-xl font-black italic text-[var(--text-primary)]">{socialMeta.followers}</p>
                  <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('profile.followers')}</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black italic text-[var(--text-primary)]">{socialMeta.following}</p>
                  <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('profile.following')}</p>
                </div>
              </>
            )}
          </div>
        </div>

        <motion.div className="grid grid-cols-2 gap-2 w-full">
            <button
              type="button"
              onClick={() => setShowCheckIn(true)}
              className="col-span-2 min-h-[48px] px-5 rounded-2xl ui-btn-brand text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 touch-manipulation"
            >
              {t('profile.checkin')}
            </button>
            <button
              type="button"
              onClick={() =>
                archive === 'transformation' ? setArchive(null) : void openArchive('transformation')
              }
              className={cn(
                'min-h-[48px] px-4 rounded-2xl border text-[10px] font-black uppercase transition-colors',
                archive === 'transformation'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)]',
              )}
            >
              {t('profile.transformation')}
            </button>
            <button
              type="button"
              onClick={() => (archive === 'posts' ? setArchive(null) : void openArchive('posts'))}
              className={cn(
                'min-h-[48px] px-4 rounded-2xl border text-[10px] font-black uppercase transition-colors',
                archive === 'posts'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)]',
              )}
            >
              {t('profile.myPosts')}
            </button>
            <button
              type="button"
              onClick={() => (archive === 'liked' ? setArchive(null) : void openArchive('liked'))}
              className={cn(
                'col-span-2 min-h-[48px] px-3 rounded-2xl border text-[10px] font-black uppercase transition-colors touch-manipulation',
                archive === 'liked'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)]',
              )}
            >
              {t('profile.liked')}
            </button>
        </motion.div>

        <div className="w-full rounded-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] p-6 text-left space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('profile.settings.section')}
            </p>
            <div>
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] mb-2">{t('profile.settings.name')}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  autoComplete="given-name"
                  value={nameFirst}
                  onChange={e => setNameFirst(e.target.value)}
                  placeholder={t('auth.placeholderFirstName')}
                  className="min-h-[44px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 text-xs font-bold text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  minLength={2}
                  required
                />
                <input
                  type="text"
                  autoComplete="family-name"
                  value={nameLast}
                  onChange={e => setNameLast(e.target.value)}
                  placeholder={t('auth.placeholderLastName')}
                  className="min-h-[44px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 text-xs font-bold text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  minLength={2}
                  required
                />
              </div>
              {nameError && (
                <p className="mt-2 text-[10px] font-bold text-red-500">{nameError}</p>
              )}
              <button
                type="button"
                disabled={nameSaving}
                onClick={() => void handleSaveName()}
                className="mt-2 w-full min-h-[44px] rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {nameSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('profile.settings.nameSave')}
              </button>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] mb-2">{t('profile.settings.language')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void setLocale('de')}
                  className={cn(
                    'flex-1 min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors',
                    locale === 'de'
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand'
                  )}
                >
                  DE
                </button>
                <button
                  type="button"
                  onClick={() => void setLocale('en')}
                  className={cn(
                    'flex-1 min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors',
                    locale === 'en'
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand'
                  )}
                >
                  EN
                </button>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] mb-2">{t('profile.theme')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void setThemeMode('light')}
                  className={cn(
                    'flex-1 min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors flex items-center justify-center gap-2',
                    (profile.themePreference ?? 'dark') === 'light'
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand'
                  )}
                >
                  <Sun size={16} />
                  {t('profile.theme.light')}
                </button>
                <button
                  type="button"
                  onClick={() => void setThemeMode('dark')}
                  className={cn(
                    'flex-1 min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors flex items-center justify-center gap-2',
                    (profile.themePreference !== 'light')
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand'
                  )}
                >
                  <Moon size={16} />
                  {t('profile.theme.dark')}
                </button>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] mb-2">{t('profile.settings.focus')}</p>
              <select
                value={profile.navigationFocus ?? 'hybrid'}
                onChange={e =>
                  void updateProfile({
                    navigationFocus: e.target.value as NavigationFocus,
                  } as Record<string, unknown>)
                }
                className="w-full min-h-[44px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 text-xs font-bold text-[var(--text-primary)]"
              >
                <option value="hybrid">{t('onb.focus.hybrid')}</option>
                <option value="workout">{t('onb.focus.workout')}</option>
                <option value="nutrition">{t('onb.focus.nutrition')}</option>
              </select>
            </div>
        </div>

        {archive && (
            <motion.section
              ref={archivePanelRef}
              id="profile-archive-panel"
              role="region"
              aria-label={
                archive === 'transformation'
                  ? t('profile.transformation')
                  : archive === 'liked'
                    ? t('profile.liked')
                    : t('profile.myPosts')
              }
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-6 w-full text-left rounded-[1.75rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] shadow-lg overflow-hidden max-h-[min(72vh,720px)] flex flex-col"
            >
              <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-muted)] bg-[var(--background)]">
                <p className="text-xs font-black uppercase italic tracking-tight text-[var(--text-primary)] truncate">
                  {archive === 'transformation'
                    ? t('profile.transformation')
                    : archive === 'liked'
                      ? t('profile.liked')
                      : t('profile.myPosts')}
                </p>
                <button
                  type="button"
                  onClick={() => setArchive(null)}
                  className="shrink-0 p-2 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:opacity-90"
                  aria-label={t('profile.closePanel')}
                >
                  <X size={18} strokeWidth={2.25} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4">
                {archiveLoading && (
                  <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
                    <Loader2 className="animate-spin" size={22} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t('profile.loadingShort')}</span>
                  </div>
                )}
                {!archiveLoading && archive === 'transformation' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[...(profile.checkIns || [])].reverse().map(c => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-[var(--border-muted)] overflow-hidden bg-[var(--background)] hover:border-brand/30 transition-colors"
                      >
                        {c.photoURL ? (
                          <img src={c.photoURL} alt="" className="w-full aspect-[4/5] object-cover" />
                        ) : (
                          <div className="aspect-[4/5] flex items-center justify-center text-[var(--text-muted)] text-[10px]">—</div>
                        )}
                        <div className="p-2">
                          <p className="text-[9px] font-black uppercase text-[var(--text-primary)]">{c.date}</p>
                          {c.weight != null && <p className="text-xs font-bold mt-1">{c.weight} kg</p>}
                          {c.note && <p className="text-[10px] mt-1 text-[var(--text-muted)] line-clamp-3">{c.note}</p>}
                        </div>
                      </div>
                    ))}
                    {(profile.checkIns?.length ?? 0) === 0 && (
                      <p className="col-span-full text-center text-[var(--text-muted)] text-sm py-12">{t('profile.noCheckins')}</p>
                    )}
                  </div>
                )}
                {!archiveLoading && (archive === 'liked' || archive === 'posts') && (
                  <div className="space-y-3 w-full">
                    {archivePosts.map(p => (
                      <article
                        key={p.id}
                        className="rounded-xl border border-[var(--border-muted)] p-4 bg-[var(--background)] hover:border-brand/25 transition-colors"
                      >
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{p.userName}</p>
                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{p.content}</p>
                      </article>
                    ))}
                    {archivePosts.length === 0 && (
                      <p className="text-center text-[var(--text-muted)] text-sm py-12">{t('profile.empty')}</p>
                    )}
                  </div>
                )}
              </div>
            </motion.section>
        )}
      </div>

      {/* ── Biometrics Quick Stats ── */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--card-bg)] p-6 rounded-[2rem] border border-[var(--border-muted)] text-center">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <p className="text-3xl font-black italic tracking-tighter uppercase">{profile?.measurements?.weight ?? '—'}</p>
              {weightTrendVsLastLog === 'up' && (
                <ArrowUpRight
                  size={28}
                  className="text-green-500 shrink-0"
                  aria-label={t('profile.weightTrendUp')}
                  strokeWidth={2.5}
                />
              )}
              {weightTrendVsLastLog === 'down' && (
                <ArrowDownRight
                  size={28}
                  className="text-red-500 shrink-0"
                  aria-label={t('profile.weightTrendDown')}
                  strokeWidth={2.5}
                />
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-2">{t('profile.kgCurrent')}</p>
          </div>
          <div className="bg-[var(--card-bg)] p-6 rounded-[2rem] border border-[var(--border-muted)] flex flex-col justify-between text-center sm:text-left">
            <div>
              <p className="text-3xl font-black italic tracking-tighter uppercase text-center sm:text-left">{profile?.measurements?.height ?? '—'}</p>
              <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-2">{t('profile.cmHeight')}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingWeight(true)}
              className="mt-5 w-full min-h-[48px] rounded-xl bg-[var(--background)] border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] hover:border-brand transition-colors"
            >
              {t('profile.updateWeight.open')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Operational Goals ── */}
      <div className="space-y-6">
        <div className="flex justify-between items-end px-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">{t('profile.operationalGoals')}</h3>
          <button
            onClick={() => {
              setGoalsForm({
                weight: profile?.goals?.weight ?? null,
                dailyCalories: profile?.goals?.dailyCalories || (tdee ?? 2400),
                dailySteps: profile?.goals?.dailySteps ?? 10000,
                dailyWaterMl: profile?.goals?.dailyWaterMl ?? 2500,
              });
              setIsEditingGoals(!isEditingGoals);
            }}
            className="text-[10px] font-black uppercase text-brand hover:underline"
          >
            {isEditingGoals ? t('profile.cancel') : t('profile.adjust')}
          </button>
        </div>

        <div className="bg-[var(--card-bg)] p-8 rounded-[2.5rem] border border-[var(--border-muted)] shadow-sm space-y-6">
          {isEditingGoals ? (
            <div className="space-y-6">
              <div>
                <label className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.targetWeightLabel')}
                </label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    step="0.5"
                    value={goalsForm.weight ?? ''}
                    onChange={e => handleTargetWeightChange(e.target.value)}
                    placeholder={t('profile.targetWeightPlaceholder')}
                    className="flex-1 bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                  />
                  {goalsForm.weight !== null && (
                    <button
                      onClick={() => handleTargetWeightChange('')}
                      className="p-4 bg-[var(--background)] border border-[var(--border-muted)] rounded-xl text-[var(--text-muted)] hover:text-red-500 transition-colors"
                      title={t('profile.removeTargetTitle')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                {goalsForm.weight !== null && currentWeight && (
                  <p className={cn("text-[9px] font-black uppercase tracking-widest mt-2", PROTOCOL_COLORS[deriveProtocol(currentWeight, goalsForm.weight)])}>
                    → {t(`profile.protocol.${deriveProtocol(currentWeight, goalsForm.weight)}`)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.dailyKcal')}
                  {tdee ? ` ${t('profile.dailyKcalTdee', { tdee })}` : ''}
                </label>
                <input
                  type="number"
                  value={goalsForm.dailyCalories}
                  onChange={e => setGoalsForm({ ...goalsForm, dailyCalories: parseInt(e.target.value) })}
                  className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                />
                {tdee && (
                  <div className="flex gap-2 mt-2">
                    {(['lose', 'maintain', 'gain'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setGoalsForm({ ...goalsForm, dailyCalories: calcProtocolCalories(tdee, p) })}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border",
                          goalsForm.dailyCalories === calcProtocolCalories(tdee, p)
                            ? "border-2 border-brand bg-brand/15 text-[var(--text-primary)]"
                            : "bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand"
                        )}
                      >
                        {p === 'lose'
                          ? t('profile.macroLose', { kcal: calcProtocolCalories(tdee, 'lose') })
                          : p === 'maintain'
                            ? t('profile.macroKeep', { kcal: tdee })
                            : t('profile.macroGain', { kcal: calcProtocolCalories(tdee, 'gain') })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.dailySteps')}
                </label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={goalsForm.dailySteps}
                  onChange={e => setGoalsForm({ ...goalsForm, dailySteps: parseInt(e.target.value, 10) || 10000 })}
                  className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.dailyWater')}
                </label>
                <input
                  type="number"
                  min={500}
                  step={250}
                  value={goalsForm.dailyWaterMl}
                  onChange={e => setGoalsForm({ ...goalsForm, dailyWaterMl: parseInt(e.target.value, 10) || 2500 })}
                  className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                />
              </div>
              {saveError && <p className="text-xs font-bold text-red-600">{saveError}</p>}
              <button
                onClick={handleUpdateGoals}
                disabled={saving}
                className="w-full ui-btn-brand py-4 rounded-xl font-black uppercase text-xs shadow-lg shadow-brand/20 disabled:opacity-50"
              >
                {saving ? t('profile.updating') : t('profile.saveGoals')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
            <div className="flex justify-between">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-brand/10 text-brand rounded-2xl flex items-center justify-center">
                  <Target size={20} />
                </div>
                <div>
                  <p className="text-xl font-black italic uppercase tracking-tighter">{profile.goals?.dailyCalories} kcal</p>
                  <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{t('profile.dailyCaloricLoad')}</p>
                </div>
              </div>
              <div className="flex flex-col items-end justify-center">
                {profile.goals?.weight ? (
                  <>
                    <p className="text-xl font-black italic uppercase text-brand tracking-tighter">{profile.goals.weight} kg</p>
                    <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{t('profile.missionObjective')}</p>
                  </>
                ) : (
                  <>
                    <p className={cn("text-sm font-black italic uppercase tracking-tighter", PROTOCOL_COLORS[protocol])}>
                      {t(`profile.protocol.${protocol}`)}
                    </p>
                    <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{t('profile.noWeightTarget')}</p>
                  </>
                )}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest text-center">
              {(profile.goals?.dailySteps ?? 10000).toLocaleString()} {t('nav.quick.steps')} · {(profile.goals?.dailyWaterMl ?? 2500).toLocaleString()} ml
            </p>
            </div>
          )}
        </div>
      </div>

      {saveError && !isEditingGoals && (
        <ErrorBanner message={saveError} onRetry={() => setSaveError('')} retryLabel={t('common.dismiss')} />
      )}

      <div className="bg-[var(--card-bg)] p-6 rounded-[2rem] border border-[var(--border-muted)] space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">{t('profile.changePassword.title')}</h3>
        <input
          type="password"
          autoComplete="current-password"
          value={pwdCurrent}
          onChange={e => setPwdCurrent(e.target.value)}
          placeholder={t('profile.changePassword.current')}
          className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={pwdNew}
          onChange={e => setPwdNew(e.target.value)}
          placeholder={t('profile.changePassword.new')}
          className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold"
        />
        {pwdMsg && (
          <p className={cn('text-xs font-bold', pwdMsg === t('profile.changePassword.ok') ? 'text-brand' : 'text-red-600')}>
            {pwdMsg}
          </p>
        )}
        <button
          type="button"
          disabled={pwdBusy || !pwdCurrent || !pwdNew}
          onClick={() => void handleChangePassword()}
          className="w-full min-h-[48px] rounded-xl bg-[var(--background)] border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest hover:border-brand disabled:opacity-50 flex items-center justify-center"
        >
          {pwdBusy ? <Loader2 className="animate-spin" size={18} /> : t('profile.changePassword.submit')}
        </button>
      </div>

      {/* ── Bericht ── */}
      <div className="space-y-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] px-4">{t('profile.reportSection')}</h3>

        <div className="bg-[var(--card-bg)] p-6 sm:p-8 rounded-[2.5rem] border border-[var(--border-muted)] space-y-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand" />
            <p className="text-sm font-black uppercase italic tracking-tighter">{t('profile.reportTitle')}</p>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">{t('profile.reportHint')}</p>
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('profile.reportRange')}</label>
            <select
              value={reportRange}
              onChange={e => setReportRange(e.target.value as ReportRangeKey)}
              className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 font-bold text-[var(--text-primary)]"
            >
              {allowedReportRangeKeys(profile.accountCreatedAt).map(k => (
                <option key={k} value={k}>
                  {k === '7d'
                    ? t('profile.report.7d')
                    : k === '28d'
                      ? t('profile.report.28d')
                      : k === '3m'
                        ? t('profile.report.3m')
                        : k === '6m'
                          ? t('profile.report.6m')
                          : k === '12m'
                            ? t('profile.report.12m')
                            : t('profile.report.custom')}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('profile.reportCustomDate')}</label>
            <input
              type="date"
              value={reportCustomDate}
              onChange={e => setReportCustomDate(e.target.value)}
              className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 font-bold text-[var(--text-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setReportError('');
              const ok = generatePeriodFitnessReport({
                profile,
                workouts,
                nutrition: nutritionEntries,
                rangeKey: reportRange,
                customDate: reportRange === 'custom' ? reportCustomDate : null,
              });
              if (!ok) setReportError(t('profile.report.popupBlocked'));
            }}
            className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-brand text-[var(--text-primary)]"
          >
            {t('profile.reportGenerate')}
          </button>
          {reportError ? (
            <p className="text-sm font-bold text-red-600 dark:text-red-400" role="alert">
              {reportError}
            </p>
          ) : null}
        </div>
        
        <div id="profile-weekly-reports">
          <ReportHistoryView />
        </div>
      </div>

      {/* ── Datenexport ── */}
      {profile && (
        <div className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] px-4">{t('profile.export.title')}</h3>
          <div className="bg-[var(--card-bg)] p-6 sm:p-8 rounded-[2.5rem] border border-[var(--border-muted)] space-y-4">
            <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">{t('profile.export.sub')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => downloadJsonExport(buildExportBundle(profile, workouts, nutritionEntries))}
                className="min-h-[52px] flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest hover:border-brand transition-all"
              >
                <Download size={16} className="text-brand" />
                {t('profile.export.json')}
              </button>
              <button
                type="button"
                onClick={() => downloadCsvExport(buildExportBundle(profile, workouts, nutritionEntries))}
                className="min-h-[52px] flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest hover:border-brand transition-all"
              >
                <Download size={16} className="text-brand" />
                {t('profile.export.csv')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--card-bg)] p-6 sm:p-8 rounded-[2.5rem] border border-[var(--border-muted)] space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">{t('profile.privacy.title')}</h3>
        <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">{t('profile.privacy.body')}</p>
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{t('profile.privacy.exportHint')}</p>
      </div>

      {/* ── Konto ── */}
      <div className="space-y-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] px-4">{t('profile.account')}</h3>
        <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-muted)] overflow-hidden shadow-sm p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[52px] w-full flex items-center justify-center gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-red-500 hover:bg-red-500/5 transition-colors"
            >
              <LogOut size={18} />
              <span className="font-black uppercase italic tracking-tight text-sm">{t('profile.logout')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeletePassword('');
                setDeleteAccountStep('confirm');
                setDeleteAccountOpen(true);
              }}
              className="min-h-[52px] w-full flex items-center justify-center gap-3 rounded-2xl border border-red-500/40 bg-[var(--background)] px-4 py-3 text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={18} />
              <span className="font-black uppercase italic tracking-tight text-sm">{t('profile.deleteAccount')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Add Weight Modal ── */}
      {isAddingWeight ? overlayPortal(
          <div className={mobileSheetOverlayClass('touch-manipulation')}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingWeight(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 24 }}
              className="bg-[var(--card-bg)] w-full max-w-sm relative z-10 shadow-2xl border border-[var(--border-muted)] rounded-t-[2.5rem] lg:rounded-[2.5rem] max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-6 sm:p-10 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-2 text-center text-[var(--text-primary)]">{t('profile.biometricScan')}</h3>
                {tdee && (
                  <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center mb-8">
                    {t('profile.caloriesRecalc')}
                  </p>
                )}
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-2 block">
                      {t('profile.newMassEntry')}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={newWeight}
                      onChange={e => setNewWeight(e.target.value)}
                      className="w-full min-h-[52px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-4 text-xl font-black text-center text-[var(--text-primary)] text-base sm:text-xl"
                      placeholder="85.5"
                    />
                  {newWeight && tdee && (
                    <div className="mt-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--border-muted)]">
                      {(() => {
                        const m = profile.measurements;
                        if (!m?.height || !m?.age) return null;
                        const newW = parseFloat(newWeight);
                        const newTDEE = calcTDEE(newW, m.height, m.age, m.gender || 'male', m.activityLevel || 'moderate');
                        const p = deriveProtocol(newW, targetWeight);
                        const cal = calcProtocolCalories(newTDEE, p);
                        return (
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                            <span className="text-[var(--text-muted)]">{t(`profile.protocol.${p}`)}</span>
                            <span className={PROTOCOL_COLORS[p]}>{t('profile.kcalPerDay', { n: cal })}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddWeight}
                  disabled={saving || !newWeight}
                  className="w-full min-h-[52px] bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-black/20 disabled:opacity-50 touch-manipulation"
                >
                  {saving ? t('profile.updatingScan') : t('profile.confirmEntry')}
                </button>
              </div>
              </div>
            </motion.div>
          </div>,
        ) : null}

      {deleteAccountOpen ? overlayPortal(
          <div className={mobileSheetOverlayClass('touch-manipulation')}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleteBusy && setDeleteAccountOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 24 }}
              className="bg-[var(--card-bg)] w-full max-w-sm rounded-t-[2.5rem] lg:rounded-[2.5rem] relative z-10 shadow-2xl border border-[var(--border-muted)] max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-6 sm:p-10 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {deleteAccountStep === 'confirm' ? (
                <>
                  <h3 className="text-xl font-black italic uppercase tracking-tighter mb-3 text-center">
                    {t('profile.deleteAccount.title')}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed text-center mb-8">
                    {t('profile.deleteAccount.warning')}
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteAccountStep('password');
                      }}
                      className="w-full min-h-[52px] rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest touch-manipulation"
                    >
                    {t('profile.deleteAccount.continue')}
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => setDeleteAccountOpen(false)}
                    className="w-full min-h-[52px] rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase text-[var(--text-muted)] touch-manipulation"
                  >
                      {t('profile.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-black italic uppercase tracking-tighter mb-2 text-center">
                    {t('profile.deleteAccount.passwordTitle')}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed text-center mb-4">
                    {t('profile.deleteAccount.passwordHint')}
                  </p>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={e => {
                      setDeletePassword(e.target.value);
                      setDeleteError(null);
                    }}
                    placeholder={t('profile.deleteAccount.passwordPh')}
                    className="w-full min-h-[52px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-3 text-base font-bold text-[var(--text-primary)] mb-3"
                  />
                  {deleteError && (
                    <p className="text-[10px] font-bold text-red-500 text-center mb-3">{deleteError}</p>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={deleteBusy || !deletePassword.trim()}
                      onClick={async () => {
                        setDeleteBusy(true);
                        setDeleteError(null);
                        try {
                          await deleteAccount(deletePassword);
                          setDeleteAccountOpen(false);
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : '';
                          if (msg.includes('invalid-password')) {
                            setDeleteError(t('profile.deleteAccount.invalidPassword'));
                          } else if (msg.includes('oauth-account-no-password')) {
                            setDeleteError(t('profile.deleteAccount.oauth'));
                          } else {
                            setDeleteError(msg || '—');
                          }
                        } finally {
                          setDeleteBusy(false);
                        }
                      }}
                      className="w-full min-h-[52px] rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 touch-manipulation"
                    >
                    {deleteBusy ? t('profile.updating') : t('profile.deleteAccount.submit')}
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteError(null);
                      setDeletePassword('');
                      setDeleteAccountStep('confirm');
                    }}
                    className="w-full min-h-[52px] rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase text-[var(--text-muted)] touch-manipulation"
                  >
                      {t('profile.deleteAccount.back')}
                    </button>
                  </div>
                </>
              )}
              </div>
            </motion.div>
          </div>,
        ) : null}

      {showCheckIn ? overlayPortal(
          <div className={mobileSheetOverlayClass('touch-manipulation')}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              onClick={closeCheckIn}
            />
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="relative z-10 w-full max-w-md max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden bg-[var(--card-bg)] rounded-t-[2rem] lg:rounded-[2rem] border border-[var(--border-muted)] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <input
                ref={checkInGalleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden
                onChange={onCheckInImageSelected}
              />
              <input
                ref={checkInCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                aria-hidden
                onChange={onCheckInImageSelected}
              />
              <div className="flex justify-between items-center gap-3 shrink-0 px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-[var(--border-muted)]">
                <p className="text-sm font-black uppercase italic tracking-tighter text-[var(--text-primary)]">{t('profile.checkin')}</p>
                <button
                  type="button"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--background)] text-[var(--text-muted)]"
                  onClick={closeCheckIn}
                  aria-label={t('profile.cancel')}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-6 py-4">
                <p className="text-[11px] text-[var(--text-muted)] mb-4 leading-relaxed">{t('profile.checkIn.hint')}</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">{t('profile.checkIn.photo')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => checkInGalleryRef.current?.click()}
                        className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] text-[11px] font-black uppercase tracking-widest hover:border-brand/50 touch-manipulation"
                      >
                        <Image size={18} className="text-brand shrink-0" />
                        {t('profile.checkIn.gallery')}
                      </button>
                      <button
                        type="button"
                        onClick={() => checkInCameraRef.current?.click()}
                        className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] text-[11px] font-black uppercase tracking-widest hover:border-brand/50 touch-manipulation"
                      >
                        <Camera size={18} className="text-brand shrink-0" />
                        {t('profile.checkIn.camera')}
                      </button>
                    </div>
                    {checkInPhoto && (
                      <div className="mt-2 relative rounded-xl border border-[var(--border-muted)] overflow-hidden bg-[var(--background)]">
                        <img src={checkInPhoto.preview} alt="" className="w-full max-h-52 object-cover" />
                        <button
                          type="button"
                          onClick={clearCheckInPhoto}
                          className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-black/60 text-white touch-manipulation"
                          aria-label={t('profile.checkIn.removePhoto')}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder={t('profile.checkIn.weightPh')}
                    id="ci-weight"
                    className="w-full min-h-[52px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 text-base font-bold text-[var(--text-primary)]"
                  />
                  <textarea
                    id="ci-note"
                    placeholder={t('profile.checkIn.notePh')}
                    className="w-full min-h-[88px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 py-2 text-base text-[var(--text-primary)]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(['chest', 'waist', 'hips', 'arms', 'thighs'] as const).map(field => (
                      <div key={field}>
                        <label className="text-[10px] uppercase text-[var(--text-muted)] font-bold block mb-1">
                          {t('profile.body.cm', { part: t(`profile.body.${field}`) })}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          inputMode="decimal"
                          id={`ci-${field}`}
                          defaultValue={profile?.bodyMeasurements?.[field] ?? ''}
                          className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-lg px-2 text-base font-bold text-[var(--text-primary)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="shrink-0 px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[var(--border-muted)] bg-[var(--card-bg)]">
                <button
                  type="button"
                  onClick={async () => {
                    const read = (id: string) => {
                      const el = document.getElementById(id) as HTMLInputElement | null;
                      const v = el?.value;
                      return v === '' || v === undefined ? undefined : parseFloat(v);
                    };
                    const file = checkInPhoto?.file;
                    let photoURL: string | undefined;
                    if (file) {
                      photoURL = await new Promise<string>((res, rej) => {
                        const r = new FileReader();
                        r.onload = () => res(String(r.result));
                        r.onerror = rej;
                        r.readAsDataURL(file);
                      });
                    }
                    const w = read('ci-weight');
                    const note = (document.getElementById('ci-note') as HTMLInputElement)?.value || '';
                    const bodySnapshot = {
                      chest: read('ci-chest'),
                      waist: read('ci-waist'),
                      hips: read('ci-hips'),
                      arms: read('ci-arms'),
                      thighs: read('ci-thighs'),
                    };
                    const hasAny = Object.values(bodySnapshot).some(v => v != null);
                    const id = globalThis.crypto?.randomUUID?.() ?? `ci-${Date.now()}`;
                    const prev = profile?.checkIns || [];
                    await updateProfile({
                      checkIns: [...prev, { id, date: format(new Date(), 'yyyy-MM-dd'), weight: w, photoURL, note, bodySnapshot: hasAny ? bodySnapshot : undefined }],
                      bodyMeasurements: hasAny
                        ? {
                            ...(profile.bodyMeasurements || {}),
                            ...Object.fromEntries(Object.entries(bodySnapshot).filter(([, v]) => v != null)),
                            updatedAt: new Date().toISOString(),
                          }
                        : profile.bodyMeasurements,
                    });
                    closeCheckIn();
                  }}
                  className="w-full min-h-[52px] ui-btn-brand rounded-xl text-[11px] font-black uppercase tracking-widest touch-manipulation"
                >
                  {t('profile.checkIn.save')}
                </button>
              </div>
            </motion.div>
          </div>,
        ) : null}

    </div>
  );
}
