/**
 * Quadratischer Scan-Rahmen (quer + hochformatige Barcodes).
 */

import { cn } from '@/src/lib/utils';

interface BarcodeScanOverlayProps {
  hint: string;
  className?: string;
}

/** Kantenlänge des Scan-Fensters in px (max). */
export const BARCODE_FRAME = { size: 260 } as const;

export default function BarcodeScanOverlay({ hint, className }: BarcodeScanOverlayProps) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 z-10', className)} aria-hidden>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="relative aspect-square w-[min(78vw,260px)] max-w-[85%] shrink-0"
          style={{ boxShadow: '0 0 0 100vmax rgba(0,0,0,0.58)' }}
        >
          <span className="absolute left-0 top-0 h-7 w-7 border-l-[3px] border-t-[3px] border-brand" />
          <span className="absolute right-0 top-0 h-7 w-7 border-r-[3px] border-t-[3px] border-brand" />
          <span className="absolute bottom-0 left-0 h-7 w-7 border-b-[3px] border-l-[3px] border-brand" />
          <span className="absolute bottom-0 right-0 h-7 w-7 border-b-[3px] border-r-[3px] border-brand" />
          <div className="absolute inset-3 overflow-hidden rounded-sm">
            <div className="barcode-scan-line absolute left-0 right-0 h-0.5 bg-brand" />
          </div>
        </div>
        <p className="relative z-10 mt-4 max-w-[260px] text-center text-[10px] font-black uppercase tracking-widest text-white drop-shadow-md">
          {hint}
        </p>
      </div>
    </div>
  );
}
