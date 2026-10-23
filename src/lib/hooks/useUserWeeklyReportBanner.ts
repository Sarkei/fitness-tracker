import { useCallback, useEffect, useState } from 'react';
import {
  ensureUserWeeklyReport,
  fetchLatestUserWeeklyReport,
  type UserWeeklyReportRow,
} from '@/src/services/userWeeklyReportService';
import { getLastCompletedWeekRange } from '@/src/lib/weeklyReport/weekWindow';
import { forceReleaseAllOverlayScrollLocks, resetMobileChromeAfterOverlay } from '@/src/lib/mobileViewport';

const DISMISS_PREFIX = 'user_weekly_report_dismissed_';
const MAX_BANNER_AGE_DAYS = 21;

export function useUserWeeklyReportBanner(enabled = true) {
  const [row, setRow] = useState<UserWeeklyReportRow | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      await ensureUserWeeklyReport().catch(() => null);
      const latest = await fetchLatestUserWeeklyReport();
      if (!latest) {
        setRow(null);
        return;
      }
      const { weekKey: currentWeek } = getLastCompletedWeekRange();
      const daysSince = (Date.now() - new Date(latest.generated_at).getTime()) / 86400000;
      if (latest.week_key === currentWeek && daysSince <= MAX_BANNER_AGE_DAYS) {
        setDismissed(localStorage.getItem(`${DISMISS_PREFIX}${latest.week_key}`) === '1');
        setRow(latest);
      } else {
        setRow(null);
      }
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismiss = useCallback(() => {
    if (!row) return;
    localStorage.setItem(`${DISMISS_PREFIX}${row.week_key}`, '1');
    setDismissed(true);
    forceReleaseAllOverlayScrollLocks();
    resetMobileChromeAfterOverlay();
  }, [row]);

  return { row, dismissed, loading, refresh, dismiss };
}
