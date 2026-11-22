import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Moon, Sun, Timer, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import {
  FASTING_PRESETS,
  fastingStatus,
  formatClock,
  formatRemaining,
  isValidPlan,
  nextEatingStart,
  parseClock,
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
 * Im Panel ist die Auswahl zunächst ein Entwurf: sie wird hervorgehoben, aber erst mit
 * „Speichern" übernommen. Die laufende Uhr ändert sich also nicht beim Antippen.
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

  // Entwurf im Panel (noch nicht gespeichert)
  const [draftFast, setDraftFast] = useState<number | null>(null);
  const [draftEat, setDraftEat] = useState<number | null>(null);
  const [draftStart, setDraftStart] = useState('20:00');

  // Uhr läuft dauerhaft — jede Sekunde neu rechnen, kostet praktisch nichts.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Beim Öffnen den gespeicherten Plan als Entwurf laden
  useEffect(() => {
    if (!open) return;
    setDraftFast(plan?.fastHours ?? null);
    setDraftEat(plan?.eatHours ?? null);
    setDraftStart(plan?.startTime ?? '20:00');
    setFehler(null);
  }, [open, plan?.fastHours, plan?.eatHours, plan?.startTime]);

  const status = useMemo(() => (plan ? fastingStatus(plan, now) : null), [plan, now]);

  const draftValid =
    draftFast != null &&
    draftEat != null &&
    draftFast > 0 &&
    draftFast < 24 &&
    draftEat > 0 &&
    draftEat < 24 &&
    draftFast + draftEat === 24 &&
    parseClock(draftStart) !== null;

  const draftSameAsSaved =
    !!plan && plan.fastHours === draftFast && plan.eatHours === draftEat && plan.startTime === draftStart;

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

  const uebernehmeDraft = () => {
    if (!draftValid || draftFast == null || draftEat == null) return;
    const matching = FASTING_PRESETS.find((p) => p.fastHours === draftFast && p.eatHours === draftEat);
    void speichere({
      fastHours: draftFast,
      eatHours: draftEat,
      startTime: draftStart,
      label: matching ? planLabel(matching) : `${draftFast}:${draftEat}`,
    });
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
              ? 'Noch kein Fastenplan gewählt. Verhältnis und Startzeit einstellen, dann auf „Speichern" tippen — die Uhr läuft danach dauerhaft mit.'
              : 'No plan yet. Pick a ratio, set the start time and press “Save” — the clock then runs continuously.'}
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
              <dd>
                {Math.round((status?.progress ?? 0) * 100)} %
              </dd>
            </div>
          </dl>
        </div>
      )}

      {open && (
        <div className="fast-card__panel">
          <p className="fast-card__hint">
            {de
              ? 'Verhältnis wählen und die Startzeit der Fastenzeit einstellen — übernommen wird erst mit „Speichern".'
              : 'Pick a ratio and the fasting start time — nothing changes until you press “Save”.'}
          </p>

          <div className="fast-card__presets" role="radiogroup" aria-label={de ? 'Fastenverhältnis' : 'Fasting ratio'}>
            {FASTING_PRESETS.map((preset) => {
              const ausgewaehlt = draftFast === preset.fastHours && draftEat === preset.eatHours;
              return (
                <button
                  key={planLabel(preset)}
                  type="button"
                  role="radio"
                  aria-checked={ausgewaehlt}
                  className={`fast-card__preset ${ausgewaehlt ? 'is-selected' : ''}`}
                  disabled={saving}
                  onClick={() => {
                    setDraftFast(preset.fastHours);
                    setDraftEat(preset.eatHours);
                  }}
                >
                  {ausgewaehlt && <Check size={13} className="fast-card__check" aria-hidden />}
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
              <span>{de ? 'Startzeit Fasten' : 'Fasting start'}</span>
              <input
                type="time"
                value={draftStart}
                disabled={saving}
                onChange={(e) => setDraftStart(e.target.value || '20:00')}
              />
            </label>
            <span className="fast-card__preview">
              {draftValid
                ? `${de ? 'Essen ab' : 'Eating from'} ${formatClock(
                    nextEatingStart({ fastHours: draftFast!, eatHours: draftEat!, startTime: draftStart }, now),
                  )}`
                : de
                  ? 'Bitte ein Verhältnis wählen.'
                  : 'Please pick a ratio.'}
            </span>
          </div>

          <div className="fast-card__actions">
            {plan && (
              <button type="button" className="fast-card__reset" disabled={saving} onClick={() => void speichere(null)}>
                {de ? 'Plan entfernen' : 'Remove plan'}
              </button>
            )}
            <button
              type="button"
              className="fast-card__save"
              disabled={saving || !draftValid || draftSameAsSaved}
              onClick={uebernehmeDraft}
            >
              {saving ? '…' : <Check size={15} />}
              {de ? 'Speichern' : 'Save'}
            </button>
          </div>

          {fehler && <p className="fast-card__error">{fehler}</p>}
        </div>
      )}
    </section>
  );
}
