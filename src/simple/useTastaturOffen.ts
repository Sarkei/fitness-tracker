import { useEffect, useRef, useState } from 'react';

/**
 * Weicht ein Popup der Bildschirmtastatur aus?
 *
 * Tims Vorgabe: „die tastatur nie über den eingabefeldern … auch dann auf
 * speichern klickt ohne die tastatur einklappen zu müssen."
 *
 * <b>Warum nicht über den Fokus:</b> Der erste Versuch lauschte auf `focusin`
 * und `focusout`. Nachgemessen im Browser kam das Ereignis am Dokument nicht an
 * (das Popup hängt über ein Portal an `<body>`), die Ausrichtung blieb „mittig".
 *
 * <b>Warum nicht nur über `resize`:</b> Der zweite Versuch hing an den
 * resize-Ereignissen von `visualViewport` und `window`. Beim Prüfen mit
 * verkleinertem Viewport änderte sich die Höhe (844 → 500), aber es kam kein
 * Ereignis an — die Anzeige blieb unverändert.
 *
 * <b>Was jetzt gilt:</b> Ein kurzer Takt misst die Höhe selbst, solange das
 * Popup offen ist. 250 ms sind schnell genug, dass man das Ausweichen nicht als
 * Verzögerung wahrnimmt, und billig genug (eine Zahl lesen, kein Layout).
 * Gemessen wird gegen die <b>größte je gesehene Höhe</b>: Die Tastatur nimmt
 * mehrere hundert Pixel weg, die Adressleiste beim Scrollen nur 50–80. Die
 * Schwelle von 150 px trennt beides sauber.
 */
const SCHWELLE_PX = 150;
const TAKT_MS = 250;

export function useTastaturOffen(): boolean {
  const [offen, setOffen] = useState(false);
  const maxHoehe = useRef(0);

  useEffect(() => {
    const vv = window.visualViewport;

    const messen = () => {
      const sichtbar = Math.round(vv?.height ?? window.innerHeight);

      /*
       * Größte je gesehene Höhe merken. Sie ist der Bezug: Solange die
       * Tastatur zu ist, bleibt die Höhe auf diesem Wert; öffnet sie sich,
       * fällt sie deutlich darunter.
       */
      if (sichtbar > maxHoehe.current) maxHoehe.current = sichtbar;

      const verlust = maxHoehe.current - sichtbar;
      setOffen(verlust > SCHWELLE_PX);
    };

    messen();
    const takt = window.setInterval(messen, TAKT_MS);
    /* Ereignisse zusätzlich — wenn der Browser sie liefert, reagiert es sofort. */
    vv?.addEventListener('resize', messen);
    window.addEventListener('resize', messen);
    window.addEventListener('orientationchange', messen);

    return () => {
      window.clearInterval(takt);
      vv?.removeEventListener('resize', messen);
      window.removeEventListener('resize', messen);
      window.removeEventListener('orientationchange', messen);
    };
  }, []);

  return offen;
}
