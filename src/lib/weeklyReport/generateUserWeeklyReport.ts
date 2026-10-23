import { parseJsonLoose } from '@/src/lib/parseCoachJson';
import { buildUserWeeklyReportPrompt } from '@/src/lib/aiPrompts/buildWorkoutPrompts';
import { buildFallbackUserWeeklyReport } from './buildFallbackUserWeeklyReport';
import type { UserWeekFacts } from './buildUserWeekFacts';
import { formatFactsForPrompt } from './buildUserWeekFacts';
import { userWeeklyReportSchema, type UserWeeklyReportPayload } from './userWeeklyReportSchema';

export async function generateUserWeeklyReport(params: {
  facts: UserWeekFacts;
  outputLanguage: string;
  callAi?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
}): Promise<{ report: UserWeeklyReportPayload; source: 'ai' | 'fallback'; rawLast?: string }> {
  const fallback = buildFallbackUserWeeklyReport(params.facts);

  if (!params.callAi) {
    return { report: fallback, source: 'fallback' };
  }

  let rawLast = '';
  let repair = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt =
      buildUserWeeklyReportPrompt({
        outputLanguage: params.outputLanguage,
        weekLabel: params.facts.weekLabel,
        weekStart: params.facts.weekStart,
        weekEnd: params.facts.weekEnd,
        factsJson: formatFactsForPrompt(params.facts),
      }) + (repair ? `\n\nJSON repair: ${repair}` : '');

    rawLast = await params.callAi([{ role: 'user', content: prompt }]);
    try {
      const parsed = parseJsonLoose(rawLast) as Record<string, unknown>;
      const z = userWeeklyReportSchema.safeParse(parsed);
      if (!z.success) {
        repair = z.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        continue;
      }
      const report: UserWeeklyReportPayload = {
        ...z.data,
        weekLabel: params.facts.weekLabel,
        weekStart: params.facts.weekStart,
        weekEnd: params.facts.weekEnd,
        locale: params.facts.locale,
      };
      return { report, source: 'ai', rawLast };
    } catch (e) {
      repair = e instanceof Error ? e.message : String(e);
    }
  }

  return { report: fallback, source: 'fallback', rawLast };
}
