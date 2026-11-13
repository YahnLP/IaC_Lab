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
    skills: ['B2.2'],
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
    steps: [
      { title: 'Le projet, vu d’ensemble', learn: 'Tu as appris deux outils séparément. Dans la vraie vie, ils s’enchaînent :\n1. Terraform crée le réseau et les machines.\n2. Terraform « passe le relais » à Ansible en lui donnant la liste des machines et leurs adresses (c’est l’inventaire).\n3. Ansible installe et configure ce qu’il y a dedans.\n\nLe but : une caisse (web) et un stock (base de données) en test, configurés sans aucune manipulation à la main. Le fichier main.tf contient déjà le réseau et la caisse ; site.yml (déjà écrit) installe nginx sur le groupe web et postgresql sur le groupe bdd.', do: [{ open: 'projet/main.tf', note: 'Terraform : le réseau et la caisse, à compléter.' }, { open: 'projet/site.yml', note: 'Ansible : deux plays, un par groupe. Tu n’as rien à y écrire.' }], expect: 'main.tf décrit une seule machine (caisse) ; site.yml vise deux groupes, web et bdd.' },
      { title: 'Ajouter la machine « stock »', learn: 'Comme pour la caisse : une ressource cloudpeda_vm placée dans le même réseau (par référence).', do: [{ insert: { path: 'projet/main.tf', text: 'resource "cloudpeda_vm" "stock" {\n  name       = "stock"\n  network_id = cloudpeda_network.principal.id\n}\n' }, note: 'Ajoute la machine stock.' }], expect: 'Deux machines décrites dans le code.' },
      { title: 'Produire l’inventaire avec une sortie', learn: 'Ansible a besoin d’un inventaire (groupes + adresses). Les adresses IP ne sont connues qu’après la création des machines : on ne peut pas les écrire à la main à l’avance. Terraform les connaît, donc on lui fait fabriquer le texte de l’inventaire dans une sortie.\n\nDeux fonctions de Terraform sont utilisées :\n• format("%s ansible_host=%s", nom, ip) : remplit un modèle de texte (chaque %s est remplacé par une valeur) ;\n• join("\\n", [ … ]) : colle plusieurs lignes de texte, séparées par un retour à la ligne (\\n).', do: [{ insert: { path: 'projet/main.tf', text: 'output "inventaire" {\n  value = join("\\n", [\n    "[web]",\n    format("%s ansible_host=%s", cloudpeda_vm.caisse.name, cloudpeda_vm.caisse.ip),\n    "[bdd]",\n    format("%s ansible_host=%s", cloudpeda_vm.stock.name, cloudpeda_vm.stock.ip),\n    "[all:vars]",\n    "ansible_become=true",\n  ])\n}\n' }, note: 'Ajoute la sortie « inventaire ».' }], expect: 'Le fichier contient maintenant le réseau, deux machines et une sortie.' },
      { title: 'Créer l’infrastructure', learn: 'Étape Terraform habituelle : init, puis apply.', do: [{ cmd: 'terraform init', note: 'Prépare le dossier.' }, { cmd: 'terraform apply', note: 'Propose de créer 3 ressources (réseau et deux machines).' }, { cmd: 'yes', note: 'Confirme.' }], expect: '« Apply complete! Resources: 3 added » et la sortie « inventaire » affichée à la fin.', until: { done: 'vms' } },
      { title: 'Passer le relais à Ansible', learn: 'Il faut maintenant écrire la sortie dans un fichier : inventory.ini. « terraform output -raw inventaire » affiche le texte de la sortie tel quel ; le symbole « > » envoie ce que la commande affiche dans un fichier au lieu de l’écran.', do: [{ cmd: 'terraform output -raw inventaire', note: 'Regarde d’abord le texte produit.' }, { cmd: 'terraform output -raw inventaire > inventory.ini', note: 'Écris-le dans le fichier inventory.ini.' }, { open: 'projet/inventory.ini', note: 'Ouvre le fichier créé.' }], expect: 'Un inventaire Ansible complet, avec les adresses IP réelles (203.0.113.…) de la caisse et du stock.', until: { done: 'inv' } },
      { title: 'Configurer les machines', learn: 'Dernière étape : Ansible lit l’inventaire fabriqué par Terraform et exécute le playbook.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Configure la caisse et le stock.' }], expect: 'nginx installé sur la caisse, postgresql sur le stock : deux plays « changed ».', until: { done: 'bdd' } },
      { title: 'Qui fait quoi ?', learn: 'Terraform a créé les machines et produit l’inventaire. Qui a installé nginx dans la caisse ?', ask: ['role'], until: { done: 'q:role' } },
      { title: 'Ce qu’il faut retenir', learn: 'Chaque outil fait son métier : Terraform décrit ce qui existe (machines, réseau) et le dit à Ansible ; Ansible décrit ce qu’il y a dedans. Si tu détruis tout et relances ces commandes, tu retrouves exactement la même infrastructure : c’est la promesse du code d’infrastructure.' },
    ],
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
    skills: ['B2.2', 'B3.4'], myth: 'Supprimer un mot de passe du dépôt suffit.',
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
    steps: [
      { title: 'Une demande de la direction', learn: 'Le projet tourne en test. La direction demande deux changements :\n• ouvrir le port 443 de la caisse (pour le https) ;\n• installer fail2ban sur la caisse (un logiciel qui bloque les tentatives de connexion répétées).\n\nLa bonne méthode : on ne touche jamais aux machines à la main. On change le code, on lit ce que l’outil va faire, on applique, puis on versionne le changement pour garder la trace de qui a changé quoi et pourquoi.', do: [{ open: 'projet/main.tf', note: 'Le code Terraform actuel.' }, { open: 'projet/site.yml', note: 'Le playbook Ansible actuel.' }], expect: 'Le schéma montre le réseau et les deux machines, déjà en place.' },
      { title: 'Le port 443 : par Terraform', learn: 'Un pare-feu est une ressource du fournisseur, donc une affaire de Terraform (pas d’Ansible). Ajoute la règle, puis lis le plan AVANT d’appliquer : tu dois voir une seule création, aucune destruction.', do: [{ insert: { path: 'projet/main.tf', text: 'resource "cloudpeda_firewall_rule" "https" {\n  vm_id = cloudpeda_vm.caisse.id\n  port  = 443\n}\n' }, note: 'Ajoute la règle.' }, { cmd: 'terraform plan', note: 'Lis le plan : « Plan: 1 to add, 0 to change, 0 to destroy ».' }, { cmd: 'terraform apply', note: 'Applique.' }, { cmd: 'yes', note: 'Confirme.' }], expect: 'La règle « port 443/tcp » apparaît dans le monde réel, rattachée à la caisse.', until: { done: 'port' } },
      { title: 'fail2ban : par Ansible', learn: 'Un logiciel dans une machine est une affaire d’Ansible. Ajoute une tâche apt au play du groupe web, puis rejoue le playbook.', do: [{ edit: { path: 'projet/site.yml', from: '        state: present\n\n- name: Configurer la base', to: '        state: present\n    - name: Installer fail2ban\n      ansible.builtin.apt:\n        name: fail2ban\n        state: present\n\n- name: Configurer la base' }, note: 'Ajoute la tâche fail2ban dans le play de la caisse.' }, { cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Rejoue le playbook : seule la nouvelle tâche doit afficher « changed ».' }], expect: 'fail2ban installé sur la caisse ; les autres tâches sont « ok ».', until: { done: 'f2b' } },
      { title: 'Versionner avec Git', learn: 'Git garde l’historique de tes fichiers : chaque « commit » est une photo du projet à un instant donné, avec un message. C’est ce qui permet de revenir en arrière et de savoir qui a fait quoi.\n\nPremière étape : initialiser un dépôt Git dans le dossier du projet.', do: [{ cmd: 'git init', note: 'Crée un dépôt Git dans ce dossier.' }], expect: 'Un message annonçant l’initialisation d’un dépôt vide.' },
      { title: 'Ce qui ne doit JAMAIS être versionné', learn: 'Deux fichiers sont dangereux dans un dépôt :\n• terraform.tfstate (et sa sauvegarde) : l’état contient les valeurs réelles, parfois des secrets, et correspond à un environnement précis.\n• secrets.auto.tfvars : il contient un mot de passe.\n\nLe fichier .gitignore liste ce que Git doit ignorer, une ligne par motif. Ouvre d’abord le fichier de secrets pour voir ce qu’on veut protéger, puis crée le .gitignore.', do: [{ open: 'projet/secrets.auto.tfvars', note: 'Un mot de passe en clair : il ne doit pas partir dans le dépôt.' }, { insert: { path: 'projet/.gitignore', text: 'terraform.tfstate\nterraform.tfstate.backup\nsecrets.auto.tfvars\n.terraform/\n' }, note: 'Crée le fichier .gitignore.' }], expect: 'Un nouveau fichier .gitignore apparaît dans la liste des fichiers.' },
      { title: 'Enregistrer le changement', learn: '« git add . » prépare tous les fichiers (sauf ceux ignorés) ; « git commit -m "message" » enregistre la photo avec un message qui explique le changement ; « git status » montre ce qui reste à enregistrer.', do: [{ cmd: 'git add .', note: 'Prépare les fichiers.' }, { cmd: 'git commit -m "Ouvre le port 443 et installe fail2ban"', note: 'Enregistre le changement.' }, { cmd: 'git status', note: 'Vérifie : il ne doit rester rien à enregistrer.' }], expect: 'Le commit contient main.tf et site.yml, mais ni terraform.tfstate ni secrets.auto.tfvars. Ces deux-là n’apparaissent même pas dans « git status ».', until: { done: 'propre' } },
      { title: 'Et si le secret avait été commité ?', learn: 'Imagine que tu aies oublié le .gitignore : le mot de passe est parti dans le dépôt. Tu t’en aperçois, tu le supprimes dans un nouveau commit. Est-il en sécurité ?', ask: ['secret'], until: { done: 'q:secret' } },
      { title: 'Ce qu’il faut retenir', learn: 'Chaque changement passe par le code, est relu dans le plan, puis versionné. L’état et les secrets restent hors du dépôt. Un secret commité par erreur est compromis : on le change, on ne se contente pas de le supprimer.' },
    ],
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
