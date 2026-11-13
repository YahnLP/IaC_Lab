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
    steps: [
      { title: 'Terraform crée, Ansible configure', learn: 'Terraform sait créer des machines, mais pas ce qu’il y a dedans (logiciels, fichiers, services). C’est le travail d’un autre outil : Ansible. Il se connecte aux machines (ici en SSH simulé) et y exécute des tâches.\n\nPremière question pour Ansible : « sur quelles machines dois-je agir ? ». La réponse s’écrit dans un fichier appelé inventaire. On y range les machines par groupes : [web], [bdd]… Un groupe est une étiquette qui permettra plus tard de dire « configure toutes les caisses ».\n\nLa Brasserie a deux machines, « caisse » et « stock », déjà créées. Regarde-les :', do: [{ cmd: 'cloud list', note: 'Liste les machines qui existent.' }, { open: 'config/inventory.ini', note: 'Ouvre l’inventaire : il est vide pour l’instant (une seule ligne de commentaire).' }], expect: 'Deux machines dans le monde réel : caisse et stock.', until: { ran: '^cloud list' } },
      { title: 'Le groupe [web]', learn: 'Un groupe s’écrit avec son nom entre crochets, suivi d’un nom de machine par ligne. La caisse enregistreuse sert l’application web : elle va dans le groupe [web].', do: [{ insert: { path: 'config/inventory.ini', text: '[web]\ncaisse\n' }, note: 'Ajoute le groupe web à l’inventaire.' }], expect: 'Le fichier contient maintenant [web] et caisse.', until: { done: 'web' } },
      { title: 'Le groupe [bdd]', learn: 'La machine « stock » héberge la base de données (bdd) : elle va dans un autre groupe.', do: [{ insert: { path: 'config/inventory.ini', text: '[bdd]\nstock\n' }, note: 'Ajoute le groupe bdd.' }], expect: 'Deux groupes, une machine chacun.', until: { done: 'bdd' } },
      { title: 'Tester avec un ping', learn: 'Vérifions qu’Ansible joint bien les machines. La commande « ansible » exécute un module sur un groupe :\n• web : le groupe visé\n• -m ping : le module à utiliser (ce « ping » n’est pas celui du réseau : il vérifie qu’Ansible peut se connecter et exécuter du Python)\n• -i inventory.ini : le fichier d’inventaire', do: [{ cmd: 'ansible web -m ping -i inventory.ini', note: 'Teste uniquement le groupe web.' }], expect: '« caisse | SUCCESS » avec « "ping": "pong" ». Seule la caisse a répondu : le groupe web ne contient qu’elle.', until: { ran: '^ansible web' } },
      { title: 'Toutes les machines', learn: '« all » désigne toutes les machines de l’inventaire. Remarque la ligne « "changed": false » dans la réponse.', do: [{ cmd: 'ansible all -m ping -i inventory.ini', note: 'Teste toutes les machines.' }], expect: 'caisse et stock répondent « SUCCESS ».', ask: ['chg'], until: { done: 'q:chg' } },
      { title: 'Ce qu’il faut retenir', learn: 'L’inventaire dit à Ansible sur qui agir, par groupes. Un ping réussi prouve seulement qu’on peut joindre la machine : rien n’est encore configuré. Si tu fais une faute dans un nom de machine, tu obtiens « UNREACHABLE » : c’est le premier réflexe de diagnostic.' },
    ],
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
    steps: [
      { title: 'Le playbook', learn: 'Un playbook est un fichier YAML qui décrit ce qu’on veut sur les machines. Il contient des « plays » : chaque play dit sur quel groupe (hosts) exécuter une liste de tâches (tasks). Chaque tâche utilise un module, un petit programme spécialisé (installer un paquet, copier un fichier, gérer un service…).\n\nLe fichier site.yml est déjà là, avec un play sur le groupe web et une liste de tâches vide (« tasks: [] »). Ouvre-le, ainsi que l’inventaire.', do: [{ open: 'config/site.yml', note: 'Le playbook : un play, aucune tâche.' }, { open: 'config/inventory.ini', note: 'L’inventaire : la ligne ansible_become=true donne aux tâches les droits administrateur, nécessaires pour installer un paquet.' }], expect: 'La caisse est dans le groupe web, la machine stock dans le groupe bdd.' },
      { title: 'Écrire la tâche', learn: 'On veut installer nginx (un serveur web). Le module ansible.builtin.apt gère les paquets Debian. Deux paramètres :\n• name : le paquet\n• state: present : « je veux qu’il soit installé »\n\nRemarque : on ne dit pas « installe nginx » mais « nginx doit être présent ». C’est la même idée que le déclaratif de Terraform. Attention à l’indentation : en YAML, les espaces comptent.', do: [{ edit: { path: 'config/site.yml', from: '  tasks: []', to: '  tasks:\n    - name: Installer nginx\n      ansible.builtin.apt:\n        name: nginx\n        state: present' }, note: 'Ajoute la tâche au playbook.' }], expect: 'Le play contient une tâche « Installer nginx ».' },
      { title: 'Premier passage', learn: 'Lance le playbook. Options : -i désigne l’inventaire, puis le nom du playbook.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Exécute le playbook.' }], expect: 'Pour la tâche « Installer nginx » : « changed: [caisse] ». En bas, le « PLAY RECAP » indique changed=1 : une chose a été modifiée.', until: { done: 'nginx' } },
      { title: 'Deuxième passage', learn: 'Relance exactement la même commande, et compare le PLAY RECAP avec celui du premier passage.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Rejoue le playbook.' }], expect: 'La tâche affiche « ok » et le récapitulatif indique changed=0 : nginx était déjà là, Ansible n’a rien fait.', ask: ['recap'], until: { done: 'q:recap' } },
      { title: 'Et la machine « stock » ?', learn: 'Le play ne visait que le groupe web : la machine stock ne doit pas avoir changé. Vérifie le contenu de chaque machine avec la commande « guest ».', do: [{ cmd: 'guest caisse status', note: 'Affiche les paquets et services de la caisse.' }, { cmd: 'guest stock status', note: 'Affiche ceux de stock.' }], expect: 'nginx apparaît dans les paquets de la caisse, pas dans ceux de stock.', until: { ran: '^guest stock' } },
      { title: 'Ce qu’il faut retenir', learn: 'Un module bien écrit est idempotent : il regarde d’abord si l’état voulu est atteint, et n’agit que si ce n’est pas le cas. Rejouer un playbook est donc sans danger.' },
    ],
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
    steps: [
      { title: 'Ce que doit faire la caisse', learn: 'La caisse doit servir une page d’accueil « Brasserie du Port - caisse ». Pour cela, il faut : installer nginx, le démarrer (et l’activer au démarrage de la machine), puis déposer la page.\n\nLa page est un modèle (template) : le fichier templates/index.html.j2 contient {{ inventory_hostname }}, qu’Ansible remplace par le nom de chaque machine. Le même modèle sert donc à toutes les machines.', do: [{ open: 'config/templates/index.html.j2', note: 'Le modèle de page, avec sa variable entre doubles accolades.' }, { open: 'config/site.yml', note: 'Le playbook, encore vide.' }], expect: 'Une ligne de HTML contenant {{ inventory_hostname }}.' },
      { title: 'Installer nginx', learn: 'Commence par la tâche que tu connais : installer nginx.', do: [{ edit: { path: 'config/site.yml', from: '  tasks: []', to: '  tasks:\n    - name: Installer nginx\n      ansible.builtin.apt:\n        name: nginx\n        state: present' }, note: 'Ajoute la tâche d’installation.' }], expect: 'Une tâche dans le play.' },
      { title: 'Démarrer le service', learn: 'Un paquet installé n’est pas forcément lancé. Le module ansible.builtin.service gère les services : state: started (il tourne maintenant) et enabled: true (il se lancera à chaque démarrage).', do: [{ edit: { path: 'config/site.yml', from: '        state: present\n', to: '        state: present\n    - name: Démarrer nginx\n      ansible.builtin.service:\n        name: nginx\n        state: started\n        enabled: true\n' }, note: 'Ajoute la tâche de démarrage.' }], expect: 'Deux tâches, bien alignées.' },
      { title: 'Déposer la page', learn: 'Le module ansible.builtin.template remplit le modèle et le copie sur la machine : src est le modèle (dans le dossier templates), dest l’endroit où il atterrit.', do: [{ edit: { path: 'config/site.yml', from: '        enabled: true\n', to: '        enabled: true\n    - name: Déposer la page d\'accueil\n      ansible.builtin.template:\n        src: index.html.j2\n        dest: /var/www/html/index.html\n' }, note: 'Ajoute la tâche de dépôt de la page.' }], expect: 'Trois tâches : apt, service, template.' },
      { title: 'Recharger nginx quand la page change', learn: 'Quand la page change, nginx doit la recharger. Mais pas à chaque passage : seulement si elle a vraiment changé. C’est le rôle d’un handler : une tâche « en attente » qui ne s’exécute que si une autre tâche la notifie après avoir produit un changement.\n\n• Sous la tâche template : notify: Recharger nginx\n• Au niveau du play, une section handlers: avec une tâche portant exactement le même nom.', do: [{ edit: { path: 'config/site.yml', from: '        dest: /var/www/html/index.html\n', to: '        dest: /var/www/html/index.html\n      notify: Recharger nginx\n  handlers:\n    - name: Recharger nginx\n      ansible.builtin.service:\n        name: nginx\n        state: reloaded\n' }, note: 'Ajoute notify et le handler.' }], expect: 'Le fichier se termine par une section handlers.', until: { done: 'handler' } },
      { title: 'Premier passage', learn: 'Lance le playbook. Regarde les tâches une par une, puis la ligne « RUNNING HANDLER ».', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Exécute le playbook.' }], expect: 'Trois tâches « changed » (ou « ok » pour le service), puis « RUNNING HANDLER [Recharger nginx] ». La page est déposée sur la caisse.', until: { done: 'page' } },
      { title: 'Deuxième passage', learn: 'Rejoue. Cette fois, plus rien ne change : le handler n’a aucune raison de s’exécuter.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Rejoue le playbook.' }], expect: 'Toutes les tâches sont « ok », aucune ligne « RUNNING HANDLER », changed=0.', ask: ['handler'], until: { done: 'q:handler' } },
      { title: 'Ce qu’il faut retenir', learn: 'Terraform crée la machine ; Ansible y installe et y configure. Un handler ne se déclenche que sur un vrai changement : pas de rechargement inutile.' },
    ],
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
    steps: [
      { title: 'La caisse est en ordre', learn: 'Dans le TP 2.2, tu as vu la dérive côté infrastructure (la taille d’une machine changée à la main). Elle existe aussi à l’intérieur des machines : un fichier modifié, un service arrêté.\n\nLa caisse a été configurée par le playbook : nginx tourne et affiche la page « Brasserie du Port ». Vérifie.', do: [{ open: 'config/site.yml', note: 'Le playbook de la caisse.' }, { cmd: 'guest caisse status', note: 'Affiche l’état de la caisse : nginx doit être actif.' }], expect: 'nginx installé, service « actif ».', until: { ran: '^guest caisse status' } },
      { title: 'Provoquer la dérive', learn: 'Un collègue pressé modifie la page à la main et arrête nginx. Fais comme lui : « guest » agit directement à l’intérieur de la machine, sans passer par Ansible.', do: [{ cmd: 'guest caisse write /var/www/html/index.html Page bidouillee', note: 'Remplace le contenu de la page.' }, { cmd: 'guest caisse stop nginx', note: 'Arrête le service nginx.' }], expect: 'La caisse ne correspond plus à ce que décrit le playbook.', until: { done: 'derive' } },
      { title: 'Détecter sans rien changer', learn: 'L’option --check lance le playbook « à blanc » : Ansible dit ce qu’il changerait, sans le faire. L’option --diff affiche en plus le contenu qui serait modifié.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml --check --diff', note: 'Simule le playbook et montre les différences.' }], expect: 'Des tâches « changed » (le service, la page) et, avec --diff, les lignes retirées (-) et ajoutées (+) dans la page. Rien n’est modifié.', ask: ['check'], until: { done: 'q:check' } },
      { title: 'Corriger', learn: 'Pour remettre la caisse d’aplomb, il suffit de rejouer le playbook sans --check.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Applique le playbook.' }], expect: 'La page est rétablie, nginx est redémarré.', until: { done: 'retour' } },
      { title: 'Ce qu’il faut retenir', learn: '--check --diff permet de voir avant d’agir, et de détecter une dérive. Pour la corriger : rejouer le playbook. Comme pour Terraform, on modifie par le code, pas à la main.' },
    ],
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
    steps: [
      { title: 'Un module un peu trop libre', learn: 'Il existe un module « command » qui exécute n’importe quelle commande. C’est pratique, mais dangereux : Ansible ne sait pas ce que fait la commande, donc ne peut pas savoir si elle a déjà été exécutée. Résultat : elle est toujours considérée comme « changed ».\n\nLe playbook crée un fichier marqueur avec « touch ». Ouvre-le.', do: [{ open: 'config/site.yml', note: 'Une seule tâche, avec le module command.' }], expect: 'La tâche « Créer le marqueur » utilise ansible.builtin.command.' },
      { title: 'Le jouer deux fois', learn: 'Lance le playbook deux fois et regarde le PLAY RECAP à chaque fois.', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Premier passage.' }, { cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Deuxième passage.' }], expect: 'changed=1 aux deux passages : le fichier existe déjà, mais Ansible le « recrée » quand même.', until: { ran: '^ansible-playbook' } },
      { title: '--check ne voit rien', learn: 'Essaie maintenant le mode simulation. Un module idempotent montrerait « ok » ou « changed » ; que dit la tâche command ?', do: [{ cmd: 'ansible-playbook -i inventory.ini site.yml --check', note: 'Simule le playbook.' }], expect: 'La tâche est « skipping » : Ansible ne peut pas prédire ce que fait une commande libre.', ask: ['check'], until: { done: 'q:check' } },
      { title: 'Corriger avec « creates »', learn: 'Pour rendre la tâche idempotente, on ajoute l’argument creates : « si ce fichier existe déjà, ne fais rien ». Il suffit de dire à Ansible quel fichier la commande produit.', do: [{ edit: { path: 'config/site.yml', from: '      ansible.builtin.command: touch /tmp/marqueur\n', to: '      ansible.builtin.command: touch /tmp/marqueur\n      args:\n        creates: /tmp/marqueur\n' }, note: 'Ajoute args: creates à la tâche.' }, { cmd: 'ansible-playbook -i inventory.ini site.yml', note: 'Relance le playbook.' }], expect: 'La tâche n’est plus « changed » : changed=0.', until: { done: 'idem' } },
      { title: 'Ce qu’il faut retenir', learn: 'Préfère toujours un module dédié (file, apt, copy…) : il connaît l’état voulu. Avec command ou shell, ajoute creates (ou removes), sinon la tâche n’est jamais idempotente. Et --check ne prouve rien pour ces tâches-là.' },
    ],
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
    steps: [
      { title: 'Prédire avant de lancer', learn: 'Toutes les machines partent d’une Debian toute neuve, sans nginx. Pour chaque cas, prédis le résultat de la tâche. La bonne question à se poser : « l’état voulu est-il déjà atteint ? ». Si oui, « ok » ; sinon, « changed ».' },
      { title: 'Cas A', learn: '- apt: name=nginx state=present\n(premier passage)', ask: ['a'], until: { done: 'q:a' } },
      { title: 'Cas B', learn: '- apt: name=nginx state=present\n(second passage)', ask: ['b'], until: { done: 'q:b' } },
      { title: 'Cas C', learn: '- command: touch /tmp/x\n(second passage)', ask: ['c'], until: { done: 'q:c' } },
      { title: 'Cas D', learn: '- copy: dest=/tmp/x content="a"\npuis, plus tard, la même tâche avec content="b"', ask: ['d'], until: { done: 'q:d' } },
      { title: 'Ce qu’il faut retenir', learn: 'Prédire le résultat avant de lancer, c’est comprendre ce que chaque module vérifie.' },
    ],
    hints: ['Demandez-vous : « l’état voulu est-il déjà atteint ? »'],
    solution: [{ answer: 'a' }, { answer: 'b' }, { answer: 'c' }, { answer: 'd' }],
  },
];
void guest;
