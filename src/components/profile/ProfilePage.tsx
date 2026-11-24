/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef, useCallback , type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/src/lib/AuthContext';
import { User, LogOut, Loader2, Plus, Target, Moon, Sun, X, FileText, Camera, Image, ArrowUpRight, ArrowDownRight, Trash2, Download, Ruler, Shield, Activity, Plug } from 'lucide-react';
import { useWorkouts } from '@/src/lib/useWorkouts';
import { useNutrition } from '@/src/lib/useNutrition';
import { generatePeriodFitnessReport, allowedReportRangeKeys, type ReportRangeKey } from '@/src/lib/periodReport';
import { api } from '@/src/lib/api';
import { formatUserError } from '@/src/lib/formatUserError';
import ErrorBanner from '@/src/components/ui/ErrorBanner';
import type { Post } from '@/src/lib/useSocial';
import { cn } from '@/src/lib/utils';
import ReportHistoryView from './ReportHistoryView';
import IntervalsConnect from './IntervalsConnect';
import MealplannerConnect from './MealplannerConnect';
import GarminConnect from './GarminConnect';
import SyncKarte from './SyncKarte';
import GarminLogin from './GarminLogin';
import { Card, PageHeader } from '@/src/simple/ui';
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
import PushoverKarte from './PushoverKarte';
import PushKarte from './PushKarte';

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


/**
 * Abschnitt im Integrations-Tab: Trennlinie, kurze Ueberschrift, erklaerender
 * Satz, dann die Karten. So sieht man auf einen Blick, wofuer die Verbindungen
 * in diesem Block da sind.
 */
function Gruppe({
  titel,
  hinweis,
  children,
}: {
  titel: string;
  hinweis: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]">
          {titel}
        </h3>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">{hinweis}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export default function ProfilePage() {
  const location = useLocation();
  const { profile, logout, deleteAccount, updateProfile } = useAuth();
  // Intervallfasten: Schalter im Profil blendet die Fasten-Box auf der Startseite ein/aus.
  const fastingGoals = (profile as unknown as { goals?: { fastingEnabled?: boolean } } | null)?.goals;
  const fastingEnabled = fastingGoals?.fastingEnabled !== false;
  const setFastingEnabled = async (on: boolean) => {
    const current = (profile as unknown as { goals?: Record<string, unknown> } | null)?.goals ?? {};
    await updateProfile({ goals: { ...current, fastingEnabled: on } } as never);
  };
  const { t, setLocale, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const { workouts } = useWorkouts();
  const { nutritionEntries } = useNutrition();
  const [tab, setTab] = useState<'uebersicht' | 'koerper' | 'ziele' | 'daten' | 'berichte' | 'account'>('uebersicht');
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

  const tabs = [
    { id: 'uebersicht', label: t('profile.tab.overview'), icon: User },
    { id: 'koerper', label: t('profile.tab.body'), icon: Ruler },
    { id: 'ziele', label: t('profile.tab.goals'), icon: Target },
    { id: 'daten', label: t('profile.tab.data'), icon: Plug },   // Integrationen
    { id: 'berichte', label: 'Berichte', icon: FileText },
    { id: 'account', label: t('profile.tab.account'), icon: Shield },
  ] as const;

  return (
    <div className="w-full space-y-6 pb-8 md:pb-16">
      <PageHeader
        eyebrow={t('nav.profile')}
        title={profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || t('profile.elite')}
        hint={t('profile.tabHint')}
      />

      {/* Kategorien statt langer Scrollseite */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition',
              tab === id
                ? 'border-[var(--simple-accent)] bg-[var(--simple-accent)] text-white'
                : 'border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'uebersicht' && (
        <div className="space-y-4">
          {/*
            Kopf des Profils: Avatar, Name, Plan — ruhig und ohne Social-Zaehler.
            Vorher standen hier 40px-Ueberschrift, Follower-Zahlen und drei grosse
            Archivknoepfe; das wirkte ueberladen.
          */}
          <Card className="flex items-center gap-4 p-4">
            <label className="group relative shrink-0 cursor-pointer">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)]">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
                    <User size={26} />
                  </div>
                )}
              </div>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
                <Plus size={16} />
              </span>
              <input type="file" className="hidden" accept="image/*" onChange={onPhotoChange} />
            </label>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-semibold leading-tight">
                {profile?.displayName ||
                  [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
                  t('profile.elite')}
              </h2>
              <p className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', PROTOCOL_COLORS[protocol])}>
                {t(`profile.protocol.${protocol}`)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCheckIn(true)}
              className="min-h-[40px] shrink-0 rounded-lg bg-[var(--simple-accent)] px-3 py-2 text-[11px] font-semibold text-white"
            >
              {t('profile.checkin')}
            </button>
          </Card>

          {/* Archiv: eine Zeile, drei gleiche Knoepfe */}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['transformation', t('profile.transformation')],
              ['posts', t('profile.myPosts')],
              ['liked', t('profile.liked')],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => (archive === id ? setArchive(null) : void openArchive(id))}
                className={cn(
                  'min-h-[40px] rounded-lg border px-2 text-[11px] font-semibold transition',
                  archive === id
                    ? 'border-[var(--simple-accent)] bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                    : 'border-[var(--line)] text-[var(--text-muted)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Gewicht', wert: profile?.measurements?.weight, einheit: 'kg' },
              { label: 'Körpergröße', wert: profile?.measurements?.height, einheit: 'cm' },
              { label: 'Tagesziel', wert: profile?.goals?.dailyCalories, einheit: 'kcal' },
              { label: 'Schritte', wert: profile?.goals?.dailySteps, einheit: '/Tag' },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  {k.label}
                </p>
                <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                  {k.wert != null ? Number(k.wert).toLocaleString('de-DE') : '—'}
                  {k.wert != null && (
                    <span className="ml-0.5 text-[10px] font-normal text-[var(--muted)]">{k.einheit}</span>
                  )}
                </p>
              </div>
            ))}
          </div>

          <Card className="space-y-2 p-4">
            <p className="text-[11.5px] font-semibold">Einstellungen</p>
            <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
              Name, Sprache, Erscheinungsmodus und Fasten findest du im Tab „Konto".
            </p>
            <button
              type="button"
              onClick={() => setTab('account')}
              className="min-h-[36px] rounded-lg border border-[var(--border-muted)] px-3 text-[11px] font-semibold text-[var(--simple-accent)]"
            >
              Zu den Einstellungen
            </button>
          </Card>

        </div>
      )}

      {tab === 'koerper' && (
        <div className="space-y-6">
      {/* ── Biometrics Quick Stats ── */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--line)] flex flex-col justify-between text-center">
            <div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <p className="text-3xl font-semibold uppercase">{profile?.measurements?.weight ?? '—'}</p>
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
              <p className="text-[10px] text-[var(--text-muted)] font-semibold tracking-widest mt-2">{t('profile.kgCurrent')}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingWeight(true)}
              className="mt-5 w-full min-h-[48px] rounded-xl bg-[var(--background)] border border-[var(--line)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-brand transition-colors"
            >
              {t('profile.updateWeight.open')}
            </button>
          </div>
          <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--line)] flex flex-col items-center justify-center text-center">
            <p className="text-3xl font-semibold uppercase">{profile?.measurements?.height ?? '—'}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold tracking-widest mt-2">{t('profile.cmHeight')}</p>
          </div>
        </div>
      </div>

        </div>
      )}
      {tab === 'ziele' && (
        <div className="space-y-6">
      {/* ── Operational Goals ── */}
      <div className="space-y-6">
        <div className="flex justify-between items-end px-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{t('profile.operationalGoals')}</h3>
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
            className="text-[10px] font-semibold text-brand hover:underline"
          >
            {isEditingGoals ? t('profile.cancel') : t('profile.adjust')}
          </button>
        </div>

        <div className="bg-[var(--surface)] p-8 rounded-xl border border-[var(--line)] shadow-sm space-y-6">
          {isEditingGoals ? (
            <div className="space-y-6">
              <div>
                <label className="text-[8px] font-semibold text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.targetWeightLabel')}
                </label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    step="0.5"
                    value={goalsForm.weight ?? ''}
                    onChange={e => handleTargetWeightChange(e.target.value)}
                    placeholder={t('profile.targetWeightPlaceholder')}
                    className="flex-1 bg-[var(--background)] border border-[var(--line)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                  />
                  {goalsForm.weight !== null && (
                    <button
                      onClick={() => handleTargetWeightChange('')}
                      className="p-4 bg-[var(--background)] border border-[var(--line)] rounded-xl text-[var(--text-muted)] hover:text-red-500 transition-colors"
                      title={t('profile.removeTargetTitle')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                {goalsForm.weight !== null && currentWeight && (
                  <p className={cn("text-[9px] font-semibold uppercase tracking-[0.1em] mt-2", PROTOCOL_COLORS[deriveProtocol(currentWeight, goalsForm.weight)])}>
                    → {t(`profile.protocol.${deriveProtocol(currentWeight, goalsForm.weight)}`)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[8px] font-semibold text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.dailyKcal')}
                  {tdee ? ` ${t('profile.dailyKcalTdee', { tdee })}` : ''}
                </label>
                <input
                  type="number"
                  value={goalsForm.dailyCalories}
                  onChange={e => setGoalsForm({ ...goalsForm, dailyCalories: parseInt(e.target.value) })}
                  className="w-full bg-[var(--background)] border border-[var(--line)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                />
                {tdee && (
                  <div className="flex gap-2 mt-2">
                    {(['lose', 'maintain', 'gain'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setGoalsForm({ ...goalsForm, dailyCalories: calcProtocolCalories(tdee, p) })}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-[8px] font-semibold tracking-widest transition-all border",
                          goalsForm.dailyCalories === calcProtocolCalories(tdee, p)
                            ? "border-2 border-brand bg-brand/15 text-[var(--text-primary)]"
                            : "bg-[var(--background)] border-[var(--line)] text-[var(--text-muted)] hover:border-brand"
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
                <label className="text-[8px] font-semibold text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.dailySteps')}
                </label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={goalsForm.dailySteps}
                  onChange={e => setGoalsForm({ ...goalsForm, dailySteps: parseInt(e.target.value, 10) || 10000 })}
                  className="w-full bg-[var(--background)] border border-[var(--line)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[8px] font-semibold text-[var(--text-muted)] tracking-widest mb-2 block">
                  {t('profile.dailyWater')}
                </label>
                <input
                  type="number"
                  min={500}
                  step={250}
                  value={goalsForm.dailyWaterMl}
                  onChange={e => setGoalsForm({ ...goalsForm, dailyWaterMl: parseInt(e.target.value, 10) || 2500 })}
                  className="w-full bg-[var(--background)] border border-[var(--line)] rounded-xl p-4 font-bold text-[var(--text-primary)]"
                />
              </div>
              {saveError && <p className="text-xs font-bold text-red-600">{saveError}</p>}
              <button
                onClick={handleUpdateGoals}
                disabled={saving}
                className="w-full ui-btn-brand py-4 rounded-xl font-semibold text-xs shadow-lg shadow-brand/20 disabled:opacity-50"
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
                  <p className="text-[15px] font-semibold tabular-nums uppercase tracking-tighter">{profile.goals?.dailyCalories} kcal</p>
                  <p className="text-[10px] font-semibold text-[var(--text-muted)]">{t('profile.dailyCaloricLoad')}</p>
                </div>
              </div>
              <div className="flex flex-col items-end justify-center">
                {profile.goals?.weight ? (
                  <>
                    <p className="text-[15px] font-semibold tabular-nums uppercase text-brand tracking-tighter">{profile.goals.weight} kg</p>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)]">{t('profile.missionObjective')}</p>
                  </>
                ) : (
                  <>
                    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", PROTOCOL_COLORS[protocol])}>
                      {t(`profile.protocol.${protocol}`)}
                    </p>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)]">{t('profile.noWeightTarget')}</p>
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

      <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--line)] space-y-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{t('profile.changePassword.title')}</h3>
        <input
          type="password"
          autoComplete="current-password"
          value={pwdCurrent}
          onChange={e => setPwdCurrent(e.target.value)}
          placeholder={t('profile.changePassword.current')}
          className="w-full bg-[var(--background)] border border-[var(--line)] rounded-xl p-4 font-bold"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={pwdNew}
          onChange={e => setPwdNew(e.target.value)}
          placeholder={t('profile.changePassword.new')}
          className="w-full bg-[var(--background)] border border-[var(--line)] rounded-xl p-4 font-bold"
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
          className="w-full min-h-[48px] rounded-xl bg-[var(--background)] border border-[var(--line)] text-[10px] font-semibold uppercase tracking-[0.12em] hover:border-brand disabled:opacity-50 flex items-center justify-center"
        >
          {pwdBusy ? <Loader2 className="animate-spin" size={18} /> : t('profile.changePassword.submit')}
        </button>
      </div>
        </div>
      )}

      {tab === 'daten' && (
        <div className="space-y-5">
          {/*
            Drei Gruppen statt einer langen Liste. Jede Gruppe bekommt eine
            Trennlinie mit kurzer Ueberschrift, damit auf einen Blick klar ist,
            wofuer die Verbindung da ist.
          */}

          {/* Ein Knopf fuer alle Quellen — vorher hatte jede Karte ihren eigenen. */}
          <SyncKarte />

          <Gruppe titel="Datenquellen" hinweis="Woher deine Werte kommen">
            <GarminConnect />
            {/* Zweiter Weg zur Uhr: kein Tageslimit, alle Schlafwerte. */}
            <GarminLogin />
            <IntervalsConnect />
          </Gruppe>

          <Gruppe titel="Benachrichtigungen" hinweis="Wie du erinnert wirst">
            <PushKarte beschreibung="Nachrichten aufs Handy, auch wenn die App geschlossen ist." />
            <PushoverKarte beschreibung="Pushover schickt dir Erinnerungen und Hinweise aufs Handy. Beide Werte stehen in deinem Pushover-Konto." />
          </Gruppe>

          <Gruppe titel="Mahlzeiten" hinweis="Verbindung zum Mealplanner">
            <MealplannerConnect />
          </Gruppe>

          <Link
            to="/wellness"
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[12px] font-semibold text-[var(--foreground)] transition hover:border-[var(--simple-accent)]"
          >
            <Activity className="h-4 w-4 text-[var(--simple-accent)]" />
            Wellness-Daten ansehen
            <span className="ml-auto text-[11px] font-normal text-[var(--text-muted)]">Schlaf, Bewegung, Form</span>
          </Link>
        </div>
      )}


      {/* ── Berichte: eigener Tab, ganz rechts vor Konto ── */}
      {tab === 'berichte' && (
        <div className="space-y-5">
      {/* ── Bericht ── */}
      <div className="space-y-6">

        <div className="bg-[var(--surface)] p-6 sm:p-8 rounded-xl border border-[var(--line)] space-y-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand" />
            <p className="text-sm text-[11px] font-semibolder">{t('profile.reportTitle')}</p>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">{t('profile.reportHint')}</p>
          <div className="space-y-2">
            <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] tracking-widest">{t('profile.reportRange')}</label>
            <select
              value={reportRange}
              onChange={e => setReportRange(e.target.value as ReportRangeKey)}
              className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--line)] rounded-xl px-4 font-bold text-[var(--text-primary)]"
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
            <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('profile.reportCustomDate')}</label>
            <input
              type="date"
              value={reportCustomDate}
              onChange={e => setReportCustomDate(e.target.value)}
              className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--line)] rounded-xl px-4 font-bold text-[var(--text-primary)]"
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
            className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--line)] rounded-xl text-[10px] font-semibold uppercase tracking-[0.12em] hover:border-brand text-[var(--text-primary)]"
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

        </div>
      )}

      {tab === 'account' && (
        <div className="space-y-6">
      {/* ── Konto ── */}
      <div className="space-y-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] px-4">{t('profile.account')}</h3>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--line)] overflow-hidden shadow-sm p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] w-full flex items-center justify-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-red-500 hover:bg-red-500/5 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-[11px] font-semibold text-sm">{t('profile.logout')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeletePassword('');
                setDeleteAccountStep('confirm');
                setDeleteAccountOpen(true);
              }}
              className="min-h-[44px] w-full flex items-center justify-center gap-3 rounded-2xl border border-red-500/40 bg-[var(--background)] px-4 py-3 text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={18} />
              <span className="text-[11px] font-semibold text-sm">{t('profile.deleteAccount')}</span>
            </button>
          </div>
        </div>
      </div>
      {/* ── Datenexport und Datenschutz (gehoeren zum Konto) ── */}
      {profile && (
        <div className="space-y-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] px-4">{t('profile.export.title')}</h3>
          <div className="bg-[var(--surface)] p-6 sm:p-8 rounded-xl border border-[var(--line)] space-y-4">
            <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">{t('profile.export.sub')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => downloadJsonExport(buildExportBundle(profile, workouts, nutritionEntries))}
                className="min-h-[44px] flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] text-[10px] font-semibold uppercase tracking-[0.12em] hover:border-brand transition-all"
              >
                <Download size={16} className="text-brand" />
                {t('profile.export.json')}
              </button>
              <button
                type="button"
                onClick={() => downloadCsvExport(buildExportBundle(profile, workouts, nutritionEntries))}
                className="min-h-[44px] flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] text-[10px] font-semibold uppercase tracking-[0.12em] hover:border-brand transition-all"
              >
                <Download size={16} className="text-brand" />
                {t('profile.export.csv')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] p-6 sm:p-8 rounded-xl border border-[var(--line)] space-y-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{t('profile.privacy.title')}</h3>
        <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">{t('profile.privacy.body')}</p>
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{t('profile.privacy.exportHint')}</p>
      </div>
        </div>
      )}

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
              className="bg-[var(--surface)] w-full max-w-sm relative z-10 shadow-2xl border border-[var(--line)] rounded-t-[2.5rem] lg:rounded-xl max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-6 sm:p-10 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <h3 className="text-[15px] font-semibold mb-2 text-center text-[var(--text-primary)]">{t('profile.biometricScan')}</h3>
                {tdee && (
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] tracking-widest text-center mb-8">
                    {t('profile.caloriesRecalc')}
                  </p>
                )}
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-muted)] tracking-widest mb-2 block">
                      {t('profile.newMassEntry')}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={newWeight}
                      onChange={e => setNewWeight(e.target.value)}
                      className="w-full min-h-[44px] bg-[var(--background)] border border-[var(--line)] rounded-xl px-4 py-4 text-base font-semibold text-center text-[var(--text-primary)] text-base sm:text-xl"
                      placeholder="85.5"
                    />
                  {newWeight && tdee && (
                    <div className="mt-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--line)]">
                      {(() => {
                        const m = profile.measurements;
                        if (!m?.height || !m?.age) return null;
                        const newW = parseFloat(newWeight);
                        const newTDEE = calcTDEE(newW, m.height, m.age, m.gender || 'male', m.activityLevel || 'moderate');
                        const p = deriveProtocol(newW, targetWeight);
                        const cal = calcProtocolCalories(newTDEE, p);
                        return (
                          <div className="flex justify-between text-[9px] font-semibold uppercase tracking-[0.1em]">
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
                  className="w-full min-h-[44px] bg-accent text-[var(--on-accent)] py-5 rounded-2xl font-semibold tracking-widest text-xs shadow-xl shadow-black/20 disabled:opacity-50 touch-manipulation"
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
              className="bg-[var(--surface)] w-full max-w-sm rounded-t-[2.5rem] lg:rounded-xl relative z-10 shadow-2xl border border-[var(--line)] max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-6 sm:p-10 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {deleteAccountStep === 'confirm' ? (
                <>
                  <h3 className="text-[15px] font-semibold tabular-nums uppercase tracking-tighter mb-3 text-center">
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
                      className="w-full min-h-[44px] rounded-xl bg-red-600 text-white text-[10px] font-semibold uppercase tracking-[0.12em] touch-manipulation"
                    >
                    {t('profile.deleteAccount.continue')}
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => setDeleteAccountOpen(false)}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--line)] text-[10px] font-semibold text-[var(--text-muted)] touch-manipulation"
                  >
                      {t('profile.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-[15px] font-semibold tabular-nums uppercase tracking-tighter mb-2 text-center">
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
                    className="w-full min-h-[44px] bg-[var(--background)] border border-[var(--line)] rounded-xl px-4 py-3 text-base font-bold text-[var(--text-primary)] mb-3"
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
                      className="w-full min-h-[44px] rounded-xl bg-red-600 text-white text-[10px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50 touch-manipulation"
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
                    className="w-full min-h-[44px] rounded-xl border border-[var(--line)] text-[10px] font-semibold text-[var(--text-muted)] touch-manipulation"
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
              className="relative z-10 w-full max-w-md max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden bg-[var(--surface)] rounded-t-[2rem] lg:rounded-xl border border-[var(--line)] shadow-2xl"
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
              <div className="flex justify-between items-center gap-3 shrink-0 px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-[var(--line)]">
                <p className="text-sm text-[11px] font-semibolder text-[var(--text-primary)]">{t('profile.checkin')}</p>
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">{t('profile.checkIn.photo')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => checkInGalleryRef.current?.click()}
                        className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--background)] text-[var(--text-primary)] text-[11px] font-semibold tracking-widest hover:border-brand/50 touch-manipulation"
                      >
                        <Image size={18} className="text-brand shrink-0" />
                        {t('profile.checkIn.gallery')}
                      </button>
                      <button
                        type="button"
                        onClick={() => checkInCameraRef.current?.click()}
                        className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--background)] text-[var(--text-primary)] text-[11px] font-semibold tracking-widest hover:border-brand/50 touch-manipulation"
                      >
                        <Camera size={18} className="text-brand shrink-0" />
                        {t('profile.checkIn.camera')}
                      </button>
                    </div>
                    {checkInPhoto && (
                      <div className="mt-2 relative rounded-xl border border-[var(--line)] overflow-hidden bg-[var(--background)]">
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
                    className="w-full min-h-[44px] bg-[var(--background)] border border-[var(--line)] rounded-xl px-3 text-base font-bold text-[var(--text-primary)]"
                  />
                  <textarea
                    id="ci-note"
                    placeholder={t('profile.checkIn.notePh')}
                    className="w-full min-h-[88px] bg-[var(--background)] border border-[var(--line)] rounded-xl px-3 py-2 text-base text-[var(--text-primary)]"
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
                          className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--line)] rounded-lg px-2 text-base font-bold text-[var(--text-primary)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="shrink-0 px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[var(--line)] bg-[var(--surface)]">
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
                  className="w-full min-h-[44px] ui-btn-brand rounded-xl text-[11px] font-semibold tracking-widest touch-manipulation"
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
