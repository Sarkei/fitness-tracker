import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';

/**
 * Ein Knopf fuer alles: stoesst den Abgleich aller verbundenen Quellen an.
 *
 * Vorher hatte jede Karte (Garmin, Intervals, Mealplanner) ihren eigenen
 * Sync-Knopf. Drei Knoepfe untereinander, jeder mit eigenem Zeitstempel —
 * unklar, was zuletzt wirklich gelaufen ist. Jetzt gibt es einen Knopf, der
 * alle Quellen nacheinander abgleicht und je Quelle meldet, was passiert ist.
 */

type Quelle = 'garmin' | 'intervals' | 'mealplanner';

type Status = {
  connected: boolean;
  lastSync: string | null;
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

export default function SyncKarte() {
  const [status, setStatus] = useState<Record<Quelle, Status | null>>({
    garmin: null,
    intervals: null,
    mealplanner: null,
  });
  const [arbeitet, setArbeitet] = useState(false);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zuletzt, setZuletzt] = useState<string | null>(null);

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

  /** Eine Quelle abgleichen und das Ergebnis einsammeln. */
  const gleicheAb = async (q: Quelle): Promise<Ergebnis> => {
    try {
      if (q === 'garmin') {
        const r = await api<{
          garmin?: { tage?: number; aktivitaeten?: number; felder?: { erfolgreich: number; gesamt: number } };
        }>('/api/integrations/refresh', { method: 'POST', body: JSON.stringify({ days: 30 }) });
        const g = r.garmin;
        return {
          quelle: q,
          label: LABEL[q],
          ok: true,
          text:
            g?.tage != null
              ? `${g.tage} Tage, ${g.aktivitaeten ?? 0} Einheiten`
              : 'abgeglichen',
        };
      }
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
    setArbeitet(true);
    setFehler(null);
    setErgebnisse([]);
    try {
      // Nur verbundene Quellen — sonst laufen Anfragen ins Leere.
      const verbunden = (Object.keys(status) as Quelle[]).filter((q) => status[q]?.connected);
      if (!verbunden.length) {
        setFehler('Keine Quelle verbunden — erst oben eine Verbindung einrichten.');
        return;
      }
      const teile: Ergebnis[] = [];
      for (const q of verbunden) {
        const e = await gleicheAb(q);
        teile.push(e);
        setErgebnisse([...teile]);
      }
      setZuletzt(new Date().toISOString());
      await laden();
    } finally {
      setArbeitet(false);
    }
  };

  const verbunden = (Object.keys(status) as Quelle[]).filter((q) => status[q]?.connected);

  return (
    <section className="app-card space-y-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">Alle Daten aktualisieren</h3>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            Stößt den Abgleich aller verbundenen Quellen an. Die App gleicht im Hintergrund
            ohnehin regelmäßig ab — dieser Knopf ist für den Moment, in dem du nicht warten willst.
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

      {/* Je Quelle eine Zeile: verbunden und zuletzt abgeglichen. */}
      <dl className="space-y-1">
        {(Object.keys(LABEL) as Quelle[]).map((q) => {
          const s = status[q];
          const e = ergebnisse.find((x) => x.quelle === q);
          return (
            <div key={q} className="flex items-center justify-between gap-3 text-[10.5px]">
              <dt className="text-[var(--text-muted)]">{LABEL[q]}</dt>
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
        <p className="text-[10px] text-[var(--text-muted)]">
          Zuletzt manuell: {fmtZeit(zuletzt)}
        </p>
      )}
      {fehler && (
        <p className="text-[10.5px]" style={{ color: '#e06c75' }}>
          {fehler}
        </p>
      )}
    </section>
  );
}
