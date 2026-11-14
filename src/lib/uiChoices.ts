/**
 * Dezente Auswahl- und Button-Stile (Border + leichte Brand-Tönung).
 */
import { cn } from '@/src/lib/utils';

export const uiChoiceBase = 'border-2 transition-colors';
export const uiChoiceSelected = 'border-brand bg-brand/15 text-[var(--text-primary)]';
export const uiChoiceUnselected =
  'border-[var(--border-muted)] text-[var(--text-primary)] hover:border-brand/50';

export function uiChoice(selected: boolean, extra?: string) {
  return cn(uiChoiceBase, selected ? uiChoiceSelected : uiChoiceUnselected, extra);
}

export const uiBtnPrimary =
  'inline-flex items-center justify-center gap-2 border border-brand/40 bg-brand/10 text-brand font-black uppercase tracking-widest rounded-xl hover:bg-brand/15 hover:border-brand disabled:opacity-50 transition-colors';

/** @deprecated Nutze uiBtnPrimary / ui-btn-brand — kein Vollflächen-Brand mehr. */
export const uiBtnPrimarySolid = uiBtnPrimary;
