import { INV, WORLD3, ans } from './common';
import { after, guest, playbookIdempotent } from './checks';
import type { Tp } from './types';

const PAGE = `<h1>Brasserie du Port - {{ inventory_hostname }}</h1>\n`;
const SITE = `- name: Configurer les caisses
  hosts: web
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present
    - name: Démarrer nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
    - name: Déposer la page d'accueil
      ansible.builtin.template:
        src: index.html.j2
        dest: /var/www/html/index.html
      notify: Recharger nginx
  handlers:
    - name: Recharger nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
`;

export const STAGE3: Tp[] = [
  {
    id: '3.1', num: '3.1', stage: 3, minutes: 15, dir: 'config', title: 'Inventaire et ping',
    intention: 'Décrire des machines en groupes et vérifier qu’Ansible les joint.',
    skills: ['B2.2'],
    bilan: 'L’inventaire dit sur qui agir ; sans lui, Ansible ne sait pas où aller. Un ping réussi prouve la jonction, pas la configuration.',
    brief: `Les machines « caisse » et « stock » existent déjà. Décrivez-les dans inventory.ini : « caisse » dans le groupe [web], « stock » dans le groupe [bdd].\n\nVérifiez : ansible web -m ping -i inventory.ini, puis ansible all -m ping -i inventory.ini.`,
    files: { 'config/inventory.ini': `# À vous : décrivez les groupes web et bdd.\n` },
    setup: WORLD3,
    objectives: [
      { id: 'web', label: 'Le groupe [web] contient « caisse »', check: st => /\[web\]\s*\n\s*caisse\b/.test(st.files['config/inventory.ini'] ?? '') },
      { id: 'bdd', label: 'Le groupe [bdd] contient « stock »', check: st => /\[bdd\]\s*\n\s*stock\b/.test(st.files['config/inventory.ini'] ?? '') },
    ],
    questions: [{ id: 'chg', prompt: 'Le ping affiche « changed: false ». Pourquoi ?', choices: ['Il a échoué', 'Il ne modifie rien sur la machine : il vérifie seulement qu’on peut la joindre', 'La machine est éteinte'], correct: 1, explain: 'Le module ping n’agit pas sur la machine. « SUCCESS » et « changed: false » sont normaux.' }],
    hints: ['Un groupe s’écrit : [web] puis un nom de machine par ligne.', 'Une faute de frappe dans le nom donne UNREACHABLE : essayez-la pour voir le message.', 'ansible all -m ping joint toutes les machines de l’inventaire.'],
    solution: [{ write: 'config/inventory.ini', content: INV }, { run: 'ansible web -m ping -i inventory.ini' }, { run: 'ansible all -m ping -i inventory.ini' }, { answer: 'chg' }],
  },
  {
    id: '3.2', num: '3.2', stage: 3, minutes: 20, dir: 'config', title: 'Première tâche, idempotence',
    intention: 'Appliquer deux fois une tâche et lire « changed » puis « changed=0 ».',
    skills: ['B2.2'], myth: 'Relancer un playbook refait tout à chaque fois.',
    bilan: 'Un bon module est idempotent : il constate l’état voulu et n’agit que s’il manque quelque chose.',
    brief: `Complétez site.yml : une tâche qui installe nginx (module ansible.builtin.apt) sur le groupe web.\n\nLancez ansible-playbook -i inventory.ini site.yml. Relancez-le. Comparez les deux « PLAY RECAP ».`,
    files: { 'config/inventory.ini': INV, 'config/site.yml': `- name: Configurer les caisses\n  hosts: web\n  tasks: []\n` },
    setup: WORLD3,
    objectives: [
      guest('nginx', 'nginx est installé sur « caisse »', 'caisse', g => g.packages.includes('nginx')),
      after('rien', '« stock » n’a pas été touchée', 'nginx', st => { const v = Object.values(st.cloud['cloudpeda_vm'] ?? {}).find(x => x['name'] === 'stock'); return !!v && !(v['guest'] as import('../state').Guest).packages.includes('nginx'); }),
    ],
    questions: [{ id: 'recap', prompt: 'Que montre le PLAY RECAP du second passage ?', choices: ['changed=1 : il réinstalle nginx', 'changed=0 : nginx est déjà là, rien à faire', 'failed=1 : nginx est déjà installé'], correct: 1, explain: 'Le premier passage affiche « changed » ; le second « ok » : l’état voulu est déjà atteint.' }],
    hints: ['- name: Installer nginx\n  ansible.builtin.apt:\n    name: nginx\n    state: present', 'ansible_become=true est dans l’inventaire : apt a besoin des droits administrateur.', 'Le second passage doit afficher changed=0.'],
    solution: [
      { write: 'config/site.yml', content: `- name: Configurer les caisses\n  hosts: web\n  tasks:\n    - name: Installer nginx\n      ansible.builtin.apt:\n        name: nginx\n        state: present\n` },
      { run: 'ansible-playbook -i inventory.ini site.yml' }, { run: 'ansible-playbook -i inventory.ini site.yml' }, { answer: 'recap' },
    ],
  },
  {
    id: '3.3', num: '3.3', stage: 3, minutes: 25, dir: 'config', title: 'Playbook complet',
    intention: 'Combiner paquet, service, modèle et handler.',
    skills: ['B2.2'], myth: 'Terraform installe les logiciels dans la machine.',
    bilan: 'Terraform crée la machine ; Ansible y installe et configure. Un handler ne s’exécute que si une tâche a réellement changé quelque chose.',
    brief: `La caisse doit servir une page d’accueil « Brasserie du Port - caisse ». Écrivez le playbook : installer nginx, le démarrer et l’activer, déposer templates/index.html.j2 (module template, destination /var/www/html/index.html). Faites notifier un handler qui recharge nginx quand la page change.\n\nLancez-le deux fois : le handler ne doit apparaître qu’au premier passage.`,
    files: { 'config/inventory.ini': INV, 'config/site.yml': `- name: Configurer les caisses\n  hosts: web\n  tasks: []\n`, 'config/templates/index.html.j2': PAGE },
    setup: WORLD3,
    objectives: [
      guest('nginx', 'nginx est installé et actif sur « caisse »', 'caisse', g => g.packages.includes('nginx') && g.services['nginx']?.active === true),
      guest('page', 'La page affiche « Brasserie du Port - caisse »', 'caisse', g => /Brasserie du Port - caisse/.test(g.files['/var/www/html/index.html']?.content ?? '')),
      { id: 'handler', label: 'Le playbook utilise notify et handlers', check: st => /notify:/.test(st.files['config/site.yml'] ?? '') && /handlers:/.test(st.files['config/site.yml'] ?? '') },
      after('idem', 'Rejoué, le playbook ne change plus rien', 'nginx', st => playbookIdempotent('x', '', 'config').check(st)),
    ],
    questions: [{ id: 'handler', prompt: 'Quand un handler s’exécute-t-il ?', choices: ['À chaque passage', 'Seulement si la tâche qui le notifie a produit un changement', 'Jamais sans --force'], correct: 1, explain: 'Un handler est « déclenché sur changement ». Si la page est déjà conforme, nginx n’est pas rechargé pour rien.' }],
    hints: ['Trois tâches : apt, service (state: started, enabled: true) et template (src, dest).', 'Sous la tâche template : notify: Recharger nginx', 'En fin de play : handlers: avec une tâche portant exactement le même nom.'],
    solution: [{ write: 'config/site.yml', content: SITE }, { run: 'ansible-playbook -i inventory.ini site.yml' }, { run: 'ansible-playbook -i inventory.ini site.yml' }, { answer: 'handler' }],
  },
  {
    id: '3.4', num: '3.4', stage: 3, minutes: 15, dir: 'config', title: '--check, --diff et dérive',
    intention: 'Détecter une modification manuelle sans rien changer, puis la corriger.',
    skills: ['B2.3'],
    bilan: 'Avec --check --diff, on voit ce qui changerait avant de le faire. Une modification manuelle se détecte et se corrige en relançant le playbook.',
    brief: `La caisse est configurée. Un collègue modifie la page à la main : guest caisse write /var/www/html/index.html Page bidouillee, et arrête nginx : guest caisse stop nginx.\n\nDétectez l’écart sans rien modifier : ansible-playbook -i inventory.ini site.yml --check --diff. Puis corrigez en lançant le playbook sans --check.`,
    files: { 'config/inventory.ini': INV, 'config/site.yml': SITE, 'config/templates/index.html.j2': PAGE },
    setup: [...WORLD3, ans('config', 'ansible-playbook -i inventory.ini site.yml')],
    objectives: [
      { id: 'derive', label: 'Vous avez provoqué la dérive (page modifiée et/ou nginx arrêté)', check: st => { const g = (Object.values(st.cloud['cloudpeda_vm'] ?? {}).find(v => v['name'] === 'caisse')?.['guest']) as import('../state').Guest | undefined; return !!g && (!/Brasserie du Port - caisse/.test(g.files['/var/www/html/index.html']?.content ?? '') || g.services['nginx']?.active !== true); } },
      after('retour', 'La caisse est revenue à l’état décrit', 'derive', st => { const g = (Object.values(st.cloud['cloudpeda_vm'] ?? {}).find(v => v['name'] === 'caisse')?.['guest']) as import('../state').Guest | undefined; return !!g && /Brasserie du Port - caisse/.test(g.files['/var/www/html/index.html']?.content ?? '') && g.services['nginx']?.active === true; }),
    ],
    questions: [{ id: 'check', prompt: 'Que fait --check ?', choices: ['Applique les changements puis les annule', 'Simule : montre ce qui changerait sans rien modifier', 'Vérifie seulement la syntaxe'], correct: 1, explain: '--check est un essai à blanc. Avec --diff, il affiche aussi le contenu qui serait modifié.' }],
    hints: ['guest caisse write <chemin> <texte> modifie un fichier dans la machine.', 'guest caisse stop nginx arrête le service ; guest caisse status montre l’état.', 'Sans --check, le playbook remet tout en place.'],
    solution: [
      { run: 'guest caisse write /var/www/html/index.html Page bidouillee' }, { run: 'guest caisse stop nginx' },
      { run: 'ansible-playbook -i inventory.ini site.yml --check --diff' }, { answer: 'check' }, { run: 'ansible-playbook -i inventory.ini site.yml' },
    ],
  },
  {
    id: '3.5', num: '3.5', stage: 3, minutes: 10, dir: 'config', title: 'Le piège de « command »',
    intention: 'Comprendre pourquoi « command » casse l’idempotence et pourquoi --check ne le voit pas.',
    skills: ['B2.3'], myth: '--check garantit que tout est idempotent.',
    bilan: '« command » et « shell » ne savent pas ce qui existe : ils sont toujours « changed ». Préférez un module dédié, ou ajoutez creates.',
    brief: `Le playbook crée un marqueur avec « command ». Lancez-le deux fois : que dit le RECAP ? Lancez-le avec --check : que dit la tâche ?\n\nCorrigez-le pour qu’il devienne idempotent (module file, ou argument creates).`,
    files: { 'config/inventory.ini': INV, 'config/site.yml': `- name: Marqueur\n  hosts: web\n  tasks:\n    - name: Créer le marqueur\n      ansible.builtin.command: touch /tmp/marqueur\n` },
    setup: WORLD3,
    objectives: [playbookIdempotent('idem', 'Rejoué, le playbook ne change plus rien', 'config')],
    questions: [{ id: 'check', prompt: 'Avec --check, la tâche « command » apparaît comme…', choices: ['changed : le défaut est visible', 'skipping : --check ne l’exécute pas et ne peut donc pas voir qu’elle n’est pas idempotente', 'failed'], correct: 1, explain: 'Ansible ne sait pas prédire une commande libre. --check la saute : il ne prouve donc rien sur l’idempotence.' }],
    hints: ['Deux passages : changed=1 deux fois. Le défaut est là.', 'Ajoutez args: { creates: /tmp/marqueur } à la tâche command.', 'Ou utilisez ansible.builtin.file avec path: /tmp/marqueur et state: touch… (state: touch change à chaque fois) ; préférez creates.'],
    solution: [
      { run: 'ansible-playbook -i inventory.ini site.yml' }, { run: 'ansible-playbook -i inventory.ini site.yml' }, { run: 'ansible-playbook -i inventory.ini site.yml --check' }, { answer: 'check' },
      { write: 'config/site.yml', content: `- name: Marqueur\n  hosts: web\n  tasks:\n    - name: Créer le marqueur\n      ansible.builtin.command: touch /tmp/marqueur\n      args:\n        creates: /tmp/marqueur\n` },
    ],
  },
  {
    id: 'TD3', num: 'TD3', stage: 3, minutes: 5, dir: 'config', title: 'Que va faire ce playbook ?',
    intention: 'Prédire ok ou changed sur quatre cas.',
    skills: ['B2.3'],
    bilan: 'Prédire le résultat avant de lancer, c’est comprendre ce que le module vérifie.',
    brief: `Toutes les machines partent d’une Debian toute neuve, sans nginx.\n\nCas A :\n  - apt: name=nginx state=present (premier passage)\n\nCas B :\n  - apt: name=nginx state=present (second passage)\n\nCas C :\n  - command: touch /tmp/x (second passage)\n\nCas D :\n  - copy: dest=/tmp/x content="a" puis la même tâche avec content="b"`,
    files: { 'config/inventory.ini': INV },
    objectives: [],
    questions: [
      { id: 'a', prompt: 'Cas A : résultat de la tâche ?', choices: ['ok', 'changed', 'failed'], correct: 1, explain: 'nginx manque : la tâche l’installe, donc changed.' },
      { id: 'b', prompt: 'Cas B : résultat ?', choices: ['changed', 'ok', 'skipping'], correct: 1, explain: 'Déjà installé : ok.' },
      { id: 'c', prompt: 'Cas C : résultat ?', choices: ['ok', 'changed', 'skipping'], correct: 1, explain: '« command » est toujours changed.' },
      { id: 'd', prompt: 'Cas D : résultat de la seconde tâche ?', choices: ['ok', 'changed : le contenu diffère', 'failed'], correct: 1, explain: 'Le contenu voulu a changé : copy le réécrit.' },
    ],
    hints: ['Demandez-vous : « l’état voulu est-il déjà atteint ? »'],
    solution: [{ answer: 'a' }, { answer: 'b' }, { answer: 'c' }, { answer: 'd' }],
  },
];
void guest;
