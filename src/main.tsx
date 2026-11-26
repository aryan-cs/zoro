import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getSettings, requestPersistence, saveSettings } from './core/db';
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
  // Local previews also get a sample profile, so Settings shows recommended targets.
  if (localPreview && !s.sex) void saveSettings({ sex: 'male', birthDate: '2001-06-14', heightIn: 70, activity: 'moderate', goalWeight: 178 });
});
if (!localPreview) startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
