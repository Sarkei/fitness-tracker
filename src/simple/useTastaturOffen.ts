import { useEffect, useState } from 'react';

/**
 * Ist die Bildschirmtastatur offen?
 *
 * Tims Vorgabe: „die tastatur nie über den eingabefeldern … auch dann auf
 * speichern klickt ohne die tastatur einklappen zu müssen."
 *
 * Umsetzung: Ein Popup, das mit offener Tastatur mittig sitzt, verliert seine
 * untere Hälfte — und damit den Speichern-Knopf. Deshalb wird es in diesem
 * Zustand oben ausgerichtet und die Höhe auf den sichtbaren Bereich begrenzt.
 *
 * Warum über den Fokus und nicht über die Höhe des Viewports:
 *  - Die Höhe allein ist unzuverlässig: Beim Wechsel zwischen zwei Feldern
 *    meldet der Browser kurz die volle Höhe, obwohl die Tastatur bleibt.
 *  - Ein Feld im Fokus ist das sichere Zeichen, dass Tastatur im Spiel ist.
 *
 * Der Fokus wird mit kurzer Verzögerung geprüft: Beim Wechsel von einem Feld
 * ins andere feuert `focusout` bevor `focusin` — ohne die Verzögerung würde
 * das Popup kurz zurückspringen.
 */
export function useTastaturOffen(): boolean {
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    const feldAktiv = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      /* Nur echte Eingabefelder lösen eine Tastatur aus. */
      if (tag === 'INPUT') {
        const typ = (el as HTMLInputElement).type;
        return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(typ);
      }
      return tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const beiFokus = () => setOffen(feldAktiv());
    const beiVerlust = () => {
      window.setTimeout(() => setOffen(feldAktiv()), 120);
    };
    /* Die Tastatur lässt sich auch ohne Fokuswechsel schließen (Zurück-Taste). */
    const beiGroesse = () => {
      if (!feldAktiv()) setOffen(false);
    };

    document.addEventListener('focusin', beiFokus);
    document.addEventListener('focusout', beiVerlust);
    window.visualViewport?.addEventListener('resize', beiGroesse);

    return () => {
      document.removeEventListener('focusin', beiFokus);
      document.removeEventListener('focusout', beiVerlust);
      window.visualViewport?.removeEventListener('resize', beiGroesse);
    };
  }, []);

  return offen;
}
