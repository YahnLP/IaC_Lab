import { PROV, NET, VM, ans } from './common';
import { after, committed, guest, playbookIdempotent, ruleOn, worldHas } from './checks';
import type { Tp } from './types';

const SITE4 = `- name: Configurer la caisse
  hosts: web
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present

- name: Configurer la base de données
  hosts: bdd
  tasks:
    - name: Installer postgresql
      ansible.builtin.apt:
        name: postgresql
        state: present
`;

const MAIN41 = `${PROV}
${NET}
${VM}
# À vous : ajoutez la machine « stock » et la sortie « inventaire ».
`;
const STOCK = `resource "cloudpeda_vm" "stock" {
  name       = "stock"
  network_id = cloudpeda_network.principal.id
}
`;
const INVENTAIRE = `output "inventaire" {
  value = join("\\n", [
    "[web]",
    format("%s ansible_host=%s", cloudpeda_vm.caisse.name, cloudpeda_vm.caisse.ip),
    "[bdd]",
    format("%s ansible_host=%s", cloudpeda_vm.stock.name, cloudpeda_vm.stock.ip),
    "[all:vars]",
    "ansible_become=true",
  ])
}
`;

const MAIN42 = `${PROV}
${NET}
${VM}
${STOCK}
${INVENTAIRE}`;

export const STAGE4: Tp[] = [
  {
    id: '4.1', num: '4.1', stage: 4, minutes: 35, dir: 'projet', title: 'Mini-projet : Terraform crée, Ansible configure',
    intention: 'Enchaîner les deux outils : l’inventaire d’Ansible est produit par une sortie de Terraform.',
    skills: ['B2.2.6', 'B2.3.2'],
    bilan: 'Terraform décrit ce qui existe (machines, réseau) et le dit à Ansible ; Ansible décrit ce qu’il y a dedans. Aucun des deux ne fait le travail de l’autre.',
    brief: `Le projet doit créer la caisse (web) et le stock (base de données) en test, puis les configurer.\n\n1. Dans main.tf, ajoutez la machine « stock » et une sortie « inventaire » qui produit un inventaire Ansible (groupes web et bdd, adresse de chaque machine).\n2. terraform init, terraform apply.\n3. terraform output -raw inventaire > inventory.ini\n4. ansible-playbook -i inventory.ini site.yml (déjà écrit).`,
    files: { 'projet/main.tf': MAIN41, 'projet/site.yml': SITE4 },
    objectives: [
      worldHas('vms', 'Les machines « caisse » et « stock » existent', 'cloudpeda_vm', { name: 'stock' }),
      { id: 'inv', label: 'inventory.ini est produit par Terraform (adresses incluses)', check: st => /ansible_host=203\.0\.113\.\d+/.test(st.files['projet/inventory.ini'] ?? '') },
      guest('web', 'nginx est installé sur la caisse', 'caisse', g => g.packages.includes('nginx')),
      guest('bdd', 'postgresql est installé et actif sur le stock', 'stock', g => g.packages.includes('postgresql') && g.services['postgresql']?.active === true),
    ],
    questions: [{ id: 'role', prompt: 'Qui installe nginx dans la machine ?', choices: ['Terraform, au moment de créer la machine', 'Ansible, une fois la machine créée', 'Le fournisseur, automatiquement'], correct: 1, explain: 'Terraform crée la machine et sa place dans le réseau. Le logiciel qu’elle contient relève d’Ansible.' }],
    hints: ['resource "cloudpeda_vm" "stock" { name = "stock"  network_id = cloudpeda_network.principal.id }', 'Une sortie peut assembler du texte avec join et format : voir l’exemple du cours sur les chaînes.', 'Le symbole > envoie la sortie d’une commande dans un fichier : terraform output -raw inventaire > inventory.ini'],
    solution: [
      { write: 'projet/main.tf', content: `${PROV}\n${NET}\n${VM}\n${STOCK}\n${INVENTAIRE}` },
      { run: 'terraform init' }, { run: 'terraform apply -auto-approve' }, { run: 'terraform output -raw inventaire > inventory.ini' },
      { run: 'ansible-playbook -i inventory.ini site.yml' }, { answer: 'role' },
    ],
  },
  {
    id: '4.2', num: '4.2', stage: 4, minutes: 25, dir: 'projet', title: 'Changement et bonnes pratiques',
    intention: 'Faire évoluer l’infrastructure par le code, relire le plan, et garder les secrets hors du dépôt.',
    skills: ['B2.2.5', 'B2.2.4'], myth: 'Supprimer un mot de passe du dépôt suffit.',
    bilan: 'Chaque changement passe par le code, est relu dans le plan, puis versionné. L’état et les secrets restent hors du dépôt : un secret commité reste dans l’historique.',
    brief: `Le projet tourne en test. La direction demande : ouvrir le port 443 de la caisse et installer fail2ban sur la caisse.\n\nFaites-le par le code (règle de pare-feu dans main.tf, tâche apt dans site.yml). Lisez le plan avant d’appliquer.\n\nPuis versionnez : git init, créez un .gitignore qui exclut l’état Terraform (terraform.tfstate et sa sauvegarde) et le fichier de secrets (secrets.auto.tfvars), git add ., git commit -m "…". Vérifiez avec git status.`,
    files: { 'projet/main.tf': MAIN42, 'projet/site.yml': SITE4, 'projet/secrets.auto.tfvars': 'admin_password = "mot-de-passe-de-test"\n' },
    setup: [
      { type: 'tf.exec', payload: { dir: 'projet', line: 'terraform init' } },
      { type: 'tf.exec', payload: { dir: 'projet', line: 'terraform apply -auto-approve' } },
      { type: 'fs.write', payload: { path: 'projet/inventory.ini', content: '[web]\ncaisse\n[bdd]\nstock\n[all:vars]\nansible_become=true\n' } },
      ans('projet', 'ansible-playbook -i inventory.ini site.yml'),
    ],
    objectives: [
      ruleOn('port', 'La règle du port 443 existe sur la caisse', 'caisse', 443),
      guest('f2b', 'fail2ban est installé sur la caisse', 'caisse', g => g.packages.includes('fail2ban')),
      { id: 'commit', label: 'Un commit contient main.tf et site.yml', check: st => { const f = committed(st, 'projet'); return !!f && 'main.tf' in f && 'site.yml' in f; } },
      after('propre', 'Ni l’état Terraform ni les secrets ne sont dans le commit', 'commit', st => { const f = committed(st, 'projet'); return !!f && !Object.keys(f).some(k => k.startsWith('terraform.tfstate') || k === 'secrets.auto.tfvars'); }),
      after('sync', 'Terraform et Ansible n’ont plus rien à changer', 'port', st => playbookIdempotent('x', '', 'projet').check(st)),
    ],
    questions: [{ id: 'secret', prompt: 'Un mot de passe a été commité par erreur, puis supprimé dans le commit suivant. Est-il en sécurité ?', choices: ['Oui : il n’est plus dans les fichiers', 'Non : il reste dans l’historique, il faut le changer', 'Oui, Git chiffre l’historique'], correct: 1, explain: 'L’historique conserve tout. Un secret commité est compromis : on le change, on ne se contente pas de le supprimer.' }],
    hints: ['resource "cloudpeda_firewall_rule" "https" { vm_id = cloudpeda_vm.caisse.id  port = 443 }', 'Dans site.yml, une tâche apt avec name: fail2ban dans le play « web ».', 'Dans .gitignore, une ligne par motif : terraform.tfstate, terraform.tfstate.backup, secrets.auto.tfvars'],
    solution: [
      { write: 'projet/main.tf', content: `${MAIN42}\nresource "cloudpeda_firewall_rule" "https" {\n  vm_id = cloudpeda_vm.caisse.id\n  port  = 443\n}\n` },
      { write: 'projet/site.yml', content: SITE4.replace('        state: present\n\n- name: Configurer la base', '        state: present\n    - name: Installer fail2ban\n      ansible.builtin.apt:\n        name: fail2ban\n        state: present\n\n- name: Configurer la base') },
      { run: 'terraform plan' }, { run: 'terraform apply -auto-approve' }, { run: 'ansible-playbook -i inventory.ini site.yml' },
      { run: 'git init' }, { write: 'projet/.gitignore', content: 'terraform.tfstate\nterraform.tfstate.backup\nsecrets.auto.tfvars\n.terraform/\n' },
      { run: 'git add .' }, { run: 'git commit -m "Ouvre le port 443 et installe fail2ban"' }, { run: 'git status' }, { answer: 'secret' },
    ],
  },
];
void worldHas;
