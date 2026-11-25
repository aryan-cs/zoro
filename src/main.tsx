import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './core/db';
import { ensureSampleData } from './core/store';
import './index.css';
import { startSync } from './ui/sync';

// Zoro always uses the dark theme.
document.documentElement.classList.add('dark');

void requestPersistence();

// Local previews (localhost, the Simulator) load sample data in every screen, and never sync,
// so sample data can't reach the GitHub backup. The deployed app is untouched.
const localPreview = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.local');
if (localPreview) void ensureSampleData();
else startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
