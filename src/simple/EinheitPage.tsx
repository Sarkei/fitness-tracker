/**
 * Detailseite einer Einheit — als normale Seite, nicht als Vollbild.
 *
 * Tim will Header und Navigation sehen wie auf jeder anderen Seite. Dafür wird
 * die Route /einheit/:id benutzt; die Seite liegt im normalen Layout.
 *
 * Diagramme statt Einzelwerte: Garmin liefert je Einheit feine Zeitreihen
 * (Puls, Pace, Höhe, Kadenz, Leistung, Body Battery). Die werden hier als
 * Verlauf gezeichnet — aus einer Zahl wie „Puls Ø 170" kann man nichts ablesen,
 * aus dem Verlauf sieht man, wo es hochging.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Clock,
  Heart,
  Loader2,
  MapPin,
  Mountain,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { api } from '@/src/lib/api';

type Punkt = {
  t: number;
  hr?: number;
  speed?: number;
  elevation?: number;
  cadence?: number;
  power?: number;
  bodyBattery?: number;
  temperature?: number;
  distance?: number;
};

type Einheit = {
  id: string;
  name?: string | null;
  type?: string | null;
  date?: string | null;
  start_date_local?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  calories?: number | null;
  total_elevation_gain?: number | null;
  average_speed?: number | null;
  source?: string | null;
};

/** Typbezeichnung auf Deutsch. */
function typLabel(typ?: string | null): string {
  const t = String(typ ?? '').toLowerCase();
  const tabelle: Record<string, string> = {
    running: 'Laufen', trail_running: 'Trailrunning', treadmill_running: 'Laufband',
    walking: 'Gehen', hiking: 'Wandern', cycling: 'Radfahren', indoor_cycling: 'Indoor-Rad',
    swimming: 'Schwimmen', strength_training: 'Krafttraining', cardio_training: 'Cardio',
    yoga: 'Yoga', rowing: 'Rudern', elliptical: 'Crosstrainer', other: 'Sonstige',
  };
  return tabelle[t] ?? (typ ? String(typ) : 'Einheit');
}

function dauerText(sekunden?: number | null): string {
  if (sekunden == null || !Number.isFinite(sekunden) || sekunden <= 0) return '—';
  const h = Math.floor(sekunden / 3600);
  const m = Math.round((sekunden % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function zeitText(sekunden: number): string {
  const m = Math.floor(sekunden / 60);
  const s = Math.round(sekunden % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Liniendiagramm mit Achsenbeschriftung.
 *
 * Bewusst handgebaut statt Bibliothek: die Seite braucht nur Linien, und eine
 * Chart-Bibliothek würde das Bundle für ein paar Kurven um ein Vielfaches
 * vergrößern.
 */
function Linie({
  werte,
  farbe,
  einheit,
  hoehe = 130,
  formatWert,
  xLabels,
  zeiten,
}: {
  werte: Array<number | null>;
  farbe: string;
  einheit?: string;
  hoehe?: number;
  formatWert?: (v: number) => string;
  xLabels?: [string, string];
  /**
   * Zeitmarke je Messpunkt in Sekunden seit Start. Damit lassen sich
   * Zwischenmarkierungen auf der X-Achse beschriften und beim Antippen der
   * genaue Zeitpunkt anzeigen.
   */
  zeiten?: number[];
}) {
  /** Angetippter bzw. ueberfahrener Messpunkt (Index), null wenn keiner. */
  const [aktiv, setAktiv] = useState<number | null>(null);

  const echte = werte.filter((v): v is number => v != null && Number.isFinite(v));
  if (echte.length < 2) {
    return (
      <p className="py-6 text-center text-[11.5px] text-[var(--text-muted)]">
        Für dieses Diagramm liegen keine Werte vor.
      </p>
    );
  }

  const min = Math.min(...echte);
  const max = Math.max(...echte);
  // Etwas Luft, damit die Linie nicht am Rand klebt.
  const polster = (max - min) * 0.1 || Math.max(1, max * 0.05);
  const lo = Math.max(0, min - polster);
  const hi = max + polster;

  const w = 300;
  const h = hoehe;
  const schritt = w / Math.max(1, werte.length - 1);
  const y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * h;

  // Lücken (null) überspringen: der Pfad wird in Abschnitte geteilt.
  const abschnitte: string[] = [];
  let aktuell: string[] = [];
  werte.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (aktuell.length > 1) abschnitte.push(aktuell.join(' '));
      aktuell = [];
      return;
    }
    aktuell.push(`${(i * schritt).toFixed(2)},${y(v).toFixed(2)}`);
  });
  if (aktuell.length > 1) abschnitte.push(aktuell.join(' '));

  const zeige = formatWert ?? ((v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1)));

  /* ---- Zeitachse: Zwischenmarkierungen und Abfrage per Tippen ---- */

  /** Sekunden als m:ss oder h:mm:ss. */
  const alsZeit = (sek: number) => {
    const x = Math.max(0, Math.round(sek));
    const hh = Math.floor(x / 3600);
    const mm = Math.floor((x % 3600) / 60);
    const ss = x % 60;
    return hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${mm}:${String(ss).padStart(2, '0')}`;
  };

  const hatZeiten = Array.isArray(zeiten) && zeiten.length === werte.length;
  /* Vier Marken auf der Zeitachse: Start, zwei Zwischenwerte, Ziel. */
  const marken = hatZeiten
    ? [0, 0.33, 0.66, 1].map((anteil) => {
        const idx = Math.min(werte.length - 1, Math.max(0, Math.round(anteil * (werte.length - 1))));
        return { idx, x: idx * schritt, text: alsZeit(Number(zeiten![idx]) || 0) };
      })
    : [];

  const aktiverIdx = aktiv;
  const aktiverWert = aktiverIdx != null ? werte[aktiverIdx] : null;
  const aktivX = aktiverIdx != null ? aktiverIdx * schritt : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: h, touchAction: 'pan-y' }}
        onPointerMove={(e) => {
          if (!hatZeiten) return;
          const r = e.currentTarget.getBoundingClientRect();
          const anteil = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          setAktiv(Math.round(anteil * (werte.length - 1)));
        }}
        onPointerLeave={() => setAktiv(null)}
        onTouchStart={(e) => {
          if (!hatZeiten) return;
          const t = e.touches[0];
          const r = e.currentTarget.getBoundingClientRect();
          const anteil = Math.min(1, Math.max(0, (t.clientX - r.left) / r.width));
          setAktiv(Math.round(anteil * (werte.length - 1)));
        }}
        onTouchEnd={() => setAktiv(null)}
      >
        {[hi, (hi + lo) / 2, lo].map((linie, i) => (
          <line
            key={i}
            x1={0}
            x2={w}
            y1={y(linie)}
            y2={y(linie)}
            stroke="var(--border-muted)"
            strokeWidth={1}
            strokeDasharray={i === 1 ? '2 3' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Senkrechte Zwischenmarkierungen auf der Zeitachse */}
        {marken.map((m, i) => (
          <line
            key={`m${i}`}
            x1={m.x}
            x2={m.x}
            y1={0}
            y2={h}
            stroke="var(--border-muted)"
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {abschnitte.map((p, i) => (
          <polyline
            key={i}
            points={p}
            fill="none"
            stroke={farbe}
            strokeWidth={1.8}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Fadenkreuz am angetippten Punkt mit Wert */}
        {aktiverWert != null && Number.isFinite(aktiverWert) && (
          <>
            <line
              x1={aktivX}
              x2={aktivX}
              y1={0}
              y2={h}
              stroke={farbe}
              strokeWidth={1}
              opacity={0.85}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={aktivX}
              cy={y(aktiverWert)}
              r={3}
              fill={farbe}
              stroke="var(--card-bg)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Achsenwerte rechts, damit nichts verdeckt wird */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between pl-1 text-[9px] leading-none text-[var(--text-muted)]"
        style={{ height: h }}
      >
        <span>{zeige(hi)}{einheit ? ` ${einheit}` : ''}</span>
        <span className="opacity-70">{zeige((hi + lo) / 2)}</span>
        <span>{zeige(lo)}{einheit ? ` ${einheit}` : ''}</span>
      </div>

      {/* Wert und Zeitpunkt des angetippten Punkts */}
      {aktiverWert != null && Number.isFinite(aktiverWert) && (
        <div className="pointer-events-none absolute left-0 top-0 rounded-md bg-[var(--card-bg)]/95 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
          {zeige(aktiverWert)}
          {einheit ? ` ${einheit}` : ''}
          {hatZeiten ? ` · ${alsZeit(Number(zeiten![aktiverIdx!]) || 0)}` : ''}
        </div>
      )}

      {/* Zeitachse: vier Marken, damit man weiss, wann was passiert ist */}
      {marken.length > 0 ? (
        <div className="relative mt-1 h-3 text-[9px] tabular-nums text-[var(--text-muted)]">
          {marken.map((m, i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2"
              style={{ left: `${(m.idx / Math.max(1, werte.length - 1)) * 100}%` }}
            >
              {m.text}
            </span>
          ))}
        </div>
      ) : (
        xLabels && (
          <div className="mt-1 flex justify-between text-[9px] text-[var(--text-muted)]">
            <span>{xLabels[0]}</span>
            <span>{xLabels[1]}</span>
          </div>
        )
      )}
    </div>
  );
}

/** Kachel für einen Kennwert. */
function Wert({ label, wert, einheit }: { label: string; wert: string; einheit?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tabular-nums">
        {wert}
        {einheit && <span className="ml-0.5 text-[11px] font-normal text-[var(--text-muted)]">{einheit}</span>}
      </p>
    </div>
  );
}

export default function EinheitPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [einheit, setEinheit] = useState<Einheit | null>(null);
  const [punkte, setPunkte] = useState<Punkt[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);

    // Einheit aus der Liste holen (dort stehen die Kennzahlen) und parallel die Zeitreihen.
    Promise.all([
      api<{ aktivitaeten?: Einheit[] }>('/api/integrations/garmin/activities?limit=60').then(
        (r) => (Array.isArray(r.aktivitaeten) ? r.aktivitaeten.find((e) => e.id === id) : undefined) ?? null,
      ),
      api<{ punkte?: Punkt[] }>(`/api/integrations/garmin/activities/${encodeURIComponent(id)}/timeseries`).catch(
        () => ({ punkte: [] as Punkt[] }),
      ),
    ])
      .then(([e, ts]) => {
        if (abgebrochen) return;
        setEinheit(e);
        setPunkte(Array.isArray(ts.punkte) ? ts.punkte : []);
        if (!e) setFehler('Diese Einheit wurde nicht gefunden.');
      })
      .catch((err) => {
        if (!abgebrochen) setFehler(err instanceof Error ? err.message : 'Einheit konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [id]);

  /** Zeitachse in Minuten für die Beschriftung. */
  const zeitraum = useMemo(() => {
    if (punkte.length < 2) return undefined;
    return [zeitText(punkte[0].t), zeitText(punkte[punkte.length - 1].t)] as [string, string];
  }, [punkte]);

  /** Zeitmarke je Messpunkt in Sekunden — Grundlage der X-Achse. */
  const zeiten = useMemo(() => punkte.map((p) => Number(p.t) || 0), [punkte]);
  const puls = useMemo(() => punkte.map((p) => p.hr ?? null), [punkte]);
  const pace = useMemo(
    () => punkte.map((p) => (p.speed && p.speed > 0.3 ? 1000 / (p.speed * 60) : null)),
    [punkte],
  );
  const hoehe = useMemo(() => punkte.map((p) => p.elevation ?? null), [punkte]);
  const kadenz = useMemo(() => punkte.map((p) => p.cadence ?? null), [punkte]);
  const leistung = useMemo(() => punkte.map((p) => p.power ?? null), [punkte]);
  const akku = useMemo(() => punkte.map((p) => p.bodyBattery ?? null), [punkte]);

  const hat = (reihe: Array<number | null>) => reihe.filter((v) => v != null).length >= 2;

  const distanzKm = einheit?.distance ? einheit.distance / 1000 : null;
  const dauerSek = einheit?.moving_time ?? einheit?.elapsed_time ?? null;
  const tempoWert =
    einheit?.distance && dauerSek
      ? (() => {
          const sekProKm = dauerSek / (einheit.distance! / 1000);
          return `${Math.floor(sekProKm / 60)}:${String(Math.round(sekProKm % 60)).padStart(2, '0')} min/km`;
        })()
      : null;

  const datum = einheit?.start_date_local ?? einheit?.date ?? null;
  const datumText = datum
    ? new Date(String(datum).length <= 10 ? `${datum}T12:00:00` : String(datum)).toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';

  if (laedt) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Einheit wird geladen …
      </div>
    );
  }

  if (fehler || !einheit) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--simple-accent)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück
        </button>
        <p className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-muted)]">
          {fehler ?? 'Einheit nicht gefunden.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Kopf wie auf jeder anderen Seite */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Activity className="h-3 w-3" />
            {typLabel(einheit.type)}
            {einheit.source === 'garmin' && <span className="normal-case tracking-normal">· von der Uhr</span>}
          </p>
          <h1 className="mt-0.5 truncate text-[22px] font-semibold text-[var(--foreground)]">
            {einheit.name || typLabel(einheit.type)}
          </h1>
          <p className="text-[12px] text-[var(--text-muted)]">{datumText}</p>
        </div>
        <Link
          to="/training"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück zum Training
        </Link>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {distanzKm != null && <Wert label="Distanz" wert={distanzKm.toFixed(2)} einheit="km" />}
        <Wert label="Dauer" wert={dauerText(dauerSek)} />
        {tempoWert && <Wert label="Pace" wert={tempoWert} />}
        {einheit.avg_hr != null && <Wert label="Puls Ø" wert={String(Math.round(einheit.avg_hr))} einheit="bpm" />}
        {einheit.max_hr != null && <Wert label="Puls max." wert={String(Math.round(einheit.max_hr))} einheit="bpm" />}
        {einheit.calories != null && <Wert label="Kalorien" wert={String(Math.round(einheit.calories))} einheit="kcal" />}
        {einheit.total_elevation_gain != null && (
          <Wert label="Aufstieg" wert={String(Math.round(einheit.total_elevation_gain))} einheit="m" />
        )}
      </div>

      {/* Diagramme */}
      <div className="space-y-3">
        {hat(puls) && (
          <section className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Heart className="h-3.5 w-3.5 text-[#dc5a4a]" /> Herzfrequenz
            </p>
            <Linie werte={puls} farbe="#dc5a4a" einheit="bpm" xLabels={zeitraum} zeiten={zeiten} />
          </section>
        )}

        {hat(pace) && (
          <section className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--simple-accent)]" /> Pace
            </p>
            {/* Pace: kleinere Zahl ist schneller — deshalb umgekehrte Achse über formatWert */}
            <Linie
              werte={pace}
              farbe="var(--simple-accent)"
              einheit="min/km"
              xLabels={zeitraum}
              formatWert={(v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`}
            />
          </section>
        )}

        {hat(hoehe) && (
          <section className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Mountain className="h-3.5 w-3.5 text-[#9cc7ae]" /> Höhenprofil
            </p>
            <Linie werte={hoehe} farbe="#9cc7ae" einheit="m" xLabels={zeitraum} zeiten={zeiten} />
          </section>
        )}

        {hat(kadenz) && (
          <section className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Clock className="h-3.5 w-3.5 text-[#4d9f6b]" /> Kadenz
            </p>
            <Linie werte={kadenz} farbe="#4d9f6b" einheit="spm" xLabels={zeitraum} zeiten={zeiten} />
          </section>
        )}

        {hat(leistung) && (
          <section className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Zap className="h-3.5 w-3.5 text-[#d98a2b]" /> Leistung
            </p>
            <Linie werte={leistung} farbe="#d98a2b" einheit="W" xLabels={zeitraum} zeiten={zeiten} />
          </section>
        )}

        {hat(akku) && (
          <section className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)]" /> Body Battery
            </p>
            <Linie werte={akku} farbe="var(--text-muted)" einheit="%" xLabels={zeitraum} zeiten={zeiten} />
          </section>
        )}

        {!hat(puls) && !hat(pace) && (
          <p className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-5 text-[12.5px] text-[var(--text-muted)]">
            Für diese Einheit hat die Uhr keine Zeitreihen aufgezeichnet — Diagramme brauchen
            Messwerte im Verlauf, nicht nur einen Durchschnitt.
          </p>
        )}
      </div>
    </div>
  );
}
