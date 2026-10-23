import type { ReactNode } from 'react';
import {
  mobileDialogOverlayClass,
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

type Props = {
  open: boolean;
  children: ReactNode;
  /** sheet = am unteren Rand auf Mobile; dialog = zentriert */
  variant?: 'sheet' | 'dialog';
  className?: string;
};

/** Portiertes Overlay über der Mobile-Tab-Bar inkl. Scroll-Lock. */
export default function MobileOverlayBackdrop({
  open,
  children,
  variant = 'sheet',
  className,
}: Props) {
  useMobileOverlaySheet(open);
  if (!open) return null;
  const cls =
    variant === 'dialog' ? mobileDialogOverlayClass(className) : mobileSheetOverlayClass(className);
  return overlayPortal(<div className={cls}>{children}</div>);
}
