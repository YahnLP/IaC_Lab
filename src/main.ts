import { createLab } from './engine';
import { startApp } from './ui/app';
import { SEED } from './ui/seed';

const KEY = 'iaclab:v1';
const lab = createLab();
let restored = false;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { lab.restore(JSON.parse(raw)); restored = true; }
} catch { /* stockage indisponible ou corrompu : on repart du départ */ }
if (!restored) for (const [path, content] of Object.entries(SEED)) lab.dispatch('fs.write', { path, content });

startApp(lab, {
  save: () => { try { localStorage.setItem(KEY, JSON.stringify(lab.snapshot())); } catch { /* ignoré */ } },
  reset: () => { try { localStorage.removeItem(KEY); } catch { /* ignoré */ } location.reload(); },
});
