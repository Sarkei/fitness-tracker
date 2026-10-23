/**
 * Legt E2E-Testuser + minimalen aktiven Workout-Coach-Plan an (ohne KI).
 * Vor Playwright: npm run seed:e2e
 */
import '../envBootstrap.ts';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const EMAIL = process.env.E2E_USER_EMAIL || 'e2e-coach@vrtx.test';
const PASSWORD = process.env.E2E_USER_PASSWORD || 'E2eCoachPass123!';

const MINIMAL_WEEK = {
  weekFocus: 'E2E Seed Week',
  coachNotes: 'Automated E2E fixture — do not edit in production DB manually.',
  schedule: [
    {
      day: 'Monday',
      isRest: false,
      title: 'Push',
      sessionType: 'Strength',
      sessionSlot: 'Morning',
      estimatedDuration: 60,
      exercises: [{ name: 'Bench Press', exerciseKey: 'bench_press', sets: '3x8', reps: '8' }],
    },
    {
      day: 'Tuesday',
      isRest: false,
      title: 'Pull',
      sessionType: 'Strength',
      sessionSlot: 'Morning',
      estimatedDuration: 55,
      exercises: [{ name: 'Row', exerciseKey: 'barbell_row', sets: '3x10', reps: '10' }],
    },
    { day: 'Wednesday', isRest: true, title: 'Rest', sessionType: 'Recovery', exercises: [] },
    { day: 'Thursday', isRest: true, title: 'Rest', sessionType: 'Recovery', exercises: [] },
    { day: 'Friday', isRest: true, title: 'Rest', sessionType: 'Recovery', exercises: [] },
    { day: 'Saturday', isRest: true, title: 'Rest', sessionType: 'Recovery', exercises: [] },
    { day: 'Sunday', isRest: true, title: 'Rest', sessionType: 'Recovery', exercises: [] },
  ],
};

async function main() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'fitness_tracker',
    user: process.env.POSTGRES_USER || 'vrtx',
    password: process.env.POSTGRES_PASSWORD || 'vrtx_secret',
  });

  try {
    const hash = await bcrypt.hash(PASSWORD, 12);
    let userId: number;

    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [EMAIL]);
    if (existing.rows.length) {
      userId = existing.rows[0].id;
      await pool.query(
        `UPDATE users SET password_hash=$2, is_active=true, display_name='E2E Coach', updated_at=NOW() WHERE id=$1`,
        [userId, hash],
      );
      console.log(`seed:e2e — user updated id=${userId} email=${EMAIL}`);
    } else {
      const ins = await pool.query(
        `INSERT INTO users (name, email, password_hash, display_name, first_name, last_name, theme_preference)
         VALUES ('E2E Coach', $1, $2, 'E2E Coach', 'E2E', 'Coach', 'dark') RETURNING id`,
        [EMAIL, hash],
      );
      userId = ins.rows[0].id;
      console.log(`seed:e2e — user created id=${userId}`);
    }

    const planCheck = await pool.query(
      `SELECT id FROM coach_plans WHERE user_id=$1 AND status='active' AND type='workout' LIMIT 1`,
      [userId],
    );

    let planId: string;
    if (planCheck.rows.length) {
      planId = planCheck.rows[0].id;
      await pool.query(
        `UPDATE coach_plans SET discipline='strength', plan_mode='ongoing', current_week=1, generation_status='ready', updated_at=NOW() WHERE id=$1`,
        [planId],
      );
      console.log(`seed:e2e — plan reused id=${planId}`);
    } else {
      const planIns = await pool.query(
        `INSERT INTO coach_plans (user_id, type, status, discipline, plan_mode, current_week, onboarding_data, generation_status)
         VALUES ($1, 'workout', 'active', 'strength', 'ongoing', 1, $2::jsonb, 'ready') RETURNING id`,
        [
          userId,
          JSON.stringify({
            type: 'workout',
            primaryGoal: 'build_muscle',
            trainingStyle: 'strength',
            trainingDays: 2,
            sessionDuration: 60,
          }),
        ],
      );
      planId = planIns.rows[0].id;
      console.log(`seed:e2e — plan created id=${planId}`);
    }

    const startYmd = new Date().toISOString().split('T')[0];
    await pool.query(
      `INSERT INTO coach_weekly_schedules (plan_id, week_number, start_date, schedule)
       VALUES ($1, 1, $2, $3::jsonb)
       ON CONFLICT (plan_id, week_number) DO UPDATE SET schedule=$3::jsonb, start_date=$2`,
      [planId, startYmd, JSON.stringify(MINIMAL_WEEK)],
    );

    const E2E_REPORT = {
      overallRating: 7,
      completionRate: 50,
      recommendation: 'maintain',
      summary: 'E2E fixture report — schedule adherence baseline.',
      coachMessage: 'Automated seed report for Playwright.',
      performanceHighlights: ['Consistent attendance on push day'],
      areasToImprove: ['Add second session when ready'],
      weekOverWeekComparison: 'First tracked week (fixture).',
      nextWeekStrategy: 'Hold volume, refine if needed.',
      nextWeekChanges: [],
    };

    await pool.query(
      `INSERT INTO coach_weekly_reports (plan_id, week_number, report)
       VALUES ($1, 1, $2::jsonb)
       ON CONFLICT (plan_id, week_number) DO UPDATE SET report=$2::jsonb, generated_at=NOW()`,
      [planId, JSON.stringify(E2E_REPORT)],
    );

    console.log('seed:e2e: OK');
    console.log(`  email: ${EMAIL}`);
    console.log(`  password: (from E2E_USER_PASSWORD or default)`);
    console.log(`  planId: ${planId}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('seed:e2e failed:', e);
  process.exit(1);
});
