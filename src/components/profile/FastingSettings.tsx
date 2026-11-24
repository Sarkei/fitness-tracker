/**
 * Intervallfasten in den Einstellungen (Profil → Ziele).
 *
 * Tim wollte die Plan-Auswahl nicht mehr auf der Startseite: Dort stand ein
 * „Plan ändern"-Knopf mitten in der Fasten-Uhr. Jetzt schaltet man das Fasten
 * hier ein und wählt gleich darunter Verhältnis und Startzeit; die Startseite
 * zeigt nur noch die laufende Uhr.
 *
 * Gespeichert wird am Profil (`goals.fasting`, `goals.fastingEnabled`), damit
 * der Plan auf jedem Gerät gilt. Der Entwurf im Formular wird erst mit
 * „Speichern" übernommen.
 */

import { useEffect, useState } from 'react';
import { Check, Moon } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import {
  FASTING_PRESETS,
  formatClock,
  isValidPlan,
  nextEatingStart,
  parseClock,
  planLabel,
  type FastingPlan,
} from '@/src/lib/fasting';

export default function FastingSettings() {
  const { profile, updateProfile } = useAuth();

  const goals = ((profile as unknown as { goals?: Record<string, unknown> } | null)?.goals ?? {}) as {
    fasting?: FastingPlan;
    fastingEnabled?: boolean;
    fastingSince?: string;
  };
  const enabled = goals.fastingEnabled !== false;
  const saved = isValidPlan(goals.fasting) ? (goals.fasting as FastingPlan) : null;

  const [draftFast, setDraftFast] = useState<number | null>(saved?.fastHours ?? null);
  const [draftEat, setDraftEat] = useState<number | null>(saved?.eatHours ?? null);
  const [draftStart, setDraftStart] = useState(saved?.startTime ?? '20:00');
  const [saving, setSaving] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  /* Gespeicherten Plan übernehmen, wenn das Profil nachgeladen wird. */
  useEffect(() => {
    setDraftFast(saved?.fastHours ?? null);
    setDraftEat(saved?.eatHours ?? null);
    setDraftStart(saved?.startTime ?? '20:00');
  }, [saved?.fastHours, saved?.eatHours, saved?.startTime]);

  const draftValid =
    draftFast != null &&
    draftEat != null &&
    draftFast > 0 &&
    draftFast < 24 &&
    draftEat > 0 &&
    draftEat < 24 &&
    draftFast + draftEat === 24 &&
    parseClock(draftStart) !== null;

  const unveraendert =
    !!saved && saved.fastHours === draftFast && saved.eatHours === draftEat && saved.startTime === draftStart;

  const speichere = async (next: FastingPlan | null) => {
    setSaving(true);
    setFehler(null);
    setGespeichert(false);
    try {
      await updateProfile({
        goals: {
          ...goals,
          fasting: next,
          fastingEnabled: next ? true : goals.fastingEnabled,
          /* Startdatum der Serie: beim ersten Plan setzen, beim Entfernen löschen. */
          fastingSince: next ? (goals.fastingSince ?? new Date().toISOString().slice(0, 10)) : undefined,
        },
      } as never);
      setGespeichert(true);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const schalte = async (an: boolean) => {
    setSaving(true);
    setFehler(null);
    try {
      await updateProfile({ goals: { ...goals, fastingEnabled: an } } as never);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const uebernehmen = () => {
    if (!draftValid || draftFast == null || draftEat == null) return;
    const passend = FASTING_PRESETS.find((p) => p.fastHours === draftFast && p.eatHours === draftEat);
    void speichere({
      fastHours: draftFast,
      eatHours: draftEat,
      startTime: draftStart,
      label: passend ? planLabel(passend) : `${draftFast}:${draftEat}`,
    });
  };

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
      {/* Schalter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Moon size={16} className="text-[var(--simple-accent,var(--accent))]" />
          <div>
            <p className="text-[13px] font-semibold">Intervallfasten</p>
            <p className="text-[10.5px] text-[var(--text-muted)]">
              {enabled
                ? saved
                  ? `${planLabel(saved)} · Fastenstart ${saved.startTime}`
                  : 'eingeschaltet, noch kein Plan gewählt'
                : 'aus — die Fasten-Box erscheint nicht auf der Startseite'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Intervallfasten ein- oder ausschalten"
          disabled={saving}
          onClick={() => void schalte(!enabled)}
          className="relative h-7 w-12 shrink-0 rounded-full border transition"
          style={{
            borderColor: enabled ? 'var(--simple-accent, var(--accent))' : 'var(--line)',
            background: enabled ? 'var(--simple-accent, var(--accent))' : 'var(--surface-2, #eee)',
          }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
            style={{ left: enabled ? 24 : 3 }}
          />
        </button>
      </div>

      {/* Plan-Auswahl nur bei aktivem Fasten */}
      {enabled && (
        <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
          <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            Verhältnis wählen und die Startzeit der Fastenzeit einstellen — übernommen wird erst mit „Speichern".
          </p>

          <div className="fast-card__presets" role="radiogroup" aria-label="Fastenverhältnis">
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
                    setGespeichert(false);
                  }}
                >
                  {ausgewaehlt && <Check size={13} className="fast-card__check" aria-hidden />}
                  <strong>{planLabel(preset)}</strong>
                  <span>
                    {preset.fastHours} h fasten · {preset.eatHours} h essen
                  </span>
                </button>
              );
            })}
          </div>

          <div className="fast-card__custom">
            <label>
              <span>Startzeit Fasten</span>
              <input
                type="time"
                value={draftStart}
                disabled={saving}
                onChange={(e) => { setDraftStart(e.target.value || '20:00'); setGespeichert(false); }}
              />
            </label>
            <span className="fast-card__preview">
              {draftValid
                ? `Essen ab ${formatClock(
                    nextEatingStart({ fastHours: draftFast!, eatHours: draftEat!, startTime: draftStart }, new Date()),
                  )}`
                : 'Bitte ein Verhältnis wählen.'}
            </span>
          </div>

          <div className="fast-card__actions">
            {saved && (
              <button type="button" className="fast-card__reset" disabled={saving} onClick={() => void speichere(null)}>
                Plan entfernen
              </button>
            )}
            <button
              type="button"
              className="fast-card__save"
              disabled={saving || !draftValid || unveraendert}
              onClick={uebernehmen}
            >
              {saving ? '…' : <Check size={15} />}
              Speichern
            </button>
          </div>

          {fehler && <p className="fast-card__error">{fehler}</p>}
          {gespeichert && !fehler && <p className="text-[10.5px] text-[var(--simple-accent,var(--accent))]">Gespeichert.</p>}
        </div>
      )}
    </section>
  );
}
