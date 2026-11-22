import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Moon, Sun, Timer, ChevronDown } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import {
  FASTING_PRESETS,
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
 * Zeigt dauerhaft laufend, ob gerade Fastenzeit oder Essensfenster ist und wie lange
 * die Phase noch dauert. Der Plan (16:8, 18:6 … und die Startzeit) wird am Profil
 * gespeichert (`goals.fasting`), damit die Box auf jedem Gerät denselben Plan zeigt.
 */
export function FastingCard(): ReactElement {
  const { profile, updateProfile } = useAuth();
  const { locale } = useI18n();
  const de = locale !== 'en';

  const saved = (profile as unknown as { goals?: { fasting?: FastingPlan } } | null)?.goals?.fasting;
  const plan: FastingPlan | null = isValidPlan(saved) ? (saved as FastingPlan) : null;

  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Uhr läuft dauerhaft — jede Sekunde neu rechnen, kostet praktisch nichts.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const status = useMemo(() => (plan ? fastingStatus(plan, now) : null), [plan, now]);

  const speichere = async (next: FastingPlan | null) => {
    setSaving(true);
    setFehler(null);
    try {
      const aktuell = (profile as unknown as { goals?: Record<string, unknown> } | null)?.goals ?? {};
      await updateProfile({ goals: { ...aktuell, fasting: next } } as never);
      setOpen(false);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : de ? 'Speichern fehlgeschlagen.' : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const titel = de ? 'Intervallfasten' : 'Intermittent fasting';

  return (
    <section className="fast-card" aria-label={titel}>
      <div className="fast-card__head">
        <div className="fast-card__title">
          <span className={`fast-card__dot ${status?.phase === 'fasting' ? 'is-fasting' : 'is-eating'}`} aria-hidden />
          <h2>{titel}</h2>
          {plan ? <span className="fast-card__plan">{planLabel(plan)}</span> : null}
        </div>
        <button
          type="button"
          className="fast-card__change"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {plan ? (de ? 'Plan ändern' : 'Change plan') : de ? 'Plan wählen' : 'Choose plan'}
          <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>

      {!plan ? (
        <div className="fast-card__empty">
          <p>
            {de
              ? 'Noch kein Fastenplan gewählt. Wähle ein Verhältnis — die Uhr läuft dann dauerhaft mit.'
              : 'No plan yet. Pick a ratio — the clock runs continuously once set.'}
          </p>
          <button type="button" className="app-btn" onClick={() => setOpen(true)}>
            <Timer size={16} /> {de ? 'Plan wählen' : 'Choose plan'}
          </button>
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

          <p className="fast-card__clock" aria-live="off">
            {formatRemaining(status?.remainingMinutes ?? 0)}
            <span className="fast-card__unit">{de ? 'h übrig' : 'h left'}</span>
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
          </dl>
        </div>
      )}

      {open && (
        <div className="fast-card__panel">
          <p className="fast-card__hint">
            {de
              ? 'Startzeit ist der Beginn der Fastenzeit (Ende des Essens).'
              : 'Start time is when fasting begins (end of eating).'}
          </p>
          <div className="fast-card__presets">
            {FASTING_PRESETS.map((preset) => {
              const aktiv = plan?.fastHours === preset.fastHours && plan?.startTime === preset.startTime;
              return (
                <button
                  key={planLabel(preset)}
                  type="button"
                  className={`fast-card__preset ${aktiv ? 'is-active' : ''}`}
                  disabled={saving}
                  onClick={() => void speichere(preset)}
                >
                  <strong>{planLabel(preset)}</strong>
                  <span>
                    {preset.fastHours} h {de ? 'fasten' : 'fasting'} · {preset.eatHours} h {de ? 'essen' : 'eating'}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="fast-card__custom">
            <label>
              <span>{de ? 'Startzeit' : 'Start time'}</span>
              <input
                type="time"
                defaultValue={plan?.startTime ?? '20:00'}
                disabled={saving}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!plan || !value) return;
                  void speichere({ ...plan, startTime: value });
                }}
              />
            </label>
            {plan && (
              <button type="button" className="fast-card__reset" disabled={saving} onClick={() => void speichere(null)}>
                {de ? 'Plan entfernen' : 'Remove plan'}
              </button>
            )}
          </div>
          {fehler && <p className="fast-card__error">{fehler}</p>}
        </div>
      )}
    </section>
  );
}

