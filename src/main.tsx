import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from './AppRoot.tsx';
import './index.css';
import { applyTheme, getStoredTheme } from './lib/themePreference.ts';
import { AiCapabilitiesProvider } from './lib/AiCapabilitiesContext.tsx';

applyTheme(getStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AiCapabilitiesProvider>
      <AppRoot />
    </AiCapabilitiesProvider>
  </StrictMode>
);
