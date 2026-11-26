import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getSettings, requestPersistence } from './core/db';
import { ensureSampleData } from './core/store';
import './index.css';
import { startSync } from './ui/sync';

// Zoro always uses the dark theme.
document.documentElement.classList.add('dark');

void requestPersistence();

// Sample data fills every screen unless it's switched off in Settings › Testing (local previews
// always have it). Backups never include it, and local previews don't sync at all.
const localPreview = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.local');
void getSettings().then((s) => {
  if (localPreview || s.sampleData !== false) void ensureSampleData();
});
if (!localPreview) startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
