/**

 * CI/Cron: Coach-AI Fehlerraten prüfen. Exit 1 bei critical.

 * npm run ops:coach

 */

import { formatCoachOpsAlertMessage } from '../src/lib/coach/coachOpsEvaluate.ts';

import { evaluateLoadedMetrics, loadCoachOpsFromDb } from './coach-ops-shared.ts';



async function main() {

  const metrics = await loadCoachOpsFromDb();

  const ev = evaluateLoadedMetrics(metrics);

  console.log(JSON.stringify(ev.metrics, null, 2));



  if (!ev.ok) {

    console.error(formatCoachOpsAlertMessage(ev, 'coach-ops-check'));

    process.exit(1);

  }

  console.log('coach-ops-check: OK');

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});

