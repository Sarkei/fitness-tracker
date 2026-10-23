/**
 * Monitoring + Alerting: DB oder /api/health prüfen, optional Webhook (Slack/Discord).
 *
 * npm run ops:coach:alert
 * npm run ops:coach:health -- --url https://app.example/api/health
 */
import {
  evaluateLoadedMetrics,
  formatCoachOpsAlertMessage,
} from '../src/lib/coach/coachOpsEvaluate.ts';
import { loadCoachOpsFromDb, loadCoachOpsFromHealth } from './coach-ops-shared.ts';

type AlertFormat = 'slack' | 'discord' | 'json';

function parseArgs(argv: string[]): { mode: 'db' | 'http'; healthUrl?: string } {
  const httpIdx = argv.indexOf('--http');
  const urlIdx = argv.indexOf('--url');
  if (httpIdx >= 0 || urlIdx >= 0) {
    const url =
      (urlIdx >= 0 ? argv[urlIdx + 1] : undefined) ||
      process.env.COACH_HEALTH_URL ||
      'http://127.0.0.1:3000/api/health';
    return { mode: 'http', healthUrl: url };
  }
  return { mode: 'db' };
}

function shouldAlert(severity: string, minSeverity: string): boolean {
  const rank = { ok: 0, degraded: 1, critical: 2 };
  return rank[severity as keyof typeof rank] >= rank[minSeverity as keyof typeof rank];
}

function buildWebhookBody(format: AlertFormat, text: string, ev: ReturnType<typeof evaluateLoadedMetrics>) {
  if (format === 'discord') {
    return JSON.stringify({
      content: text.slice(0, 1900),
      embeds: [
        {
          title: `Coach Ops — ${ev.severity}`,
          description: ev.failures.length ? ev.failures.join('\n') : 'Within thresholds',
          color: ev.severity === 'critical' ? 0xef4444 : ev.severity === 'degraded' ? 0xf59e0b : 0x22c55e,
        },
      ],
    });
  }
  if (format === 'json') {
    return JSON.stringify({ text, evaluation: ev });
  }
  return JSON.stringify({ text });
}

async function postWebhook(url: string, body: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Webhook HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const minSeverity = (process.env.COACH_ALERT_MIN_SEVERITY || 'degraded').toLowerCase();
  const webhook = process.env.COACH_ALERT_WEBHOOK_URL?.trim();
  const format = (process.env.COACH_ALERT_WEBHOOK_FORMAT || 'slack').toLowerCase() as AlertFormat;

  const metrics =
    args.mode === 'http'
      ? await loadCoachOpsFromHealth(args.healthUrl!)
      : await loadCoachOpsFromDb();

  const ev = evaluateLoadedMetrics(metrics);
  console.log(JSON.stringify(ev.metrics, null, 2));

  const context = args.mode === 'http' ? args.healthUrl : 'database';
  const message = formatCoachOpsAlertMessage(ev, context);

  if (webhook && shouldAlert(ev.severity, minSeverity)) {
    await postWebhook(webhook, buildWebhookBody(format, message, ev));
    console.log(`alert sent (${ev.severity}) → ${format}`);
  } else if (webhook) {
    console.log(`alert skipped (severity ${ev.severity} < ${minSeverity})`);
  }

  if (!ev.ok) {
    for (const f of ev.failures) console.error(`FAIL: ${f}`);
    process.exit(1);
  }
  console.log('coach-ops-alert: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
