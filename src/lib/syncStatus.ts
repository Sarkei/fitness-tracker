import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Sync-Status, der einen Bereichswechsel überlebt.
 *
 * Tims Vorgabe: Wer „Aktualisieren" antippt, kurz woanders hinsieht und
 * zurückkommt, soll weiter den laufenden Fortschritt sehen (Kreiseln plus
 * „12 / 27 Felder") statt eines zurückgesetzten Knopfs.
 *
 * Warum ein eigener Store statt React-State in der Komponente:
 * Beim Verlassen einer Seite wird die Komponente abgebaut und ihr State
 * verworfen. Der Server kennt den Lauf weiterhin — also fragt dieser Store ihn
 * ab und hält das Ergebnis außerhalb des Komponentenbaums. So sieht jede Seite
 * denselben Stand.
 */

export type SyncStatus = {
  laeuft: boolean;
  schritt: number;
  gesamt: number;
  seit: number | null;
  fertigAm: number | null;
  ergebnis: string | null;
  fehler: string | null;
};

const LEER: SyncStatus = {
  laeuft: false,
  schritt: 0,
  gesamt: 0,
  seit: null,
  fertigAm: null,
  ergebnis: null,
  fehler: null,
};

/** Abfrage-Takt, solange ein Lauf aktiv ist. */
const TAKT_MS = 1200;

type Hoerer = (s: SyncStatus) => void;

let status: SyncStatus = LEER;
let timer: number | null = null;
const hoerer = new Set<Hoerer>();

function melde(): void {
  for (const h of hoerer) h(status);
}

async function hole(): Promise<SyncStatus> {
  try {
    const r = await api<SyncStatus>('/api/integrations/sync-status');
    status = {
      laeuft: Boolean(r.laeuft),
      schritt: Number(r.schritt) || 0,
      gesamt: Number(r.gesamt) || 0,
      seit: r.seit ?? null,
      fertigAm: r.fertigAm ?? null,
      ergebnis: r.ergebnis ?? null,
      fehler: r.fehler ?? null,
    };
  } catch {
    /* Aussetzer: letzten Stand behalten, nicht auf leer zurückfallen. */
  }
  melde();
  return status;
}

function starteTakt(): void {
  if (timer != null) return;
  timer = window.setInterval(() => {
    void hole().then(() => {
      /* Fertig oder abgebrochen: Takt einstellen, aber Stand behalten. */
      if (!status.laeuft && timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    });
  }, TAKT_MS);
}

function stoppeTakt(): void {
  if (timer == null) return;
  window.clearInterval(timer);
  timer = null;
}

/**
 * Status einmalig holen und — falls ein Lauf aktiv ist — im Takt weiterfragen.
 * Gibt den aktuellen Stand zurück.
 */
export async function syncStatusAktualisieren(): Promise<SyncStatus> {
  const s = await hole();
  if (s.laeuft) starteTakt();
  else stoppeTakt();
  return s;
}

/**
 * Einen Abgleich anstoßen.
 *
 * `merken` setzt den Zustand sofort auf „läuft", damit die Anzeige nicht erst
 * auf die erste Server-Antwort warten muss — Tim soll den Klick unmittelbar
 * sehen. Der Server übernimmt den echten Fortschritt danach.
 */
export async function syncStarten(days = 7): Promise<SyncStatus> {
  status = { ...status, laeuft: true, schritt: 0, gesamt: days, seit: Date.now(), fehler: null };
  melde();
  starteTakt();

  try {
    await api('/api/integrations/refresh', {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
  } finally {
    /* Direkt nachfragen — der Lauf kann sehr schnell fertig sein. */
    await hole();
    if (status.laeuft) starteTakt();
    else stoppeTakt();
  }
  return status;
}

/** React-Anbindung: liefert den Stand und abonniert Änderungen. */
export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>(status);
  const aktiv = useRef(true);

  useEffect(() => {
    aktiv.current = true;
    const h: Hoerer = (neu) => {
      if (aktiv.current) setS(neu);
    };
    hoerer.add(h);
    /* Beim Einhängen sofort fragen: der Lauf kann vor dem Wechsel gestartet sein. */
    void syncStatusAktualisieren();
    return () => {
      aktiv.current = false;
      hoerer.delete(h);
    };
  }, []);

  return s;
}

/** Anteil in Prozent, für Balken und Anzeige. */
export function syncProzent(s: SyncStatus): number | null {
  if (!s.gesamt || s.gesamt <= 0) return null;
  return Math.min(100, Math.round((s.schritt / s.gesamt) * 100));
}

/**
 * Auf Änderungen des globalen Sync-Zustands hören, ohne React-State.
 * Wird von Seiten genutzt, die nach einem Abgleich neu laden wollen.
 */
export function aufSyncFertig(cb: () => void): () => void {
  let warLaeuft = status.laeuft;
  const h: Hoerer = (s) => {
    /* Nur beim Übergang läuft -> fertig auslösen, nicht bei jedem Takt. */
    if (warLaeuft && !s.laeuft) cb();
    warLaeuft = s.laeuft;
  };
  hoerer.add(h);
  return () => hoerer.delete(h);
}

export const syncStatusLeer = (): SyncStatus => LEER;
