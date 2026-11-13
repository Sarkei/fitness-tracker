import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from './AppRoot.tsx';
import './index.css';
import './styles/shell.css';
import { applyTheme, getStoredTheme } from './lib/themePreference.ts';
import { AiCapabilitiesProvider } from './lib/AiCapabilitiesContext.tsx';
import { isDemoMode, markDemoMode } from './lib/demoMode.ts';

applyTheme(getStoredTheme());

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
