import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './core/db';
import './index.css';
import { startSync } from './ui/sync';

// Zoro always uses the dark theme.
document.documentElement.classList.add('dark');

void requestPersistence();
startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
