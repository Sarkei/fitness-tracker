import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import {
  fastingStatus,
  formatClock,
  formatRemaining,
  isValidPlan,
  nextEatingStart,
  planLabel,
  type FastingPlan,
} from '@/src/lib/fasting';

/**
 * Intervallfasten-Box für die Startseite (oberste Karte).
 *
 * Zeigt dauerhaft laufend — mit Sekunden — ob gerade Fastenzeit oder Essensfenster ist
 * und wie lange die Phase noch dauert. Der Plan (16:8, 18:6 … und die Startzeit) wird am
 * Profil gespeichert (`goals.fasting`), damit die Box auf jedem Gerät denselben Plan zeigt.
 *
 * Gewählt wird der Plan in den Einstellungen (Profil → Ziele, siehe
 * `components/profile/FastingSettings.tsx`). Tim wollte den „Plan ändern"-Knopf nicht
 * mehr mitten in der Uhr — hier steht deshalb nur die laufende Anzeige.
 */
export function FastingCard(): ReactElement | null {
  const { profile } = useAuth();
  const { locale } = useI18n();
  const de = locale !== 'en';

  const goals = (profile as unknown as { goals?: { fasting?: FastingPlan; fastingEnabled?: boolean } } | null)?.goals;
  const saved = goals?.fasting;
  const plan: FastingPlan | null = isValidPlan(saved) ? (saved as FastingPlan) : null;

  const [now, setNow] = useState(() => new Date());

  // Uhr läuft dauerhaft — jede Sekunde neu rechnen, kostet praktisch nichts.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const status = useMemo(() => (plan ? fastingStatus(plan, now) : null), [plan, now]);

  /* Fasten im Profil ausgeschaltet: die Box erscheint gar nicht. */
  if (goals?.fastingEnabled === false) return null;

  const titel = de ? 'Intervallfasten' : 'Intermittent fasting';

  return (
    <section className="fast-card" aria-label={titel}>
      <div className="fast-card__head">
        <div className="fast-card__title">
          <span className={`fast-card__dot ${status?.phase === 'fasting' ? 'is-fasting' : 'is-eating'}`} aria-hidden />
          <h2>{titel}</h2>
          {plan ? <span className="fast-card__plan">{planLabel(plan)}</span> : null}
        </div>
      </div>

      {!plan ? (
        <div className="fast-card__empty">
          <p>
            {de
              ? 'Kein Fastenplan gewählt. Unter Profil → Ziele kannst du Fasten einschalten und Verhältnis sowie Startzeit festlegen.'
              : 'No fasting plan yet. Turn fasting on under Profile → Goals to pick a ratio and the start time.'}
          </p>
        </div>
      ) : (
        <div className="fast-card__body">
          <div className="fast-card__phase">
            {status?.phase === 'fasting' ? <Moon size={18} /> : <Sun size={18} />}
            <span>
              {status?.phase === 'fasting'
                ? de
                  ? 'Fastenzeit'
                  : 'Fasting'
                : de
                  ? 'Essensfenster'
                  : 'Eating window'}
            </span>
          </div>

          <p className="fast-card__clock" aria-live="off" title={de ? 'Restzeit dieser Phase' : 'Time left in this phase'}>
            {formatRemaining(status?.remainingMinutes ?? 0)}
            <span className="fast-card__unit">{de ? 'übrig' : 'left'}</span>
          </p>

          <div className="fast-card__track" role="presentation">
            <div
              className={`fast-card__fill ${status?.phase === 'fasting' ? 'is-fasting' : 'is-eating'}`}
              style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }}
            />
          </div>

          <dl className="fast-card__meta">
            <div>
              <dt>{de ? 'Fasten' : 'Fasting'}</dt>
              <dd>
                {status?.phase === 'fasting'
                  ? `${formatClock(status.phaseStart)} – ${formatClock(status.phaseEnd)}`
                  : `${de ? 'bis' : 'until'} ${plan.startTime}`}
              </dd>
            </div>
            <div>
              <dt>{de ? 'Essen' : 'Eating'}</dt>
              <dd>
                {status?.phase === 'eating'
                  ? `${formatClock(status.phaseStart)} – ${formatClock(status.phaseEnd)}`
                  : `${de ? 'ab' : 'from'} ${formatClock(nextEatingStart(plan, now))}`}
              </dd>
            </div>
            <div>
              <dt>{de ? 'Phase' : 'Phase'}</dt>
              <dd>{Math.round((status?.progress ?? 0) * 100)} %</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
