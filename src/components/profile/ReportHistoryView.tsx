import { useState, useEffect } from 'react';
import { Download, FileText, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  ensureUserWeeklyReport,
  fetchUserWeeklyReports,
  type UserWeeklyReportRow,
} from '@/src/services/userWeeklyReportService';
import UserWeeklyReportDocument from '@/src/components/reports/UserWeeklyReportDocument';
import type { UserWeeklyReportPayload } from '@/src/lib/weeklyReport/userWeeklyReportSchema';
import { useI18n } from '@/src/lib/i18n';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { format } from 'date-fns';

export default function ReportHistoryView() {
  const { t, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const [reports, setReports] = useState<UserWeeklyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ensureBusy, setEnsureBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setEnsureBusy(true);
      await ensureUserWeeklyReport().catch(() => null);
      setEnsureBusy(false);
      const data = await fetchUserWeeklyReports();
      setReports(data);
      if (data.length > 0 && !expandedId) setExpandedId(data[0].id);
    } catch (err) {
      console.error('Failed to fetch weekly reports', err);
    } finally {
      setLoading(false);
      setEnsureBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading || ensureBusy) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-[var(--text-muted)] gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand" />
        <p className="text-xs font-bold uppercase tracking-widest">{t('profile.userReport.loading')}</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[var(--border-muted)] rounded-3xl mt-4">
        <FileText size={48} className="text-[var(--text-muted)] mb-4 opacity-50" />
        <h3 className="text-lg font-black uppercase tracking-widest text-[var(--text-muted)]">
          {t('profile.userReport.emptyTitle')}
        </h3>
        <p className="text-sm font-medium text-[var(--text-muted)] mt-2 max-w-sm">{t('profile.userReport.emptyBody')}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 min-h-[44px] px-5 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest"
        >
          {t('profile.userReport.checkNow')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4 print:space-y-0">
      <div className="flex justify-between items-end print:hidden">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter">{t('profile.userReport.historyTitle')}</h2>
          <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
            {t('profile.userReport.historySub')}
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border-muted)] hover:border-brand/40 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest touch-manipulation"
        >
          <Download size={14} /> {t('profile.userReport.print')}
        </button>
      </div>

      <div className="space-y-4 print:hidden">
        {reports.map((r, i) => {
          const isExpanded = expandedId === r.id;
          const dateStr = format(new Date(r.generated_at), 'P', { locale: dfLocale });
          const payload = r.report as UserWeeklyReportPayload;
          const sourceLabel =
            r.source === 'ai' ? t('profile.userReport.sourceAi') : t('profile.userReport.sourceAuto');

          return (
            <div
              key={r.id}
              className={cn(
                'bg-[var(--card-bg)] border rounded-2xl overflow-hidden transition-colors',
                isExpanded ? 'border-brand/30 shadow-lg' : 'border-[var(--border-muted)]',
              )}
            >
              <button
                type="button"
                className="w-full p-5 flex items-center justify-between text-left touch-manipulation"
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center border',
                      i === 0 ? 'bg-brand/10 border-brand/20 text-brand' : 'bg-[var(--background)] border-[var(--border-muted)]',
                    )}
                  >
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tighter">{payload.weekLabel}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      {dateStr} · {sourceLabel}
                    </p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {isExpanded ? (
                <div className="px-2 pb-6 sm:px-4 border-t border-[var(--border-muted)]">
                  <UserWeeklyReportDocument report={payload} className="mt-4" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden print:block">
        {expandedId ? (
          <UserWeeklyReportDocument
            report={(reports.find(r => r.id === expandedId)?.report ?? reports[0].report) as UserWeeklyReportPayload}
          />
        ) : (
          <UserWeeklyReportDocument report={reports[0].report as UserWeeklyReportPayload} />
        )}
      </div>
    </div>
  );
}
