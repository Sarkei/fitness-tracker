/**
 * Handy-Health als Quelle: Health Connect (Android) oder Apple Health (iOS).
 *
 * Tims Vorgabe: Die Anzeige richtet sich nach dem Gerät. Auf Android steht nur
 * Health Connect, auf dem iPhone nur Apple Health, am Rechner nur Garmin —
 * niemand soll eine Anleitung lesen, die auf seinem Gerät nicht funktioniert.
 *
 * Warum eine Exporter-App und nicht die App selbst: VRTX ist eine PWA. Eine
 * Web-App kann Health Connect und Apple Health nicht auslesen, das geht nur
 * über native Berechtigungen. Der Weg ist deshalb: Exporter-App liest die
 * Daten des Handys und schickt sie als JSON an unseren Webhook. Der Schlüssel
 * steckt in der URL, damit man ihn nur einmal eintippen muss.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { api } from '@/src/lib/api';

type Ereignis = {
  empfangen_am: string;
  quelle: string;
  tage: number;
  felder: string[];
  unbekannt: string[];
  fehler: string | null;
};

type Status = {
  verbunden: boolean;
  token: string | null;
  letzterEmpfang: string | null;
  quelle: string | null;
  aktiv: boolean;
  ereignisse: Ereignis[];
};

export type Geraet = 'android' | 'ios' | 'desktop';

/**
 * Gerät erkennen.
 *
 * `desktop` ist der Standard, wenn kein Handy erkannt wird — dort gibt es
 * weder Health Connect noch Apple Health, also bleibt Garmin die einzige
 * Quelle. Ein iPad zählt bewusst zu iOS: Health gibt es dort auch.
 */
export function erkenneGeraet(): Geraet {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** „vor 12 Minuten" aus einem ISO-Zeitstempel. */
function seit(wert: string | null): string {
  if (!wert) return 'noch nie';
  const t = Date.parse(wert);
  if (!Number.isFinite(t)) return 'noch nie';
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std`;
  const tage = Math.round(std / 24);
  if (tage === 1) return 'gestern';
  return `vor ${tage} Tagen`;
}

const QUELLE_LABEL: Record<string, string> = {
  healthconnect: 'Health Connect',
  applehealth: 'Apple Health',
  garmin: 'Garmin',
};

export default function HandyHealthKarte() {
  const geraet = useMemo(erkenneGeraet, []);
  const [status, setStatus] = useState<Status | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [offen, setOffen] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const r = await api<Status>('/api/integrations/health');
      setStatus(r);
    } catch {
      setStatus(null);
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const schluesselAnlegen = async (neu: boolean) => {
    setArbeitet(true);
    setFehler(null);
    try {
      await api('/api/integrations/health/token', {
        method: 'POST',
        body: JSON.stringify({ neu: neu ? 'true' : 'false' }),
      });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Schlüssel konnte nicht angelegt werden.');
    } finally {
      setArbeitet(false);
    }
  };

  const trennen = async () => {
    setArbeitet(true);
    setFehler(null);
    try {
      await api('/api/integrations/health', { method: 'DELETE' });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Abschalten fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  /*
   * Auf dem Rechner gibt es keine Handy-Health-Quelle. Statt eine leere Karte
   * zu zeigen, sagt die Zeile klar, warum hier nichts steht — sonst wirkt es
   * wie ein fehlendes Feature.
   */
  if (geraet === 'desktop') {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-[var(--text-muted)]" />
          <p className="text-[12px] font-semibold text-[var(--foreground)]">Handy-Health</p>
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
          Am Rechner nicht verfügbar — Health Connect und Apple Health gibt es nur auf dem
          Handy. Hier zählt allein Garmin. Öffne die App auf dem Handy, um die Quelle
          einzurichten.
        </p>
      </div>
    );
  }

  const url =
    status?.token && typeof window !== 'undefined'
      ? `${window.location.origin}/api/integrations/health/webhook?key=${status.token}`
      : null;

  const istAndroid = geraet === 'android';
  const appName = istAndroid ? 'HC Webhook' : 'Health Auto Export';
  const plattform = istAndroid ? 'Health Connect' : 'Apple Health';

  const kopieren = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      setFehler('Kopieren ging nicht — bitte die Adresse von Hand übernehmen.');
    }
  };

  const letzteQuelle = status?.quelle ? QUELLE_LABEL[status.quelle] ?? status.quelle : null;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-[var(--simple-accent)]" />
        <p className="text-[12px] font-semibold text-[var(--foreground)]">{plattform}</p>
        {status?.verbunden && status.aktiv && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[var(--simple-accent)]">
            <Check className="h-3 w-3" />
            {status.letzterEmpfang ? seit(status.letzterEmpfang) : 'eingerichtet'}
          </span>
        )}
        {status?.verbunden && !status.aktiv && (
          <span className="ml-auto text-[10px] font-semibold text-[var(--text-muted)]">aus</span>
        )}
      </div>

      <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
        {istAndroid
          ? 'Schritte, Kalorien, Puls, Schlaf und Gewicht direkt vom Handy — deutlich früher als über die Uhr.'
          : 'Schritte, Kalorien, Puls, Schlaf und Gewicht direkt vom iPhone — deutlich früher als über die Uhr.'}
        {' '}
        Sind Garmin und {plattform} beide verbunden, gilt je Wert immer der
        aktuellere Stand.
      </p>

      {laedt ? (
        <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" /> Wird geladen …
        </div>
      ) : !status?.token ? (
        <button
          type="button"
          onClick={() => void schluesselAnlegen(false)}
          disabled={arbeitet}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--simple-accent)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Einrichten
        </button>
      ) : (
        <>
          {/*
            Die Adresse ist der einzige Schritt, den Tim selbst machen muss.
            Deshalb steht sie offen da, sobald eingerichtet ist — kein Klick
            mehr nötig, um sie zu sehen.
          */}
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Adresse für {appName}
            </p>
            <div className="flex items-stretch gap-1.5">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 py-1.5 text-[9.5px] text-[var(--foreground)]">
                {url}
              </code>
              <button
                type="button"
                onClick={() => void kopieren()}
                className="shrink-0 rounded-lg border border-[var(--line)] px-2 py-1.5 text-[var(--text-muted)]"
                aria-label="Adresse kopieren"
              >
                {kopiert ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOffen((v) => !v)}
              className="text-[10.5px] font-semibold text-[var(--simple-accent)]"
            >
              {offen ? 'Anleitung ausblenden' : `So richtest du ${appName} ein`}
            </button>

            {offen && (
              <ol className="ml-3.5 list-decimal space-y-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
                {istAndroid ? (
                  <>
                    <li>
                      Im Play Store <strong>{appName}</strong> installieren, öffnen und die
                      Berechtigungen für Health Connect erteilen.
                    </li>
                    <li>Webhook anlegen und die Adresse von oben als URL eintragen.</li>
                    <li>
                      Als Datenarten Schritte, Kalorien (aktiv und gesamt), Herzfrequenz,
                      Ruhepuls, Schlaf, Gewicht, Körperfett und Sauerstoffsättigung wählen.
                    </li>
                    <li>
                      Sync-Intervall auf 15 oder 30 Minuten stellen — dann kommen die Werte
                      deutlich früher als über die Uhr.
                    </li>
                    <li>Einmal „Test" antippen; hier muss „verbunden" erscheinen.</li>
                  </>
                ) : (
                  <>
                    <li>
                      Im App Store <strong>{appName}</strong> installieren und öffnen.
                    </li>
                    <li>
                      Neue Automation vom Typ „REST API" anlegen und die Adresse von oben als
                      URL eintragen, Export-Format JSON.
                    </li>
                    <li>
                      Datenart „Health Metrics" wählen: Schritte, aktive Energie, Herzfrequenz,
                      Ruhepuls, Schlaf, Gewicht, Körperfett, Sauerstoffsättigung.
                    </li>
                    <li>
                      „Summarize Data" einschalten und als Zeitraster „Days" wählen — sonst
                      kommen Einzelmessungen statt Tageswerten.
                    </li>
                    <li>Sync-Frequenz auf 15 oder 30 Minuten stellen und einmal manuell senden.</li>
                  </>
                )}
              </ol>
            )}
          </div>

          {letzteQuelle && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              Zuletzt empfangen: {letzteQuelle}, {seit(status.letzterEmpfang)}
            </p>
          )}

          {status.ereignisse.length > 0 && (
            <div className="mt-2 space-y-1">
              {status.ereignisse.slice(0, 3).map((e, i) => (
                <p key={`${e.empfangen_am}-${i}`} className="text-[9.5px] text-[var(--text-muted)]">
                  {seit(e.empfangen_am)}: {e.tage} {e.tage === 1 ? 'Tag' : 'Tage'},{' '}
                  {e.felder.length} {e.felder.length === 1 ? 'Feld' : 'Felder'} übernommen
                  {e.unbekannt.length > 0 && `, ${e.unbekannt.length} unbekannt`}
                </p>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => void schluesselAnlegen(true)}
              disabled={arbeitet}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10.5px] font-semibold text-[var(--text-muted)] disabled:opacity-60"
            >
              {arbeitet ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Neuer Schlüssel
            </button>
            {status.aktiv ? (
              <button
                type="button"
                onClick={() => void trennen()}
                disabled={arbeitet}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10.5px] font-semibold text-[var(--text-muted)] disabled:opacity-60"
              >
                <Trash2 className="h-3 w-3" />
                Aus
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void schluesselAnlegen(false)}
                disabled={arbeitet}
                className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10.5px] font-semibold text-[var(--text-muted)] disabled:opacity-60"
              >
                Wieder an
              </button>
            )}
          </div>
        </>
      )}

      {fehler && (
        <p className="mt-2 flex items-start gap-1.5 text-[10.5px] text-[#e06c75]">
          <AlertCircle className="mt-px h-3 w-3 shrink-0" />
          {fehler}
        </p>
      )}
    </div>
  );
}
