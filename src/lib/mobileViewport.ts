import { useEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/src/lib/utils';
import { isStandalonePwa } from '@/src/lib/isStandalonePwa';

/**
 * Dynamische Browser-Leiste (Safari/Chrome Mobile): Tab-Bar an sichtbaren Viewport binden.
 * In installierter PWA (Home-Bildschirm): immer `bottom: 0` + safe-area — kein vv-Offset.
 */

let lastBottom = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let standalonePinTimer: ReturnType<typeof setTimeout> | null = null;

function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  return el.getAttribute('contenteditable') === 'true';
}

function hasMobileOverlayOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    overlayScrollLockCount > 0 ||
    document.documentElement.classList.contains('mobile-overlay-open')
  );
}

/** iOS PWA: kurzer Scroll-Offset lässt `position:fixed` unten „schweben“. */
function pinStandaloneBottomChrome(): void {
  if (!isStandalonePwa() || typeof window === 'undefined') return;
  if (hasMobileOverlayOpen() || isEditableFocused()) return;
  if (window.scrollY > 0 || (window.visualViewport?.offsetTop ?? 0) > 0) {
    resetScrollAncestors();
  }
  forceMobileViewportInsetsReset();
}

function scheduleStandaloneBottomPin(): void {
  if (!isStandalonePwa()) return;
  if (standalonePinTimer != null) clearTimeout(standalonePinTimer);
  standalonePinTimer = setTimeout(() => {
    standalonePinTimer = null;
    pinStandaloneBottomChrome();
  }, 50);
}

function applyInsets(top: number, height: number) {
  const root = document.documentElement;
  // Tab-Bar bleibt immer am physischen unteren Rand — kein vv-bottom-Lift (Safari-Jitter nach Modals).
  root.style.setProperty('--vv-bottom-inset', '0px');
  root.style.setProperty('--vv-top-inset', `${top}px`);
  root.style.setProperty('--vv-height', `${height}px`);
  // --mobile-quick-sheet-bottom kommt aus CSS (:root / html.mobile-overlay-open) —
  // kein Inline-Override, sonst gewinnt die Tab-Bar-Höhe auch bei offener Overlay-Klasse.
  root.style.removeProperty('--mobile-quick-sheet-bottom');
}

function syncMobileViewportInsets(force = false): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const standalone = isStandalonePwa();
  root.classList.toggle('app-standalone-pwa', standalone);
  root.style.setProperty('--app-standalone', standalone ? '1' : '0');

  if (standalone || root.classList.contains('workout-session-active')) {
    lastBottom = 0;
    applyInsets(0, window.innerHeight);
    return;
  }

  const vv = window.visualViewport;
  if (!vv) {
    lastBottom = 0;
    applyInsets(0, window.innerHeight);
    return;
  }

  const bottom = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  const top = Math.max(0, Math.round(vv.offsetTop));
  const height = Math.round(vv.height);

  // Nur noch für Workout-Player-Höhe relevant — Tab-Bar nutzt bottom:0 (CSS).
  if (!force && bottom === 0 && lastBottom > 0) {
    lastBottom = 0;
    applyInsets(top, height);
    return;
  }

  if (!force && Math.abs(bottom - lastBottom) < 28 && bottom > 0 && lastBottom > 0) {
    return;
  }

  lastBottom = bottom;
  applyInsets(top, height);
}

function scheduleViewportSync(force = false): void {
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncMobileViewportInsets(force);
  }, 80);
}

/** Tab-Leiste wieder an den unteren Bildschirmrand (nach Modal / Tracken). */
export function forceMobileViewportInsetsReset(): void {
  if (typeof window === 'undefined') return;
  lastBottom = 0;
  const root = document.documentElement;
  root.style.setProperty('--vv-bottom-inset', '0px');
  syncMobileViewportInsets(true);
  window.requestAnimationFrame(() => {
    root.style.setProperty('--vv-bottom-inset', '0px');
    syncMobileViewportInsets(true);
  });
  scheduleViewportSync(true);
  window.setTimeout(() => {
    root.style.setProperty('--vv-bottom-inset', '0px');
    syncMobileViewportInsets(true);
  }, 120);
  window.setTimeout(() => {
    root.style.setProperty('--vv-bottom-inset', '0px');
    syncMobileViewportInsets(true);
  }, 360);
}

export function initMobileViewportInsets(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onChange = () => {
    scheduleViewportSync(false);
    if (isStandalonePwa()) scheduleStandaloneBottomPin();
  };
  const onVvScroll = () => {
    if (isStandalonePwa()) scheduleStandaloneBottomPin();
  };
  const onTouchEnd = () => {
    if (isStandalonePwa()) scheduleStandaloneBottomPin();
  };

  syncMobileViewportInsets(true);
  window.visualViewport?.addEventListener('resize', onChange);
  window.visualViewport?.addEventListener('scroll', onVvScroll);
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  document.addEventListener('touchend', onTouchEnd, { passive: true });

  const displayMq = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
  const onDisplayMode = () => syncMobileViewportInsets(true);
  displayMq.addEventListener?.('change', onDisplayMode);
  displayMq.addListener?.(onDisplayMode);

  return () => {
    if (debounceTimer != null) clearTimeout(debounceTimer);
    if (standalonePinTimer != null) clearTimeout(standalonePinTimer);
    window.visualViewport?.removeEventListener('resize', onChange);
    window.visualViewport?.removeEventListener('scroll', onVvScroll);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    document.removeEventListener('touchend', onTouchEnd);
    displayMq.removeEventListener?.('change', onDisplayMode);
    displayMq.removeListener?.(onDisplayMode);
    const root = document.documentElement;
    root.classList.remove('app-standalone-pwa');
    root.style.removeProperty('--vv-bottom-inset');
    root.style.removeProperty('--vv-top-inset');
    root.style.removeProperty('--vv-height');
    root.style.removeProperty('--app-standalone');
    root.style.removeProperty('--mobile-quick-sheet-bottom');
    lastBottom = 0;
  };
}

/**
 * iOS / Mobile: Scroll-Offsets nach Overlays, Tastatur oder Routenwechsel zurücksetzen,
 * damit `position: fixed` (z. B. Tab-Bar) nicht „mitwandert“.
 */
export function resetScrollAncestors(): void {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  const docEl = document.documentElement;
  const body = document.body;
  docEl.scrollTop = 0;
  docEl.scrollLeft = 0;
  body.scrollTop = 0;
  body.scrollLeft = 0;
  const root = document.getElementById('root');
  if (root) {
    root.scrollTop = 0;
    root.scrollLeft = 0;
  }
  const main = document.querySelector('main');
  if (main instanceof HTMLElement) {
    main.scrollTop = 0;
    main.scrollLeft = 0;
  }
}

/** Nach Modals / Tastatur: Viewport-Inset stabilisieren — kein Scroll-Jump zum Seitenanfang. */
export function resetMobileChromeAfterOverlay(): void {
  forceMobileViewportInsetsReset();
  scheduleStandaloneBottomPin();
}

/** Nach Routenwechsel: Scroll + Viewport zurücksetzen. */
export function resetMobileChromeAfterRouteChange(): void {
  forceReleaseAllOverlayScrollLocks();
  resetScrollAncestors();
  window.requestAnimationFrame(() => {
    resetScrollAncestors();
    window.requestAnimationFrame(resetScrollAncestors);
  });
  window.setTimeout(resetScrollAncestors, 0);
  window.setTimeout(resetScrollAncestors, 120);
  forceMobileViewportInsetsReset();
}

/**
 * Vollbild-/Sheet-Overlays: Scroll sperren, Tab-Bar-Viewport nach Schließen stabilisieren
 * (wie NutritionLogSheet). Während Live-Workout kein window.scrollTo(0).
 */
/** Portierte Mobile-Tab-Bar (Navbar) — Overlays mindestens darüber. */
export const MOBILE_TAB_BAR_Z = 40;

/** Standard z-index für Modals/Sheets (über Tab-Bar z-40 und Quick-Actions z-55). */
export const MOBILE_OVERLAY_Z_CLASS = 'z-[200]';

/** @deprecated Backdrop ist vollflächig; Abstand nur am Panel via `mobileSheetPanelClass`. */
export const MOBILE_NAV_CLEARANCE_CLASS = 'max-lg:pb-[var(--shell-pad-bottom)]';

const OVERLAY_BASE = 'fixed inset-0 flex touch-manipulation p-0 lg:p-4';

/** Vollflächiger Overlay-Container — Backdrop deckt auch Tab-Bar-Bereich ab. */
export function mobileSheetOverlayClass(extra?: string): string {
  return cn(
    OVERLAY_BASE,
    'items-end lg:items-center justify-center',
    MOBILE_OVERLAY_Z_CLASS,
    extra,
  );
}

/** Zentrierte Dialoge — ebenfalls vollflächiger Backdrop. */
export function mobileDialogOverlayClass(extra?: string): string {
  return cn(
    OVERLAY_BASE,
    'items-end lg:items-center justify-center',
    MOBILE_OVERLAY_Z_CLASS,
    extra,
  );
}

/** Sheet-Inhalt oberhalb der Tab-Bar (Backdrop bleibt randlos). */
export function mobileSheetPanelClass(extra?: string): string {
  return cn(
    'relative z-10 w-full max-lg:max-h-[min(88dvh,calc(100dvh-var(--shell-pad-bottom)-env(safe-area-inset-top,0px)))]',
    extra,
  );
}

let overlayScrollLockCount = 0;
let savedBodyOverflow = '';
let savedBodyOverscroll = '';
let savedHtmlOverflow = '';

function applyOverlayScrollLock(): void {
  if (typeof document === 'undefined') return;
  if (overlayScrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedBodyOverscroll = document.body.style.overscrollBehavior;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.classList.add('mobile-overlay-open');
  }
  overlayScrollLockCount += 1;
}

function releaseOverlayScrollLock(): void {
  if (typeof document === 'undefined') return;
  overlayScrollLockCount = Math.max(0, overlayScrollLockCount - 1);
  if (overlayScrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.body.style.overscrollBehavior = savedBodyOverscroll;
    document.documentElement.style.overflow = savedHtmlOverflow;
    document.documentElement.classList.remove('mobile-overlay-open');
    resetMobileChromeAfterOverlay();
  }
}

/** Scroll-Lock mit Referenzzählung (mehrere Overlays gleichzeitig). */
export function lockMobileOverlayScroll(): () => void {
  applyOverlayScrollLock();
  forceMobileViewportInsetsReset();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseOverlayScrollLock();
  };
}

/** Notfall: alle Overlay-Locks lösen (z. B. nach Coach-Plan-Erstellung). */
export function forceReleaseAllOverlayScrollLocks(): void {
  if (typeof document === 'undefined') return;
  overlayScrollLockCount = 0;
  document.body.style.overflow = '';
  document.body.style.overscrollBehavior = '';
  document.documentElement.style.overflow = '';
  document.documentElement.classList.remove('mobile-overlay-open');
  resetMobileChromeAfterOverlay();
}

/** Rendert Overlays auf document.body — vermeidet Stacking unter portierter Tab-Bar. */
export function overlayPortal(node: ReactNode): ReactNode {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

/**
 * Korrektes Overlay-Muster: Scroll-Lock nur wenn offen, Portal außerhalb von AnimatePresence.
 * AnimatePresence um `{open && overlayPortal(...)}` lässt unsichtbare Backdrops hängen (UI friert ein).
 */
export function MobileOverlayRoot({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  useMobileOverlaySheet(open);
  if (!open) return null;
  return overlayPortal(children);
}

export type MobileOverlaySheetOptions = {
  /** Escape schließt das Overlay */
  onEscape?: () => void;
  /** Panel für Fokus-Trap (Tab zyklisch innerhalb) */
  panelRef?: RefObject<HTMLElement | null>;
};

const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter(el => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

export function useMobileOverlaySheet(open: boolean, opts?: MobileOverlaySheetOptions): void {
  const onEscape = opts?.onEscape;
  const panelRef = opts?.panelRef;

  useEffect(() => {
    if (!open) return;
    const release = lockMobileOverlayScroll();
    return () => {
      release();
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      if (overlayScrollLockCount > 0) return;
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overflow = '';
      document.documentElement.classList.remove('mobile-overlay-open');
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onEscape]);

  useEffect(() => {
    if (!open || !panelRef) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const items = listFocusable(panel);
      (items[0] ?? panel).focus();
    };
    // Nach Layout: erstes steuerelement fokussieren
    const focusTimer = window.setTimeout(focusFirst, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = listFocusable(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      panel.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, panelRef]);
}
