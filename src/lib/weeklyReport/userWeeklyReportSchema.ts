import { z } from 'zod';

export const reportKeyMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  hint: z.string().optional(),
  tone: z.enum(['positive', 'neutral', 'attention']).optional(),
});

export const reportSectionSchema = z.object({
  title: z.string().min(1),
  paragraphs: z.array(z.string()).optional().default([]),
  bullets: z.array(z.string()).optional().default([]),
});

export const userWeeklyReportSchema = z.object({
  weekLabel: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  locale: z.enum(['de', 'en']).optional().default('de'),
  personalReport: z.object({
    headline: z.string(),
    intro: z.string(),
    /** Scanbare Kernzahlen für Seite 1 — ohne Fließtext lesen. */
    keyMetrics: z.array(reportKeyMetricSchema).optional().default([]),
    sections: z.array(reportSectionSchema).min(3),
    goalAssessment: z.object({
      heading: z.string(),
      progressSummary: z.string(),
      onTrack: z.boolean(),
      distanceToGoal: z.string().optional(),
      nextFocus: z.array(z.string()).min(1).max(6),
    }),
    nutritionTips: z.array(z.string()).min(2).max(6),
    strengthTips: z.array(z.string()).min(2).max(6),
    cardioTips: z.array(z.string()).min(2).max(6),
    closingNote: z.string(),
  }),
  performanceReport: z.object({
    headline: z.string(),
    summaryStats: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          hint: z.string().optional(),
        }),
      )
      .min(4)
      .max(12),
    records: z.array(
      z.object({
        title: z.string(),
        detail: z.string(),
        isNew: z.boolean().optional(),
      }),
    ),
    highlights: z.array(z.string()).min(1).max(8),
    trainingSection: reportSectionSchema,
    nutritionSection: reportSectionSchema,
    cardioSection: reportSectionSchema.optional(),
    comparisonSection: reportSectionSchema.optional(),
    sections: z.array(reportSectionSchema).optional().default([]),
  }),
});

export type UserWeeklyReportPayload = z.infer<typeof userWeeklyReportSchema>;
export type ReportSection = z.infer<typeof reportSectionSchema>;

/** Nur narrative Felder — Zahlen kommen aus Facts. */
export const userWeeklyReportNarrativeSchema = userWeeklyReportSchema;
