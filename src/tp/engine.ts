/** Moteur de TP : démarrage reproductible, vérification des objectifs, progression, sauvegarde. */
import { createLab, type Lab } from '../engine';
import type { State } from '../state';
import type { Objective, Question, Tp } from './types';

export interface Progress {
  /** Objectifs déjà validés (conservés même si l'état change ensuite). */
  done: Record<string, string[]>;
  /** Nombre d'indices demandés par TP. */
  hints: Record<string, number>;
  /** Nombre de commandes passées par TP (pour le bilan). */
  commands: Record<string, number>;
  /** Réponses données aux questions : TP → question → numéro de choix (dernier essai) et nombre d'essais. */
  answers: Record<string, Record<string, { choice: number; tries: number }>>;
}
export const newProgress = (): Progress => ({ done: {}, hints: {}, commands: {}, answers: {} });

/** Crée un laboratoire neuf prêt pour le TP : fichiers de départ puis préparation du monde. */
export function startTp(tp: Tp): Lab {
  const lab = createLab();
  for (const [path, content] of Object.entries(tp.files)) lab.dispatch('fs.write', { path, content });
  for (const c of tp.setup ?? []) lab.dispatch(c.type, c.payload);
  return lab;
}

export interface CheckResult { objective: Objective; ok: boolean; sticky: boolean }

/** Objectifs dérivés des questions : validés par `answerQuestion`, jamais par l'état. */
export const questionObjectives = (qs: Question[] = []): Objective[] => qs.map(q => ({ id: `q:${q.id}`, label: `Question : ${q.prompt}`, check: () => false }));

export function answerQuestion(tp: Tp, progress: Progress, qid: string, choice: number): { ok: boolean; explain: string } {
  const q = tp.questions?.find(x => x.id === qid);
  if (!q) throw new Error(`question inconnue : ${qid}`);
  const rec = (progress.answers[tp.id] ??= {});
  rec[qid] = { choice, tries: (rec[qid]?.tries ?? 0) + 1 };
  const ok = choice === q.correct;
  if (ok) { const d = new Set(progress.done[tp.id] ?? []); d.add(`q:${q.id}`); progress.done[tp.id] = [...d]; }
  return { ok, explain: q.explain };
}

/** Vérifie les objectifs ; un objectif déjà validé le reste. Met `progress` à jour. */
export function checkTp(tp: Tp, st: Readonly<State>, progress: Progress): CheckResult[] {
  const done = new Set(progress.done[tp.id] ?? []);
  const res = [...tp.objectives, ...questionObjectives(tp.questions)].map(o => {
    const live = o.check(st, done);
    if (live) done.add(o.id);
    return { objective: o, ok: live || done.has(o.id), sticky: !live && done.has(o.id) };
  });
  progress.done[tp.id] = [...done];
  return res;
}

export const isComplete = (res: CheckResult[]): boolean => res.length > 0 && res.every(r => r.ok);

/** Prochain indice (le compteur avance) ; undefined s'il n'y en a plus. */
export function nextHint(tp: Tp, progress: Progress): string | undefined {
  const n = progress.hints[tp.id] ?? 0;
  if (n >= tp.hints.length) return undefined;
  progress.hints[tp.id] = n + 1;
  return tp.hints[n];
}

// ------------------------------------------------------------------ sauvegarde

export interface SaveFile { app: 'iaclab-save'; v: 1; tp: string; journal: ReturnType<Lab['snapshot']>; progress: Progress }

export function exportSave(tpId: string, lab: Lab, progress: Progress): string {
  const f: SaveFile = { app: 'iaclab-save', v: 1, tp: tpId, journal: lab.snapshot(), progress };
  return JSON.stringify(f, null, 2);
}

export function importSave(text: string): { tp: string; lab: Lab; progress: Progress } {
  let f: SaveFile;
  try { f = JSON.parse(text) as SaveFile; } catch { throw new Error('Ce fichier n’est pas une sauvegarde IaC Lab (JSON illisible).'); }
  if (f?.app !== 'iaclab-save' || f.v !== 1 || typeof f.tp !== 'string') throw new Error('Ce fichier n’est pas une sauvegarde IaC Lab.');
  const lab = createLab();
  lab.restore(f.journal);
  const p = f.progress ?? newProgress();
  return { tp: f.tp, lab, progress: { done: p.done ?? {}, hints: p.hints ?? {}, commands: p.commands ?? {}, answers: p.answers ?? {} } };
}
