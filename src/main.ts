import { startApp } from './ui/app';
import { importSave, startTp } from './tp/engine';
import { CATALOG, tpById } from './tp/catalog';
import { newProgress } from './tp/engine';

const KEY = 'iaclab:save:v1';
let initial = { tp: CATALOG[0]!.id, lab: startTp(CATALOG[0]!), progress: newProgress() };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { const s = importSave(raw); if (tpById(s.tp)) initial = s; }
} catch { /* stockage indisponible ou sauvegarde illisible : on repart du premier TP */ }

startApp(initial, {
  save: text => { try { localStorage.setItem(KEY, text); } catch { /* ignoré */ } },
  reset: () => { try { localStorage.removeItem(KEY); } catch { /* ignoré */ } location.reload(); },
});
