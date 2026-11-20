/**
 * KI-Coach-Chat (`/coach`).
 *
 * Freitext-Chat ueber das komplette Fitnessprofil. Aenderungen (Ziele, Masse,
 * Praeferenzen) und das Anlegen neuer Plaene laufen ueber den actions-Block, den der
 * Server auswertet und der Nutzer hier als Quittung sieht.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Dumbbell, Loader2, RotateCcw, Sparkles, Check, AlertCircle } from 'lucide-react';
import { api } from '@/src/lib/api';
import { Card, PageHeader } from '@/src/simple/ui';

type ChatMessage = {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ type: string; ok: boolean; note?: string }>;
  created_at?: string;
  pending?: boolean;
};

const ACTION_LABELS: Record<string, string> = {
  update_goals: 'Ziele aktualisiert',
  update_measurements: 'Körpermaße aktualisiert',
  update_extras: 'Profildaten aktualisiert',
  update_coach_preferences: 'Trainingspräferenzen aktualisiert',
  create_plan: 'Neuer Plan angelegt',
  set_coaching_active: 'Coaching-Status geändert',
};

const VORSCHLAEGE = [
  'Wie war meine Woche? Wo hakt es?',
  'Stell meine Kalorien auf Abnehmen um, moderat.',
  'Ich habe nur 3 Tage pro Woche Zeit — pass die Tage an.',
  'Mein Knie zwickt beim Beugen, was soll ich machen?',
  'Bau mir einen neuen Trainingsplan für Muskelaufbau.',
];

export default function CoachChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [eingabe, setEingabe] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const endeRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    endeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sendet]);

  const senden = useCallback(
    async (text: string) => {
      const inhalt = text.trim();
      if (!inhalt || sendet) return;
      setFehler(null);
      setEingabe('');
      setSendet(true);
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, role: 'user', content: inhalt }]);
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
    <div className="flex flex-col gap-5 pb-10">
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

      <Card className="flex min-h-[60vh] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {laedt && (
            <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Chat wird geladen …
            </p>
          )}

          {leer && (
            <div className="space-y-4">
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

          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[var(--simple-accent)] text-white'
                    : 'bg-[var(--surface-gray)] text-[var(--foreground)]'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="space-y-1 border-t border-black/10 pt-2">
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
              </div>
            </div>
          ))}

          {sendet && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-gray)] px-4 py-2.5 text-[13px] text-[var(--text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> denkt nach …
              </div>
            </div>
          )}
          <div ref={endeRef} />
        </div>

        {fehler && (
          <p className="mx-5 mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">
            {fehler}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void senden(eingabe);
          }}
          className="flex items-end gap-2 border-t border-[var(--border-muted)] p-3"
        >
          <textarea
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void senden(eingabe);
              }
            }}
            rows={1}
            placeholder="Frag deinen Coach …"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl bg-[var(--surface-gray)] px-4 py-3 text-[13.5px] outline-none focus:ring-1 focus:ring-[var(--simple-accent)]"
          />
          <button
            type="submit"
            disabled={sendet || !eingabe.trim()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--simple-accent)] text-white transition disabled:opacity-40"
            aria-label="Senden"
          >
            {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </form>
      </Card>

      <Link
        to="/training"
        className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--border-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)] transition hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)]"
      >
        <Dumbbell className="h-3.5 w-3.5" /> Trainingsplan im Trainingsbereich verwalten
      </Link>
    </div>
  );
}
