/**
 * KI-Coach-Chat (`/coach`) im Messenger-Layout:
 * oben eine Chatbox mit eigenem Scrollbereich, Eingabezeile fest am unteren Rand der Box,
 * Coach-Nachrichten links, eigene rechts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowUp, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '@/src/lib/api';
import { formatChatText } from '@/src/lib/chatFormat';
import { PageHeader } from '@/src/simple/ui';

type ChatMessage = {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ type: string; ok: boolean; note?: string }>;
  created_at?: string;
};

const ACTION_LABELS: Record<string, string> = {
  update_goals: 'Ziele aktualisiert',
  update_measurements: 'Körpermaße aktualisiert',
  update_extras: 'Profildaten aktualisiert',
  update_coach_preferences: 'Trainingspräferenzen aktualisiert',
  create_plan: 'Neuer Plan angelegt',
  set_coaching_active: 'Coaching-Status geändert',
};

/** Tagesschluessel in lokaler Zeit (YYYY-MM-DD) fuer die Datums-Trenner. */
function tagKey(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ueberschrift fuer einen Tag: Heute, Gestern oder ausgeschriebenes Datum. */
function tagLabel(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const heute = new Date();
  const gestern = new Date();
  gestern.setDate(heute.getDate() - 1);
  if (tagKey(iso) === tagKey(heute.toISOString())) return 'Heute';
  if (tagKey(iso) === tagKey(gestern.toISOString())) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

/** Uhrzeit HH:MM in lokaler Zeit. */
function zeitLabel(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

const VORSCHLAEGE = [
  'Wie war meine Woche? Wo hakt es?',
  'Stell meine Kalorien auf Abnehmen um, moderat.',
  'Ich habe nur 3 Tage pro Woche Zeit — pass die Tage an.',
  'Bau mir einen neuen Trainingsplan für Muskelaufbau.',
];

export default function CoachChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [eingabe, setEingabe] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Sichtbare Hoehe selbst verfolgen: die globale Logik bremst kleine Aenderungen
  // (< 28 px) und den Fall "Tastatur gerade offen" aus - im Chat muss sie aber
  // immer exakt stimmen, sonst verschwindet die Eingabezeile.
  const [sichtbareHoehe, setSichtbareHoehe] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const aktualisieren = () => setSichtbareHoehe(Math.round(vv.height));
    aktualisieren();
    vv.addEventListener('resize', aktualisieren);
    vv.addEventListener('scroll', aktualisieren);
    return () => {
      vv.removeEventListener('resize', aktualisieren);
      vv.removeEventListener('scroll', aktualisieren);
    };
  }, []);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const rows = await api<ChatMessage[]>('/api/coach/chat?limit=80');
      setMessages(rows);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Chat konnte nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Nach unten scrollen, aber nur innerhalb der Chatbox — die Seite selbst bleibt stehen.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sendet, laedt]);

  const senden = useCallback(
    async (text: string) => {
      const inhalt = text.trim();
      if (!inhalt || sendet) return;
      setFehler(null);
      setEingabe('');
      setSendet(true);
      setMessages((prev) => [...prev, { id: `temp-${Date.now()}`, role: 'user', content: inhalt }]);
      try {
        const res = await api<{ message: ChatMessage }>('/api/coach/chat', {
          method: 'POST',
          body: JSON.stringify({ message: inhalt }),
        });
        setMessages((prev) => [...prev, res.message]);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : 'Antwort fehlgeschlagen.');
      } finally {
        setSendet(false);
      }
    },
    [sendet],
  );

  const verlaufLoeschen = useCallback(async () => {
    if (!window.confirm('Den ganzen Chatverlauf löschen?')) return;
    try {
      await api('/api/coach/chat', { method: 'DELETE' });
      setMessages([]);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  }, []);

  const leer = useMemo(() => !laedt && messages.length === 0, [laedt, messages.length]);

  return (
    // Hoehe folgt dem sichtbaren Bereich (visualViewport). Auf dem Handy schrumpft
    // --vv-height, sobald die Tastatur aufgeht - dadurch bleibt die Eingabezeile sichtbar.
    // Ohne JavaScript-Wert greift dvh als Rueckfall.
    <div
      className="flex w-full flex-col gap-3"
      style={{
        height: `calc(${sichtbareHoehe ? `${sichtbareHoehe}px` : 'var(--vv-height, 100dvh)'} - var(--app-header-h) - env(safe-area-inset-top, 0px) - 5.5rem)`,
      }}
    >
      <PageHeader
        eyebrow="Coach"
        title="Dein Coach"
        hint="Frag zu Training, Ernährung oder deinem Plan — er kennt dein ganzes Profil."
        action={
          messages.length > 0 ? (
            <button
              type="button"
              onClick={() => void verlaufLoeschen()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Verlauf löschen
            </button>
          ) : null
        }
      />

      {/* Nachrichten liegen direkt auf dem Seitenhintergrund - keine aeussere Box */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-1"
      >
          {laedt && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Chat wird geladen …
            </p>
          )}

          {leer && (
            <div className="w-full space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-[var(--simple-accent-soft)] p-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--simple-accent)]" />
                <p className="text-sm leading-relaxed text-[var(--simple-accent)]">
                  Ich kenne deine Ziele, dein Gewicht, deine Trainings und deine letzten Mahlzeiten.
                  Sag mir, was du ändern willst — ich passe es direkt an.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {VORSCHLAEGE.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void senden(v)}
                    className="rounded-full border border-[var(--border-muted)] px-3 py-1.5 text-left text-[12px] text-[var(--text-muted)] transition hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)]"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, index) => {
            const eigen = m.role === 'user';
            const vorherige = index > 0 ? messages[index - 1] : null;
            // Datums-Trenner, sobald ein neuer Kalendertag beginnt (wie bei WhatsApp)
            const neuerTag = !vorherige || tagKey(vorherige.created_at) !== tagKey(m.created_at);
            return (
              <div key={m.id} className="w-full">
                {neuerTag && (
                  <div className="my-4 flex items-center gap-3" aria-label={tagLabel(m.created_at)}>
                    <span className="h-px flex-1 bg-[var(--border-muted)]" />
                    <span className="shrink-0 rounded-full bg-[var(--surface-gray)] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {tagLabel(m.created_at)}
                    </span>
                    <span className="h-px flex-1 bg-[var(--border-muted)]" />
                  </div>
                )}
              <div className={`flex w-full ${eigen ? 'justify-end' : 'justify-start'}`}>
                {/* 60 % der Boxbreite als Obergrenze — die Zeile selbst ist 100 % breit */}
                <div className={`flex w-fit max-w-[90%] flex-col gap-0.5 sm:max-w-[60%] ${eigen ? 'items-end' : 'items-start'}`}>
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {eigen ? 'Du' : 'Coach'}
                  </span>
                  <div
                    className={`space-y-2 rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed shadow-[0_1px_2px_rgb(15_23_42/0.06)] ${
                      eigen
                        ? 'rounded-br-md coach-bubble-me'
                        : 'rounded-bl-md coach-bubble-coach'
                    }`}
                  >
                    {formatChatText(m.content)}
                    {m.actions && m.actions.length > 0 && (
                      <div
                        className={`space-y-1 border-t pt-2 ${
                          'border-white/30'
                        }`}
                      >
                        {m.actions.map((a, i) => (
                          <p
                            key={`${m.id}-${i}`}
                            className="flex items-center gap-1.5 text-[11px] font-semibold opacity-90"
                          >
                            {a.ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {ACTION_LABELS[a.type] ?? a.type}
                            {a.note ? <span className="font-normal opacity-70">· {a.note}</span> : null}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className={`text-right text-[10px] tabular-nums ${eigen ? 'coach-time-me' : 'coach-time'}`}>
                      {zeitLabel(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
              </div>
            );
          })}

          {sendet && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md coach-bubble-coach px-4 py-2.5 text-[13px]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> denkt nach …
              </div>
            </div>
          )}
        </div>

        {fehler && (
          <p className="mx-4 mb-2 shrink-0 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">
            {fehler}
          </p>
        )}

        {/* Eingabezeile: eigenstaendige dunkelgruene Box am unteren Rand */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void senden(eingabe);
          }}
          className="mt-3 flex shrink-0 items-end gap-2 rounded-2xl coach-input p-2 shadow-[0_2px_8px_rgb(15_23_42/0.12)]"
        >
          <textarea
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onFocus={() => {
              // Tastatur oeffnet erst kurz danach - dann ans Ende scrollen,
              // damit die letzte Nachricht ueber der Eingabe sichtbar bleibt.
              [120, 320, 600].forEach((ms) =>
                window.setTimeout(() => {
                  const el = scrollRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                }, ms),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void senden(eingabe);
              }
            }}
            rows={1}
            enterKeyHint="send"
            autoComplete="off"
            placeholder="Frag deinen Coach …"
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-[13.5px] text-white placeholder:text-white/60 outline-none"
          />
          <button
            type="submit"
            disabled={sendet || !eingabe.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-40"
            aria-label="Senden"
          >
            {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </form>
    </div>
  );
}
