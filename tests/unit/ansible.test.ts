import { describe, expect, it } from 'vitest';
import { ans, createLab, tf, write, type Lab } from '../../src/engine';
import { parseYaml } from '../../src/yaml/yaml';
import { evalCondition, render } from '../../src/ansible/jinja';

const D = 'projet';
const INV = `[web]\nweb1 ansible_host=203.0.113.10\n\n[all:vars]\nansible_become=true\n`;

function labWithVm(): Lab {
  const l = createLab();
  const net = JSON.parse(l.dispatch('cloud.create', { type: 'cloudpeda_network', args: { name: 'reseau', cidr: '203.0.113.0/24' } }).output!);
  l.dispatch('cloud.create', { type: 'cloudpeda_vm', args: { name: 'web1', network_id: net.id } });
  write(l, `${D}/inventory.ini`, INV);
  return l;
}
const PB = `- name: Web
  hosts: web
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present
      notify: Redemarrer nginx
    - name: Page
      ansible.builtin.copy:
        content: "Bonjour\\n"
        dest: /var/www/html/index.html
  handlers:
    - name: Redemarrer nginx
      ansible.builtin.service:
        name: nginx
        state: restarted
`;
const run = (l: Lab, extra = '') => ans(l, D, `ansible-playbook -i inventory.ini site.yml ${extra}`);

describe('yaml / jinja', () => {
  it('lit une liste de tâches', () => { expect(parseYaml('- a: 1\n  b: [x, y]\n')).toEqual([{ a: 1, b: ['x', 'y'] }]); });
  it('rend les variables et conditions', () => {
    expect(render('Bonjour {{ nom | upper }}', { nom: 'a' })).toBe('Bonjour A');
    expect(evalCondition('x == "a" and y is defined', { x: 'a', y: 1 })).toBe(true);
  });
});

describe('ansible', () => {
  it('ping ad hoc', () => {
    const l = labWithVm();
    const r = ans(l, D, 'ansible web -m ping -i inventory.ini');
    expect(r.output).toContain('web1 | SUCCESS');
    expect(r.output).toContain('"ping": "pong"');
  });
  it('première exécution : changements, second passage : idempotent', () => {
    const l = labWithVm(); write(l, `${D}/site.yml`, PB);
    const r1 = run(l);
    expect(r1.output).toContain('changed: [web1]');
    expect(r1.output).toContain('RUNNING HANDLER [Redemarrer nginx]');
    expect(r1.output).toMatch(/web1\s+: ok=4\s+changed=3\s+unreachable=0\s+failed=0/);
    const r2 = run(l);
    expect(r2.output).not.toContain('RUNNING HANDLER');
    expect(r2.output).toMatch(/ok=3\s+changed=0\s+unreachable=0\s+failed=0/);
    expect(r2.code).toBe(0);
  });
  it('sans become, apt échoue', () => {
    const l = labWithVm(); write(l, `${D}/inventory.ini`, '[web]\nweb1 ansible_host=203.0.113.10\n'); write(l, `${D}/site.yml`, PB);
    const r = run(l);
    expect(r.output).toContain('FAILED!');
    expect(r.code).toBe(2);
  });
  it('--check --diff n’écrit rien', () => {
    const l = labWithVm(); write(l, `${D}/site.yml`, PB); run(l);
    write(l, `${D}/site.yml`, PB.replace('Bonjour', 'Salut'));
    const r = run(l, '--check --diff');
    expect(r.output).toContain('+Salut');
    expect(r.output).toMatch(/changed=1/);
    const again = run(l, '--check');
    expect(again.output).toMatch(/changed=1/); // rien n'a été écrit
  });
  it('dérive manuelle détectée en --check', () => {
    const l = labWithVm(); write(l, `${D}/site.yml`, PB); run(l);
    const id = 'vm-0001';
    l.dispatch('guest.write', { vm: id, path: '/var/www/html/index.html', content: 'modifié\n' });
    const r = run(l, '--check --diff');
    expect(r.output).toContain('-modifié');
    expect(r.output).toMatch(/changed=1/);
  });
  it('command est toujours changed, créer avec creates l’évite', () => {
    const l = labWithVm();
    write(l, `${D}/site.yml`, `- hosts: web\n  tasks:\n    - name: a\n      ansible.builtin.command: touch /tmp/x\n    - name: b\n      ansible.builtin.command: touch /tmp/y\n      args:\n        creates: /tmp/y\n`);
    run(l); const r = run(l);
    expect(r.output).toMatch(/ok=3\s+changed=1/);
  });
  it('hôte injoignable', () => {
    const l = labWithVm(); write(l, `${D}/inventory.ini`, '[web]\nweb1 ansible_host=203.0.113.99\n'); write(l, `${D}/site.yml`, PB);
    const r = run(l);
    expect(r.output).toContain('UNREACHABLE!');
    expect(r.code).toBe(4);
  });
  it('module inconnu et handler manquant', () => {
    const l = labWithVm(); write(l, `${D}/site.yml`, '- hosts: web\n  tasks:\n    - name: x\n      ansible.builtin.aptt:\n        name: a\n');
    expect(run(l).output).toContain("couldn't resolve module/action 'ansible.builtin.aptt'");
  });
  it('boucle et when', () => {
    const l = labWithVm();
    write(l, `${D}/site.yml`, `- hosts: web\n  tasks:\n    - name: paquets\n      ansible.builtin.apt:\n        name: "{{ item }}"\n      loop: [git, tree]\n    - name: jamais\n      ansible.builtin.debug:\n        msg: x\n      when: ansible_hostname == "autre"\n`);
    const r = run(l);
    expect(r.output).toContain('changed: [web1] => (item=git)');
    expect(r.output).toContain('skipping: [web1]');
  });
  it('chaîne Terraform → Ansible', () => {
    const l = createLab();
    write(l, 'iac/main.tf', `terraform {\n  required_providers {\n    cloudpeda = {\n      source = "registry.example/ecole/cloudpeda"\n    }\n  }\n}\nresource "cloudpeda_network" "n" {\n  name = "r"\n  cidr = "203.0.113.0/24"\n}\nresource "cloudpeda_vm" "web" {\n  name = "web1"\n  network_id = cloudpeda_network.n.id\n}\n`);
    tf(l, 'iac', 'init'); expect(tf(l, 'iac', 'apply -auto-approve').ok).toBe(true);
    write(l, 'iac/inventory.ini', '[web]\nweb1\n[all:vars]\nansible_become=true\n'); write(l, 'iac/site.yml', PB);
    const r = ans(l, 'iac', 'ansible-playbook -i inventory.ini site.yml');
    expect(r.ok).toBe(true);
  });
  it('ansible-inventory --list', () => {
    const l = labWithVm();
    expect(JSON.parse(ans(l, D, 'ansible-inventory -i inventory.ini --list').output!)._meta.hostvars.web1.ansible_host).toBe('203.0.113.10');
  });
});
