/**
 * Anzeige-Helfer für Coach-Schedules — strukturelle Felder übersetzen, Freitext bleibt aus KI.
 */

import type { UiLocale } from './i18n';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function coachOutputLanguageLabel(locale: UiLocale): string {
  return locale === 'de' ? 'German' : 'English';
}

export function formatCoachDayShort(day: string | undefined, t: TFn): string {
  const d = String(day || '').trim();
  if (!d) return '';
  const key = `coach.onb.wd.${d}`;
  const label = t(key);
  return label === key ? d.slice(0, 3).toUpperCase() : label;
}

const SESSION_TYPE_KEYS: Record<string, string> = {
  strength: 'coach.sessionType.strength',
  cardio: 'coach.sessionType.cardio',
  intervals: 'coach.sessionType.intervals',
  technique: 'coach.sessionType.technique',
  recovery: 'coach.sessionType.recovery',
  'cross-training': 'coach.sessionType.crossTraining',
  cross_training: 'coach.sessionType.crossTraining',
};

export function formatCoachSessionType(raw: string | undefined, t: TFn): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const slug = s.toLowerCase().replace(/\s+/g, '-');
  const key = SESSION_TYPE_KEYS[slug] ?? SESSION_TYPE_KEYS[slug.replace(/-/g, '_')];
  if (key) {
    const label = t(key);
    if (label !== key) return label;
  }
  return s;
}

const SESSION_SLOT_KEYS: Record<string, string> = {
  morning: 'coach.sessionSlot.morning',
  evening: 'coach.sessionSlot.evening',
  afternoon: 'coach.sessionSlot.afternoon',
  midday: 'coach.sessionSlot.midday',
};

export function formatCoachSessionSlot(raw: string | undefined, t: TFn): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const key = SESSION_SLOT_KEYS[s.toLowerCase()];
  if (key) {
    const label = t(key);
    if (label !== key) return label;
  }
  return s;
}

const REST_TITLE = /^rest\s*day?$/i;

export function formatCoachDayTitle(
  day: { isRest?: boolean; title?: string; sessionType?: string },
  t: TFn,
): string {
  if (day.isRest || REST_TITLE.test(String(day.title || '').trim())) {
    return t('coach.day.rest');
  }
  const title = String(day.title || '').trim();
  if (title) return title;
  const st = formatCoachSessionType(day.sessionType, t);
  return st || t('coach.day.session');
}

export function formatCoachRecommendation(raw: string | undefined, t: TFn): string {
  const r = String(raw || '').trim();
  if (!r) return '';
  const key = `coach.recommendation.${r}`;
  const label = t(key);
  return label === key ? r.replace(/_/g, ' ') : label;
}

export function coachDateLocale(locale: UiLocale): string {
  return locale === 'de' ? 'de-DE' : 'en-US';
}
