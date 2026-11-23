import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from './AppRoot.tsx';
import './index.css';
import './styles/shell.css';
import './styles/fasting.css';
import { applyTheme, getStoredTheme } from './lib/themePreference.ts';
import { AiCapabilitiesProvider } from './lib/AiCapabilitiesContext.tsx';
import { isDemoMode, markDemoMode } from './lib/demoMode.ts';

applyTheme(getStoredTheme());

/**
 * Service Worker registrieren: macht die App installierbar (echtes Vollbild, kein
 * Browser-Rahmen) und laedt gebaute Assets aus dem Cache. API-Aufrufe bleiben
 * ungecacht, damit Trainings- und Garmin-Daten frisch sind.
 */
if ('serviceWorker' in navigator && !location.hostname.startsWith('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Installation bleibt optional — die App laeuft auch ohne */
    });
  });
}

/**
 * Statusleiste der installierten App an die Kopfzeile anpassen.
 *
 * Ohne das faerbt der Browser die Leiste mit `theme_color` aus dem Manifest
 * (Gruen) — sichtbar als fremder Balken ueber der App.
 */
function syncStatusBarColor(): void {
  const dunkel = document.documentElement.classList.contains('dark');
  const farbe = dunkel ? '#101312' : '#f6f7f5';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', farbe);
}
syncStatusBarColor();

/**
 * Auf einer Demo-Domain meldet sich die App mit dem Beispielkonto an,
 * bevor gerendert wird — so öffnet der Demo-Link direkt die Anwendung.
 */
async function bootstrapDemo(): Promise<void> {
  if (!isDemoMode()) return;
  markDemoMode();
  if (localStorage.getItem('vrtx_jwt')) return;
  try {
    const res = await fetch('/api/auth/demo', { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.token) localStorage.setItem('vrtx_jwt', data.token);
  } catch {
    /* Demo bleibt dann auf der Anmeldeseite */
  }
}

const root = createRoot(document.getElementById('root')!);

void bootstrapDemo().finally(() => {
  root.render(
    <StrictMode>
      <AiCapabilitiesProvider>
        <AppRoot />
      </AiCapabilitiesProvider>
    </StrictMode>
  );
});
