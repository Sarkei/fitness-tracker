/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { api } from '@/src/lib/api';
import { useI18n } from '@/src/lib/i18n';
import { cn } from '@/src/lib/utils';
import type { Nutrition } from '@/src/types';

export interface DailyNutritionAiReviewProps {
  aiEnabled: boolean;
  aiCapabilitiesLoading: boolean;
  locale: 'de' | 'en';
  dateYmd: string;
  adjustedCalorieTarget: number;
  targetCalories: number;
  activeBurnToday: number;
  targetMacros: { protein: number; carbs: number; fat: number };
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  todayEntries: Nutrition[];
  goalType?: 'lose' | 'maintain' | 'gain';
}

const DEBOUNCE_MS = 1600;
const LS_KEY = 'fitness_tracker.nutDayAi.v1';

type AiBlockKey = 'good' | 'watch' | 'tip';

/** Entfernt Markdown und doppelte Disclaimer-Zeilen (alte/gespeicherte Antworten). */
function stripMdForNutDayAi(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      let s = line.trim();
      if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(s)) return '';
      if (/^general information only/i.test(s)) return '';
      if (/^hinweis:\s*allgemeine information/i.test(s)) return '';
      s = s.replace(/\*\*+/g, '');
      s = s.replace(/\*+/g, '');
      s = s.replace(/_+/g, '');
      s = s.replace(/`+/g, '');
      s = s.replace(/^#+\s*/, '');
      return s.trim();
    })
    .filter(Boolean)
    .join('\n');
}

function readNutDayAiCache(dateYmd: string): { dataKey: string; text: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, { dataKey: string; text: string }>;
    const row = all[dateYmd];
    if (!row || typeof row.dataKey !== 'string' || typeof row.text !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

function writeNutDayAiCache(dateYmd: string, dataKey: string, text: string): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, { dataKey: string; text: string }>) : {};
    all[dateYmd] = { dataKey, text };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}

function clearNutDayAiCache(dateYmd: string): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, { dataKey: string; text: string }>;
    delete all[dateYmd];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Erwartet bereits bereinigten Klartext: Gut/Good, Zu beachten/Watch, Tipp/Tip + „–“/„-“. */
function parseDayAiBlocks(cleaned: string): { key: AiBlockKey; bullets: string[] }[] | null {
  const lines = cleaned
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headingToKey = (h: string): AiBlockKey | null => {
    const x = h.trim();
    if (x === 'Gut:' || x === 'Good:') return 'good';
    if (x === 'Zu beachten:' || x === 'Watch:') return 'watch';
    if (x === 'Tipp:' || x === 'Tip:') return 'tip';
    return null;
  };
  const blocks: { key: AiBlockKey; bullets: string[] }[] = [];
  let cur: { key: AiBlockKey; bullets: string[] } | null = null;
  for (const line of lines) {
    const hk = headingToKey(line);
    if (hk) {
      cur = { key: hk, bullets: [] };
      blocks.push(cur);
      continue;
    }
    const m = line.match(/^[-–•]\s+(.+)$/);
    if (m && cur) cur.bullets.push(m[1].trim());
  }
  if (blocks.length === 0) return null;
  return blocks;
}

export default function DailyNutritionAiReview({
  aiEnabled,
  aiCapabilitiesLoading,
  locale,
  dateYmd,
  adjustedCalorieTarget,
  targetCalories,
  activeBurnToday,
  targetMacros,
  consumed,
  todayEntries,
  goalType,
}: DailyNutritionAiReviewProps) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const dataKeyRef = useRef('');

  const dataKey = useMemo(() => {
    const ids = todayEntries
      .map((e) => String(e.id))
      .sort()
      .join(',');
    return `${dateYmd}|${locale}|${ids}|${Math.round(consumed.calories)}|${Math.round(consumed.protein * 10) / 10}|${Math.round(consumed.carbs * 10) / 10}|${Math.round(consumed.fat * 10) / 10}|${adjustedCalorieTarget}`;
  }, [todayEntries, dateYmd, locale, consumed, adjustedCalorieTarget]);

  dataKeyRef.current = dataKey;

  const fetchReview = useCallback(
    async (persistKey: string) => {
      if (!aiEnabled || todayEntries.length === 0) return;
      const myId = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const meals = todayEntries.map((e) => ({
          meal: e.meal,
          category: e.category,
          calories: e.calories,
          protein: e.protein ?? 0,
          carbs: e.carbs ?? 0,
          fat: e.fat ?? 0,
        }));
        const data = await api<{ text: string }>('/api/ai/daily-nutrition-review', {
          method: 'POST',
          body: JSON.stringify({
            date: dateYmd,
            locale,
            adjustedCalorieTarget,
            baseCalorieTarget: targetCalories,
            activeBurnToday,
            targetMacros,
            consumed,
            meals,
            goalType: goalType ?? 'maintain',
          }),
        });
        if (reqId.current !== myId) return;
        const next = data.text;
        setText(next);
        writeNutDayAiCache(dateYmd, persistKey, next);
      } catch (e) {
        if (reqId.current !== myId) return;
        setError(e instanceof Error ? e.message : t('nut.dayAi.error'));
      } finally {
        if (reqId.current === myId) setLoading(false);
      }
    },
    [
      aiEnabled,
      todayEntries,
      dateYmd,
      locale,
      adjustedCalorieTarget,
      targetCalories,
      activeBurnToday,
      targetMacros,
      consumed,
      goalType,
      t,
    ],
  );

  useEffect(() => {
    if (aiCapabilitiesLoading || !aiEnabled) return;

    if (todayEntries.length === 0) {
      setText(null);
      setError(null);
      clearNutDayAiCache(dateYmd);
      return;
    }

    const cached = readNutDayAiCache(dateYmd);
    if (cached != null && cached.dataKey === dataKey) {
      setText(cached.text);
      setError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      const k = dataKeyRef.current;
      void fetchReview(k);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [dataKey, aiCapabilitiesLoading, aiEnabled, todayEntries.length, dateYmd, fetchReview]);

  const showDisabled = aiCapabilitiesLoading || !aiEnabled;
  const emptyDay = todayEntries.length === 0;
  const displayText = useMemo(() => (text ? stripMdForNutDayAi(text) : null), [text]);
  const blocks = displayText ? parseDayAiBlocks(displayText) : null;

  const blockTitle = (key: AiBlockKey) =>
    key === 'good' ? t('nut.dayAi.secGood') : key === 'watch' ? t('nut.dayAi.secWatch') : t('nut.dayAi.secTip');

  return (
    <div className="pt-6 mt-2 border-t border-[var(--border-muted)] space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <Brain size={16} className="text-brand shrink-0" />
        <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)] truncate">
          {t('nut.dayAi.title')}
        </h4>
        {loading && <Loader2 size={14} className={cn('animate-spin text-brand shrink-0 ml-auto')} aria-hidden />}
      </div>

      {showDisabled && !aiCapabilitiesLoading && (
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{t('nut.aiDisabled')}</p>
      )}
      {!showDisabled && emptyDay && (
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed italic">{t('nut.dayAi.hintEmpty')}</p>
      )}
      {error && (
        <p className="text-[10px] text-red-500 leading-relaxed" role="status">
          {error}
        </p>
      )}
      {displayText && blocks && blocks.length > 0 && (
        <>
          <div
            className={cn(
              'space-y-4 text-[var(--text-primary)] transition-opacity',
              loading && 'opacity-45',
            )}
          >
            {blocks.map((b) => (
              <div key={b.key} className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">{blockTitle(b.key)}</p>
                <ul className="list-disc space-y-1 pl-4 text-[11px] md:text-xs leading-snug marker:text-brand/80">
                  {b.bullets.length > 0 ? (
                    b.bullets.map((line, i) => (
                      <li key={`${b.key}-${i}`} className="pl-0.5">
                        {line}
                      </li>
                    ))
                  ) : (
                    <li className="text-[var(--text-muted)] list-none pl-0">—</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          {!loading && (
            <p className="text-[9px] text-[var(--text-muted)] leading-relaxed italic">{t('nut.dayAi.disclaimer')}</p>
          )}
        </>
      )}
      {displayText && (!blocks || blocks.length === 0) && (
        <>
          <div
            className={cn(
              'space-y-2 text-[11px] md:text-xs leading-relaxed text-[var(--text-primary)] transition-opacity',
              loading && 'opacity-45',
            )}
          >
            {displayText
              .split(/\n+/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => (
                <p key={`${i}-${line.slice(0, 24)}`}>{line}</p>
              ))}
          </div>
          {!loading && (
            <p className="text-[9px] text-[var(--text-muted)] leading-relaxed italic">{t('nut.dayAi.disclaimer')}</p>
          )}
        </>
      )}
    </div>
  );
}
