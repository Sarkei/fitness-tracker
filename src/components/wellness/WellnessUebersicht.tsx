/**
 * Wellness: Übersicht: nur die Tageslage.
 * Schlaf der letzten Nacht, Schritte heute, Form — ein Bild, kein Detail.
 */

import { useState } from 'react';
import { Moon, Footprints, Heart, Activity, ChevronRight, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/src/simple/ui';
import { useWellness, WellnessAktualisieren } from './WellnessProvider';
import { KennzahlSheet, KlickKachel, type KennzahlDef, type KennzahlPunkt } from './KennzahlSheet';
import { Tagesdetail } from './Tagesdetail';
import EinheitDetailModal, { type EinheitDaten } from './EinheitDetailModal';
import { formLabel, heuteWert, juengsterTag, schlafBewertung, schlafStunden } from '@/src/lib/wellness';

type Kennzahl = { def: KennzahlDef; punkte: KennzahlPunkt[] };

export default function WellnessUebersicht() {
  const { daten } = useWellness();
  const navigate = useNavigate();
  const tage = daten.tage;
  const [offen, setOffen] = useState<string | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);
  const [einheitOffen, setEinheitOffen] = useState<EinheitDaten | null>(null);

  // Bewusst nur der heutige Tag: fehlt ein Wert, steht „—" statt eines alten Stands.
  const schlafLetzte = schlafStunden(heuteWert(tage, 'sleepSecs'));
  const schlafScore = heuteWert(tage, 'sleepScore');
  const schritte = heuteWert(tage, 'steps');
  const hrv = heuteWert(tage, 'hrv');
  const puls = heuteWert(tage, 'restingHr');
  const tsb = heuteWert(tage, 'tsb');
  const form = formLabel(tsb);

  // Werte, die nur Garmin liefert — Intervals.icu gibt sie nicht her. Die Kacheln
  // erscheinen deshalb nur, wenn die Quelle sie wirklich hat.
  const stress = heuteWert(tage, 'stress');
  const bodyBattery = heuteWert(tage, 'bodyBatteryMax');
  const spo2 = heuteWert(tage, 'spo2');
  const atem = heuteWert(tage, 'respiration');
  const vo2 = heuteWert(tage, 'vo2max');
  const fitnessAlter = heuteWert(tage, 'fitnessAge');
  const gewicht = heuteWert(tage, 'weight');
  const etagen = heuteWert(tage, 'floors');

  const formFarbe =
    form.tone === 'gut'
      ? 'var(--simple-accent)'
      : form.tone === 'mittel'
        ? '#d98a2b'
        : form.tone === 'schlecht'
          ? '#dc5a4a'
          : 'var(--text-muted)';

  const naechsteEinheit = daten.aktivitaeten[0];

  /**
   * Kommen die Werte wirklich von heute? Wenn die Quelle seit Tagen nichts liefert,
   * steht in den Kacheln „—". Dann muss hier stehen, warum — sonst wirkt es wie ein Fehler.
   */
  const letzterTag = juengsterTag(tage);
  const heuteIso = new Date().toISOString().slice(0, 10);
  // Entscheidend ist nicht, ob es einen heutigen Eintrag gibt (Schritte kommen oft
  // allein), sondern ob die Körperwerte von heute fehlen.
  const koerperWerteFehlen = hrv == null && schlafLetzte == null && puls == null;
  const werteVeraltet = Boolean(letzterTag);
  // Letzter Tag, an dem es wirklich Körperwerte gab.
  const letzterKoerperTag =
    [...tage].reverse().find((t) => t.hrv != null || t.sleepSecs != null || t.restingHr != null)?.date ?? null;

  // Jede Kachel ist anklickbar und oeffnet den Verlauf dazu.
  const kennzahlen: Record<string, Kennzahl> = {
    schlaf: {
      def: { key: 'schlaf', titel: 'Schlafdauer', einheit: 'h', format: (v) => v.toFixed(1), hoeherBesser: true,
        hinweis: 'Nacht für Nacht. Unter 7 Stunden gilt als zu kurz.' },
      punkte: tage.map((t) => ({ datum: t.date, wert: schlafStunden(t.sleepSecs) })),
    },
    schritte: {
      def: { key: 'schritte', titel: 'Schritte', format: (v) => Math.round(v).toLocaleString('de-DE'), hoeherBesser: true,
        hinweis: 'Alltagsbewegung pro Tag.' },
      punkte: tage.map((t) => ({ datum: t.date, wert: t.steps ?? null })),
    },
    hrv: {
      def: { key: 'hrv', titel: 'HRV', einheit: 'ms', hoeherBesser: true,
        hinweis: 'Herzfrequenzvariabilität. Sinkt sie über Tage, fehlt Erholung.' },
      punkte: tage.map((t) => ({ datum: t.date, wert: t.hrv ?? null })),
    },
    puls: {
      def: { key: 'puls', titel: 'Ruhepuls', einheit: 'bpm', hoeherBesser: false,
        hinweis: 'Steigt er bei gleicher Belastung, ist das ein Ermüdungszeichen.' },
      punkte: tage.map((t) => ({ datum: t.date, wert: t.restingHr ?? null })),
    },
    form: {
      def: { key: 'form', titel: 'Trainingsform (TSB)', format: (v) => String(Math.round(v)), hoeherBesser: true,
        hinweis: 'Fitness minus Ermüdung. Über 5 heißt frisch, unter -30 überlastet.' },
      punkte: tage.map((t) => ({ datum: t.date, wert: t.tsb ?? null })),
    },
  };

  return (
    <div className="space-y-4">
      {/* Tageslage: Kopf links, Aktualisieren rechts */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Heute
        </p>
        <WellnessAktualisieren />
      </div>

      {/*
       * Alle Kacheln gleich aufgebaut: oben die Beschreibung, darunter der Wert.
       * Früher hingen Etagen, Fitnessalter, Schlafscore und Atemfrequenz als
       * Untertext an einer anderen Kachel — jetzt hat jeder Wert sein eigenes Feld.
       */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KlickKachel
          label="Schlaf"
          value={schlafLetzte ?? '—'}
          unit="h"
          onClick={() => navigate('/wellness/schlaf')}
        />
        <KlickKachel
          label="Schlafscore"
          value={schlafScore != null ? Math.round(schlafScore) : '—'}
          onClick={() => navigate('/wellness/schlaf')}
        />
        <KlickKachel
          label="Schritte"
          value={schritte != null ? Math.round(schritte).toLocaleString('de-DE') : '—'}
          onClick={() => navigate('/wellness/bewegung')}
        />
        <KlickKachel
          label="Etagen"
          value={etagen != null ? Math.round(etagen) : '—'}
          onClick={() => navigate('/wellness/bewegung')}
        />
        <KlickKachel
          label="HRV"
          value={hrv != null ? Math.round(hrv) : '—'}
          unit="ms"
          onClick={() => navigate('/wellness/koerper')}
        />
        <KlickKachel
          label="Ruhepuls"
          value={puls != null ? Math.round(puls) : '—'}
          unit="bpm"
          onClick={() => navigate('/wellness/koerper')}
        />
        <KlickKachel
          label="Stress"
          value={stress != null ? Math.round(stress) : '—'}
          onClick={() => navigate('/wellness/koerper')}
        />
        <KlickKachel
          label="Body Battery"
          value={bodyBattery != null ? Math.round(bodyBattery) : '—'}
          onClick={() => navigate('/wellness/koerper')}
        />
        <KlickKachel
          label="Sauerstoff"
          value={spo2 != null ? Math.round(spo2) : '—'}
          unit="%"
          onClick={() => navigate('/wellness/koerper')}
        />
        <KlickKachel
          label="Atemfrequenz"
          value={atem != null ? Math.round(atem) : '—'}
          unit="/min"
          onClick={() => navigate('/wellness/koerper')}
        />
        {/* Verbrauch heute — Garmin-Gesamtwert, waechst ueber den Tag. */}
        <KlickKachel
          label="Verbrauch"
          value={
            (() => {
              const t = [...tage].reverse().find((x) => x.totalCalories != null && x.totalCalories > 0);
              return t?.totalCalories != null ? Math.round(t.totalCalories).toLocaleString('de-DE') : '—';
            })()
          }
          unit="kcal"
          hint={
            (() => {
              const t = [...tage].reverse().find((x) => x.totalCalories != null && x.totalCalories > 0);
              const aktiv = t?.activeCalories != null ? Math.round(t.activeCalories) : null;
              return aktiv != null ? `${aktiv} aktiv` : undefined;
            })()
          }
          onClick={() => navigate('/wellness/kalorien')}
        />
        <KlickKachel
          label="VO₂max"
          value={vo2 != null ? Math.round(vo2) : '—'}
          onClick={() => navigate('/wellness/form')}
        />
        <KlickKachel
          label="Fitnessalter"
          value={fitnessAlter != null ? Math.round(fitnessAlter) : '—'}
          unit="Jahre"
          onClick={() => navigate('/wellness/form')}
        />
        {gewicht != null && (
          <KlickKachel label="Gewicht" value={gewicht} unit="kg" onClick={() => navigate('/wellness/koerper')} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/wellness/form')}
          className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-left transition hover:border-[var(--simple-accent)]"
        >
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Trainingsform
          </p>
          <p className="mt-1 text-[18px] font-semibold capitalize leading-none" style={{ color: formFarbe }}>
            {form.text}
          </p>
          <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
            {tsb != null ? `TSB ${Math.round(tsb)}` : 'keine Daten'}
          </p>
        </button>
        <Link
          to="/wellness/form"
          className="flex items-center gap-2 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-[12.5px] font-semibold text-[var(--foreground)] transition hover:border-[var(--simple-accent)]"
        >
          Belastung
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
        </Link>
      </div>

      {naechsteEinheit && (
        <div
          role="button"
          tabIndex={0}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-5 transition hover:border-[var(--simple-accent)]"
          onClick={() => navigate(`/einheit/${encodeURIComponent(String((naechsteEinheit as { id?: string }).id ?? ''))}`)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              navigate(`/einheit/${encodeURIComponent(String((naechsteEinheit as { id?: string }).id ?? ''))}`);
            }
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Letzte Einheit
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[var(--foreground)]">
              {naechsteEinheit.name ?? naechsteEinheit.type ?? 'Einheit'}
            </p>
            <p className="text-[11.5px] text-[var(--text-muted)]">
              {String(naechsteEinheit.start_date_local ?? '').slice(0, 10)} ·{' '}
              {naechsteEinheit.distance ? `${(naechsteEinheit.distance / 1000).toFixed(1)} km` : ''}{' '}
              {naechsteEinheit.moving_time ? `· ${Math.round(naechsteEinheit.moving_time / 60)} min` : ''}
            </p>
          </div>
          <Link
            to="/wellness/aktivitaeten"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--simple-accent)]"
          >
            Alle <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { to: '/wellness/schlaf', label: 'Schlaf', icon: Moon },
          { to: '/wellness/aktivitaeten', label: 'Aktivitäten', icon: Activity },
          { to: '/wellness/koerper', label: 'Herz & Körper', icon: Heart },
          { to: '/wellness/bewegung', label: 'Bewegung', icon: Footprints },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-xl border border-[var(--border-muted)] px-3 py-3 text-[12.5px] font-semibold text-[var(--foreground)] transition hover:border-[var(--simple-accent)]"
          >
            <Icon className="h-4 w-4 text-[var(--simple-accent)]" />
            {label}
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
          </Link>
        ))}
      </div>

      {offen && kennzahlen[offen] && (
        <KennzahlSheet
          def={kennzahlen[offen].def}
          punkte={kennzahlen[offen].punkte}
          onClose={() => setOffen(null)}
          onTag={(datum) => setTagOffen(datum)}
        />
      )}

      {tagOffen && (() => {
        const t = tage.find((x) => x.date === tagOffen);
        return t ? (
          <Tagesdetail tag={t} aktivitaeten={daten.aktivitaeten} onClose={() => setTagOffen(null)} />
        ) : null;
      })()}

      {koerperWerteFehlen && werteVeraltet && (
        <div className="flex items-start gap-2 rounded-xl bg-[#fbbf24]/10 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a16207]" />
          <p className="text-[11px] leading-relaxed text-[#a16207]">
            Für heute liegen noch keine Schlaf-, HRV- oder Pulsdaten vor. Letzter Stand:{' '}
            {letzterKoerperTag ? letzterKoerperTag.split('-').reverse().slice(0, 2).join('.') : 'unbekannt'}.
            Sobald deine Uhr die Nacht synchronisiert hat, erscheinen sie hier.
          </p>
        </div>
      )}

      {daten.nichtVerfuegbar.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--surface-gray)] px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            {daten.quelle === 'garmin'
              ? `Deine Uhr liefert ${daten.nichtVerfuegbar.join(', ')} nicht — für diese Werte misst das Gerät nicht.`
              : `Intervals.icu gibt ${daten.nichtVerfuegbar.join(', ')} nicht weiter — verbinde Garmin im Profil für diese Werte.`}
          </p>
        </div>
      )}

      <EinheitDetailModal einheit={einheitOffen} onClose={() => setEinheitOffen(null)} />
    </div>
  );
}
