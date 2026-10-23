import type {
  UserWeeklyReportPayload,
  ReportSection,
} from '@/src/lib/weeklyReport/userWeeklyReportSchema';
import { cn } from '@/src/lib/utils';
import { ReportBullet, ReportRichText } from '@/src/components/reports/reportRichText';

type KeyMetric = UserWeeklyReportPayload['personalReport']['keyMetrics'][number];

function toneBorder(tone?: KeyMetric['tone']) {
  if (tone === 'positive') return 'border-green-500/30 bg-green-500/5';
  if (tone === 'attention') return 'border-amber-500/30 bg-amber-500/5';
  return 'border-[var(--border-muted)] bg-[var(--background)]';
}

function KeyMetricsGrid({ metrics }: { metrics: KeyMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
      {metrics.map((m) => (
        <div
          key={m.label}
          className={cn('rounded-xl border p-3 break-inside-avoid', toneBorder(m.tone))}
        >
          <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] leading-tight">
            {m.label}
          </p>
          <p className="text-xl font-black italic tracking-tight mt-1 tabular-nums text-brand">
            {m.value}
          </p>
          {m.hint ? (
            <p className="text-[9px] font-bold text-[var(--text-muted)] mt-0.5 leading-snug">
              <ReportRichText text={m.hint} />
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function deriveKeyMetrics(report: UserWeeklyReportPayload): KeyMetric[] {
  const stored = report.personalReport.keyMetrics;
  if (stored && stored.length > 0) return stored;
  return report.performanceReport.summaryStats.slice(0, 6).map((s) => ({
    label: s.label,
    value: s.value,
    hint: s.hint,
    tone: 'neutral' as const,
  }));
}

function SectionBlock({ section, dense = false }: { section: ReportSection; dense?: boolean }) {
  const bullets = section.bullets ?? [];
  const paragraphs = section.paragraphs ?? [];
  const preferBullets = bullets.length > 0;

  return (
    <section className={cn('mb-5 break-inside-avoid', dense && 'mb-4')}>
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand mb-2.5">
        {section.title}
      </h3>
      {preferBullets ? (
        <ul className="space-y-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)]/60 p-3.5">
          {bullets.map((b, i) => (
            <ReportBullet key={i}>
              <ReportRichText text={b} />
            </ReportBullet>
          ))}
        </ul>
      ) : null}
      {!preferBullets &&
        paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-[var(--text-primary)] mb-2 font-medium">
            <ReportRichText text={p} />
          </p>
        ))}
      {preferBullets && paragraphs.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-xs leading-relaxed text-[var(--text-muted)] font-medium">
              <ReportRichText text={p} />
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type Props = {
  report: UserWeeklyReportPayload;
  className?: string;
};

/** Zwei A4-Seiten: persönlicher Bericht + Leistungsbericht (druckoptimiert). */
export default function UserWeeklyReportDocument({ report, className }: Props) {
  const p = report.personalReport;
  const perf = report.performanceReport;
  const keyMetrics = deriveKeyMetrics(report);
  const isDe = report.locale !== 'en';

  return (
    <div className={cn('user-weekly-report-doc', className)}>
      <article className="weekly-report-a4-page bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-8 md:p-10 shadow-sm print:shadow-none print:border-black/10 print:rounded-none">
        <header className="border-b border-[var(--border-muted)] pb-4 mb-6">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">
            VRTX · Persönlicher Wochenbericht
          </p>
          <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter mt-1">
            {p.headline}
          </h2>
          <p className="text-xs font-bold text-[var(--text-muted)] mt-2 uppercase tracking-widest">
            {report.weekLabel}
          </p>
        </header>

        <KeyMetricsGrid metrics={keyMetrics} />

        <p className="text-sm leading-relaxed text-[var(--text-primary)] font-medium mb-6 border-l-2 border-brand/40 pl-4">
          <ReportRichText text={p.intro} />
        </p>

        {p.sections.map((s, i) => (
          <SectionBlock key={i} section={s} />
        ))}

        <section className="mb-5 rounded-xl border border-brand/25 bg-brand/5 p-5 break-inside-avoid">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand">
              {p.goalAssessment.heading}
            </h3>
            <span
              className={cn(
                'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full',
                p.goalAssessment.onTrack
                  ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
              )}
            >
              {p.goalAssessment.onTrack
                ? isDe
                  ? '✓ Auf Kurs'
                  : '✓ On track'
                : isDe
                  ? '→ Anpassung sinnvoll'
                  : '→ Adjust focus'}
            </span>
          </div>
          {p.goalAssessment.distanceToGoal ? (
            <p className="text-sm font-black text-brand mb-3 tabular-nums">
              <ReportRichText text={p.goalAssessment.distanceToGoal} />
            </p>
          ) : null}
          <ul className="space-y-2 mb-4">
            {p.goalAssessment.progressSummary
              .split(/(?<=[.!?])\s+/)
              .filter(Boolean)
              .map((sentence, i) => (
                <ReportBullet key={i}>
                  <ReportRichText text={sentence.trim()} />
                </ReportBullet>
              ))}
          </ul>
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
            {isDe ? 'Nächste Prioritäten' : 'Next priorities'}
          </p>
          <ul className="space-y-1.5">
            {p.goalAssessment.nextFocus.map((f, i) => (
              <li
                key={i}
                className="text-sm font-bold flex gap-2 rounded-lg bg-[var(--card-bg)]/80 border border-[var(--border-muted)] px-3 py-2"
              >
                <span className="text-brand shrink-0 font-black">{i + 1}.</span>
                <ReportRichText text={f} />
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <TipBox title="Ernährung" items={p.nutritionTips} />
          <TipBox title="Kraft" items={p.strengthTips} />
          <TipBox title="Cardio" items={p.cardioTips} />
        </div>

        <p className="text-sm leading-relaxed italic text-[var(--text-muted)] border-t border-[var(--border-muted)] pt-4">
          <ReportRichText text={p.closingNote} />
        </p>
      </article>

      <article className="weekly-report-a4-page bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-8 md:p-10 shadow-sm mt-6 print:shadow-none print:border-black/10 print:rounded-none print:mt-0">
        <header className="border-b border-[var(--border-muted)] pb-4 mb-6">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">
            VRTX · Leistungsbericht
          </p>
          <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter mt-1">
            {perf.headline}
          </h2>
          <p className="text-xs font-bold text-[var(--text-muted)] mt-2 uppercase tracking-widest">
            {report.weekLabel}
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {perf.summaryStats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-[var(--background)] border border-[var(--border-muted)] p-3"
            >
              <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {s.label}
              </p>
              <p className="text-lg font-black italic mt-1 tabular-nums text-brand">{s.value}</p>
              {s.hint ? (
                <p className="text-[9px] text-[var(--text-muted)] font-bold mt-0.5">
                  <ReportRichText text={s.hint} />
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {perf.highlights.length > 0 ? (
          <section className="mb-5">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand mb-2">
              Highlights
            </h3>
            <ul className="space-y-1.5 rounded-xl border border-[var(--border-muted)] bg-[var(--background)]/60 p-3.5">
              {perf.highlights.map((h, i) => (
                <ReportBullet key={i} accent="green">
                  <ReportRichText text={h} />
                </ReportBullet>
              ))}
            </ul>
          </section>
        ) : null}

        {perf.records.length > 0 ? (
          <section className="mb-5">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand mb-2">
              Rekorde
            </h3>
            <div className="space-y-2">
              {perf.records.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border px-3 py-2',
                    r.isNew ? 'border-brand/40 bg-brand/5' : 'border-[var(--border-muted)]',
                  )}
                >
                  <p className="text-sm font-black">
                    <ReportRichText text={r.title} />
                  </p>
                  <p className="text-xs text-[var(--text-muted)] font-medium">
                    <ReportRichText text={r.detail} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <SectionBlock section={perf.trainingSection} dense />
        <SectionBlock section={perf.nutritionSection} dense />
        {perf.cardioSection ? <SectionBlock section={perf.cardioSection} dense /> : null}
        {perf.comparisonSection ? <SectionBlock section={perf.comparisonSection} dense /> : null}
        {perf.sections?.map((s, i) => (
          <SectionBlock key={`extra-${i}`} section={s} dense />
        ))}
      </article>
    </div>
  );
}

function TipBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3 break-inside-avoid">
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <ReportBullet key={i}>
            <span className="text-[11px] leading-snug">
              <ReportRichText text={t} />
            </span>
          </ReportBullet>
        ))}
      </ul>
    </div>
  );
}
