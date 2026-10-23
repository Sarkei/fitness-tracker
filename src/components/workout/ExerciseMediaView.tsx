/**
 * Übungs-Medien mit Fallback-Kette (Video → Bild/GIF) und optionalem Server-Proxy.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import {
  exerciseMediaProxyUrl,
  isAllowedExerciseMediaUrl,
  pickExerciseDisplayMedia,
} from '@/src/lib/exerciseMedia';

type MediaKind = 'video' | 'image';

function looksLikeVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || url.includes('/videos/');
}

export default function ExerciseMediaView({
  exercise,
  gender,
  className = 'w-full max-h-56 object-contain rounded-2xl bg-black/40',
}: {
  exercise: LibraryExercise;
  gender?: 'male' | 'female' | 'other';
  className?: string;
}) {
  const candidates = useMemo(() => {
    const m = pickExerciseDisplayMedia(exercise, gender);
    const list: { kind: MediaKind; url: string }[] = [];
    if (m.videoUrl && looksLikeVideoUrl(m.videoUrl)) {
      list.push({ kind: 'video', url: m.videoUrl });
    }
    if (m.gifUrl) list.push({ kind: 'image', url: m.gifUrl });
    if (m.imageUrl && m.imageUrl !== m.gifUrl) list.push({ kind: 'image', url: m.imageUrl });
    return list;
  }, [exercise.key, exercise.gifUrl, exercise.imageUrl, exercise.videoUrl, gender]);

  const [index, setIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(false);

  useEffect(() => {
    setIndex(0);
    setUseProxy(false);
  }, [exercise.key, candidates.length]);

  const current = candidates[index];
  if (!current) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl bg-[var(--background)] text-[var(--text-muted)]">
        <Dumbbell size={32} />
      </div>
    );
  }

  const src = useProxy && isAllowedExerciseMediaUrl(current.url)
    ? exerciseMediaProxyUrl(current.url)
    : current.url;

  const onFail = () => {
    if (!useProxy && isAllowedExerciseMediaUrl(current.url)) {
      setUseProxy(true);
      return;
    }
    if (index + 1 < candidates.length) {
      setIndex(i => i + 1);
      setUseProxy(false);
      return;
    }
    setIndex(candidates.length);
  };

  if (index >= candidates.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl bg-[var(--background)] text-[var(--text-muted)]">
        <Dumbbell size={32} />
      </div>
    );
  }

  if (current.kind === 'video') {
    return (
      <video
        key={`${src}-v`}
        src={src}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        controls
        onError={onFail}
      />
    );
  }

  return (
    <img
      key={`${src}-i`}
      src={src}
      alt=""
      className={className}
      loading="lazy"
      onError={onFail}
    />
  );
}
