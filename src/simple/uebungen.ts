/**
 * Übungsbibliothek: ordnet Übungsnamen einer Muskelgruppe zu.
 *
 * Erst exakte Treffer über eine Tabelle gängiger Übungen (auch deutsche
 * Schreibweisen), dann eine Wortsuche als Rückfall. So landet "Face Pull"
 * bei Schultern statt in "Sonstiges".
 */

import type { Muskelgruppe } from './analytics';

type Eintrag = { woerter: string[]; gruppe: Muskelgruppe; anzeige: string };

/**
 * Woerter werden als Teilstring geprueft, laengere zuerst.
 * Beispiel: "bankdruecken" trifft Brust, bevor "druecken" etwas anderes trifft.
 */
const TABELLE: Array<{ muster: string[]; gruppe: Muskelgruppe; vorrang?: number }> = [
  // Hoechster Vorrang: mehrdeutige Namen, die sonst falsch zugeordnet werden
  { vorrang: 100, gruppe: 'Beine', muster: [
    'rumaenisch', 'rumänisch', 'rdl', 'romanian deadlift',
    'rumaenisches kreuzheben', 'rumänisches kreuzheben',
  ]},
  { vorrang: 100, gruppe: 'Schultern', muster: [
    'face pull', 'facepull', 'rear delt', 'hintere schulter',
    'reverse fly', 'reverse flye', 'vorgebeugtes seitheben',
  ]},

  // Brust
  { gruppe: 'Brust', muster: [
    'bankdruecken', 'bankdrücken', 'bench', 'brustpresse', 'chest press',
    'chest fly', 'pec deck', 'cable crossover', 'crossover', 'flye',
    'liegestuetz', 'liegestütz', 'push-up', 'pushup', 'push up',
    'incline press', 'decline press', 'schraegbank', 'schrägbank', 'dips',
  ]},

  // Ruecken
  { gruppe: 'Rücken', muster: [
    'kabelrudern', 'rudern', 'row', 'latziehen', 'latzug', 'lat pull',
    'pull-up', 'pullup', 'pull up', 'klimmzug', 'chin-up', 'chinup',
    'kreuzheben', 'deadlift', 'rack pull', 'hyperextension',
    'back extension', 't-bar', 't bar', 'pullover',
  ]},

  // Beine
  { gruppe: 'Beine', muster: [
    'kniebeuge', 'squat', 'hack squat', 'beinpresse', 'leg press',
    'ausfallschritt', 'lunge', 'beinstrecker', 'leg extension',
    'beinbeuger', 'leg curl', 'wadenheben', 'calf raise',
    'hip thrust', 'hüftheben', 'glute bridge', 'glute',
    'step-up', 'step up', 'bulgarian', 'bulgarisch', 'good morning',
  ]},

  // Schultern
  { gruppe: 'Schultern', muster: [
    'schulterdruecken', 'schulterdrücken', 'shoulder press',
    'overhead press', 'military press', 'arnold press',
    'seitheben', 'lateral raise', 'lateral', 'frontheben', 'front raise',
    'shrug', 'nackenheben', 'upright row', 'aufrechtes rudern',
  ]},

  // Arme
  { gruppe: 'Arme', muster: [
    'bizepscurl', 'bizeps', 'biceps', 'curl', 'hammer',
    'konzentrationscurl', 'trizeps', 'triceps', 'pushdown', 'kickback',
    'skull crusher', 'french press', 'close grip',
    'engbankdruecken', 'engbankdrücken', 'unterarm', 'wrist curl', 'handgelenk',
  ]},

  // Core
  { gruppe: 'Core', muster: [
    'plank', 'unterarmstuetz', 'unterarmstütz', 'crunch', 'sit-up',
    'situp', 'sit up', 'bauch', 'core', 'russian twist', 'hollow',
    'leg raise', 'beinheben', 'ab wheel', 'abwheel', 'rollout',
    'seitstuetz', 'seitstütz', 'side plank', 'dead bug', 'bird dog',
  ]},

  // Cardio
  { gruppe: 'Cardio', muster: [
    'laufband', 'treadmill', 'laufen', 'joggen', 'running', 'lauf',
    'ergometer', 'rudergeraet', 'rudergerät', 'rowing', 'row erg',
    'fahrrad', 'radfahren', 'bike', 'cycling', 'crosstrainer', 'elliptical',
    'stairmaster', 'stepper', 'hiit', 'sprint', 'intervall',
    'seilspringen', 'jump rope', 'schwimmen', 'swim', 'cardio',
    'burpee', 'jumping jack', 'boxing', 'boxen',
  ]},
];

/** Exakte Zuordnung — null, wenn nichts sicher passt. */
export function gruppeAusTabelle(name: string): Muskelgruppe | null {
  const n = String(name ?? '').toLowerCase().replace(/[-_]/g, ' ').trim();
  if (!n) return null;

  // Vorrang schlaegt Trefferlaenge: spezifische Namen (Face Pull, RDL)
  // gewinnen gegen allgemeine Woerter, die auch anderswo stehen.
  let beste: { gruppe: Muskelgruppe; vorrang: number; laenge: number } | null = null;
  for (const { muster, gruppe, vorrang = 0 } of TABELLE) {
    for (const m of muster) {
      if (!n.includes(m)) continue;
      const kandidat = { gruppe, vorrang, laenge: m.length };
      if (
        !beste ||
        kandidat.vorrang > beste.vorrang ||
        (kandidat.vorrang === beste.vorrang && kandidat.laenge > beste.laenge)
      ) {
        beste = kandidat;
      }
    }
  }
  return beste?.gruppe ?? null;
}

/** Anzeigename für eine Übung — bekannte Namen werden ausgeschrieben. */
const ANZEIGE: Record<string, string> = {
  bench: 'Bankdrücken',
  'bench press': 'Bankdrücken',
  squat: 'Kniebeuge',
  deadlift: 'Kreuzheben',
  row: 'Rudern',
  'lat pull': 'Latzug',
  'pull-up': 'Klimmzug',
  curl: 'Curl',
  'lateral raise': 'Seitheben',
  plank: 'Plank',
  'calf raise': 'Wadenheben',
  'leg press': 'Beinpresse',
  'leg curl': 'Beinbeuger',
  'leg extension': 'Beinstrecker',
  'shoulder press': 'Schulterdrücken',
  'face pull': 'Face Pull',
  'hip thrust': 'Hip Thrust',
};

export function uebungAnzeige(name: string): string {
  const n = String(name ?? '').trim();
  const hit = ANZEIGE[n.toLowerCase()];
  if (hit) return hit;
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}

/**
 * Vorschläge für die Eingabe: bekannte Übungen, die den Suchtext enthalten.
 * Wird beim Erfassen als Autovervollständigung genutzt.
 */
export const UEBUNGEN: string[] = [
  // Brust
  'Bankdrücken', 'Schrägbankdrücken', 'Negativbankdrücken', 'Kurzhantel-Bankdrücken',
  'Fliegende', 'Cable Crossover', 'Pec Deck', 'Dips', 'Liegestütze',
  // Rücken
  'Kreuzheben', 'Rudern', 'Latzug', 'Klimmzug', 'T-Bar Rudern', 'Kabelrudern',
  'Face Pull', 'Reverse Fly', 'Hyperextension', 'Pullover',
  // Beine
  'Kniebeuge', 'Beinpresse', 'Ausfallschritte', 'Beinstrecker', 'Beinbeuger',
  'Wadenheben', 'Hip Thrust', 'Rumänisches Kreuzheben', 'Bulgarian Split Squat',
  'Good Morning',
  // Schultern
  'Schulterdrücken', 'Seitheben', 'Frontheben', 'Arnold Press', 'Upright Row', 'Nackenheben',
  // Arme
  'Bizeps-Curl', 'Hammer-Curl', 'Konzentrations-Curl', 'Trizeps-Pushdown',
  'Skull Crusher', 'Kickback', 'Enges Bankdrücken', 'Unterarm-Curl',
  // Core
  'Plank', 'Crunch', 'Sit-Up', 'Russian Twist', 'Beinheben', 'Ab Wheel', 'Seitstütz',
  // Cardio
  'Laufband', 'Ergometer', 'Fahrrad', 'Crosstrainer', 'Seilspringen', 'HIIT', 'Burpees',
];

/** Autovervollständigung: filtert die Bibliothek nach Teiltext. */
export function uebungVorschlaege(suchtext: string, limit = 8): string[] {
  const q = String(suchtext ?? '').toLowerCase().trim();
  if (!q) return [];
  return UEBUNGEN.filter((u) => u.toLowerCase().includes(q)).slice(0, limit);
}
