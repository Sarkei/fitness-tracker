import type { UserWeekFacts } from './buildUserWeekFacts';
import type { UserWeeklyReportPayload } from './userWeeklyReportSchema';

function t(facts: UserWeekFacts, de: string, en: string): string {
  return facts.locale === 'en' ? en : de;
}

export function buildFallbackUserWeeklyReport(facts: UserWeekFacts): UserWeeklyReportPayload {
  const name = facts.profile.displayName?.trim() || t(facts, 'Athlet', 'Athlete');
  const volDelta =
    facts.training.volumeDeltaPct != null
      ? `${facts.training.volumeDeltaPct > 0 ? '+' : ''}${facts.training.volumeDeltaPct}%`
      : t(facts, 'kein Vergleich', 'no comparison');

  const records =
    facts.records.filter((r) => r.isNewThisWeek).length > 0
      ? facts.records
          .filter((r) => r.isNewThisWeek)
          .map((r) => ({
            title: r.exercise,
            detail: `${r.metric}: ${r.value}`,
            isNew: true,
          }))
      : [
          {
            title: t(facts, 'Keine neuen Kraft-Rekorde', 'No new strength PRs'),
            detail: t(
              facts,
              'Diese Woche war stabil — nächste Woche liegt Fokus auf progressiver Überladung.',
              'A stable week — focus on progressive overload next week.',
            ),
            isNew: false,
          },
        ];

  return {
    weekLabel: facts.weekLabel,
    weekStart: facts.weekStart,
    weekEnd: facts.weekEnd,
    locale: facts.locale,
    personalReport: {
      headline: t(facts, `${name}, deine Woche in Review`, `${name}, your week in review`),
      intro: t(
        facts,
        `Deine Woche ${facts.weekLabel} auf einen Blick — ${facts.activity.workoutSessions} Sessions, ${facts.nutrition.daysLogged} Ernährungstage geloggt.`,
        `Your week ${facts.weekLabel} at a glance — ${facts.activity.workoutSessions} sessions, ${facts.nutrition.daysLogged} nutrition days logged.`,
      ),
      keyMetrics: [
        {
          label: t(facts, 'Trainingseinheiten', 'Workouts'),
          value: String(facts.activity.workoutSessions),
          hint: t(facts, `Streak: ${facts.activity.workoutStreak}`, `Streak: ${facts.activity.workoutStreak}`),
          tone: facts.activity.workoutSessions >= 3 ? 'positive' : 'neutral',
        },
        {
          label: t(facts, 'Volumen', 'Volume'),
          value: `${facts.training.totalVolumeKg} kg`,
          hint: volDelta,
          tone: 'neutral',
        },
        {
          label: t(facts, 'Ø kcal/Tag', 'Avg kcal/day'),
          value: String(facts.nutrition.avgKcalPerDay),
          hint: t(facts, `Ziel ${facts.nutrition.targetKcal}`, `Target ${facts.nutrition.targetKcal}`),
          tone:
            facts.nutrition.calorieAdherencePct != null && facts.nutrition.calorieAdherencePct >= 85
              ? 'positive'
              : 'attention',
        },
        {
          label: t(facts, 'Ø Protein', 'Avg protein'),
          value: `${facts.nutrition.avgProteinPerDay} g`,
          hint: t(facts, `Ziel ${facts.nutrition.targetProtein} g`, `Target ${facts.nutrition.targetProtein} g`),
          tone:
            facts.nutrition.proteinAdherencePct != null && facts.nutrition.proteinAdherencePct >= 85
              ? 'positive'
              : 'attention',
        },
        {
          label: t(facts, 'Schritte Ø', 'Avg steps'),
          value: facts.activity.avgSteps.toLocaleString(),
          hint: t(facts, `Ziel ${facts.profile.dailySteps}`, `Goal ${facts.profile.dailySteps}`),
          tone: facts.activity.avgSteps >= facts.profile.dailySteps * 0.9 ? 'positive' : 'neutral',
        },
        {
          label: t(facts, 'Wochen-Prognose', 'Weekly outlook'),
          value: `${facts.nutrition.projectedKgPerWeek} kg`,
          hint: t(facts, `Netto ${facts.nutrition.weeklyNetKcal} kcal`, `Net ${facts.nutrition.weeklyNetKcal} kcal`),
          tone: facts.profile.goalType === 'lose' && facts.nutrition.weeklyNetKcal < 0 ? 'positive' : 'neutral',
        },
      ],
      sections: [
        {
          title: t(facts, 'Was gut lief', 'What went well'),
          paragraphs: [],
          bullets: [
            facts.activity.workoutSessions > 0
              ? t(facts, `${facts.activity.workoutSessions} Sessions — Konstanz zählt.`, `${facts.activity.workoutSessions} sessions — consistency counts.`)
              : t(facts, 'Ruhewoche — nutze sie bewusst für Regeneration.', 'Recovery week — use it deliberately.'),
            facts.nutrition.daysLogged >= 5
              ? t(facts, `${facts.nutrition.daysLogged} Tage Ernährung geloggt — solides Tracking.`, `${facts.nutrition.daysLogged} nutrition days logged — solid tracking.`)
              : t(facts, 'Mehr Food-Logs geben dir schärfere Steuerung.', 'More food logs sharpen your control.'),
            facts.records.filter((r) => r.isNewThisWeek).length > 0
              ? t(facts, `${facts.records.filter((r) => r.isNewThisWeek).length} neue Kraft-Rekorde diese Woche.`, `${facts.records.filter((r) => r.isNewThisWeek).length} new strength PRs this week.`)
              : t(facts, 'Stabile Kraftwerte — Basis für Progression gelegt.', 'Stable strength numbers — base for progression set.'),
          ],
        },
        {
          title: t(facts, 'Energie & Alltag', 'Energy & lifestyle'),
          paragraphs: [],
          bullets: [
            t(
              facts,
              `Ø ${facts.activity.avgSteps.toLocaleString()} Schritte/Tag (Ziel ${facts.profile.dailySteps}).`,
              `Avg ${facts.activity.avgSteps.toLocaleString()} steps/day (goal ${facts.profile.dailySteps}).`,
            ),
            facts.activity.avgSleepHours != null
              ? t(facts, `Schlaf ~${facts.activity.avgSleepHours} h/Nacht.`, `Sleep ~${facts.activity.avgSleepHours} h/night.`)
              : t(facts, 'Schlaf tracken für bessere Regenerations-Einschätzung.', 'Track sleep for better recovery insights.'),
            t(
              facts,
              `Trainingsverbrauch: ${facts.training.caloriesBurned} kcal · Fatigue ${facts.training.fatigueScore}/100.`,
              `Training burn: ${facts.training.caloriesBurned} kcal · fatigue ${facts.training.fatigueScore}/100.`,
            ),
          ],
        },
        {
          title: t(facts, 'Ernährung im Blick', 'Nutrition focus'),
          paragraphs: [],
          bullets: [
            t(
              facts,
              `Ø ${facts.nutrition.avgKcalPerDay} kcal/Tag vs. Ziel ${facts.nutrition.targetKcal} kcal.`,
              `Avg ${facts.nutrition.avgKcalPerDay} kcal/day vs. target ${facts.nutrition.targetKcal} kcal.`,
            ),
            t(
              facts,
              `Protein Ø ${facts.nutrition.avgProteinPerDay} g vs. Ziel ${facts.nutrition.targetProtein} g.`,
              `Protein avg ${facts.nutrition.avgProteinPerDay} g vs. target ${facts.nutrition.targetProtein} g.`,
            ),
            facts.nutrition.calorieAdherencePct != null
              ? t(facts, `Kalorien-Adhärenz: ${facts.nutrition.calorieAdherencePct}%.`, `Calorie adherence: ${facts.nutrition.calorieAdherencePct}%.`)
              : t(facts, 'Mehr Log-Tage verbessern die Prognose.', 'More log days improve the forecast.'),
            t(
              facts,
              `Wochen-Netto: ${facts.nutrition.weeklyNetKcal} kcal → ~${facts.nutrition.projectedKgPerWeek} kg/Woche.`,
              `Weekly net: ${facts.nutrition.weeklyNetKcal} kcal → ~${facts.nutrition.projectedKgPerWeek} kg/week.`,
            ),
          ],
        },
        {
          title: t(facts, 'Training & Belastung', 'Training load'),
          paragraphs: [],
          bullets: [
            t(
              facts,
              `${facts.training.totalVolumeKg} kg Gesamtvolumen (${volDelta} vs. Vorwoche).`,
              `${facts.training.totalVolumeKg} kg total volume (${volDelta} vs prior week).`,
            ),
            facts.training.topExercisesByVolume[0]
              ? t(
                  facts,
                  `Top-Übung: ${facts.training.topExercisesByVolume[0].name} (${facts.training.topExercisesByVolume[0].volumeKg} kg).`,
                  `Top lift: ${facts.training.topExercisesByVolume[0].name} (${facts.training.topExercisesByVolume[0].volumeKg} kg).`,
                )
              : t(facts, 'Noch kein Kraftvolumen diese Woche.', 'No strength volume this week yet.'),
            t(
              facts,
              `${facts.training.cardioMinutes} min Cardio in ${facts.training.cardioSessions} Einheiten.`,
              `${facts.training.cardioMinutes} min cardio across ${facts.training.cardioSessions} sessions.`,
            ),
            facts.training.fatigueScore > 75
              ? t(facts, 'Fatigue hoch — Deload oder leichtere Woche erwägen.', 'Fatigue high — consider deload or lighter week.')
              : t(facts, 'Belastung im steuerbaren Bereich.', 'Load in a manageable range.'),
          ],
        },
        {
          title: t(facts, 'Ausblick', 'Outlook'),
          paragraphs: [],
          bullets: [
            t(
              facts,
              `Bei gleichbleibender Adhärenz: ${facts.nutrition.projectedKgPerWeek} kg/Woche Richtung Ziel.`,
              `At current adherence: ${facts.nutrition.projectedKgPerWeek} kg/week toward goal.`,
            ),
            t(facts, '3–4 Krafteinheiten nächste Woche anstreben.', 'Aim for 3–4 strength sessions next week.'),
            t(facts, 'Protein täglich im Zielbereich halten.', 'Keep protein in target range daily.'),
            t(
              facts,
              'Fortschritt ist nicht linear — Richtung über mehrere Wochen zählt.',
              'Progress is not linear — direction over several weeks matters.',
            ),
          ],
        },
      ],
      goalAssessment: {
        heading: t(facts, 'Ziel-Check', 'Goal check'),
        progressSummary: t(
          facts,
          facts.profile.goalType === 'lose'
            ? `Ziel Abnahme: geschätzte Wochenbilanz ${facts.nutrition.weeklyNetKcal} kcal (${facts.nutrition.projectedKgPerWeek} kg Äquivalent).${facts.profile.weightDeltaWeekKg != null ? ` Gewicht diese Woche: ${facts.profile.weightDeltaWeekKg > 0 ? '+' : ''}${facts.profile.weightDeltaWeekKg} kg.` : ''}`
            : facts.profile.goalType === 'gain'
              ? `Ziel Aufbau: Netto-Energie ${facts.nutrition.weeklyNetKcal} kcal — prüfe ob Aufnahme und Training dazu passen.`
              : `Ziel Erhalt/Performance: halte Aufnahme nahe ${facts.nutrition.targetKcal} kcal und Training konsistent.`,
          facts.profile.goalType === 'lose'
            ? `Fat loss goal: weekly balance ${facts.nutrition.weeklyNetKcal} kcal (${facts.nutrition.projectedKgPerWeek} kg equivalent).${facts.profile.weightDeltaWeekKg != null ? ` Weight change this week: ${facts.profile.weightDeltaWeekKg > 0 ? '+' : ''}${facts.profile.weightDeltaWeekKg} kg.` : ''}`
            : facts.profile.goalType === 'gain'
              ? `Muscle gain goal: net energy ${facts.nutrition.weeklyNetKcal} kcal — align intake with training.`
              : `Maintain/performance: stay near ${facts.nutrition.targetKcal} kcal and keep training steady.`,
        ),
        onTrack:
          facts.profile.goalType === 'lose'
            ? facts.nutrition.weeklyNetKcal < 0
            : facts.profile.goalType === 'gain'
              ? facts.nutrition.weeklyNetKcal > 0
              : Math.abs(facts.nutrition.weeklyNetKcal) < 1500,
        distanceToGoal:
          facts.profile.goalWeightKg != null && facts.profile.currentWeightKg != null
            ? t(
                facts,
                `Aktuell ${facts.profile.currentWeightKg} kg, Ziel ${facts.profile.goalWeightKg} kg.`,
                `Currently ${facts.profile.currentWeightKg} kg, target ${facts.profile.goalWeightKg} kg.`,
              )
            : undefined,
        nextFocus: [
          t(facts, '3–4 Krafteinheiten mit klarem Progressionsplan', '3–4 strength sessions with clear progression'),
          t(facts, 'Protein täglich im Zielbereich halten', 'Hit protein target daily'),
          t(facts, 'Schritte & Schlaf stabilisieren', 'Stabilize steps & sleep'),
        ],
      },
      nutritionTips: [
        t(facts, `Logge mindestens 5–6 Tage/Woche (aktuell ${facts.nutrition.daysLogged}).`, `Log at least 5–6 days/week (currently ${facts.nutrition.daysLogged}).`),
        t(facts, `Protein auf ~${facts.nutrition.targetProtein} g/Tag ausrichten.`, `Aim for ~${facts.nutrition.targetProtein} g protein/day.`),
        t(facts, 'Vorkochen / gleiche Frühstücks-Routine spart Entscheidungen.', 'Meal prep / same breakfast routine reduces friction.'),
      ],
      strengthTips: [
        t(facts, 'Top-Übung diese Woche: ' + (facts.training.topExercisesByVolume[0]?.name ?? '—'), 'Top lift: ' + (facts.training.topExercisesByVolume[0]?.name ?? '—')),
        t(facts, 'RPE notieren und bei Fatigue >75 Deload erwägen.', 'Track RPE; deload if fatigue >75.'),
        t(facts, '2. Wiederholungssatz oft am effektivsten für Hypertrophie.', 'Second working set often most effective for hypertrophy.'),
      ],
      cardioTips: [
        t(facts, `${facts.training.cardioMinutes} min Cardio in ${facts.training.cardioSessions} Einheiten.`, `${facts.training.cardioMinutes} min cardio across ${facts.training.cardioSessions} sessions.`),
        t(facts, `Schritte-Ziel: ${facts.profile.dailySteps}/Tag (Ø ${facts.activity.avgSteps}).`, `Step goal: ${facts.profile.dailySteps}/day (avg ${facts.activity.avgSteps}).`),
        t(facts, 'Zone-2 nach schweren Beinentagen entlastet Regeneration.', 'Zone-2 after heavy leg days aids recovery.'),
      ],
      closingNote: t(
        facts,
        'Nimm dir 10 Minuten, den Bericht durchzugehen, und setz dir eine konkrete Priorität für Montag. Du bist auf dem richtigen Weg, wenn du die Woche ehrlich bewertest und kleine Anpassungen umsetzt.',
        'Take 10 minutes to read this report and set one concrete priority for Monday. You are on track when you assess honestly and apply small adjustments.',
      ),
    },
    performanceReport: {
      headline: t(facts, 'Leistungsbericht', 'Performance report'),
      summaryStats: [
        { label: t(facts, 'Trainingseinheiten', 'Workouts'), value: String(facts.activity.workoutSessions) },
        { label: t(facts, 'Volumen', 'Volume'), value: `${facts.training.totalVolumeKg} kg`, hint: volDelta },
        { label: t(facts, 'Ø kcal/Tag', 'Avg kcal/day'), value: String(facts.nutrition.avgKcalPerDay) },
        { label: t(facts, 'Ø Protein', 'Avg protein'), value: `${facts.nutrition.avgProteinPerDay} g` },
        { label: t(facts, 'Schritte Ø', 'Avg steps'), value: facts.activity.avgSteps.toLocaleString() },
        { label: t(facts, 'Fatigue', 'Fatigue'), value: `${facts.training.fatigueScore}/100` },
        { label: t(facts, 'Wochen-Netto', 'Weekly net'), value: `${facts.nutrition.weeklyNetKcal} kcal` },
        { label: t(facts, 'Cardio', 'Cardio'), value: `${facts.training.cardioMinutes} min` },
      ],
      records,
      highlights: [
        facts.activity.workoutSessions > 0
          ? t(facts, `${facts.activity.workoutSessions} abgeschlossene Sessions`, `${facts.activity.workoutSessions} completed sessions`)
          : t(facts, 'Fokus auf Regeneration', 'Focus on recovery'),
        ...facts.records
          .filter((r) => r.isNewThisWeek)
          .slice(0, 4)
          .map((r) => `${r.exercise}: ${r.value} ${r.metric}`),
      ],
      trainingSection: {
        title: t(facts, 'Krafttraining', 'Strength training'),
        paragraphs: [],
        bullets: facts.training.topExercisesByVolume.map(
          (e) => `${e.name}: ${e.volumeKg} kg Volumen`,
        ),
      },
      nutritionSection: {
        title: t(facts, 'Ernährung', 'Nutrition'),
        paragraphs: [],
        bullets: [
          `${facts.nutrition.daysLogged} ${t(facts, 'Tage geloggt', 'days logged')}`,
          `${facts.nutrition.totalKcal} kcal ${t(facts, 'gesamt', 'total')}`,
          t(facts, `Adhärenz Kalorien: ${facts.nutrition.calorieAdherencePct ?? '—'}%`, `Calorie adherence: ${facts.nutrition.calorieAdherencePct ?? '—'}%`),
        ],
      },
      cardioSection: {
        title: t(facts, 'Cardio & NEAT', 'Cardio & NEAT'),
        paragraphs: [],
        bullets: [
          `${facts.training.cardioMinutes} min / ${facts.training.cardioSessions} Sessions`,
          `${facts.activity.avgSteps} ${t(facts, 'Ø Schritte', 'avg steps')}`,
        ],
      },
      comparisonSection: {
        title: t(facts, 'Woche vs. Vorwoche', 'Week vs prior week'),
        paragraphs: [],
        bullets: [
          t(facts, `Volumen: ${facts.training.totalVolumeKg} kg (Vorwoche ${facts.training.prevWeekVolumeKg} kg)`, `Volume: ${facts.training.totalVolumeKg} kg (prior ${facts.training.prevWeekVolumeKg} kg)`),
          t(facts, `Verbrauch Training: ${facts.training.caloriesBurned} kcal`, `Training burn: ${facts.training.caloriesBurned} kcal`),
        ],
      },
      sections: [],
    },
  };
}
