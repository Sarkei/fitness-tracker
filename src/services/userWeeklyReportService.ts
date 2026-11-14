import { api } from '@/src/lib/api';
import type { UserWeeklyReportPayload } from '@/src/lib/weeklyReport/userWeeklyReportSchema';

export type UserWeeklyReportRow = {
  id: string;
  user_id: number;
  week_key: string;
  week_start: string;
  week_end: string;
  report: UserWeeklyReportPayload;
  facts?: unknown;
  source: 'ai' | 'fallback' | string;
  generated_at: string;
};

export async function ensureUserWeeklyReport(): Promise<{
  ok: boolean;
  generated: boolean;
  generatedCount?: number;
  report?: UserWeeklyReportRow;
  reason?: string;
}> {
  return api('/api/user-weekly-reports/ensure', { method: 'POST' });
}

export async function fetchLatestUserWeeklyReport(): Promise<UserWeeklyReportRow | null> {
  return api<UserWeeklyReportRow | null>('/api/user-weekly-reports/latest');
}

export async function fetchUserWeeklyReports(): Promise<UserWeeklyReportRow[]> {
  return api<UserWeeklyReportRow[]>('/api/user-weekly-reports');
}

export async function fetchUserWeeklyReportById(id: string): Promise<UserWeeklyReportRow> {
  return api<UserWeeklyReportRow>(`/api/user-weekly-reports/${encodeURIComponent(id)}`);
}
