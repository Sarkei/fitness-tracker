import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart2,
  Brain,
  CalendarCheck,
  Dumbbell,
  Utensils,
  User,
  type LucideIcon,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { useNutrition, useWorkouts } from '@/src/lib/AppDataContext';
import { effectiveNutritionTotals } from '@/src/lib/nutritionTotals';
import { strengthVolumeForWorkout } from '@/src/lib/workoutAnalytics';

/**
 * Startseite als Übersicht (knowledge/design-system/layout.md, Abschnitt 9):
 * Badge, Serif-Titel, ein Satz, Kennzahlen aus echten Daten, Kartenraster der Bereiche,
 * abgesetzte Sektion mit dem, was zuletzt passiert ist.
 */

const EMPTY = '—';

function dayKey(value?: string | null): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

/** yyyy-MM-dd oder ISO ohne Zeitzonen-Verschiebung als 13.11.2026 ausgeben. */
function formatDayLabel(value: string): string {
  const key = dayKey(value);
  const [y, m, d] = key.split('-');
  return y && m && d ? `${d}.${m}.${y}` : key;
}

export default function OverviewPage() {
  const { profile } = useAuth();
  const { t, locale } = useI18n();
  const { workouts, loading: workoutsLoading } = useWorkouts();
  const { nutritionEntries, loading: nutritionLoading } = useNutrition();

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US'),
    [locale],
  );

  const today = useMemo(() => new Date(), []);
  const todayKey = format(today, 'yyyy-MM-dd');
  const weekStartKey = format(subDays(today, 6), 'yyyy-MM-dd');

  const weekWorkouts = useMemo(
    () => workouts.filter((w) => dayKey(w.date) >= weekStartKey && dayKey(w.date) <= todayKey),
    [workouts, weekStartKey, todayKey],
  );

  const weekVolume = useMemo(
    () => weekWorkouts.reduce((sum, workout) => sum + strengthVolumeForWorkout(workout), 0),
    [weekWorkouts],
  );

  const todayMeals = useMemo(
    () => nutritionEntries.filter((entry) => dayKey(entry.date) === todayKey),
    [nutritionEntries, todayKey],
  );

  const todayCalories = useMemo(
    () => Math.round(todayMeals.reduce((sum, entry) => sum + effectiveNutritionTotals(entry).calories, 0)),
    [todayMeals],
  );

  const weight = useMemo(() => {
    const current = Number(profile?.measurements?.weight) || 0;
    if (current > 0) return current;
    const history = profile?.measurements?.weightHistory ?? [];
    const last = [...history].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1);
    return Number(last?.value) || 0;
  }, [profile?.measurements?.weight, profile?.measurements?.weightHistory]);

  const statsLoading = workoutsLoading || nutritionLoading;

  const stats = [
    {
      value: statsLoading ? EMPTY : numberFormat.format(weekWorkouts.length),
      label: t('home.kpi.workouts'),
    },
    {
      value: statsLoading ? EMPTY : weekVolume > 0 ? `${numberFormat.format(Math.round(weekVolume))} kg` : EMPTY,
      label: t('home.kpi.volume'),
    },
    {
      value: weight > 0 ? `${numberFormat.format(Math.round(weight * 10) / 10)} kg` : EMPTY,
      label: t('home.kpi.weight'),
    },
    {
      value: statsLoading ? EMPTY : todayCalories > 0 ? `${numberFormat.format(todayCalories)} kcal` : EMPTY,
      label: t('home.kpi.calories'),
    },
  ];

  const areas: { to: string; icon: LucideIcon; titleKey: string; textKey: string; meta?: string }[] = [
    {
      to: '/today',
      icon: CalendarCheck,
      titleKey: 'home.card.today.title',
      textKey: 'home.card.today.text',
      meta: `${numberFormat.format(todayMeals.length)} ${locale === 'de' ? 'Mahlzeiten heute' : 'meals today'}`,
    },
    {
      to: '/training',
      icon: Dumbbell,
      titleKey: 'home.card.training.title',
      textKey: 'home.card.training.text',
      meta: `${numberFormat.format(weekWorkouts.length)} ${locale === 'de' ? 'Einheiten · 7 Tage' : 'sessions · 7 days'}`,
    },
    {
      to: '/foods',
      icon: Utensils,
      titleKey: 'home.card.nutrition.title',
      textKey: 'home.card.nutrition.text',
      meta: todayCalories > 0 ? `${numberFormat.format(todayCalories)} kcal` : undefined,
    },
    { to: '/coach', icon: Brain, titleKey: 'home.card.coach.title', textKey: 'home.card.coach.text' },
    { to: '/stats', icon: BarChart2, titleKey: 'home.card.stats.title', textKey: 'home.card.stats.text' },
    { to: '/profile', icon: User, titleKey: 'home.card.profile.title', textKey: 'home.card.profile.text' },
  ];

  const recent = useMemo(() => {
    const rows = [
      ...workouts.slice(0, 6).map((workout) => ({
        id: `w-${workout.id}`,
        to: '/workouts',
        title: workout.name,
        hint: `${formatDayLabel(workout.date)} · ${workout.duration} min`,
        value: workout.caloriesBurned ? `${numberFormat.format(workout.caloriesBurned)} kcal` : '',
        sortKey: dayKey(workout.date),
      })),
      ...nutritionEntries.slice(0, 6).map((entry) => ({
        id: `n-${entry.id}`,
        to: '/nutrition',
        title: entry.meal,
        hint: `${formatDayLabel(entry.date)} · ${t(`nut.cat.${entry.category}`)}`,
        value: `${numberFormat.format(effectiveNutritionTotals(entry).calories)} kcal`,
        sortKey: dayKey(entry.date),
      })),
    ];
    return rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).slice(0, 5);
  }, [workouts, nutritionEntries, numberFormat, t]);

  return (
    <>
      <header className="app-container app-hero">
        <p className="app-badge">{t('home.badge')}</p>
        <h1 className="app-title">{t('home.title')}</h1>
        <p className="app-lede">{t('home.intro')}</p>
        <div className="app-hero__actions">
          <Link className="app-btn" to="/today">
            {t('nav.today')}
            <ArrowRight size={16} />
          </Link>
          <Link className="app-btn app-btn--ghost" to="/training">
            {t('home.card.training.title')}
          </Link>
        </div>

        <dl className="stat-row">
          {stats.map((entry) => (
            <div className="stat" key={entry.label}>
              <dt className="stat__value">{entry.value}</dt>
              <dd className="stat__label">{entry.label}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="app-section">
        <div className="app-container">
          <div className="app-section__head">
            <h2 className="app-section__title">{t('home.sections.title')}</h2>
            <p className="app-section__note">{t('home.sections.note')}</p>
          </div>

          <div className="app-grid app-grid--three">
            {areas.map(({ to, icon: Icon, titleKey, textKey, meta }) => (
              <Link key={to} to={to} className="app-card app-card--link">
                <div className="app-card__head">
                  <span className="app-card__icon" aria-hidden>
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <ArrowRight size={16} className="app-card__arrow" aria-hidden />
                </div>
                <h3 className="app-card__title">{t(titleKey)}</h3>
                <p className="app-card__text">{t(textKey)}</p>
                {meta ? <p className="app-card__meta">{meta}</p> : null}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="app-band app-section">
        <div className="app-container">
          <div className="app-section__head">
            <h2 className="app-section__title">{t('home.recent.title')}</h2>
            <p className="app-section__note">{t('home.recent.note')}</p>
          </div>

          {recent.length > 0 ? (
            <div className="app-list">
              {recent.map((row) => (
                <Link key={row.id} to={row.to} className="app-list__row">
                  <span className="app-list__main">
                    <span className="app-list__title">{row.title}</span>
                    <span className="app-list__hint">{row.hint}</span>
                  </span>
                  <span className="app-list__value">{row.value}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="app-list">
              <div className="app-list__row">
                <span className="app-list__main">
                  <span className="app-list__title">{workoutsLoading || nutritionLoading ? '…' : t('home.recent.empty')}</span>
                  <span className="app-list__hint">{t('home.recent.note')}</span>
                </span>
                <Link className="app-btn app-btn--ghost" to="/training">
                  {t('home.card.training.title')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
