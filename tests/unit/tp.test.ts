import { describe, expect, it } from 'vitest';
import { checkTp, exportSave, importSave, isComplete, newProgress, nextHint, startTp } from '../../src/tp/engine';
import { tpById } from '../../src/tp/catalog';
import { Session } from '../../src/ui/session';

const S1 = tpById('s1-premiere-vm')!;
const S3 = tpById('s3-configurer')!;

describe('moteur de TP', () => {
  it('au départ, aucun objectif atteint', () => {
    const lab = startTp(S1);
    expect(checkTp(S1, lab.getState(), newProgress()).some(r => r.ok)).toBe(false);
  });

  it('TP 1 : résolution complète', () => {
    const lab = startTp(S1); const s = new Session(lab, S1.dir); const p = newProgress();
    const main = lab.getState().files['brasserie/main.tf']!;
    lab.dispatch('fs.write', { path: 'brasserie/main.tf', content: main + '\nresource "cloudpeda_vm" "caisse" {\n  name       = "caisse"\n  network_id = cloudpeda_network.principal.id\n}\n' });
    let r = checkTp(S1, lab.getState(), p);
    expect(r.find(x => x.objective.id === 'code')!.ok).toBe(true);
    expect(isComplete(r)).toBe(false);
    s.exec('terraform init'); s.exec('terraform apply'); s.exec('yes');
    r = checkTp(S1, lab.getState(), p);
    expect(isComplete(r)).toBe(true);
  });

  it('un objectif validé le reste (sticky) même si l’état change', () => {
    const lab = startTp(S1); const p = newProgress();
    lab.dispatch('fs.write', { path: 'brasserie/main.tf', content: '# x\nresource "cloudpeda_vm" "c" {\n name = "caisse"\n}\n' });
    checkTp(S1, lab.getState(), p);
    lab.dispatch('fs.write', { path: 'brasserie/main.tf', content: '' });
    const r = checkTp(S1, lab.getState(), p);
    expect(r.find(x => x.objective.id === 'code')).toMatchObject({ ok: true, sticky: true });
  });

  it('la vérification ne modifie pas l’état', () => {
    const lab = startTp(S1); const s = new Session(lab, S1.dir);
    s.exec('terraform init');
    const before = JSON.stringify(lab.getState());
    checkTp(S1, lab.getState(), newProgress());
    expect(JSON.stringify(lab.getState())).toBe(before);
  });

  it('TP 3 : le monde préparé, puis résolution Ansible', () => {
    const lab = startTp(S3); const s = new Session(lab, S3.dir); const p = newProgress();
    expect(Object.keys(lab.getState().cloud['cloudpeda_vm'] ?? {})).toHaveLength(1);
    lab.dispatch('fs.write', { path: 'brasserie/site.yml', content: `- name: Caisse
  hosts: caisse
  tasks:
    - name: nginx
      ansible.builtin.apt:
        name: nginx
        state: present
    - name: page
      ansible.builtin.copy:
        content: "Brasserie du Port\\n"
        dest: /var/www/html/index.html
` });
    s.exec('ansible-playbook -i inventory.ini site.yml');
    expect(isComplete(checkTp(S3, lab.getState(), p))).toBe(true);
  });

  it('indices progressifs comptés', () => {
    const p = newProgress();
    expect(nextHint(S1, p)).toBe(S1.hints[0]);
    expect(nextHint(S1, p)).toBe(S1.hints[1]);
    expect(p.hints[S1.id]).toBe(2);
    nextHint(S1, p); expect(nextHint(S1, p)).toBeUndefined();
  });

  it('sauvegarde et restauration identiques', () => {
    const lab = startTp(S3); const s = new Session(lab, S3.dir); const p = newProgress();
    s.exec('ansible-playbook -i inventory.ini site.yml'); nextHint(S3, p);
    const back = importSave(exportSave(S3.id, lab, p));
    expect(back.tp).toBe(S3.id);
    expect(JSON.stringify(back.lab.getState())).toBe(JSON.stringify(lab.getState()));
    expect(back.progress.hints[S3.id]).toBe(1);
  });

  it('refuse un fichier invalide', () => {
    expect(() => importSave('pas du json')).toThrow(/sauvegarde IaC Lab/);
    expect(() => importSave('{"app":"autre"}')).toThrow(/sauvegarde IaC Lab/);
  });
});
