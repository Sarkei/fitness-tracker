/**
 * Trainingsplan — manuell, ohne Coach.
 *
 * Tims Vorgabe: Wochenansicht Montag bis Sonntag, darunter Workouts anlegen
 * (Gym, Laufen, Rad, Schwimmen, hybrid, Triathlon, EMOM, HIIT, Zirkel, frei) und
 * per Drag & Drop auf Tage ziehen. Mehrere Workouts je Tag, eines an mehreren
 * Tagen. Uebungen mit Saetzen (Wiederholungen, Gewicht, Satztyp) und Supersaetzen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bike,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  Dumbbell,
  Flame,
  Footprints,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  Repeat,
  Timer,
  Trash2,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import ExercisePaletteModal from '@/src/components/workout/ExercisePaletteModal';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import { Card, GhostButton, SectionTitle } from '@/src/simple/ui';
import { todayYmd } from './simpleApi';
import { VORLAGEN, type Vorlage } from './planVorlagen';

/** Art des Trainings — bestimmt den Editor und das Symbol. */
export type TrainingsArt =
  | 'gym'
  | 'laufen'
  | 'rad'
  | 'schwimmen'
  | 'hybrid'
  | 'triathlon'
  | 'emom'
  | 'hiit'
  | 'zirkel'
  | 'frei';

export const ARTEN: Array<{ id: TrainingsArt; label: string; icon: typeof Dumbbell; hinweis: string }> = [
  { id: 'gym', label: 'Gym', icon: Dumbbell, hinweis: 'Uebungen mit Saetzen und Gewicht' },
  { id: 'laufen', label: 'Laufen', icon: Footprints, hinweis: 'Distanz, Tempo, Intervalle' },
  { id: 'rad', label: 'Rad', icon: Bike, hinweis: 'Distanz, Watt, Kadenz' },
  { id: 'schwimmen', label: 'Schwimmen', icon: Waves, hinweis: 'Bahnen und Zeiten' },
  { id: 'hybrid', label: 'Hybrid', icon: Layers, hinweis: 'Kraft und Ausdauer gemischt' },
  { id: 'triathlon', label: 'Triathlon', icon: Layers, hinweis: 'Schwimmen, Rad, Laufen' },
  { id: 'emom', label: 'EMOM', icon: Timer, hinweis: 'Jede Minute eine Aufgabe' },
  { id: 'hiit', label: 'HIIT', icon: Zap, hinweis: 'Belastung und Pause im Wechsel' },
  { id: 'zirkel', label: 'Zirkel', icon: Repeat, hinweis: 'Stationen in Runden' },
  { id: 'frei', label: 'Frei', icon: Flame, hinweis: 'Ohne festes Schema' },
];

/**
 * Vier Arten stehen beim Anlegen zur Wahl — Tim wollte zuerst gefragt werden,
 * was fuer ein Workout entsteht. Die uebrigen Arten (Gym, Laufen, Rad …) bleiben
 * im Datenmodell, werden hier aber nicht mehr angeboten.
 */
export const NEUE_ARTEN: TrainingsArt[] = ['emom', 'hiit', 'zirkel', 'frei'];

/** Satztyp — warmup zaehlt nicht als Arbeitssatz. */
export type SatzTyp = 'warmup' | 'normal' | 'top';

export type Satz = {
  id: string;
  wiederholungen: number | null;
  gewicht: number | null;
  typ: SatzTyp;
};

export type Uebung = {
  id: string;
  name: string;
  /** Supersatz-Gruppe: Uebungen mit gleicher Kennung werden im Wechsel gemacht. */
  supersatz: string | null;
  saetze: Satz[];
  /** Nur bei Intervall-Arten: Belastung/Pause in Sekunden. */
  belastungSek?: number | null;
  pauseSek?: number | null;
};

export type IntervallVorgabe = {
  /** EMOM: Minuten. HIIT: Runden. Zirkel: Runden. */
  runden: number | null;
  arbeitSek: number | null;
  pauseSek: number | null;
  /** Zirkel: Stationen je Runde. */
  stationen: number | null;
};

export type Training = {
  id: string;
  name: string;
  art: TrainingsArt;
  notiz: string | null;
  inhalt: { uebungen?: Uebung[]; intervall?: IntervallVorgabe };
  dauer_min: number | null;
};

export type PlanEintrag = {
  id: string;
  datum: string;
  reihenfolge: number;
  trainings_id: string;
  name: string;
  art: TrainingsArt;
  inhalt: Training['inhalt'];
  dauer_min: number | null;
};

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const artIcon = (art: TrainingsArt) => ARTEN.find((a) => a.id === art)?.icon ?? Dumbbell;
const artLabel = (art: TrainingsArt) => ARTEN.find((a) => a.id === art)?.label ?? art;

/** Montag der Woche, in der `ymd` liegt. */
function montagVon(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const versatz = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - versatz);
  return d.toISOString().slice(0, 10);
}

function plusTage(ymd: string, tage: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
}

const neueId = () => Math.random().toString(36).slice(2, 10);

/** Leere Uebung mit einem Satz. */
function neueUebung(): Uebung {
  return {
    id: neueId(),
    name: '',
    supersatz: null,
    saetze: [{ id: neueId(), wiederholungen: 10, gewicht: null, typ: 'normal' }],
  };
}

export default function TrainingsplanPage() {
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [plan, setPlan] = useState<PlanEintrag[]>([]);
  const [woche, setWoche] = useState(() => montagVon(todayYmd()));
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Geoeffneter Editor: neue Vorlage oder bestehende. */
  const [editor, setEditor] = useState<Training | null>(null);
  /** Art-Auswahl vor dem Anlegen: ohne Wahl oeffnet sich kein Editor. */
  const [artWahl, setArtWahl] = useState(false);
  /** Vorlagen-Bibliothek offen? */
  const [vorlagen, setVorlagen] = useState(false);
  /** Tagesauswahl: welches Workout soll auf welchen Tag? (Handy-freundlich) */
  const [tagWahl, setTagWahl] = useState<Training | null>(null);
  /** Umgekehrt: Tag steht fest, Workout wird gewählt. */
  const [waehleTag, setWaehleTag] = useState<string | null>(null);
  /** Läuft gerade eine Vorlage oder das Kopieren? */
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  /** Welches Training wird gerade gezogen (Drag & Drop). */
  const [zieht, setZieht] = useState<string | null>(null);
  /** Tag, ueber dem gerade gezogen wird — fuer die Hervorhebung. */
  const [ueberTag, setUeberTag] = useState<string | null>(null);

  const tageDerWoche = useMemo(
    () => Array.from({ length: 7 }, (_, i) => plusTage(woche, i)),
    [woche],
  );

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const [t, p] = await Promise.all([
        api<{ trainings?: Training[] }>('/api/trainings'),
        api<{ eintraege?: PlanEintrag[] }>(
          `/api/trainings/plan?von=${tageDerWoche[0]}&bis=${tageDerWoche[6]}`,
        ),
      ]);
      setTrainings(Array.isArray(t.trainings) ? t.trainings : []);
      setPlan(Array.isArray(p.eintraege) ? p.eintraege : []);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht laden.');
    } finally {
      setLaedt(false);
    }
  }, [tageDerWoche]);

  useEffect(() => {
    void laden();
  }, [laden]);

  /** Workout auf einen Tag legen. */
  const aufTagLegen = async (trainingsId: string, datum: string) => {
    try {
      await api('/api/trainings/plan', {
        method: 'POST',
        body: JSON.stringify({ trainingsId, datum }),
      });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht einplanen.');
    }
  };

  /** Alle Einplanungen dieser Woche eine Woche weiter kopieren. */
  const kopiereWoche = async () => {
    if (!plan.length) {
      setFehler('Diese Woche ist noch leer — es gibt nichts zu kopieren.');
      return;
    }
    setArbeitet('kopie');
    setFehler(null);
    try {
      for (const e of plan) {
        await api('/api/trainings/plan', {
          method: 'POST',
          body: JSON.stringify({ trainingsId: e.trainings_id, datum: plusTage(e.datum, 7) }),
        });
      }
      setWoche(plusTage(woche, 7));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht kopieren.');
    } finally {
      setArbeitet(null);
    }
  };

  /**
   * Fertige Vorlage übernehmen: legt alle Workouts an und verteilt sie auf die
   * Tage dieser Woche. Bestehende Einplanungen bleiben unberührt.
   */
  const legeVorlageAn = async (v: Vorlage) => {
    setArbeitet(v.id);
    setFehler(null);
    try {
      const ids = new Map<string, string>();
      for (const w of v.workouts) {
        const antwort = await api<{ training: { id: string } }>('/api/trainings', {
          method: 'POST',
          body: JSON.stringify({
            name: w.name,
            art: w.art,
            notiz: `Vorlage: ${v.titel}`,
            dauerMin: w.dauer ?? null,
            inhalt: {
              uebungen: w.uebungen.map((ue) => ({
                id: neueId(),
                name: ue.name,
                supersatz: null,
                saetze: Array.from({ length: ue.saetze }, () => ({
                  id: neueId(),
                  wiederholungen: ue.wdh,
                  gewicht: ue.gewicht ?? null,
                  typ: 'normal' as SatzTyp,
                })),
              })),
              intervall: w.intervall ?? { runden: null, arbeitSek: null, pauseSek: null, stationen: null },
            },
          }),
        });
        ids.set(w.key, antwort.training.id);
      }
      for (const eintrag of v.plan) {
        const id = ids.get(eintrag.workout);
        if (!id) continue;
        for (const tag of eintrag.tage) {
          await api('/api/trainings/plan', {
            method: 'POST',
            body: JSON.stringify({ trainingsId: id, datum: plusTage(woche, tag) }),
          });
        }
      }
      setVorlagen(false);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Vorlage konnte nicht angelegt werden.');
    } finally {
      setArbeitet(null);
    }
  };

  const planEntfernen = async (id: string) => {
    try {
      await api(`/api/trainings/plan/${id}`, { method: 'DELETE' });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht entfernen.');
    }
  };

  const trainingLoeschen = async (id: string) => {
    try {
      await api(`/api/trainings/${id}`, { method: 'DELETE' });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht loeschen.');
    }
  };

  const speichern = async (t: Training) => {
    const rumpf = {
      name: t.name.trim() || 'Training',
      art: t.art,
      notiz: t.notiz,
      inhalt: t.inhalt,
      dauerMin: t.dauer_min,
    };
    try {
      if (t.id) {
        await api(`/api/trainings/${t.id}`, { method: 'PUT', body: JSON.stringify(rumpf) });
      } else {
        await api('/api/trainings', { method: 'POST', body: JSON.stringify(rumpf) });
      }
      setEditor(null);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Konnte nicht speichern.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Trainingsplan</SectionTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          {/*
           * Tim baut den Plan hier von Hand. Wer keine Lust auf Kacheln hat, laesst
           * ihn vom Coach bauen — der Wizard laeuft auf der Trainingsseite.
           */}
          <GhostButton onClick={() => navigate('/training', { state: { coachWizard: true } })}>
            <Zap className="h-3.5 w-3.5" /> Von Coach erstellen lassen
          </GhostButton>
          <GhostButton onClick={() => setVorlagen(true)}>
            <Copy className="h-3.5 w-3.5" /> Vorlagen
          </GhostButton>
          <GhostButton onClick={() => void kopiereWoche()} disabled={arbeitet === 'kopie'}>
            <Copy className="h-3.5 w-3.5" /> {arbeitet === 'kopie' ? 'Kopiere …' : 'Woche kopieren'}
          </GhostButton>
          <div className="flex items-center gap-1.5">
            <GhostButton onClick={() => setWoche(plusTage(woche, -7))}>← Woche</GhostButton>
            <GhostButton onClick={() => setWoche(montagVon(todayYmd()))}>Heute</GhostButton>
            <GhostButton onClick={() => setWoche(plusTage(woche, 7))}>Woche →</GhostButton>
          </div>
        </div>
      </div>

      {fehler && (
        <p className="rounded-lg bg-[var(--danger-soft,_#3a1d1d)] px-3 py-2 text-[11.5px] text-[var(--danger,_#f08a7a)]">
          {fehler}
        </p>
      )}

      {/*
       * Wochenkennzahlen: dieselben Zahlen, die man in Gym-Apps sucht, ohne die
       * Einheiten einzeln aufzuklappen.
       */}
      {(() => {
        const alle = plan.map((e) => {
          const tr = trainings.find((t) => t.id === e.trainings_id);
          const uebungen = tr?.inhalt?.uebungen ?? [];
          const saetze = uebungen.reduce((a, x) => a + x.saetze.length, 0);
          const volumen = uebungen.reduce(
            (a, x) => a + x.saetze.reduce((b, sy) => b + (sy.wiederholungen ?? 0) * (sy.gewicht ?? 0), 0),
            0,
          );
          return { einheiten: 1, uebungen: uebungen.length, saetze, volumen, minuten: tr?.dauer_min ?? 0 };
        });
        const summe = alle.reduce(
          (a, x) => ({
            einheiten: a.einheiten + x.einheiten,
            uebungen: a.uebungen + x.uebungen,
            saetze: a.saetze + x.saetze,
            volumen: a.volumen + x.volumen,
            minuten: a.minuten + x.minuten,
          }),
          { einheiten: 0, uebungen: 0, saetze: 0, volumen: 0, minuten: 0 },
        );
        return (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Einheiten', wert: String(summe.einheiten), einheit: 'diese Woche' },
              { label: 'Übungen', wert: String(summe.uebungen), einheit: 'in Summe' },
              { label: 'Sätze', wert: String(summe.saetze), einheit: 'geplant' },
              {
                label: 'Volumen',
                wert: summe.volumen > 0 ? `${Math.round(summe.volumen).toLocaleString('de-DE')}` : '—',
                einheit: summe.volumen > 0 ? 'kg bewegt' : 'ohne Gewichte',
              },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{k.label}</p>
                <p className="mt-0.5 text-[16px] font-bold leading-none tabular-nums">{k.wert}</p>
                <p className="text-[9.5px] text-[var(--text-muted)]">{k.einheit}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Wochenansicht Montag bis Sonntag */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {tageDerWoche.map((datum, i) => {
          const eintraege = plan.filter((p) => p.datum === datum);
          const istHeute = datum === todayYmd();
          const hervorgehoben = ueberTag === datum;
          return (
            <div
              key={datum}
              onDragOver={(e) => {
                e.preventDefault();
                setUeberTag(datum);
              }}
              onDragLeave={() => setUeberTag((d) => (d === datum ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setUeberTag(null);
                const id = e.dataTransfer.getData('text/training') || zieht;
                if (id) void aufTagLegen(id, datum);
                setZieht(null);
              }}
              className={`min-h-[132px] rounded-xl border p-2 transition ${
                hervorgehoben
                  ? 'border-[var(--simple-accent)] bg-[var(--simple-accent-soft)]'
                  : istHeute
                    ? 'border-[var(--simple-accent)]/60 bg-[var(--card-bg)]'
                    : 'border-[var(--border-muted)] bg-[var(--card-bg)]'
              }`}
            >
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {WOCHENTAGE[i]}
                </span>
                <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                  {(() => {
                    const uebungen = eintraege.reduce((a, e) => {
                      const tr = trainings.find((t) => t.id === e.trainings_id);
                      return a + (tr?.inhalt?.uebungen?.length ?? 0);
                    }, 0);
                    return uebungen > 0 ? `${uebungen} Übungen · ` : '';
                  })()}
                  {datum.slice(8, 10)}.{datum.slice(5, 7)}.
                </span>
              </div>

              <div className="space-y-1.5">
                {eintraege.map((e) => {
                  const Icon = artIcon(e.art);
                  return (
                    <div
                      key={e.id}
                      className="group flex items-start gap-1.5 rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-1.5 py-1"
                    >
                      <Icon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--simple-accent)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold leading-tight">{e.name}</p>
                        <p className="text-[9.5px] text-[var(--text-muted)]">
                          {artLabel(e.art)}
                          {e.dauer_min ? ` · ${e.dauer_min} min` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void planEntfernen(e.id)}
                        aria-label={`${e.name} von diesem Tag entfernen`}
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--border-muted)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                {eintraege.length === 0 && (
                  <p className="text-[9.5px] italic text-[var(--text-muted)]">frei</p>
                )}
                <button
                  type="button"
                  onClick={() => setWaehleTag(datum)}
                  className="w-full rounded-lg border border-dashed border-[var(--border-muted)] py-1 text-[10px] font-semibold text-[var(--text-muted)] transition hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)]"
                >
                  + Workout
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vorlagen — ziehbar auf die Tage */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] font-semibold">Meine Workouts</p>
          <GhostButton onClick={() => setArtWahl(true)}>
            <Plus className="mr-1 h-3 w-3" /> Neues Workout
          </GhostButton>
        </div>

        {trainings.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            Noch keine Workouts. Lege eines an — danach kannst du es auf einen Tag ziehen.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {trainings.map((t) => {
              const Icon = artIcon(t.art);
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/training', t.id);
                    e.dataTransfer.effectAllowed = 'copy';
                    setZieht(t.id);
                  }}
                  onDragEnd={() => setZieht(null)}
                  className="group flex cursor-grab items-center gap-2 rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-2 py-1.5 active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--simple-accent)]" />
                  <button
                    type="button"
                    onClick={() => setTagWahl(t)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[11.5px] font-semibold">{t.name}</p>
                    <p className="text-[9.5px] text-[var(--text-muted)]">
                      {artLabel(t.art)}
                      {t.inhalt?.uebungen?.length ? ` · ${t.inhalt.uebungen.length} Übungen` : ''}
                      {t.dauer_min ? ` · ${t.dauer_min} min` : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor(t)}
                    aria-label={`${t.name} bearbeiten`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--border-muted)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void trainingLoeschen(t.id)}
                    aria-label={`${t.name} löschen`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--border-muted)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
          Workout auf einen Tag ziehen, um es einzuplanen. Auf dem Handy: Workout antippen, dann
          den Tag wählen. Dasselbe Workout darf an mehreren Tagen liegen.
        </p>
      </Card>

      {/* Tagesauswahl: Workout → Tag */}
      {tagWahl && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold">{tagWahl.name} einplanen</p>
              <button type="button" onClick={() => setTagWahl(null)} aria-label="Schliessen">
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tageDerWoche.map((datum, i) => {
                const anzahl = plan.filter((p) => p.datum === datum).length;
                return (
                  <button
                    key={datum}
                    type="button"
                    onClick={() => {
                      void aufTagLegen(tagWahl.id, datum);
                      setTagWahl(null);
                    }}
                    className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-2 py-2.5 text-center transition hover:border-[var(--simple-accent)]"
                  >
                    <span className="block text-[11px] font-semibold">{WOCHENTAGE[i]}</span>
                    <span className="block text-[9.5px] tabular-nums text-[var(--text-muted)]">
                      {datum.slice(8, 10)}.{datum.slice(5, 7)}.
                    </span>
                    {anzahl > 0 && (
                      <span className="mt-0.5 block text-[9px] text-[var(--simple-accent)]">{anzahl} geplant</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Workout-Auswahl: Tag → Workout */}
      {waehleTag && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold">
                Was kommt am {waehleTag.slice(8, 10)}.{waehleTag.slice(5, 7)}.?
              </p>
              <button type="button" onClick={() => setWaehleTag(null)} aria-label="Schliessen">
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            {trainings.length === 0 ? (
              <div className="space-y-2">
                <p className="text-[11.5px] text-[var(--text-muted)]">Noch kein Workout angelegt.</p>
                <GhostButton
                  onClick={() => {
                    setWaehleTag(null);
                    setArtWahl(true);
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Workout anlegen
                </GhostButton>
              </div>
            ) : (
              <div className="space-y-1.5">
                {trainings.map((t) => {
                  const Icon = artIcon(t.art);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        void aufTagLegen(t.id, waehleTag);
                        setWaehleTag(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-2.5 py-2 text-left transition hover:border-[var(--simple-accent)]"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--simple-accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold">{t.name}</span>
                        <span className="block text-[9.5px] text-[var(--text-muted)]">
                          {artLabel(t.art)}
                          {t.inhalt?.uebungen?.length ? ` · ${t.inhalt.uebungen.length} Übungen` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vorlagen */}
      {vorlagen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold">Vorlage übernehmen</p>
              <button type="button" onClick={() => setVorlagen(false)} aria-label="Schliessen">
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <p className="mb-3 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
              Legt die Workouts an und verteilt sie auf diese Woche. Danach frei änderbar — nichts ist fest verdrahtet.
            </p>
            <div className="space-y-2">
              {VORLAGEN.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold">{v.titel}</p>
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--simple-accent)]">
                        {v.aufwand}
                      </p>
                    </div>
                    <GhostButton onClick={() => void legeVorlageAn(v)} disabled={arbeitet !== null}>
                      {arbeitet === v.id ? 'Lege an …' : 'Übernehmen'}
                    </GhostButton>
                  </div>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">{v.beschreibung}</p>
                  <p className="mt-1 text-[9.5px] text-[var(--text-muted)]">
                    {v.workouts.map((w) => `${w.name} (${w.uebungen.length} Übungen)`).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {artWahl && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold">Was für ein Workout?</p>
              <button type="button" onClick={() => setArtWahl(false)} aria-label="Schliessen">
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NEUE_ARTEN.map((id) => {
                const art = ARTEN.find((a) => a.id === id);
                if (!art) return null;
                const Icon = art.icon;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setArtWahl(false);
                      setEditor({
                        id: '',
                        name: art.label,
                        art: id,
                        notiz: null,
                        inhalt: { uebungen: [], intervall: { runden: null, arbeitSek: null, pauseSek: null, stationen: null } },
                        dauer_min: null,
                      });
                    }}
                    className="flex flex-col items-start gap-1 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3 text-left transition hover:border-[var(--simple-accent)]"
                  >
                    <Icon className="h-4 w-4 text-[var(--simple-accent)]" />
                    <span className="text-[12px] font-semibold">{art.label}</span>
                    <span className="text-[10px] leading-snug text-[var(--text-muted)]">{art.hinweis}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editor && (
        <EditorSheet
          training={editor}
          onClose={() => setEditor(null)}
          onSave={(t) => void speichern(t)}
        />
      )}
    </div>
  );
}

/** Editor fuer ein Workout — Art-abhaengige Felder. */
function EditorSheet({
  training,
  onClose,
  onSave,
}: {
  training: Training;
  onClose: () => void;
  onSave: (t: Training) => void;
}) {
  const [t, setT] = useState<Training>(() => ({
    ...training,
    inhalt: {
      /* Neu: leer starten — Übungen kommen aus dem Katalog, nicht als leere Zeile. */
      uebungen: training.inhalt?.uebungen ?? [],
      intervall: training.inhalt?.intervall ?? { runden: null, arbeitSek: null, pauseSek: null, stationen: null },
    },
  }));
  /** Übungskatalog (ExerciseDB) offen? */
  const [katalog, setKatalog] = useState(false);

  /** Aus dem Katalog gewählte Übungen als Zeilen übernehmen. */
  const uebernehmeAusKatalog = (liste: LibraryExercise[]) => {
    setT((alt) => {
      const vorhanden = alt.inhalt.uebungen ?? [];
      const neu = liste.map((ex) => ({ ...neueUebung(), name: ex.name }));
      return { ...alt, inhalt: { ...alt.inhalt, uebungen: [...vorhanden, ...neu] } };
    });
    setKatalog(false);
  };

  const istIntervall = ['emom', 'hiit', 'zirkel'].includes(t.art);
  const uebungen = t.inhalt.uebungen ?? [];

  const setUebungen = (liste: Uebung[]) =>
    setT((alt) => ({ ...alt, inhalt: { ...alt.inhalt, uebungen: liste } }));

  const setIntervall = (feld: keyof IntervallVorgabe, wert: number | null) =>
    setT((alt) => ({
      ...alt,
      inhalt: {
        ...alt.inhalt,
        intervall: { ...(alt.inhalt.intervall ?? { runden: null, arbeitSek: null, pauseSek: null, stationen: null }), [feld]: wert },
      },
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-semibold">{training.id ? 'Workout bearbeiten' : 'Neues Workout'}</p>
          <button type="button" onClick={onClose} aria-label="Schliessen">
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Art wurde beim Anlegen gewählt — hier nur noch sichtbar. */}
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--simple-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white">
            {(() => {
              const Icon = artIcon(t.art);
              return <Icon className="h-3 w-3" />;
            })()}
            {artLabel(t.art)}
          </span>
        </div>

        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Name
        </label>
        <input
          value={t.name}
          onChange={(e) => setT((alt) => ({ ...alt, name: e.target.value }))}
          placeholder="z. B. Push Day, 5 km locker, EMOM 20"
          className="mb-3 w-full rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-2.5 py-2 text-[12px]"
        />

        {/* Intervall-Vorgaben nur bei EMOM/HIIT/Zirkel */}
        {istIntervall && (
          <div className="mb-3 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--simple-accent)]">
              {t.art === 'emom' ? 'EMOM' : t.art === 'hiit' ? 'HIIT' : 'Zirkel'}-Vorgabe
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { feld: 'runden' as const, label: t.art === 'emom' ? 'Minuten' : 'Runden' },
                { feld: 'arbeitSek' as const, label: 'Belastung (s)' },
                { feld: 'pauseSek' as const, label: 'Pause (s)' },
                { feld: 'stationen' as const, label: 'Stationen' },
              ].map((f) => (
                <div key={f.feld}>
                  <label className="mb-0.5 block text-[9px] text-[var(--text-muted)]">{f.label}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={t.inhalt.intervall?.[f.feld] ?? ''}
                    onChange={(e) => setIntervall(f.feld, e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full rounded-md border border-[var(--border-muted)] bg-[var(--card-bg)] px-2 py-1.5 text-[11.5px] tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Uebungen mit Saetzen — Auswahl aus dem ExerciseDB-Katalog */}
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Übungen</p>
          <GhostButton onClick={() => setKatalog(true)}>
            <Plus className="mr-1 h-3 w-3" /> Übungen hinzufügen
          </GhostButton>
        </div>
        {uebungen.length === 0 && (
          <p className="mb-2 rounded-lg border border-dashed border-[var(--border-muted)] px-3 py-3 text-[11px] text-[var(--text-muted)]">
            Noch keine Übung. Über „Übungen hinzufügen" öffnest du den Katalog und filterst nach Muskelgruppe.
          </p>
        )}
        <div className="space-y-2">
          {uebungen.map((u, idx) => (
            <div key={u.id} className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <input
                  value={u.name}
                  onChange={(e) =>
                    setUebungen(uebungen.map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Übung, z. B. Bankdrücken"
                  className="min-w-0 flex-1 rounded-md border border-[var(--border-muted)] bg-[var(--card-bg)] px-2 py-1.5 text-[11.5px]"
                />
                <button
                  type="button"
                  onClick={() =>
                    setUebungen(
                      uebungen.map((x) =>
                        x.id === u.id
                          ? { ...x, supersatz: x.supersatz ? null : `S${Math.floor(idx / 2) + 1}` }
                          : x,
                      ),
                    )
                  }
                  className={`shrink-0 rounded-md border px-2 py-1.5 text-[10px] font-semibold ${
                    u.supersatz
                      ? 'border-[var(--simple-accent)] text-[var(--simple-accent)]'
                      : 'border-[var(--border-muted)] text-[var(--text-muted)]'
                  }`}
                >
                  {u.supersatz ? `SS ${u.supersatz}` : 'Supersatz'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setUebungen(
                      uebungen.flatMap((x, i2) => {
                        if (i2 !== idx) return [x];
                        if (i2 === 0) return [x, uebungen[1]].filter(Boolean);
                        return [uebungen[i2 - 1], x];
                      }) as Uebung[],
                    )
                  }
                  disabled={idx === 0}
                  aria-label="Übung nach oben"
                  className="shrink-0 text-[var(--text-muted)] disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (idx >= uebungen.length - 1) return;
                    const kopie = [...uebungen];
                    [kopie[idx], kopie[idx + 1]] = [kopie[idx + 1], kopie[idx]];
                    setUebungen(kopie);
                  }}
                  disabled={idx === uebungen.length - 1}
                  aria-label="Übung nach unten"
                  className="shrink-0 text-[var(--text-muted)] disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setUebungen([
                      ...uebungen.slice(0, idx + 1),
                      {
                        ...u,
                        id: neueId(),
                        saetze: u.saetze.map((sy) => ({ ...sy, id: neueId() })),
                      },
                      ...uebungen.slice(idx + 1),
                    ])
                  }
                  aria-label="Übung duplizieren"
                  className="shrink-0 text-[var(--text-muted)]"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setUebungen(uebungen.filter((x) => x.id !== u.id))}
                  aria-label="Übung entfernen"
                  className="shrink-0 text-[var(--text-muted)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1">
                {u.saetze.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className="w-9 shrink-0 text-[9.5px] tabular-nums text-[var(--text-muted)]">
                      Satz {u.saetze.indexOf(s) + 1}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={s.wiederholungen ?? ''}
                      onChange={(e) =>
                        setUebungen(
                          uebungen.map((x) =>
                            x.id === u.id
                              ? {
                                  ...x,
                                  saetze: x.saetze.map((y) =>
                                    y.id === s.id ? { ...y, wiederholungen: e.target.value === '' ? null : Number(e.target.value) } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Wdh"
                      className="w-14 rounded-md border border-[var(--border-muted)] bg-[var(--card-bg)] px-1.5 py-1 text-[11px] tabular-nums"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      value={s.gewicht ?? ''}
                      onChange={(e) =>
                        setUebungen(
                          uebungen.map((x) =>
                            x.id === u.id
                              ? {
                                  ...x,
                                  saetze: x.saetze.map((y) =>
                                    y.id === s.id ? { ...y, gewicht: e.target.value === '' ? null : Number(e.target.value) } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="kg"
                      className="w-14 rounded-md border border-[var(--border-muted)] bg-[var(--card-bg)] px-1.5 py-1 text-[11px] tabular-nums"
                    />
                    <select
                      value={s.typ}
                      onChange={(e) =>
                        setUebungen(
                          uebungen.map((x) =>
                            x.id === u.id
                              ? {
                                  ...x,
                                  saetze: x.saetze.map((y) =>
                                    y.id === s.id ? { ...y, typ: e.target.value as SatzTyp } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                      className="flex-1 rounded-md border border-[var(--border-muted)] bg-[var(--card-bg)] px-1.5 py-1 text-[10.5px]"
                    >
                      <option value="warmup">Aufwärmen</option>
                      <option value="normal">Arbeitssatz</option>
                      <option value="top">Top-Satz</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setUebungen(
                          uebungen.map((x) =>
                            x.id === u.id ? { ...x, saetze: x.saetze.filter((y) => y.id !== s.id) } : x,
                          ),
                        )
                      }
                      aria-label="Satz entfernen"
                      className="shrink-0 text-[var(--text-muted)]"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setUebungen(
                    uebungen.map((x) =>
                      x.id === u.id
                        ? { ...x, saetze: [...x.saetze, { id: neueId(), wiederholungen: 10, gewicht: null, typ: 'normal' }] }
                        : x,
                    ),
                  )
                }
                className="mt-1 text-[10px] font-semibold text-[var(--simple-accent)]"
              >
                + Satz
              </button>
            </div>
          ))}
        </div>

        {/* Summe des Workouts — dieselben Kennzahlen wie auf der Plan-Seite */}
        {uebungen.length > 0 && (() => {
          const saetze = uebungen.reduce((a, x) => a + x.saetze.length, 0);
          const volumen = uebungen.reduce(
            (a, x) => a + x.saetze.reduce((b, sy) => b + (sy.wiederholungen ?? 0) * (sy.gewicht ?? 0), 0),
            0,
          );
          return (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              {uebungen.length} Übungen · {saetze} Sätze
              {volumen > 0 ? ` · ${Math.round(volumen).toLocaleString('de-DE')} kg Volumen` : ''}
            </p>
          );
        })()}

        {/* Notiz zum Workout (Ausführungshinweise) */}
        <div className="mt-3">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Notiz
          </label>
          <input
            value={t.notiz ?? ''}
            onChange={(e) => setT((alt) => ({ ...alt, notiz: e.target.value || null }))}
            placeholder="z. B. langsam ablassen, letzter Satz bis zum Versagen"
            className="w-full rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-2.5 py-2 text-[11.5px]"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Dauer (min)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={t.dauer_min ?? ''}
            onChange={(e) => setT((alt) => ({ ...alt, dauer_min: e.target.value === '' ? null : Number(e.target.value) }))}
            placeholder="45"
            className="w-24 rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-2.5 py-2 text-[12px] tabular-nums"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(t)}
            className="flex-1 rounded-lg bg-[var(--simple-accent)] px-3 py-2.5 text-[12px] font-semibold text-white"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-muted)] px-3 py-2.5 text-[12px] font-semibold text-[var(--text-muted)]"
          >
            Abbrechen
          </button>
        </div>
      </div>

      <ExercisePaletteModal
        open={katalog}
        onClose={() => setKatalog(false)}
        onPickMultiple={uebernehmeAusKatalog}
        multiSelect
      />
    </div>
  );
}
