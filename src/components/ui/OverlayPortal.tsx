import type { ReactNode } from 'react';
import { overlayPortal } from '@/src/lib/mobileViewport';

/** Mountet Kinder auf `document.body` (über Mobile-Tab-Bar). */
export default function OverlayPortal({ children }: { children: ReactNode }) {
  return <>{overlayPortal(children)}</>;
}
