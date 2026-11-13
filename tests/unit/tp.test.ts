import { describe, expect, it } from 'vitest';
import { CATALOG, tpById } from '../../src/tp/catalog';
import { SELF_LEVELS, answerQuestion, checkTp, rateSelf, exportSave, importSave, isComplete, newProgress, nextHint, recordCommand, startTp, stepDone, appendBlock, editText } from '../../src/tp/engine';
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
  for (const it of tp.selfEval ?? []) rateSelf(tp, p, it.id, 2);
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
    if (!tp.selfEval) { expect(tp.hints.length).toBeGreaterThan(0); if (tp.id !== '0.0') expect(tp.skills.length).toBeGreaterThan(0); }
    for (const q of tp.questions ?? []) { expect(q.choices[q.correct]).toBeDefined(); expect(q.choices.length).toBeGreaterThanOrEqual(3); }
  });
  it('la vérification ne modifie pas l’état', () => {
    const { lab, p } = solve(tp);
    const before = JSON.stringify(lab.getState()); checkTp(tp, lab.getState(), p);
    expect(JSON.stringify(lab.getState())).toBe(before);
  });
});

describe.each(CATALOG.filter(t => t.steps).map(t => [t.id, t] as const))('parcours guidé %s', (_id, tp) => {
  it('suivre chaque action à la lettre mène à 100 %, et chaque étape se termine', () => {
    const lab = startTp(tp); const s = new Session(lab, tp.dir); const p = newProgress();
    checkTp(tp, lab.getState(), p);
    for (const [i, st] of tp.steps!.entries()) {
      for (const a of st.do ?? []) {
        if ('cmd' in a) { s.exec(a.cmd); recordCommand(p, tp.id, a.cmd); }
        else if ('insert' in a) { const cur = lab.getState().files[a.insert.path] ?? ''; lab.dispatch('fs.write', { path: a.insert.path, content: appendBlock(cur, a.insert.text) }); }
        else if ('edit' in a) { const cur = lab.getState().files[a.edit.path] ?? ''; const nx = editText(cur, a.edit.from, a.edit.to); expect(nx, `étape ${i + 1} : texte à modifier introuvable « ${a.edit.from} »`).not.toBeNull(); lab.dispatch('fs.write', { path: a.edit.path, content: nx! }); }
        else expect(lab.getState().files[a.open], `étape ${i + 1} : fichier à ouvrir introuvable`).toBeDefined();
        checkTp(tp, lab.getState(), p);
      }
      for (const qid of st.ask ?? []) { const q = tp.questions!.find(x => x.id === qid)!; expect(q, `question ${qid}`).toBeDefined(); answerQuestion(tp, p, qid, q.correct); }
      if (st.until?.done === 'self') for (const it of tp.selfEval ?? []) rateSelf(tp, p, it.id, 2);
      checkTp(tp, lab.getState(), p);
      expect(stepDone(st, p, tp.id), `étape ${i + 1} « ${st.title} » non terminée`).toBe(true);
    }
    for (const it of tp.selfEval ?? []) rateSelf(tp, p, it.id, 2);
    const res = checkTp(tp, lab.getState(), p);
    expect(res.filter(r => !r.ok).map(r => r.objective.label)).toEqual([]);
  });
  it('les conditions des étapes sont valides', () => {
    const ids = new Set([...(tp.selfEval ? ['self'] : []), ...tp.objectives.map(o => o.id), ...(tp.questions ?? []).map(q => `q:${q.id}`)]);
    for (const st of tp.steps!) {
      if (st.until?.done !== undefined) expect(ids.has(st.until.done), st.until.done).toBe(true);
      if (st.until?.ran !== undefined) expect(() => new RegExp(st.until!.ran!)).not.toThrow();
      for (const q of st.ask ?? []) expect((tp.questions ?? []).some(x => x.id === q), q).toBe(true);
    }
  });
});

it('tous les TP ont un parcours guidé', () => { expect(CATALOG.filter(t => !t.steps || t.steps.length < 2).map(t => t.id)).toEqual([]); });

describe('scénarios', () => {
  it('0.1 : la recette diffère de la production', () => {
    const { s } = solve(tpById('0.1')!);
    expect(s.exec('cloud list').map(l => l.text).join('\n')).toContain('443');
  });
  it('0.2 : le script échoue au second passage, Terraform ne fait rien', () => {
    const { log } = solve(tpById('0.2')!);
    expect(log[1]).toMatch(/Erreur|already exists/);
    expect(log[5]).toContain('No changes');
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

describe('étapes 3 et 4 : scénarios', () => {
  it('3.1 : une faute dans l’inventaire donne UNREACHABLE', () => {
    const tp = tpById('3.1')!; const { lab } = solve(tp); const s = new Session(lab, tp.dir);
    lab.dispatch('fs.write', { path: 'config/inventory.ini', content: '[web]\ncassie\n' });
    expect(s.exec('ansible web -m ping -i inventory.ini').map(l => l.text).join('\n')).toContain('UNREACHABLE');
  });
  it('3.2 : second passage à changed=0', () => { expect(solve(tpById('3.2')!).log[1]).toMatch(/changed=0/); });
  it('3.3 : le handler ne s’exécute qu’au premier passage', () => {
    const { log } = solve(tpById('3.3')!);
    expect(log[0]).toContain('RUNNING HANDLER'); expect(log[1]).not.toContain('RUNNING HANDLER');
  });
  it('3.4 : --check --diff détecte sans corriger', () => {
    const tp = tpById('3.4')!; const lab = startTp(tp); const s = new Session(lab, tp.dir);
    s.exec('guest caisse write /var/www/html/index.html Page bidouillee');
    const r = s.exec('ansible-playbook -i inventory.ini site.yml --check --diff').map(l => l.text).join('\n');
    expect(r).toContain('+<h1>Brasserie du Port - caisse</h1>'); expect(r).toMatch(/changed=\d/);
    expect(s.exec('guest caisse cat /var/www/html/index.html')[0]!.text).toBe('Page bidouillee');
  });
  it('3.5 : command est toujours changed et --check la saute', () => {
    const { log } = solve(tpById('3.5')!);
    expect(log[0]).toMatch(/changed=1/); expect(log[1]).toMatch(/changed=1/); expect(log[2]).toContain('skipping');
  });
  it('4.1 : l’inventaire vient de la sortie Terraform', () => {
    const tp = tpById('4.1')!; const { lab } = solve(tp);
    expect(lab.getState().files['projet/inventory.ini']).toContain('[bdd]\nstock ansible_host=');
  });
  it('4.2 : git ignore l’état et les secrets', () => {
    const tp = tpById('4.2')!; const { lab, log } = solve(tp);
    expect(log.join('\n')).toContain('cloudpeda_firewall_rule.https'); // le plan annonce la règle
    const s = new Session(lab, tp.dir); expect(s.exec('git status').map(l => l.text).join('\n')).toContain('nothing to commit');
  });
  it('4.2 : sans .gitignore, l’état est commité (objectif non atteint)', () => {
    const tp = tpById('4.2')!; const lab = startTp(tp); const s = new Session(lab, tp.dir); const p = newProgress();
    s.exec('git init'); s.exec('git add .'); s.exec('git commit -m "tout"');
    const r = checkTp(tp, lab.getState(), p);
    expect(r.find(x => x.objective.id === 'commit')!.ok).toBe(true);
    expect(r.find(x => x.objective.id === 'propre')!.ok).toBe(false);
  });
});

import { buildReport, reportHtml, reportJson } from '../../src/tp/report';

describe('bilan, examen, compte rendu', () => {
  it('auto-évaluation : complète seulement quand tout est renseigné', () => {
    const tp = tpById('5.3')!; const p = newProgress();
    expect(() => rateSelf(tp, p, 'zzz', 1)).toThrow(); expect(() => rateSelf(tp, p, 's1', 7)).toThrow();
    for (const i of tp.selfEval!.slice(0, 9)) rateSelf(tp, p, i.id, 1);
    expect(isComplete(checkTp(tp, startTp(tp).getState(), p))).toBe(false);
    rateSelf(tp, p, 's10', 3);
    expect(isComplete(checkTp(tp, startTp(tp).getState(), p))).toBe(true);
    expect(SELF_LEVELS[3]).toBe('excellente maîtrise');
  });
  it('examen : seule la dernière réponse compte', () => {
    const tp = tpById('TD1')!; const p = newProgress(); p.exam = true;
    answerQuestion(tp, p, 'a', 0); expect(p.done['TD1']).toContain('q:a');
    answerQuestion(tp, p, 'a', 2); expect(p.done['TD1']).not.toContain('q:a');
    p.exam = false; answerQuestion(tp, p, 'a', 0); answerQuestion(tp, p, 'a', 2); expect(p.done['TD1']).toContain('q:a');
  });
  it('compte rendu : pourcentage, lignes, échappement HTML, JSON', () => {
    const p = newProgress(); const tp = tpById('TD1')!;
    for (const q of tp.questions!) answerQuestion(tp, p, q.id, q.correct);
    p.hints['1.1'] = 2; p.self['s1'] = 3;
    const r = buildReport(CATALOG, p, null, { student: '<b>Léa</b>', group: 'SIO1', date: '2026-11-13' });
    expect(r.rows.find(x => x.id === 'TD1')).toMatchObject({ done: 5, total: 5, complete: true });
    expect(r.rows.find(x => x.id === '1.1')!.hints).toBe(2);
    expect(r.percent).toBeGreaterThan(0); expect(r.percent).toBeLessThan(100);
    const html = reportHtml(r);
    expect(html).toContain('&lt;b&gt;Léa&lt;/b&gt;'); expect(html).not.toContain('<b>Léa');
    expect(JSON.parse(reportJson(r)).app).toBe('iaclab-report');
  });
  it('compte rendu : un parcours complet donne 100 %', () => {
    const p = newProgress(); const lab = startTp(CATALOG[0]!);
    for (const tp of CATALOG) { const s = solve(tp); Object.assign(p.done, { [tp.id]: s.p.done[tp.id] ?? [] }); Object.assign(p.self, s.p.self); }
    expect(buildReport(CATALOG, p, null, { student: 'x', group: 'y', date: 'z' }).percent).toBe(100);
    void lab;
  });
});
