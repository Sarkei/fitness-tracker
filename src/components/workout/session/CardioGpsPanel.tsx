import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Square, Timer, MapPin, Heart, Zap, MessageSquare, Check, X, Navigation } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import type { Exercise } from '@/src/types';
import { inferGpsActivityType, getDistanceInKm, exerciseSupportsGpsTracking } from '@/src/lib/gpsCardio';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function calcPace(distanceKm: number, seconds: number): string {
  if (!distanceKm || distanceKm <= 0) return '—';
  const secsPerKm = seconds / distanceKm;
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

function RecenterMap({ route }: { route: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length > 0) map.setView(route[route.length - 1]);
  }, [route, map]);
  return null;
}

export interface CardioGpsResult {
  minutes: number;
  distanceKm: number;
  routeData?: [number, number][];
  heartRateAvg?: number;
  rpe?: number;
  sessionNotes?: string;
}

export default function CardioGpsPanel({
  exercise,
  onSave,
  onClose,
}: {
  exercise: Exercise;
  onSave: (result: CardioGpsResult) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const actType = inferGpsActivityType(exercise);
  const showMap = exerciseSupportsGpsTracking(exercise);
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [gpsDistance, setGpsDistance] = useState(0);
  const [manualDistance, setManualDistance] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');

  useEffect(() => {
    if (phase !== 'running' || paused) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase, paused]);

  useEffect(() => {
    let watchId: number;
    if (phase === 'running' && !paused && showMap && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          setRoute(prev => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              const dist = getDistanceInKm(last[0], last[1], latitude, longitude);
              if (dist > 0.005) {
                setGpsDistance(d => d + dist);
                return [...prev, [latitude, longitude]];
              }
              return prev;
            }
            return [[latitude, longitude]];
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
      );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [phase, paused, showMap]);

  const submit = () => {
    const minutes = Math.max(1, Math.round(elapsed / 60));
    const distanceKm = parseFloat(manualDistance) || gpsDistance || 0;
    onSave({
      minutes,
      distanceKm,
      routeData: route.length > 1 ? route : undefined,
      heartRateAvg: heartRate ? parseInt(heartRate, 10) : undefined,
      rpe: rpe ?? undefined,
      sessionNotes: sessionNotes || undefined,
    });
  };

  if (phase === 'ready') {
    return (
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">{t('workout.session.gps.title')}</p>
        <p className="text-xs text-neutral-400">{exercise.name}</p>
        <button
          type="button"
          onClick={() => setPhase('running')}
          className="w-full min-h-[48px] rounded-xl bg-orange-500 text-white font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
        >
          <Play size={18} fill="white" /> {t('workout.session.gps.start')}
        </button>
        <button type="button" onClick={onClose} className="w-full text-[10px] text-neutral-500 uppercase font-bold">
          {t('workout.session.gps.manualOnly')}
        </button>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div className="rounded-2xl border border-orange-500/40 overflow-hidden bg-neutral-950">
        {showMap && (
          <div className="h-48 w-full relative">
            <MapContainer
              center={route.length ? route[route.length - 1] : [51.16, 10.45]}
              zoom={16}
              className="w-full h-full"
              zoomControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              {route.length > 0 && (
                <>
                  <Polyline positions={route} color="#f97316" weight={4} />
                  <Marker position={route[route.length - 1]} icon={customIcon} />
                  <RecenterMap route={route} />
                </>
              )}
            </MapContainer>
          </div>
        )}
        <div className="p-4 space-y-3">
          <p className="text-3xl font-black tabular-nums text-center">{formatTime(elapsed)}</p>
          {showMap && (
            <p className="text-center text-brand font-black tabular-nums">{gpsDistance.toFixed(2)} km</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaused(p => !p)}
              className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 text-[10px] font-black uppercase"
            >
              {paused ? t('cardio.resume') : t('cardio.pause')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('done');
                setManualDistance(gpsDistance > 0 ? gpsDistance.toFixed(2) : '');
              }}
              className="flex-1 min-h-[44px] rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase flex items-center justify-center gap-1"
            >
              <Square size={14} /> {t('cardio.finish')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-4 space-y-3">
      <p className="text-[10px] font-black uppercase text-brand">{t('cardio.done.title')}</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-neutral-950 rounded-xl p-3">
          <p className="text-xl font-black tabular-nums">{formatTime(elapsed)}</p>
        </div>
        <div className="bg-neutral-950 rounded-xl p-3">
          <input
            type="number"
            step="0.1"
            value={manualDistance}
            onChange={e => setManualDistance(e.target.value)}
            className="w-full text-center text-xl font-black bg-transparent text-white"
            placeholder="km"
          />
        </div>
      </div>
      <div className="flex gap-1">
        {[1, 3, 5, 8, 10].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setRpe(n)}
            className={cn(
              'flex-1 h-10 rounded-lg font-black text-sm',
              rpe === n ? 'ui-mark-selected' : 'bg-neutral-950 text-neutral-500',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        className="w-full min-h-[48px] ui-btn-brand rounded-xl font-black uppercase text-[10px]"
      >
        <Check size={16} className="inline mr-1" /> {t('workout.session.gps.apply')}
      </button>
    </div>
  );
}
