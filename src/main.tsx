import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './core/db';
import { purgeSampleData } from './core/store';
import './index.css';
import { startHealthSync } from './ui/healthSync';
import { startSync } from './ui/sync';

// Zoro always uses the dark theme.
document.documentElement.classList.add('dark');

void requestPersistence();

// Local previews (dev server, Simulator) never sync, so they can't touch the real backup.
const localPreview = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.local');
// Clear out the sample week older versions of the app added.
void purgeSampleData();
if (!localPreview) {
  startSync();
  startHealthSync();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
