/** Compte rendu de session : données structurées, export JSON et HTML imprimable. Pur : la date et le nom viennent de l'appelant. */
import { SELF_LEVELS, checkTp, isComplete, type Progress } from './engine';
import type { State } from '../state';
import type { Tp } from './types';

export interface ReportRow { id: string; num: string; title: string; stage: number; done: number; total: number; complete: boolean; hints: number; commands: number; tries: number; bilan: string }
export interface Report {
  app: 'iaclab-report'; v: 1; student: string; group: string; date: string; exam: boolean;
  percent: number; rows: ReportRow[]; self: { text: string; level: string }[];
}

/** `states` : état du laboratoire courant (pour recalculer l'objectif en cours) ; les autres TP se lisent dans la progression. */
export function buildReport(catalog: Tp[], progress: Progress, current: { tp: string; state: Readonly<State> } | null, who: { student: string; group: string; date: string }): Report {
  const rows: ReportRow[] = catalog.map(tp => {
    const total = tp.objectives.length + (tp.questions?.length ?? 0) + (tp.selfEval ? 1 : 0);
    let done: number; let complete: boolean;
    if (current && current.tp === tp.id) { const r = checkTp(tp, current.state, progress); done = r.filter(x => x.ok).length; complete = isComplete(r); }
    else { done = new Set(progress.done[tp.id] ?? []).size; complete = total > 0 && done >= total; }
    const tries = Object.values(progress.answers[tp.id] ?? {}).reduce((a, x) => a + x.tries, 0);
    return { id: tp.id, num: tp.num, title: tp.title, stage: tp.stage, done: Math.min(done, total), total, complete, hints: progress.hints[tp.id] ?? 0, commands: progress.commands[tp.id] ?? 0, tries, bilan: tp.bilan };
  });
  const totalAll = rows.reduce((a, r) => a + r.total, 0); const doneAll = rows.reduce((a, r) => a + r.done, 0);
  const selfTp = catalog.find(t => t.selfEval);
  return {
    app: 'iaclab-report', v: 1, ...who, exam: progress.exam,
    percent: totalAll === 0 ? 0 : Math.round((doneAll / totalAll) * 100), rows,
    self: (selfTp?.selfEval ?? []).filter(i => progress.self[i.id] !== undefined).map(i => ({ text: i.text, level: SELF_LEVELS[progress.self[i.id]!] ?? '' })),
  };
}

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function reportHtml(r: Report): string {
  const rows = r.rows.map(x => `<tr><td>${esc(x.num)}</td><td>${esc(x.title)}</td><td>${x.done} / ${x.total}</td><td>${x.complete ? 'terminé' : x.done > 0 ? 'en cours' : 'non commencé'}</td><td>${x.hints}</td><td>${x.tries}</td><td>${x.commands}</td></tr>`).join('');
  const self = r.self.length ? `<h2>Auto-évaluation</h2><ul>${r.self.map(s => `<li>${esc(s.text)} : <strong>${esc(s.level)}</strong></li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Compte rendu IaC Lab</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:4px 8px;text-align:left}th{background:#eee}.meta{color:#444}@media print{body{margin:0}}</style></head><body>
<h1>IaC Lab — compte rendu</h1>
<p class="meta">Nom : <strong>${esc(r.student || '—')}</strong> · Classe : <strong>${esc(r.group || '—')}</strong> · Date : ${esc(r.date)} · Mode : ${r.exam ? 'examen (sans aide)' : 'entraînement'}</p>
<p>Objectifs atteints : <strong>${r.percent} %</strong></p>
<table><thead><tr><th>TP</th><th>Titre</th><th>Objectifs</th><th>État</th><th>Indices</th><th>Essais aux questions</th><th>Commandes</th></tr></thead><tbody>${rows}</tbody></table>
${self}
<p class="meta">Simulateur pédagogique : aucun vrai outil n’a été exécuté. Les compétences visées restent à valider par l’enseignant.</p></body></html>`;
}

export const reportJson = (r: Report): string => JSON.stringify(r, null, 2);
