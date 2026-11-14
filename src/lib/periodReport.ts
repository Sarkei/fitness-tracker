/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format, startOfDay, endOfDay, differenceInCalendarDays } from 'date-fns';
import type { Workout, Nutrition, UserProfile } from '../types';
import { printFitnessReport } from './printReport';
import {
  computeExercisePRTable,
  computeVolumeByExercise,
  buildPeriodNarrative,
  filterByDateRange,
} from './fitnessInsights';

export type ReportRangeKey = '7d' | '28d' | '3m' | '6m' | '12m' | 'custom';

export function resolveReportWindow(
  key: ReportRangeKey,
  customEnd: Date | null,
  accountStart: Date | null
): { start: Date; end: Date; label: string } {
  const end = startOfDay(customEnd ?? new Date());
  let days = 7;
  let label = 'Letzte 7 Tage';
  if (key === '28d') {
    days = 28;
    label = 'Letzte 4 Wochen';
  } else if (key === '3m') {
    days = 90;
    label = 'Letzte 3 Monate';
  } else if (key === '6m') {
    days = 180;
    label = 'Letzte 6 Monate';
  } else if (key === '12m') {
    days = 365;
    label = 'Letzte 12 Monate';
  } else if (key === 'custom' && customEnd) {
    days = 7;
    label = `Stichtag ${format(customEnd, 'dd.MM.yyyy')} (± Fenster)`;
  }
  const start = startOfDay(new Date(end));
  start.setDate(start.getDate() - (days - 1));
  if (accountStart && start < startOfDay(accountStart)) {
    return { start: startOfDay(accountStart), end, label: label + ' (gekürzt auf Profilbeginn)' };
  }
  return { start, end, label };
}

/** Progressive unlocking: nur Zeiträume die <= Account-Alter erlaubt sind */
export function allowedReportRangeKeys(accountCreatedAt: string | undefined): ReportRangeKey[] {
  const acc = accountCreatedAt ? new Date(accountCreatedAt) : null;
  const ageDays = acc ? Math.max(1, differenceInCalendarDays(new Date(), acc)) : 9999;
  const keys: ReportRangeKey[] = ['7d', 'custom'];
  if (ageDays >= 27) keys.push('28d');
  if (ageDays >= 85) keys.push('3m');
  if (ageDays >= 175) keys.push('6m');
  if (ageDays >= 360) keys.push('12m');
  return keys;
}

export function generatePeriodFitnessReport(opts: {
  profile: UserProfile;
  workouts: Workout[];
  nutrition: Nutrition[];
  rangeKey: ReportRangeKey;
  customDate: string | null;
}): boolean {
  const customEnd = opts.customDate ? new Date(opts.customDate) : null;
  const acc = opts.profile.accountCreatedAt ? new Date(opts.profile.accountCreatedAt) : null;
  const { start, end, label } = resolveReportWindow(opts.rangeKey, customEnd, acc);

  const w = filterByDateRange(opts.workouts, start, end);
  const n = filterByDateRange(opts.nutrition, start, end);
  const pr = computeExercisePRTable(w).slice(0, 12);
  const vol = computeVolumeByExercise(w).slice(0, 8);
  const narrative = buildPeriodNarrative(w, n, opts.profile, start, end);

  const periodLine = `${format(start, 'dd.MM.yyyy')} – ${format(end, 'dd.MM.yyyy')}`;
  const sections: string[] = [
    `<h2>Berichtszeitraum</h2><p>${escape(label)}<br><strong>${periodLine}</strong></p>`,
    `<h2>Executive Summary</h2><p style="line-height:1.6">${narrative.summary}</p>`,
    `<h2>Training</h2><p style="line-height:1.6">${narrative.training}</p>`,
    `<h2>Ernährung &amp; Routinen</h2><p style="line-height:1.6">${narrative.nutrition}</p>`,
    `<h2>Körper &amp; Verlauf</h2><p style="line-height:1.6">${narrative.body}</p>`,
    `<h2>Kennzahlen</h2><ul style="line-height:1.7;font-size:13px">${narrative.bullets.map(b => `<li>${escape(b)}</li>`).join('')}</ul>`,
  ];
  if (pr.length) {
    sections.push(
      `<h2>Personal Records (im Zeitraum)</h2><table><thead><tr><th>Übung</th><th>Max kg</th></tr></thead><tbody>${pr.map(r => `<tr><td>${escape(r.exercise)}</td><td>${r.maxWeight}</td></tr>`).join('')}</tbody></table>`
    );
  }
  if (vol.length) {
    sections.push(
      `<h2>Volumen Top Übungen</h2><table><thead><tr><th>Übung</th><th>Σ kg×Reps</th></tr></thead><tbody>${vol.map(v => `<tr><td>${escape(v.name)}</td><td>${v.volume}</td></tr>`).join('')}</tbody></table>`
    );
  }

  return printFitnessReport({
    title: `VRTX Analysebericht · ${label}`,
    displayName: opts.profile.displayName || 'Athlet',
    htmlSections: sections,
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
