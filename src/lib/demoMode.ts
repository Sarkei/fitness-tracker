const DEMO_FLAG_KEY = 'vrtx_demo';

/**
 * Demo-Modus: über eine `demo-*`-Domain (z. B. demo.fitness.example) oder
 * explizit über `?demo=1`. Einmal erkannt, bleibt der Modus für die
 * Browser-Session aktiv, auch nachdem `?demo=1` aus der URL entfernt wurde.
 */
export function isDemoMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location.hostname.startsWith('demo-')) return true;
    if (new URLSearchParams(window.location.search).get('demo') === '1') return true;
    return window.sessionStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function markDemoMode(): void {
  try {
    window.sessionStorage.setItem(DEMO_FLAG_KEY, '1');
  } catch {
    /* Storage kann blockiert sein – dann bleibt nur Hostname/Query als Signal. */
  }
}
