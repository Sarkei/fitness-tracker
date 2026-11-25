import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { syncProzent, syncStarten, useSyncStatus, type SyncStatus } from '../../lib/syncStatus';

/**
 * Ein Knopf fuer alles: stoesst den Abgleich aller verbundenen Quellen an.
 *
 * Vorher hatte jede Karte (Garmin, Intervals, Mealplanner) ihren eigenen
 * Sync-Knopf. Drei Knoepfe untereinander, jeder mit eigenem Zeitstempel —
 * unklar, was zuletzt wirklich gelaufen ist. Jetzt gibt es einen Knopf, der
 * alle Quellen nacheinander abgleicht und je Quelle meldet, was passiert ist.
 *
 * Tims Nachtrag: Der Knopf soll im Hintergrund weiterlaufen. Wer ihn antippt,
 * kurz woanders hinsieht und zurueckkommt, soll weiter Kreiseln und den Stand
 * sehen — nicht einen zurueckgesetzten Knopf. Dafuer kommt der Fortschritt
 * nicht mehr aus dem Komponenten-State, sondern aus `syncStatus` (fragt den
 * Server, der den Lauf ohnehin kennt).
 */

type Quelle = 'garmin' | 'intervals' | 'mealplanner';

type Status = {
  connected: boolean;
  lastSync: string | null;
  /* Garmin liefert zusaetzlich, wie viele Felder belegt sind. */
  felder?: { erfolgreich: number; gesamt: number } | null;
  tage?: number | null;
  quellen?: { personalApi?: boolean; intervals?: boolean } | null;
};

type Ergebnis = {
  quelle: Quelle;
  label: string;
  ok: boolean;
  text: string;
};

const LABEL: Record<Quelle, string> = {
  garmin: 'Garmin',
  intervals: 'Intervals.icu',
  mealplanner: 'Mealplanner',
};

function fmtZeit(iso: string | null): string {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'noch nie';
  const heute = new Date();
  const gleich = d.toDateString() === heute.toDateString();
  return gleich
    ? `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Sekunden seit Beginn des Laufs, lesbar kurz. */
function dauerText(status: SyncStatus): string | null {
  if (!status.laeuft || !status.seit) return null;
  const s = Math.max(0, Math.round((Date.now() - status.seit) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

export default function SyncKarte() {
  const [status, setStatus] = useState<Record<Quelle, Status | null>>({
    garmin: null,
    intervals: null,
    mealplanner: null,
  });
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zuletzt, setZuletzt] = useState<string | null>(null);
  /** Eigener Zusatzlauf fuer Quellen, die der Garmin-Abgleich nicht abdeckt. */
  const [extraLaeuft, setExtraLaeuft] = useState(false);

  /* Fortschritt aus dem globalen Store — ueberlebt den Bereichswechsel. */
  const sync = useSyncStatus();
  const arbeitet = sync.laeuft || extraLaeuft;
  const prozent = syncProzent(sync);

  const laden = useCallback(async () => {
    // Jede Quelle einzeln — eine nicht verbundene Quelle darf die anderen nicht blockieren.
    const holen = async (q: Quelle, pfad: string): Promise<[Quelle, Status | null]> => {
      try {
        return [q, await api<Status>(pfad)];
      } catch {
        return [q, null];
      }
    };
    const paare = await Promise.all([
      holen('garmin', '/api/integrations/garmin'),
      holen('intervals', '/api/integrations/intervals'),
      holen('mealplanner', '/api/integrations/mealplanner'),
    ]);
    setStatus(Object.fromEntries(paare) as Record<Quelle, Status | null>);
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  /* Nach dem Ende eines Laufs die Zeitstempel neu holen. */
  useEffect(() => {
    if (!sync.laeuft && sync.fertigAm) {
      void laden();
      setZuletzt(new Date(sync.fertigAm).toISOString());
    }
  }, [sync.laeuft, sync.fertigAm, laden]);

  /** Eine Quelle abgleichen und das Ergebnis einsammeln. */
  const gleicheAb = async (q: Quelle): Promise<Ergebnis> => {
    try {
      if (q === 'intervals') {
        const r = await api<{ activityCount: number; neuSeitLetztemSync: boolean; hinweis: string | null }>(
          '/api/integrations/intervals/sync',
          { method: 'POST', body: JSON.stringify({ days: 30 }) },
        );
        if (r.hinweis) return { quelle: q, label: LABEL[q], ok: false, text: r.hinweis };
        return {
          quelle: q,
          label: LABEL[q],
          ok: true,
          text: r.neuSeitLetztemSync
            ? `neue Daten · ${r.activityCount} Aktivitäten`
            : `${r.activityCount} Aktivitäten, nichts neu`,
        };
      }
      const r = await api<{ ms: number; anzahl: number; kcalSumme: number }>(
        '/api/integrations/mealplanner/sync',
        { method: 'POST', body: JSON.stringify({}) },
      );
      return { quelle: q, label: LABEL[q], ok: true, text: `${r.anzahl} Gerichte übernommen` };
    } catch (e) {
      return {
        quelle: q,
        label: LABEL[q],
        ok: false,
        text: e instanceof Error ? e.message : 'fehlgeschlagen',
      };
    }
  };

  const allesSyncen = async () => {
    setFehler(null);
    setErgebnisse([]);
    try {
      // Nur verbundene Quellen — sonst laufen Anfragen ins Leere.
      const verbunden = (Object.keys(status) as Quelle[]).filter((q) => status[q]?.connected);
      if (!verbunden.length) {
        setFehler('Keine Quelle verbunden — erst oben eine Verbindung einrichten.');
        return;
      }
      if (sync.laeuft) return;

      /*
       * Garmin laeuft ueber `syncStarten`: der Server fuehrt den Abgleich und
       * meldet den Fortschritt, auch wenn diese Karte zwischendurch verschwindet.
       */
      if (verbunden.includes('garmin')) {
        await syncStarten(30);
        const r = await api<{ garmin?: { tage?: number; aktivitaeten?: number } }>(
          '/api/integrations/garmin',
        ).catch(() => null);
        setErgebnisse([
          {
            quelle: 'garmin',
            label: LABEL.garmin,
            ok: !r?.garmin ? true : true,
            text: r?.garmin?.tage != null ? `${r.garmin.tage} Tage im Speicher` : 'abgeglichen',
          },
        ]);
      }

      /* Restliche Quellen nacheinander — kurz, deshalb eigener Zaehler. */
      const rest = verbunden.filter((q) => q !== 'garmin');
      if (rest.length) {
        setExtraLaeuft(true);
        const teile = [...ergebnisse];
        for (const q of rest) {
          const e = await gleicheAb(q);
          teile.push(e);
          setErgebnisse([...teile]);
        }
        setExtraLaeuft(false);
      }
      setZuletzt(new Date().toISOString());
      await laden();
    } finally {
      setExtraLaeuft(false);
    }
  };

  const verbunden = (Object.keys(status) as Quelle[]).filter((q) => status[q]?.connected);
  const dauer = dauerText(sync);
  /* Belegte Felder des juengsten Tages — wie das „27/27" bei der Garmin-API. */
  const feldStand = status.garmin?.felder ?? null;

  return (
    <section className="app-card space-y-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">Alle Daten aktualisieren</h3>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            Stößt den Abgleich aller verbundenen Quellen an. Läuft im Hintergrund weiter — du kannst
            den Bereich wechseln und siehst beim Zurückkommen den Fortschritt.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void allesSyncen()}
          disabled={arbeitet || !verbunden.length}
          className="app-btn app-btn--primary shrink-0"
          style={{ minHeight: 36 }}
        >
          {arbeitet ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {arbeitet ? 'Läuft …' : 'Aktualisieren'}
        </button>
      </div>

      {/* Statusleiste: Fortschritt mit Zahlen, solange der Lauf aktiv ist. */}
      {arbeitet && (
        <div className="space-y-1.5">
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ background: 'color-mix(in srgb, var(--text-muted) 20%, transparent)' }}
            role="progressbar"
            aria-valuenow={prozent ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: prozent != null ? `${prozent}%` : '35%',
                background: 'var(--simple-accent)',
                animation: prozent == null ? 'pulse 1.4s ease-in-out infinite' : undefined,
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[10.5px] font-semibold">
            <span className="text-[var(--foreground)]">
              {sync.gesamt > 0 ? `${sync.schritt} / ${sync.gesamt} Tage` : 'Holt Daten …'}
            </span>
            {dauer && <span className="text-[var(--text-muted)]">{dauer}</span>}
          </div>
          {feldStand && feldStand.gesamt > 0 && (
            <p className="text-[10px] text-[var(--text-muted)]">
              Felder heute: {feldStand.erfolgreich} / {feldStand.gesamt}
            </p>
          )}
        </div>
      )}

      {/* Nach dem Lauf: Ergebnis in einer Zeile, kein Dialog noetig. */}
      {!arbeitet && sync.fertigAm && (sync.ergebnis || sync.fehler) && (
        <p
          className="flex items-start gap-1.5 text-[10.5px]"
          style={{ color: sync.fehler ? '#e06c75' : 'var(--foreground)' }}
        >
          {sync.fehler ? (
            <AlertCircle className="mt-px h-3 w-3 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-px h-3 w-3 shrink-0" style={{ color: 'var(--simple-accent)' }} />
          )}
          {sync.fehler ?? sync.ergebnis}
        </p>
      )}

      {/* Je Quelle eine Zeile: verbunden und zuletzt abgeglichen. */}
      <dl className="space-y-1">
        {(Object.keys(LABEL) as Quelle[]).map((q) => {
          const s = status[q];
          const e = ergebnisse.find((x) => x.quelle === q);
          /* Abgeschaltete Quelle sichtbar machen, statt sie zu verschweigen. */
          const aus =
            (q === 'intervals' && status.garmin?.quellen?.intervals === false) ||
            (q === 'garmin' && status.garmin?.quellen?.personalApi === false && !status.garmin?.connected);
          return (
            <div key={q} className="flex items-center justify-between gap-3 text-[10.5px]">
              <dt className="text-[var(--text-muted)]">
                {LABEL[q]}
                {aus && <span className="ml-1 opacity-70">(aus)</span>}
              </dt>
              <dd className="flex items-center gap-1.5 text-right font-semibold">
                {e ? (
                  e.ok ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: 'var(--accent)' }} />
                  ) : (
                    <AlertCircle className="h-3 w-3 shrink-0" style={{ color: '#e06c75' }} />
                  )
                ) : null}
                <span className={e && !e.ok ? '' : 'text-[var(--foreground)]'}>
                  {e ? e.text : s?.connected ? fmtZeit(s.lastSync) : 'nicht verbunden'}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      {zuletzt && !arbeitet && (
        <p className="text-[10px] text-[var(--text-muted)]">Zuletzt manuell: {fmtZeit(zuletzt)}</p>
      )}
      {fehler && (
        <p className="text-[10.5px]" style={{ color: '#e06c75' }}>
          {fehler}
        </p>
      )}
    </section>
  );
}
