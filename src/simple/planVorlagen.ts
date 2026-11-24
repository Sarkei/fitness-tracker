/**
 * Fertige Trainingsplan-Vorlagen.
 *
 * Tim wollte das Plan-Anlegen „besser als in den viralen Gym-Apps": Statt bei
 * null anzufangen, legt eine Vorlage die passenden Workouts an und verteilt sie
 * auf die Wochentage. Danach lässt sich alles frei umbauen — die Vorlage ist
 * nur ein Startpunkt, kein Sonderfall im Datenmodell.
 *
 * Aufbau je Vorlage:
 *   workouts: die Workout-Vorlagen (Name, Art, Übungen mit Sätzen)
 *   plan:     welches Workout an welchem Wochentag liegt (0 = Montag)
 */

import type { TrainingsArt } from './TrainingsplanPage';

export type VorlagenUebung = {
  name: string;
  saetze: number;
  wdh: number;
  gewicht?: number | null;
};

export type VorlagenWorkout = {
  /** Schlüssel, über den der Plan das Workout referenziert. */
  key: string;
  name: string;
  art: TrainingsArt;
  dauer?: number | null;
  uebungen: VorlagenUebung[];
  intervall?: { runden: number | null; arbeitSek: number | null; pauseSek: number | null; stationen: number | null };
};

export type Vorlage = {
  id: string;
  titel: string;
  beschreibung: string;
  /** Kurzinfo für die Karte, z. B. „3× pro Woche · ca. 55 min". */
  aufwand: string;
  workouts: VorlagenWorkout[];
  /** workout-Key → Wochentage (0 = Montag). */
  plan: Array<{ workout: string; tage: number[] }>;
};

const u = (name: string, saetze: number, wdh: number, gewicht: number | null = null): VorlagenUebung => ({
  name,
  saetze,
  wdh,
  gewicht,
});

export const VORLAGEN: Vorlage[] = [
  {
    id: 'ganzkoerper3',
    titel: 'Ganzkörper 3×',
    beschreibung: 'Drei Einheiten, jede deckt den ganzen Körper ab — der Klassiker für Einsteiger und alle mit wenig Zeit.',
    aufwand: '3× pro Woche · ca. 50 min',
    workouts: [
      {
        key: 'gk',
        name: 'Ganzkörper',
        art: 'frei',
        dauer: 50,
        uebungen: [
          u('Kniebeuge (Langhantel)', 3, 8),
          u('Bankdrücken (Langhantel)', 3, 8),
          u('Rudern am Kabel', 3, 10),
          u('Schulterdrücken (Kurzhantel)', 3, 10),
          u('Kreuzheben (Langhantel)', 3, 5),
          u('Plank', 3, 45),
        ],
      },
    ],
    plan: [{ workout: 'gk', tage: [0, 2, 4] }],
  },
  {
    id: 'upperlower4',
    titel: 'Oberkörper / Unterkörper 4×',
    beschreibung: 'Zwei Einheiten im Wechsel, viermal pro Woche. Mehr Volumen pro Muskel, ohne dass eine Einheit zu lang wird.',
    aufwand: '4× pro Woche · ca. 60 min',
    workouts: [
      {
        key: 'upper',
        name: 'Oberkörper',
        art: 'frei',
        dauer: 60,
        uebungen: [
          u('Bankdrücken (Langhantel)', 4, 6),
          u('Klimmzüge', 4, 8),
          u('Schulterdrücken (Kurzhantel)', 3, 10),
          u('Rudern (Langhantel)', 3, 10),
          u('Trizepsdrücken am Kabel', 3, 12),
          u('Bizepscurls (Kurzhantel)', 3, 12),
        ],
      },
      {
        key: 'lower',
        name: 'Unterkörper',
        art: 'frei',
        dauer: 60,
        uebungen: [
          u('Kniebeuge (Langhantel)', 4, 6),
          u('Rumänisches Kreuzheben', 3, 8),
          u('Beinpresse', 3, 12),
          u('Wadenheben (stehend)', 4, 15),
          u('Hanging Leg Raise', 3, 12),
        ],
      },
    ],
    plan: [
      { workout: 'upper', tage: [0, 3] },
      { workout: 'lower', tage: [1, 4] },
    ],
  },
  {
    id: 'ppl3',
    titel: 'Push / Pull / Legs',
    beschreibung: 'Drei klare Tage: Drücken, Ziehen, Beine. Übersichtlich, gut steigerbar und leicht zu merken.',
    aufwand: '3× pro Woche · ca. 55 min',
    workouts: [
      {
        key: 'push',
        name: 'Push (Brust, Schulter, Trizeps)',
        art: 'frei',
        dauer: 55,
        uebungen: [
          u('Bankdrücken (Langhantel)', 4, 8),
          u('Schrägbankdrücken (Kurzhantel)', 3, 10),
          u('Schulterdrücken (Kurzhantel)', 3, 10),
          u('Seitheben (Kurzhantel)', 3, 15),
          u('Trizepsdrücken am Kabel', 3, 12),
        ],
      },
      {
        key: 'pull',
        name: 'Pull (Rücken, Bizeps)',
        art: 'frei',
        dauer: 55,
        uebungen: [
          u('Klimmzüge', 4, 8),
          u('Rudern (Langhantel)', 4, 10),
          u('Latzug', 3, 12),
          u('Face Pulls', 3, 15),
          u('Bizepscurls (Kurzhantel)', 3, 12),
        ],
      },
      {
        key: 'legs',
        name: 'Legs',
        art: 'frei',
        dauer: 55,
        uebungen: [
          u('Kniebeuge (Langhantel)', 4, 6),
          u('Rumänisches Kreuzheben', 3, 8),
          u('Beinpresse', 3, 12),
          u('Beincurls im Sitzen', 3, 12),
          u('Wadenheben (stehend)', 4, 15),
        ],
      },
    ],
    plan: [
      { workout: 'push', tage: [0] },
      { workout: 'pull', tage: [2] },
      { workout: 'legs', tage: [4] },
    ],
  },
  {
    id: 'kraft5x5',
    titel: 'Kraft 5×5',
    beschreibung: 'Drei Grundübungen, fünf Sätze, fünf Wiederholungen. Wenig Auswahl, viel Fortschritt — für alle, die stärker werden wollen.',
    aufwand: '3× pro Woche · ca. 45 min',
    workouts: [
      {
        key: 'a',
        name: '5×5 · Tag A',
        art: 'frei',
        dauer: 45,
        uebungen: [u('Kniebeuge (Langhantel)', 5, 5), u('Bankdrücken (Langhantel)', 5, 5), u('Rudern (Langhantel)', 5, 5)],
      },
      {
        key: 'b',
        name: '5×5 · Tag B',
        art: 'frei',
        dauer: 45,
        uebungen: [u('Kniebeuge (Langhantel)', 5, 5), u('Schulterdrücken (Langhantel)', 5, 5), u('Kreuzheben (Langhantel)', 1, 5)],
      },
    ],
    plan: [
      { workout: 'a', tage: [0, 4] },
      { workout: 'b', tage: [2] },
    ],
  },
  {
    id: 'hiitzirkel2',
    titel: 'HIIT-Zirkel 2×',
    beschreibung: 'Zwei kurze Zirkel-Einheiten mit Intervallvorgabe — fünf Stationen, vier Runden, 40 Sekunden Arbeit.',
    aufwand: '2× pro Woche · ca. 30 min',
    workouts: [
      {
        key: 'zirkel',
        name: 'HIIT-Zirkel',
        art: 'zirkel',
        dauer: 30,
        intervall: { runden: 4, arbeitSek: 40, pauseSek: 20, stationen: 5 },
        uebungen: [
          u('Burpees', 1, 0),
          u('Mountain Climbers', 1, 0),
          u('Kniebeuge (Körpergewicht)', 1, 0),
          u('Liegestütze', 1, 0),
          u('Plank', 1, 0),
        ],
      },
    ],
    plan: [{ workout: 'zirkel', tage: [1, 3] }],
  },
];
