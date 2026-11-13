import { describe, expect, it } from 'vitest';
import { CATALOG, tpById } from '../../src/tp/catalog';
import { answerQuestion, checkTp, exportSave, importSave, isComplete, newProgress, nextHint, startTp } from '../../src/tp/engine';
import type { Tp } from '../../src/tp/types';
import { Session } from '../../src/ui/session';

/** Rejoue la solution de référence comme le ferait un élève. */
function solve(tp: Tp) {
  const lab = startTp(tp); const s = new Session(lab, tp.dir); const p = newProgress();
  const log: string[] = [];
  for (const step of tp.solution) {
    if ('write' in step) lab.dispatch('fs.write', { path: step.write, content: step.content });
    else if ('run' in step) { const out = s.exec(step.run); log.push(out.map(l => l.text).join('\n')); }
    else answerQuestion(tp, p, step.answer, tp.questions!.find(q => q.id === step.answer)!.correct);
    checkTp(tp, lab.getState(), p);
  }
  return { lab, s, p, log };
}

describe.each(CATALOG.map(t => [t.id, t] as const))('TP %s', (_id, tp) => {
  it('au départ, aucun objectif atteint', () => {
    const lab = startTp(tp);
    expect(checkTp(tp, lab.getState(), newProgress()).some(r => r.ok)).toBe(false);
  });
  it('la solution de référence atteint 100 %', () => {
    const { lab, p } = solve(tp);
    const res = checkTp(tp, lab.getState(), p);
    expect(res.filter(r => !r.ok).map(r => r.objective.label)).toEqual([]);
    expect(isComplete(res)).toBe(true);
  });
  it('les textes sont complets', () => {
    expect(tp.intention.length).toBeGreaterThan(20); expect(tp.bilan.length).toBeGreaterThan(20);
    expect(tp.hints.length).toBeGreaterThan(0); expect(tp.skills.length).toBeGreaterThan(0);
    for (const q of tp.questions ?? []) { expect(q.choices[q.correct]).toBeDefined(); expect(q.choices.length).toBeGreaterThanOrEqual(3); }
  });
  it('la vérification ne modifie pas l’état', () => {
    const { lab, p } = solve(tp);
    const before = JSON.stringify(lab.getState()); checkTp(tp, lab.getState(), p);
    expect(JSON.stringify(lab.getState())).toBe(before);
  });
});

describe('scénarios', () => {
  it('0.1 : la recette diffère de la production', () => {
    const { s } = solve(tpById('0.1')!);
    expect(s.exec('cloud list').map(l => l.text).join('\n')).toContain('443');
  });
  it('0.2 : le script échoue au second passage, Terraform ne fait rien', () => {
    const { log } = solve(tpById('0.2')!);
    expect(log[1]).toMatch(/Erreur|already exists/);
    expect(log[4]).toContain('No changes');
  });
  it('1.2 : « ~ » puis « -/+ »', () => {
    const { log } = solve(tpById('1.2')!);
    expect(log[0]).toMatch(/~ .*size/); expect(log[2]).toContain('must be replaced');
  });
  it('1.4 : un cycle est détecté', () => { expect(solve(tpById('1.4')!).log.join('\n')).toMatch(/[Cc]ycle/); });
  it('2.2 : la dérive est détectée par -refresh-only', () => { expect(solve(tpById('2.2')!).log[1]).toContain('changed outside of Terraform'); });
  it('2.3 : l’apply de prod échoue d’abord', () => { expect(solve(tpById('2.3')!).log.join('\n')).toMatch(/already exists/); });
});

describe('moteur', () => {
  const T = tpById('1.1')!;
  it('un objectif validé le reste (sticky)', () => {
    const lab = startTp(T); const p = newProgress();
    lab.dispatch('fs.write', { path: 'brasserie/main.tf', content: 'resource "cloudpeda_network" "x" {\n name = "reseau-brasserie"\n}\n' });
    checkTp(T, lab.getState(), p);
    lab.dispatch('fs.write', { path: 'brasserie/main.tf', content: '' });
    expect(checkTp(T, lab.getState(), p).find(x => x.objective.id === 'code')).toMatchObject({ ok: true, sticky: true });
  });
  it('mauvaise réponse : comptée, non validée', () => {
    const t = tpById('TD1')!; const p = newProgress();
    expect(answerQuestion(t, p, 'a', 1).ok).toBe(false);
    expect(p.answers['TD1']!['a']).toEqual({ choice: 1, tries: 1 });
    expect(isComplete(checkTp(t, startTp(t).getState(), p))).toBe(false);
  });
  it('indices progressifs comptés', () => {
    const p = newProgress();
    expect(nextHint(T, p)).toBe(T.hints[0]); nextHint(T, p); nextHint(T, p);
    expect(nextHint(T, p)).toBeUndefined(); expect(p.hints[T.id]).toBe(3);
  });
  it('sauvegarde et restauration identiques, réponses comprises', () => {
    const tp = tpById('2.2')!; const { lab, p } = solve(tp);
    const back = importSave(exportSave(tp.id, lab, p));
    expect(JSON.stringify(back.lab.getState())).toBe(JSON.stringify(lab.getState()));
    expect(back.progress.answers[tp.id]!['detect']!.tries).toBe(1);
  });
  it('refuse un fichier invalide', () => {
    expect(() => importSave('pas du json')).toThrow(/sauvegarde IaC Lab/);
    expect(() => importSave('{"app":"autre"}')).toThrow(/sauvegarde IaC Lab/);
  });
});
