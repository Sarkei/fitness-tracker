import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Pencil, Trash2, LogOut, RefreshCw, ShieldCheck, X, Eye, EyeOff, Users, Bot, KeyRound, Save, FlaskConical, CheckCircle2, Sparkles, Database, Loader2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/src/lib/i18n';
import { resolveUserNameFields } from '@/src/lib/userName';
import { getModelSelectOptions, type AiProviderName } from '@/src/lib/aiModelConfig';
import { mobileSheetOverlayClass, overlayPortal, useMobileOverlaySheet } from '@/src/lib/mobileViewport';

type AiModelArea = 'coach_workout' | 'coach_nutrition' | 'meal' | 'meal_vision' | 'workout_template';

interface AiModelRecommendation {
  model: string;
  hint: string;
}

interface AiModelOptionDto {
  id: string;
  label: string;
}

interface AiAreaMeta {
  id: AiModelArea;
  label: string;
  recommended: {
    ollama: AiModelRecommendation;
    deepseek: AiModelRecommendation;
    mistral: AiModelRecommendation;
    gemini: AiModelRecommendation;
  };
  options?: {
    ollama: AiModelOptionDto[];
    deepseek: AiModelOptionDto[];
    mistral: AiModelOptionDto[];
    gemini: AiModelOptionDto[];
  };
}

interface AiConfigState {
  active: 'ollama' | 'deepseek' | 'gemini' | 'mistral' | 'none';
  ollamaConfigured: boolean;
  deepseekConfigured: boolean;
  geminiConfigured: boolean;
  mistralConfigured: boolean;
  ollama?: {
    baseUrl: string;
    model: string;
    configured: boolean;
  };
  keys: {
    deepseek: { configured: boolean; masked?: string | null };
    mistral: { configured: boolean; masked?: string | null };
    gemini: { configured: boolean; masked?: string | null };
  };
  models: {
    ollama: Record<AiModelArea, string>;
    deepseek: Record<AiModelArea, string>;
    mistral: Record<AiModelArea, string>;
    gemini: Record<AiModelArea, string>;
  };
  areas: AiAreaMeta[];
}

const DEFAULT_AI_MODELS: AiConfigState['models'] = {
  deepseek: {
    coach_workout: 'deepseek-chat',
    coach_nutrition: 'deepseek-chat',
    meal: 'deepseek-chat',
    meal_vision: 'deepseek-chat',
    workout_template: 'deepseek-chat',
  },
  ollama: {
    coach_workout: 'gemma4:e2b',
    coach_nutrition: 'gemma4:e2b',
    meal: 'gemma4:e2b',
    meal_vision: 'gemma4:e2b',
    workout_template: 'gemma4:e2b',
  },
  mistral: {
    coach_workout: 'mistral-large-latest',
    coach_nutrition: 'mistral-large-latest',
    meal: 'mistral-small-latest',
    meal_vision: 'pixtral-large-latest',
    workout_template: 'mistral-large-latest',
  },
  gemini: {
    coach_workout: 'gemini-2.5-flash',
    coach_nutrition: 'gemini-2.5-flash',
    meal: 'gemini-2.5-flash',
    meal_vision: 'gemini-2.5-flash',
    workout_template: 'gemini-2.5-flash',
  },
};

function ModelSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: AiModelOptionDto[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs font-medium text-ink bg-surface-2 border border-line rounded-lg px-2 py-2.5 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ModelRecommendationHint({
  rec,
  current,
}: {
  rec: AiModelRecommendation;
  current: string;
}) {
  const matches = current.trim() === rec.model;
  return (
    <div className={`mt-1.5 rounded-lg px-2 py-1.5 text-[9px] leading-snug ${matches ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50/80 text-amber-900/80 border border-amber-100/80'}`}>
      <span className="font-black uppercase tracking-widest flex items-center gap-1">
        <Sparkles size={10} />
        Empfohlen: <span className="font-mono normal-case tracking-normal">{rec.model}</span>
      </span>
      <span className="block mt-0.5 font-medium opacity-90">{rec.hint}</span>
    </div>
  );
}

interface AdminUser {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  has_password: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function adminUserNames(u: AdminUser): { firstName: string; lastName: string; displayName: string } {
  return resolveUserNameFields({
    first_name: u.first_name,
    last_name: u.last_name,
    display_name: u.name,
    name: u.name,
  });
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

function makeBasicAuth(user: string, pass: string) {
  return 'Basic ' + btoa(`${user}:${pass}`);
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: (auth: string) => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        onLogin(makeBasicAuth(username, password));
      } else {
        setError(t('admin.login.badCreds'));
      }
    } catch {
      setError(t('admin.login.noServer'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent rounded-2xl mb-4">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic">{t('admin.title')}</h1>
          <p className="text-[10px] text-muted uppercase tracking-widest font-bold mt-1">{t('admin.controlPanel')}</p>
        </div>

        <div className="bg-surface rounded-2xl border border-line shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-muted uppercase tracking-widest block mb-1">
                {t('admin.login.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full text-sm font-medium text-ink bg-surface-2 border border-line rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-shadow"
                placeholder={t('admin.login.placeholderUser')}
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase tracking-widest block mb-1">
                {t('admin.login.password')}
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm font-medium text-ink bg-surface-2 border border-line rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-shadow"
                  placeholder={t('admin.login.placeholderPw')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-[var(--on-accent)] rounded-xl py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? t('admin.login.signingIn') : t('admin.login.signIn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  user,
  authHeader,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  authHeader: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const initial = adminUserNames(user);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError(t('auth.nameRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email,
          password: password || undefined,
        }),
      });
      if (!res.ok) throw new Error(t('admin.edit.saveErr'));
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.edit.saveErr'));
    } finally {
      setLoading(false);
    }
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <div
        className="max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-surface text-ink shadow-2xl lg:max-h-[90vh] lg:rounded-2xl [-webkit-overflow-scrolling:touch]"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-6 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tighter text-ink">{t('admin.edit.title')}</h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted">{t('admin.edit.id', { id: user.id })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink active:opacity-90"
            aria-label={t('admin.edit.cancel')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                {t('admin.edit.firstName')}
              </label>
              <input
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="min-h-[48px] w-full touch-manipulation rounded-xl border border-line bg-surface-2 px-4 py-3 text-base font-medium text-ink transition-shadow focus:outline-none focus:ring-1 focus:ring-[var(--accent)] md:text-sm"
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                {t('admin.edit.lastName')}
              </label>
              <input
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="min-h-[48px] w-full touch-manipulation rounded-xl border border-line bg-surface-2 px-4 py-3 text-base font-medium text-ink transition-shadow focus:outline-none focus:ring-1 focus:ring-[var(--accent)] md:text-sm"
                required
                minLength={2}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">{t('admin.edit.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[48px] w-full touch-manipulation rounded-xl border border-line bg-surface-2 px-4 py-3 text-base font-medium text-ink transition-shadow focus:outline-none focus:ring-1 focus:ring-[var(--accent)] md:text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
              {t('admin.edit.newPw')}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[48px] w-full touch-manipulation rounded-xl border border-line bg-surface-2 px-4 py-3 pr-12 text-base font-medium text-ink transition-shadow focus:outline-none focus:ring-1 focus:ring-[var(--accent)] md:text-sm"
                placeholder={t('admin.edit.newPwPh')}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 touch-manipulation items-center justify-center text-muted transition-colors hover:text-ink"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-500">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[52px] flex-1 touch-manipulation rounded-xl border border-line py-3 text-[10px] font-bold uppercase tracking-widest text-ink transition-colors hover:bg-surface-2 active:opacity-90 md:min-h-[48px]"
            >
              {t('admin.edit.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[52px] flex-1 touch-manipulation rounded-xl bg-accent py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 active:opacity-90 md:min-h-[48px]"
            >
              {loading ? t('admin.edit.saving') : t('admin.edit.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── API Key Editor (never shows stored key) ───────────────────────────────────

function ApiKeyEditor({
  provider,
  label,
  configured,
  masked,
  authHeader,
  onSaved,
}: {
  provider: 'deepseek' | 'mistral' | 'gemini';
  label: string;
  configured: boolean;
  masked?: string | null;
  authHeader: string;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const saveKey = async () => {
    if (!apiKey.trim()) {
      setMsg({ type: 'err', text: 'Bitte einen API-Key eingeben.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setApiKey('');
        setMsg({ type: 'ok', text: 'Key gespeichert (wird in .env aktualisiert).' });
        onSaved();
      } else {
        setMsg({ type: 'err', text: data.error || 'Speichern fehlgeschlagen' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Verbindung zum Server fehlgeschlagen' });
    } finally {
      setSaving(false);
    }
  };

  return overlayPortal(
    <motion.div layout className="bg-surface rounded-2xl border border-line p-5 space-y-3 text-ink">
      <motion.div layout className="flex items-center justify-between gap-2">
        <p className="text-sm font-black uppercase tracking-tighter text-ink">{label}</p>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
            <CheckCircle2 size={12} /> Konfiguriert
          </span>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">Nicht gesetzt</span>
        )}
      </motion.div>
      <p className="text-[10px] text-muted">Gespeicherte Keys werden nie angezeigt. Nur ein neuer Key überschreibt den bestehenden.</p>
      {configured && masked ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 font-mono text-base font-semibold tracking-wide text-emerald-700">
          {masked}
        </p>
      ) : null}
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Neuen API-Key eingeben…"
          autoComplete="off"
          className="w-full text-sm font-medium text-ink bg-surface-2 border border-line rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <motion.div layout className="flex gap-2">
        <button
          type="button"
          onClick={saveKey}
          disabled={saving || !apiKey.trim()}
          className="w-full flex items-center justify-center gap-1.5 bg-accent text-[var(--on-accent)] rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          <Save size={14} />
          {saving ? 'API Key aktualisieren…' : 'API Key aktualisieren'}
        </button>
      </motion.div>
      {msg && (
        <p className={`text-xs font-bold p-2 rounded-lg ${msg.type === 'ok' ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
          {msg.text}
        </p>
      )}
    </motion.div>
  );
}

// ─── Model Config ──────────────────────────────────────────────────────────────

function ModelConfigPanel({
  aiConfig,
  authHeader,
  onSaved,
}: {
  aiConfig: AiConfigState;
  authHeader: string;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(aiConfig.models);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(aiConfig.models);
  }, [aiConfig.models]);

  const updateModel = (provider: 'ollama' | 'deepseek' | 'mistral' | 'gemini', area: AiModelArea, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [area]: value },
    }));
  };

  const saveModels = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/ai-models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ models: draft }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMsg('Modelle gespeichert.');
        onSaved();
      } else {
        setMsg(data.error || 'Speichern fehlgeschlagen');
      }
    } catch {
      setMsg('Verbindung zum Server fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-line p-6 space-y-4 text-ink">
      <motion.div layout>
        <p className="text-sm font-black uppercase tracking-tighter text-ink">Modell-Mapping pro Bereich</p>
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mt-0.5">
          Modell pro Bereich aus der Liste wählen – Änderungen landen in der .env
        </p>
      </motion.div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 pr-4 text-[9px] font-black uppercase tracking-widest text-muted">Bereich</th>
              <th className="py-2 px-2 text-[9px] font-black uppercase tracking-widest text-emerald-600">Ollama (Lokal)</th>
              <th className="py-2 px-2 text-[9px] font-black uppercase tracking-widest text-muted">DeepSeek</th>
              <th className="py-2 px-2 text-[9px] font-black uppercase tracking-widest text-muted">Mistral</th>
              <th className="py-2 pl-2 text-[9px] font-black uppercase tracking-widest text-muted">Gemini</th>
            </tr>
          </thead>
          <tbody>
            {aiConfig.areas.map((area) => (
              <tr key={area.id} className="border-b border-line align-top">
                <td className="py-3 pr-4 text-xs font-bold text-ink whitespace-nowrap">{area.label}</td>
                <td className="py-3 px-2 min-w-[220px]">
                  <ModelSelect
                    value={draft.ollama?.[area.id] ?? area.recommended.ollama?.model ?? 'gemma4:e2b'}
                    options={
                      area.options?.ollama ??
                      getModelSelectOptions('ollama' as AiProviderName, area.id, draft.ollama?.[area.id])
                    }
                    onChange={(v) => updateModel('ollama', area.id, v)}
                  />
                  {area.recommended.ollama && (
                    <ModelRecommendationHint
                      rec={area.recommended.ollama}
                      current={draft.ollama?.[area.id] ?? ''}
                    />
                  )}
                </td>
                <td className="py-3 px-2 min-w-[220px]">
                  <ModelSelect
                    value={draft.deepseek?.[area.id] ?? area.recommended.deepseek?.model ?? 'deepseek-chat'}
                    options={
                      area.options?.deepseek ??
                      getModelSelectOptions('deepseek' as AiProviderName, area.id, draft.deepseek?.[area.id])
                    }
                    onChange={(v) => updateModel('deepseek', area.id, v)}
                  />
                  {area.recommended.deepseek && (
                    <ModelRecommendationHint
                      rec={area.recommended.deepseek}
                      current={draft.deepseek?.[area.id] ?? ''}
                    />
                  )}
                </td>
                <td className="py-3 px-2 min-w-[220px]">
                  <ModelSelect
                    value={draft.mistral[area.id] ?? area.recommended.mistral.model}
                    options={
                      area.options?.mistral ??
                      getModelSelectOptions('mistral' as AiProviderName, area.id, draft.mistral[area.id])
                    }
                    onChange={(v) => updateModel('mistral', area.id, v)}
                  />
                  <ModelRecommendationHint
                    rec={area.recommended.mistral}
                    current={draft.mistral[area.id] ?? ''}
                  />
                </td>
                <td className="py-3 pl-2 min-w-[220px]">
                  <ModelSelect
                    value={draft.gemini[area.id] ?? area.recommended.gemini.model}
                    options={
                      area.options?.gemini ??
                      getModelSelectOptions('gemini' as AiProviderName, area.id, draft.gemini[area.id])
                    }
                    onChange={(v) => updateModel('gemini', area.id, v)}
                  />
                  <ModelRecommendationHint
                    rec={area.recommended.gemini}
                    current={draft.gemini[area.id] ?? ''}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <motion.div layout className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveModels}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-accent text-[var(--on-accent)] rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Speichern…' : 'Modelle speichern'}
        </button>
        {msg && <p className={`text-xs font-bold ${msg.includes('fehl') ? 'text-red-500' : 'text-emerald-600'}`}>{msg}</p>}
      </motion.div>
    </div>
  );
}

// ─── ExerciseDB RapidAPI Key (wie Mistral/Gemini → schreibt in .env) ─────────

function ExerciseDbKeyEditor({
  configured,
  authHeader,
  onSaved,
}: {
  configured: boolean;
  authHeader: string;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const testKey = async () => {
    if (!apiKey.trim()) {
      setMsg({ type: 'err', text: 'Bitte RapidAPI-Key eingeben.' });
      return;
    }
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/exercisedb-key/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.ok) setMsg({ type: 'ok', text: 'Key ist gültig – kann gespeichert werden.' });
      else setMsg({ type: 'err', text: data.error || 'Test fehlgeschlagen' });
    } catch {
      setMsg({ type: 'err', text: 'Verbindung zum Server fehlgeschlagen' });
    } finally {
      setTesting(false);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim()) {
      setMsg({ type: 'err', text: 'Bitte RapidAPI-Key eingeben.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/exercisedb-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setApiKey('');
        setMsg({ type: 'ok', text: 'In .env gespeichert (EXERCISEDB_RAPIDAPI_KEY) – sofort aktiv.' });
        onSaved();
      } else {
        setMsg({ type: 'err', text: data.error || 'Speichern fehlgeschlagen' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Verbindung zum Server fehlgeschlagen' });
    } finally {
      setSaving(false);
    }
  };

  return overlayPortal(
    <motion.div layout className="bg-surface rounded-2xl border border-line p-5 space-y-3 text-ink">
      <motion.div layout className="flex items-center justify-between gap-2">
        <p className="text-sm font-black uppercase tracking-tighter text-ink">ExerciseDB (RapidAPI)</p>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
            <CheckCircle2 size={12} /> Konfiguriert
          </span>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Nicht in .env</span>
        )}
      </motion.div>
      <p className="text-[10px] text-muted leading-relaxed">
        RapidAPI-Key von{' '}
        <a
          href="https://rapidapi.com/ascendapi/api/edb-with-videos-and-images-by-ascendapi"
          target="_blank"
          rel="noreferrer"
          className="text-brand underline"
        >
          AscendAPI ExerciseDB V2
        </a>
        . Auf dem Server als Umgebungsvariable{' '}
        <code className="bg-surface-2 px-1 rounded">EXERCISEDB_RAPIDAPI_KEY</code> (Docker/Panel) oder hier in die
        .env speichern. Lange alphanumerische Keys werden unterstützt.
      </p>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="RapidAPI X-RapidAPI-Key…"
          autoComplete="off"
          className="w-full text-sm font-medium text-ink bg-surface-2 border border-line rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void testKey()}
          disabled={testing || !apiKey.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 border border-line rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest text-ink hover:bg-surface-2 disabled:opacity-40"
        >
          <FlaskConical size={14} />
          {testing ? 'Teste…' : 'Testen'}
        </button>
        <button
          type="button"
          onClick={() => void saveKey()}
          disabled={saving || !apiKey.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-[var(--on-accent)] rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          <Save size={14} />
          {saving ? 'Speichern…' : 'In .env speichern'}
        </button>
      </div>
      {msg && (
        <p
          className={`text-xs font-bold p-2 rounded-lg ${msg.type === 'ok' ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}
        >
          {msg.text}
        </p>
      )}
    </motion.div>
  );
}

// ─── Daten-Migration (ExerciseDB + Open Food Facts) ───────────────────────────

type MigrationStatusDto = {
  targetVersion: number;
  pendingUsers: number;
  upToDateUsers: number;
  totalActiveUsers: number;
  exerciseDbConfigured: boolean;
  exerciseDbSource?: string | null;
  exerciseDbHost?: string;
  exerciseDbEnvHints?: string[];
  envFilePath?: string;
  envFileProblem?: string | null;
  keyLength?: number | null;
};

type BatchMigrationDto = {
  ok: boolean;
  targetVersion: number;
  usersMigrated: number;
  usersSkipped: number;
  usersFailed: number;
  exercisesUpdated: number;
  nutritionUpdated: number;
  coachWeeksUpdated: number;
  errors: string[];
};

type MigrationJobDto = {
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  totalUsers: number;
  processedUsers: number;
  force: boolean;
  logs: Array<{
    ts: string;
    userId: number;
    status: 'started' | 'skipped' | 'success' | 'failed';
    message: string;
  }>;
  result: BatchMigrationDto | null;
};

function DataMigrationPanel({ authHeader }: { authHeader: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const [status, setStatus] = useState<MigrationStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchMigrationDto | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<MigrationJobDto | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [err, setErr] = useState('');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/migration/status', { headers: { Authorization: authHeader } });
      if (!res.ok) throw new Error('Status konnte nicht geladen werden');
      setStatus(await res.json());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const fetchJob = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/admin/migration/job/${encodeURIComponent(id)}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error('Migrationsstatus konnte nicht geladen werden');
      return (await res.json()) as MigrationJobDto;
    },
    [authHeader],
  );

  useEffect(() => {
    if (!jobId || !running) return;
    let alive = true;
    const tick = async () => {
      try {
        const nextJob = await fetchJob(jobId);
        if (!alive) return;
        setJob(nextJob);
        if (nextJob.status !== 'running') {
          setRunning(false);
          if (nextJob.result) setResult(nextJob.result);
          await fetchStatus();
          return;
        }
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Statusabfrage fehlgeschlagen');
      }
      if (alive) setTimeout(() => void tick(), 900);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [jobId, running, fetchJob, fetchStatus]);

  const runMigration = async (force: boolean) => {
    if (!force && status && status.pendingUsers === 0) {
      setErr('Keine ausstehenden Nutzer für Migration.');
      return;
    }
    setRunning(true);
    setResult(null);
    setErr('');
    setJob(null);
    setShowJobModal(true);
    try {
      const res = await fetch('/api/admin/migration/run-all-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ force }),
      });
      const data = (await res.json()) as { ok?: boolean; jobId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Migration fehlgeschlagen');
      if (!data.jobId) throw new Error('Migration Job-ID fehlt');
      setJobId(data.jobId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Migration fehlgeschlagen');
      setRunning(false);
    } finally {
      /* running handled by polling */
    }
  };

  return overlayPortal(
    <motion.div layout className="mb-8 rounded-2xl border border-line bg-surface p-6 space-y-4 text-ink">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 gap-3 rounded-xl border border-transparent px-1 py-1 text-left hover:bg-surface-2"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Database size={22} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-tighter text-ink">Daten-Migration</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted">
              ExerciseDB · Open Food Facts · Zielversion{' '}
              {status?.targetVersion ?? '…'} · {collapsed ? 'Ausklappen' : 'Einklappen'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchStatus()}
            disabled={loading || running}
            className="flex min-h-[40px] items-center justify-center gap-1.5 self-start rounded-xl border border-line px-3 py-2 text-[9px] font-black uppercase tracking-widest text-muted hover:bg-surface-2 disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Aktualisieren
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <p className="text-xs text-muted leading-relaxed">
            Migriert alle aktiven Nutzer auf die aktuelle Datenbank-Version (inkl. Ernährung/Workout/Coach).
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void runMigration(false)}
              disabled={running || loading}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[var(--on-accent)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              {running ? 'Migration läuft…' : 'Nur ausstehende Nutzer migrieren'}
            </button>
            <button
              type="button"
              onClick={() => void runMigration(true)}
              disabled={running || loading}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 disabled:opacity-50"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              {running ? 'Erzwungene Migration läuft…' : 'Migration für alle Nutzer erzwingen'}
            </button>
          </div>
        </>
      )}

      {!collapsed && (
        <>
          <ExerciseDbKeyEditor
            configured={!!status?.exerciseDbConfigured}
            authHeader={authHeader}
            onSaved={() => void fetchStatus()}
          />

          {!status?.exerciseDbConfigured && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 space-y-2">
              <div className="flex gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>
                  Der laufende Server-Prozess hat keinen gültigen Key unter{' '}
                  <code className="bg-amber-100/80 px-1 rounded">EXERCISEDB_RAPIDAPI_KEY</code> (oder den Alternativen unten).
                  Trage den Key in der Host-<code className="bg-amber-100/80 px-1 rounded">.env</code> ein und starte den
                  Container neu.
                </p>
              </div>
              {status?.exerciseDbEnvHints && status.exerciseDbEnvHints.length > 0 && (
                <ul className="list-disc pl-5 font-medium text-[10px] space-y-0.5 opacity-90">
                  {status.exerciseDbEnvHints.map(h => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {status?.exerciseDbConfigured && (
            <p className="text-[10px] font-bold text-emerald-700">
              ExerciseDB aktiv · {status.exerciseDbHost ?? 'exercisedb.p.rapidapi.com'}
              {status.exerciseDbSource ? ` · ${status.exerciseDbSource}` : ''}
              {status.keyLength != null ? ` · Key-Länge ${status.keyLength} Zeichen` : ''}.
            </p>
          )}
        </>
      )}

      {err && (
        <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{err}</p>
      )}

      {result && (
        <div
          className={`rounded-xl p-4 text-xs font-bold space-y-1 ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
        >
          <p>
            {result.usersMigrated} Nutzer migriert · {result.usersSkipped} übersprungen
            {result.usersFailed > 0 ? ` · ${result.usersFailed} mit Fehlern` : ''}
          </p>
          <p>
            {result.exercisesUpdated} Workout/Vorlagen · {result.nutritionUpdated} Ernährung ·{' '}
            {result.coachWeeksUpdated} Coach-Wochen (Version {result.targetVersion})
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-4 font-medium opacity-90 max-h-24 overflow-y-auto">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showJobModal && (
        <div className={mobileSheetOverlayClass()}>
          <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-6 text-ink shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tighter">Migration läuft</h3>
                <p className="text-[10px] text-muted">
                  {job ? `${job.processedUsers}/${job.totalUsers} Nutzer verarbeitet` : 'Initialisiere…'}
                </p>
              </div>
              {!running && (
                <button
                  type="button"
                  onClick={() => setShowJobModal(false)}
                  className="rounded-lg border border-line px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted hover:bg-surface-2"
                >
                  Schließen
                </button>
              )}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: job && job.totalUsers > 0 ? `${Math.min(100, Math.round((job.processedUsers / job.totalUsers) * 100))}%` : '8%',
                }}
              />
            </div>
            <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface-2 p-3 space-y-1">
              {(job?.logs ?? []).slice(-80).map((l, i) => (
                <p key={`${l.ts}-${l.userId}-${i}`} className="text-[11px] text-ink">
                  <span className="font-bold">User #{l.userId}</span> · {l.status} · {l.message}
                </p>
              ))}
              {(job?.logs?.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted">Warte auf den ersten Nutzer…</p>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const { locale, t } = useI18n();
  const [authHeader, setAuthHeader] = useState<string | null>(
    () => sessionStorage.getItem('vrtx_admin_auth')
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [aiConfig, setAiConfig] = useState<AiConfigState | null>(null);
  const [modelsCollapsed, setModelsCollapsed] = useState(true);

  const fetchAiConfig = useCallback(async () => {
    if (!authHeader) return;
    try {
      const res = await fetch('/api/admin/ai-config', {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json();
        const fallbackRec = (id: AiModelArea) => ({
          ollama: DEFAULT_AI_MODELS.ollama[id],
          deepseek: DEFAULT_AI_MODELS.deepseek[id],
          mistral: DEFAULT_AI_MODELS.mistral[id],
          gemini: DEFAULT_AI_MODELS.gemini[id],
        });
        const defaultAreas: AiAreaMeta[] = (
          ['coach_workout', 'coach_nutrition', 'meal', 'meal_vision', 'workout_template'] as AiModelArea[]
        ).map((id) => ({
          id,
          label:
            id === 'coach_workout'
              ? 'Coach – Workout'
              : id === 'coach_nutrition'
                ? 'Coach – Ernährung'
                : id === 'meal'
                  ? 'Ernährung – Textanalyse'
                  : id === 'meal_vision'
                    ? 'Ernährung – Bildanalyse'
                    : 'Workout-Vorlagen',
          recommended: {
            ollama: { model: DEFAULT_AI_MODELS.ollama[id], hint: '' },
            deepseek: { model: DEFAULT_AI_MODELS.deepseek[id], hint: '' },
            mistral: { model: DEFAULT_AI_MODELS.mistral[id], hint: '' },
            gemini: { model: DEFAULT_AI_MODELS.gemini[id], hint: '' },
          },
        }));
        const areas: AiAreaMeta[] = (data.areas?.length ? data.areas : defaultAreas).map(
          (a: Partial<AiAreaMeta> & { id: AiModelArea; label: string }) => ({
            id: a.id,
            label: a.label,
            recommended: a.recommended ?? {
              ollama: {
                model: data.recommendations?.ollama?.[a.id]?.model ?? fallbackRec(a.id).ollama,
                hint: data.recommendations?.ollama?.[a.id]?.hint ?? '',
              },
              deepseek: {
                model: data.recommendations?.deepseek?.[a.id]?.model ?? fallbackRec(a.id).deepseek,
                hint: data.recommendations?.deepseek?.[a.id]?.hint ?? '',
              },
              mistral: {
                model: data.recommendations?.mistral?.[a.id]?.model ?? fallbackRec(a.id).mistral,
                hint: data.recommendations?.mistral?.[a.id]?.hint ?? '',
              },
              gemini: {
                model: data.recommendations?.gemini?.[a.id]?.model ?? fallbackRec(a.id).gemini,
                hint: data.recommendations?.gemini?.[a.id]?.hint ?? '',
              },
            },
            options: a.options,
          }),
        );
        setAiConfig({
          active: data.active ?? 'none',
          ollamaConfigured: !!data.ollamaConfigured,
          deepseekConfigured: !!data.deepseekConfigured,
          geminiConfigured: !!data.geminiConfigured,
          mistralConfigured: !!data.mistralConfigured,
          ollama: data.ollama,
          keys: {
            deepseek: { configured: !!data.keys?.deepseek?.configured, masked: data.keys?.deepseek?.masked ?? null },
            mistral: { configured: !!data.keys?.mistral?.configured, masked: data.keys?.mistral?.masked ?? null },
            gemini: { configured: !!data.keys?.gemini?.configured, masked: data.keys?.gemini?.masked ?? null },
          },
          models: { ...DEFAULT_AI_MODELS, ...data.models },
          areas,
        });
      }
    } catch {}
  }, [authHeader]);

  const fetchUsers = useCallback(async () => {
    if (!authHeader) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: authHeader },
      });
      if (res.status === 401) {
        setAuthHeader(null);
        sessionStorage.removeItem('vrtx_admin_auth');
        return;
      }
      const data = await res.json();
      setUsers(data);
    } catch {
      setError(t('admin.err.loadUsers'));
    } finally {
      setLoading(false);
    }
  }, [authHeader, t]);

  useEffect(() => {
    fetchUsers();
    fetchAiConfig();
  }, [fetchUsers, fetchAiConfig]);

  const [aiSwitchModal, setAiSwitchModal] = useState<{
    provider: 'ollama' | 'deepseek' | 'gemini' | 'mistral';
    phase: 'testing' | 'ok' | 'error';
    message?: string;
  } | null>(null);

  const toggleAiProvider = async (provider: 'ollama' | 'deepseek' | 'gemini' | 'mistral') => {
    if (!authHeader || !aiConfig) return;
    if (aiConfig.active === provider) return;

    setAiSwitchModal({ provider, phase: 'testing' });
    setError('');

    try {
      const res = await fetch('/api/admin/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        active?: 'ollama' | 'deepseek' | 'gemini' | 'mistral' | 'none';
        error?: string;
        reverted?: boolean;
      };

      const nextActive =
        data.active === 'ollama' || data.active === 'deepseek' || data.active === 'gemini' || data.active === 'mistral'
          ? data.active
          : aiConfig.active;

      if (res.ok && data.ok) {
        setAiConfig(prev => (prev ? { ...prev, active: provider } : null));
        setAiSwitchModal({ provider, phase: 'ok' });
        window.setTimeout(() => setAiSwitchModal(null), 1600);
        return;
      }

      setAiConfig(prev =>
        prev
          ? {
              ...prev,
              active:
                nextActive === 'ollama' || nextActive === 'gemini' || nextActive === 'mistral'
                  ? nextActive
                  : prev.active,
            }
          : null,
      );
      setAiSwitchModal({
        provider,
        phase: 'error',
        message:
          data.error ||
          (data.reverted
            ? 'Test fehlgeschlagen — vorherige KI-Einstellung wurde wiederhergestellt.'
            : 'KI-Wechsel fehlgeschlagen.'),
      });
    } catch (err: unknown) {
      setAiSwitchModal({
        provider,
        phase: 'error',
        message: err instanceof Error ? err.message : 'Verbindung zum Server fehlgeschlagen',
      });
      void fetchAiConfig();
    }
  };

  const handleLogin = (auth: string) => {
    sessionStorage.setItem('vrtx_admin_auth', auth);
    setAuthHeader(auth);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('vrtx_admin_auth');
    setAuthHeader(null);
    setUsers([]);
  };

  const handleDelete = async (id: number) => {
    if (!authHeader) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error(t('admin.err.delete'));
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || t('admin.err.delete'));
    }
  };

  const handleSuspend = async (id: number) => {
    if (!authHeader) return;
    try {
      const res = await fetch(`/api/admin/users/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Sperren fehlgeschlagen');
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Sperren fehlgeschlagen');
    }
  };

  if (!authHeader) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="admin-page min-h-screen">
      {/* Delete confirm overlay */}
      {deleteConfirm !== null && (
        <div className={mobileSheetOverlayClass()}>
          <div className="w-full max-w-sm rounded-t-2xl bg-surface p-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center text-ink shadow-2xl lg:rounded-2xl md:p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <h3 className="mb-2 text-xl font-black uppercase tracking-tighter text-ink">{t('admin.delete.title')}</h3>
            <p className="mb-8 text-sm text-muted">
              {t('admin.delete.body')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="min-h-[52px] flex-1 touch-manipulation rounded-xl border border-line py-3 text-[10px] font-bold uppercase tracking-widest text-ink transition-colors hover:bg-surface-2 active:opacity-90 md:min-h-[48px]"
              >
                {t('admin.delete.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="min-h-[52px] flex-1 touch-manipulation rounded-xl bg-red-500 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-600 active:opacity-90 md:min-h-[48px]"
              >
                {t('admin.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      

      {/* KI-Wechsel: Test-Dialog */}
      {aiSwitchModal && (
        <div className={mobileSheetOverlayClass()}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-ink shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2">
                {aiSwitchModal.phase === 'testing' ? (
                  <Loader2 size={22} className="animate-spin text-ink" />
                ) : aiSwitchModal.phase === 'ok' ? (
                  <CheckCircle2 size={22} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={22} className="text-red-500" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tighter">
                  {aiSwitchModal.phase === 'testing'
                    ? `${aiSwitchModal.provider === 'ollama' ? 'Lokales Modell (Ollama)' : aiSwitchModal.provider === 'mistral' ? 'Mistral' : 'Gemini'} wird getestet…`
                    : aiSwitchModal.phase === 'ok'
                      ? 'KI-Wechsel erfolgreich'
                      : 'KI-Wechsel abgebrochen'}
                </h3>
                <p className="text-[10px] text-muted font-medium mt-0.5">
                  {aiSwitchModal.phase === 'testing'
                    ? (aiSwitchModal.provider === 'ollama' ? 'Verbindung zum lokalen Ollama-Daemon auf dem NAS wird geprüft…' : 'Kurzer API-Test mit dem gespeicherten Key.')
                    : aiSwitchModal.phase === 'ok'
                      ? 'Der Provider ist aktiv und antwortet.'
                      : 'Die vorherige Einstellung wurde wiederhergestellt.'}
                </p>
              </div>
            </div>
            {aiSwitchModal.message && (
              <p
                className={`text-xs font-bold p-3 rounded-xl mb-4 ${
                  aiSwitchModal.phase === 'error'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {aiSwitchModal.message}
              </p>
            )}
            {aiSwitchModal.phase !== 'testing' && (
              <button
                type="button"
                onClick={() => setAiSwitchModal(null)}
                className="w-full min-h-[48px] rounded-xl bg-accent text-[var(--on-accent)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-hover)]"
              >
                Schließen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editUser && (
        <EditModal
          user={editUser}
          authHeader={authHeader}
          onClose={() => setEditUser(null)}
          onSaved={fetchUsers}
        />
      )}

      {/* Top bar */}
      <header className="bg-surface border-b border-line sticky top-0 z-40 text-ink">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-black uppercase tracking-tighter text-lg leading-none text-ink">{t('admin.title')}</h1>
              <p className="text-[9px] text-muted uppercase tracking-widest font-bold">{t('admin.controlPanel')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              className="p-2 rounded-xl hover:bg-surface-2 transition-colors text-muted hover:text-ink"
              title={t('admin.header.refreshTitle')}
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 border border-line rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-surface-2 transition-colors text-muted"
            >
              <LogOut size={14} />
              {t('admin.header.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6" />

        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden text-ink mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-ink">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.hash')}</th>
                  <th className="text-left px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.firstName')}</th>
                  <th className="text-left px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.lastName')}</th>
                  <th className="text-left px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.email')}</th>
                  <th className="text-left px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.password')}</th>
                  <th className="text-left px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.registered')}</th>
                  <th className="text-right px-6 py-4 text-[9px] font-black uppercase tracking-widest text-muted">{t('admin.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-[10px] text-muted uppercase tracking-widest font-bold">
                      {t('admin.table.loading')}
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-[10px] text-muted uppercase tracking-widest font-bold">
                      {t('admin.table.empty')}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const names = adminUserNames(u);
                    return (
                      <tr key={u.id} className="border-b border-line hover:bg-surface-2 transition-colors">
                        <td className="px-6 py-4 text-xs font-black text-muted">#{u.id}</td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-ink">{names.firstName || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-ink">{names.lastName || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-muted font-medium">{u.email}</span>
                        </td>
                        <td className="px-6 py-4">
                          {u.has_password ? (
                            <span className="font-mono text-sm text-muted tracking-widest">••••••••</span>
                          ) : (
                            <span className="text-[10px] text-muted uppercase tracking-widest font-bold">{t('admin.table.sso')}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-muted font-medium">{formatDate(u.created_at)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditUser(u)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-[9px] font-black uppercase tracking-widest text-muted hover:bg-surface-2 hover:border-line transition-all"
                            >
                              <Pencil size={12} />
                              {t('admin.table.edit')}
                            </button>
                            <button
                              onClick={() => void handleSuspend(u.id)}
                              disabled={!u.is_active}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[9px] font-black uppercase tracking-widest text-amber-800 hover:bg-amber-100 transition-all disabled:opacity-40"
                            >
                              <X size={12} />
                              Sperren
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(u.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all"
                            >
                              <Trash2 size={12} />
                              {t('admin.table.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {aiConfig && authHeader && (
          <motion.div layout className="mb-8 rounded-2xl border border-line bg-surface p-4 text-ink">
            <button
              type="button"
              onClick={() => setModelsCollapsed((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-1 py-1 text-left hover:bg-surface-2"
            >
              <div>
                <p className="text-sm font-black uppercase tracking-tighter text-ink">generell: KI-Modelle</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted">Nur ausklappen wenn du etwas ändern willst</p>
              </div>
              <span className="rounded-xl border border-line px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted">
                {modelsCollapsed ? 'Ausklappen' : 'Einklappen'}
              </span>
            </button>
            {!modelsCollapsed && (
              <div className="mt-4 space-y-4">
                <div className="bg-surface rounded-2xl border border-line p-4 text-ink">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black tracking-tighter uppercase text-ink">KI-Engine Steuerung</p>
                      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mt-0.5">Umschalten zwischen Ollama (Lokal), Gemini & Mistral</p>
                    </div>
                    <div className="flex gap-2 bg-surface-2 p-1 rounded-xl border border-line">
                      <button
                        onClick={() => toggleAiProvider('ollama')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          aiConfig.active === 'ollama'
                            ? 'bg-accent text-on-accent shadow-md'
                            : 'text-muted hover:text-ink hover:bg-surface'
                        }`}
                      >
                        Ollama (Lokal)
                      </button>
                      <button
                        onClick={() => toggleAiProvider('deepseek')}
                        disabled={!aiConfig.deepseekConfigured}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          aiConfig.active === 'deepseek'
                            ? 'bg-accent text-[var(--ink)] shadow-md'
                            : aiConfig.deepseekConfigured
                              ? 'text-muted hover:text-ink hover:bg-surface'
                              : 'text-muted cursor-not-allowed'
                        }`}
                      >
                        DeepSeek {!aiConfig.deepseekConfigured && <KeyRound size={10} className="inline ml-1" />}
                      </button>
                      <button
                        onClick={() => toggleAiProvider('mistral')}
                        disabled={!aiConfig.mistralConfigured}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          aiConfig.active === 'mistral'
                            ? 'bg-accent text-[var(--ink)] shadow-md'
                            : aiConfig.mistralConfigured
                              ? 'text-muted hover:text-ink hover:bg-surface'
                              : 'text-muted cursor-not-allowed'
                        }`}
                      >
                        Mistral {!aiConfig.mistralConfigured && <KeyRound size={10} className="inline ml-1" />}
                      </button>
                      <button
                        onClick={() => toggleAiProvider('gemini')}
                        disabled={!aiConfig.geminiConfigured}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          aiConfig.active === 'gemini'
                            ? 'bg-accent text-[var(--ink)] shadow-md'
                            : aiConfig.geminiConfigured
                              ? 'text-muted hover:text-ink hover:bg-surface'
                              : 'text-muted cursor-not-allowed'
                        }`}
                      >
                        Gemini {!aiConfig.geminiConfigured && <KeyRound size={10} className="inline ml-1" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-surface rounded-2xl border border-line p-5 space-y-3 text-ink">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-sm font-black tracking-tighter uppercase text-ink">
                          Lokales Modell (Ollama · Gemma 4 E2B)
                        </p>
                      </div>
                      <p className="text-[10px] text-muted font-medium mt-1">
                        Kein API-Key für Benutzer erforderlich. Läuft lokal und privat im Docker-Netzwerk auf deinem NAS.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {aiConfig.active === 'ollama' ? 'Aktiver Standard' : 'Bereit'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-2 p-3.5 rounded-xl border border-line font-medium">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-muted block">Ollama URL (Docker)</span>
                      <span className="font-mono text-ink font-semibold">{aiConfig.ollama?.baseUrl || 'http://ollama:11434'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-muted block">Lokales Modell</span>
                      <span className="font-mono text-ink font-semibold">{aiConfig.ollama?.model || 'gemma4:e2b'}</span>
                    </div>
                  </div>
                </div>
                <motion.div layout className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <ApiKeyEditor
                    provider="deepseek"
                    label="DeepSeek API-Key"
                    configured={aiConfig.deepseekConfigured}
                    masked={aiConfig.keys?.deepseek?.masked}
                    authHeader={authHeader}
                    onSaved={fetchAiConfig}
                  />
                  <ApiKeyEditor
                    provider="mistral"
                    label="Mistral API-Key"
                    configured={aiConfig.mistralConfigured}
                    masked={aiConfig.keys?.mistral?.masked}
                    authHeader={authHeader}
                    onSaved={fetchAiConfig}
                  />
                  <ApiKeyEditor
                    provider="gemini"
                    label="Gemini API-Key"
                    configured={aiConfig.geminiConfigured}
                    masked={aiConfig.keys?.gemini?.masked}
                    authHeader={authHeader}
                    onSaved={fetchAiConfig}
                  />
                </motion.div>
                <ModelConfigPanel aiConfig={aiConfig} authHeader={authHeader} onSaved={fetchAiConfig} />
              </div>
            )}
          </motion.div>
        )}

        {authHeader && <DataMigrationPanel authHeader={authHeader} />}

        {error && (
          <div className="text-red-500 text-xs font-bold bg-red-50 p-4 rounded-2xl mb-6 border border-red-100">
            {error}
          </div>
        )}

        
      </main>
    </div>
  );
}
