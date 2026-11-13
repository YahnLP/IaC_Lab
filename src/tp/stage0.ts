import { cloud } from './common';
import { ruleOn, worldHas } from './checks';
import type { Tp } from './types';

export const STAGE0: Tp[] = [
  {
    id: '0.0', num: '0.0', stage: 0, minutes: 5, dir: 'atelier', title: 'Prise en main du simulateur',
    intention: 'Savoir où lire, où écrire et où taper les commandes avant de commencer.',
    skills: [],
    bilan: 'Tu sais lire la consigne, ouvrir un fichier, taper une commande et lire le schéma : tu peux commencer.',
    brief: 'Visite guidée du simulateur.',
    files: { 'atelier/bienvenue.txt': 'Bienvenue à la Brasserie du Port !\nCe fichier est un exemple : ouvre-le dans l’éditeur.\n' },
    objectives: [],
    questions: [{ id: 'zone', prompt: 'Où tape-t-on les commandes ?', choices: ['Dans l’éditeur, au centre en haut', 'Dans le terminal, au centre en bas', 'Dans le schéma, à droite'], correct: 1, explain: 'Le terminal est la zone noire en bas : tu y tapes une commande puis Entrée. L’éditeur sert à écrire des fichiers.' }],
    steps: [
      { title: 'Les quatre zones', learn: 'Tu es dans un simulateur : rien de ce que tu fais ici n’abîme un vrai ordinateur, et tu peux toujours recommencer.\n\nL’écran a quatre zones.\n1. À gauche, la Mission : ce texte. Il t’explique ce qu’il faut comprendre, puis ce qu’il faut faire.\n2. Au centre en haut, l’Éditeur : tu y lis et tu y écris des fichiers (du code).\n3. Au centre en bas, le Terminal : tu y tapes des commandes, puis Entrée.\n4. À droite, le Schéma : il montre ce qui existe vraiment, ce que contient le code et ce que l’outil a noté.', do: [{ open: 'atelier/bienvenue.txt', note: 'Clique sur « bienvenue.txt » dans la liste Fichiers (à gauche, en bas) : il s’ouvre dans l’éditeur.' }], expect: 'Le texte « Bienvenue à la Brasserie du Port ! » apparaît dans l’éditeur.' },
      { title: 'Ta première commande', learn: 'Une commande est une ligne de texte que tu tapes dans le terminal. Le bouton « Mettre dans le terminal » la recopie à ta place : tu n’as plus qu’à appuyer sur Entrée.\n\nLa commande « ls » (list) affiche les fichiers du dossier où tu te trouves.', do: [{ cmd: 'ls', note: 'Affiche la liste des fichiers du dossier courant.' }, { cmd: 'cat bienvenue.txt', note: 'Affiche le contenu d’un fichier dans le terminal.' }], expect: 'Le terminal affiche « bienvenue.txt », puis le texte du fichier.', until: { ran: '^cat\\s+bienvenue' } },
      { title: 'Le schéma à droite', learn: 'Le schéma a trois colonnes.\n• Code : ce que tu as décrit dans les fichiers.\n• État : ce que l’outil a noté de ce qu’il a fait.\n• Monde réel : ce qui existe vraiment chez le fournisseur (le « cloud »).\n\nUne boîte verte veut dire « code, état et monde sont d’accord ». Une boîte jaune : « décrit mais pas encore créé ». Une boîte violette : « existe, mais n’est décrit dans aucun code ».\n\nCréons un réseau directement dans le monde réel, sans code, pour voir.', do: [{ cmd: 'cloud create network name=essai cidr=198.51.100.0/24', note: 'Crée un réseau « essai » directement chez le fournisseur.' }], expect: 'Une boîte violette « réseau · essai » apparaît dans la colonne Monde réel : elle existe, mais aucun code ne la décrit.', until: { ran: '^cloud create network' } },
      { title: 'Demander de l’aide', learn: 'Si tu ne te souviens plus d’une commande, tape « help ». Sous le terminal, le bandeau « Pourquoi ? » explique en une phrase ce que vient de faire ta dernière commande : n’hésite pas à l’ouvrir.\n\nEn cas de blocage, le bouton « Indice » de la Mission donne un coup de pouce, et « Recommencer » remet le TP à zéro.', do: [{ cmd: 'help', note: 'Liste toutes les commandes disponibles.' }], ask: ['zone'], until: { done: 'q:zone' } },
    ],
    hints: ['Les commandes se tapent dans la zone noire en bas, puis Entrée.'],
    solution: [{ answer: 'zone' }],
  },
  {
    id: '0.1', num: '0.1', stage: 0, minutes: 15, dir: 'atelier', title: 'Monter, puis refaire à la main',
    intention: 'Constater qu’une infrastructure refaite à la main ne ressemble jamais tout à fait à la première.',
    skills: ['B2.2'], myth: 'Une infrastructure bien documentée se refait à l’identique.',
    bilan: 'Sans description écrite et relisible, la copie diffère de l’original et personne ne sait en quoi : c’est le problème que le code résout.',
    brief: 'Refaire à la main une copie de la production en suivant une fiche, puis comparer.',
    files: { 'atelier/recette.txt': `1. cloud create network name=reseau-recette cidr=198.51.100.0/24\n2. cloud create vm name=caisse-recette network_id=net-0002\n3. cloud create firewall_rule vm_id=vm-0002 port=22\n` },
    setup: [
      cloud('network', { name: 'reseau-brasserie', cidr: '203.0.113.0/24' }),
      cloud('vm', { name: 'caisse', network_id: 'net-0001' }),
      cloud('firewall_rule', { vm_id: 'vm-0001', port: 22 }),
      cloud('firewall_rule', { vm_id: 'vm-0001', port: 443 }),
    ],
    objectives: [
      worldHas('vm', 'La machine « caisse-recette » existe', 'cloudpeda_vm', { name: 'caisse-recette' }),
      ruleOn('ssh', 'La règle du port 22 existe sur la recette', 'caisse-recette', 22),
      ruleOn('https', 'Après comparaison, la recette a aussi le port 443', 'caisse-recette', 443),
    ],
    questions: [{ id: 'diff', prompt: 'Que montre la comparaison entre la production et la recette ?', choices: ['Il manque la règle du port 443 en recette, et la fiche ne la mentionnait pas', 'La recette n’a pas de réseau', 'La production n’a pas de règle de pare-feu'], correct: 0, explain: 'La fiche était incomplète : la règle 443 avait été ajoutée à la main en production sans être notée. Rien ne le disait.' }],
    steps: [
      { title: 'La situation', learn: 'La Brasserie du Port a un petit système informatique : un réseau, une machine virtuelle « caisse » (elle fait tourner la caisse enregistreuse) et deux règles de pare-feu.\n\nUn pare-feu est un portier : il décide quelles « portes » (les ports, numérotés) sont ouvertes. Le port 22 sert à administrer la machine à distance ; le port 443 sert à afficher un site web sécurisé (https).\n\nTout cela existe déjà : c’est la production. Regarde le schéma à droite, colonne « Monde réel », puis liste ce qui existe avec la commande ci-dessous.', do: [{ cmd: 'cloud list', note: 'Liste tout ce qui existe chez le fournisseur (le « cloud »).' }], expect: 'Tu vois un réseau (net-0001), une machine « caisse » (vm-0001) et deux règles de pare-feu : ports 22 et 443, toutes deux sur vm-0001.', until: { ran: '^cloud list' } },
      { title: 'Refaire une copie « à la main »', learn: 'On te demande de monter une copie de cette infrastructure pour faire des essais : une « recette ».\n\nJulien, l’ancien technicien, a laissé une fiche : « recette.txt ». Ouvre-la, puis tape ses trois commandes une par une. « cloud create » crée un objet directement chez le fournisseur : rien n’est écrit nulle part, à part dans ta tête et dans la fiche.', do: [{ open: 'atelier/recette.txt', note: 'Ouvre la fiche de Julien dans l’éditeur.' }, { cmd: 'cloud create network name=reseau-recette cidr=198.51.100.0/24', note: '1. Crée le réseau de la recette.' }, { cmd: 'cloud create vm name=caisse-recette network_id=net-0002', note: '2. Crée la machine, rattachée à ce réseau (net-0002, l’identifiant affiché à l’étape 1).' }, { cmd: 'cloud create firewall_rule vm_id=vm-0002 port=22', note: '3. Ouvre le port 22 sur la nouvelle machine (vm-0002).' }], expect: 'Chaque commande répond « … créé ». Trois nouvelles boîtes apparaissent dans le schéma.', until: { done: 'ssh' } },
      { title: 'Comparer avec la production', learn: 'La copie est-elle identique à l’original ? Compare, objet par objet. Regarde en particulier les règles de pare-feu : à quelle machine appartient chacune, et quel port ouvre-t-elle ?', do: [{ cmd: 'cloud list', note: 'Relis la liste complète et compare les lignes « firewall_rule ».' }], expect: 'La production a deux règles (ports 22 et 443). La recette n’en a qu’une (port 22).', ask: ['diff'], until: { done: 'q:diff' } },
      { title: 'Corriger la différence', learn: 'Il manque donc la règle du port 443 sur la recette. La fiche de Julien ne la mentionnait pas : il l’avait ajoutée à la main un jour, sans la noter.\n\nPour ajouter une règle : « cloud create firewall_rule vm_id=<machine> port=<numéro> ». La machine de la recette est vm-0002.', do: [{ cmd: 'cloud create firewall_rule vm_id=vm-0002 port=443', note: 'Ajoute la règle manquante : ouvre le port 443 sur la recette.' }], expect: 'La recette a maintenant les deux règles, comme la production.', until: { done: 'https' } },
      { title: 'Ce qu’il faut retenir', learn: 'Tu as réussi, mais seulement parce qu’on t’a mis sur la piste. Dans la vraie vie, personne ne sait qu’il manque quelque chose : la fiche semblait complète, et rien ne permet de comparer automatiquement.\n\nSi l’infrastructure était décrite dans un fichier à jour, on la recréerait à l’identique en une commande, et on pourrait comparer la description à la réalité. C’est exactement ce que fait le code d’infrastructure, que tu vas découvrir dans le TP suivant.' },
    ],
    hints: ['Tape les commandes de la fiche une par une dans le terminal.', '« cloud list » affiche tout : compare les lignes « firewall_rule » des deux machines.', 'Pour corriger : cloud create firewall_rule vm_id=vm-0002 port=443'],
    solution: [
      { run: 'cloud list' },
      { run: 'cloud create network name=reseau-recette cidr=198.51.100.0/24' },
      { run: 'cloud create vm name=caisse-recette network_id=net-0002' },
      { run: 'cloud create firewall_rule vm_id=vm-0002 port=22' },
      { answer: 'diff' },
      { run: 'cloud create firewall_rule vm_id=vm-0002 port=443' },
    ],
  },
  {
    id: '0.2', num: '0.2', stage: 0, minutes: 15, dir: 'atelier', title: 'Déclaratif ou impératif',
    intention: 'Distinguer « fais ceci » (script) et « je veux cela » (description) en les rejouant deux fois.',
    skills: ['B2.2'], myth: 'Le code d’infrastructure est une liste d’étapes à suivre.',
    bilan: 'Un script décrit des actions et échoue ou duplique quand on le rejoue ; une description décrit un résultat et ne fait que ce qui manque.',
    brief: 'Rejouer un script puis une description : comparer ce qui se passe au second passage.',
    files: {
      'atelier/creer.sh': `# Script impératif : une suite d'actions\ncloud create network name=reseau-script cidr=198.51.100.0/24\ncloud create vm name=caisse-script network_id=net-0001\n`,
      'atelier/main.tf': `terraform {\n  required_providers {\n    cloudpeda = {\n      source = "registry.example/ecole/cloudpeda"\n    }\n  }\n}\n\nresource "cloudpeda_network" "reseau" {\n  name = "reseau-tf"\n  cidr = "203.0.113.0/24"\n}\n\nresource "cloudpeda_vm" "caisse" {\n  name       = "caisse-tf"\n  network_id = cloudpeda_network.reseau.id\n}\n`,
    },
    objectives: [
      worldHas('script', 'Le script a créé « caisse-script »', 'cloudpeda_vm', { name: 'caisse-script' }),
      worldHas('tf', 'Terraform a créé « caisse-tf »', 'cloudpeda_vm', { name: 'caisse-tf' }),
    ],
    questions: [
      { id: 'script', prompt: 'Que se passe-t-il quand on rejoue le script ?', choices: ['Il recrée tout sans rien dire', 'Les commandes échouent : les objets existent déjà', 'Il détecte tout seul qu’il n’y a rien à faire'], correct: 1, explain: 'Le script exécute chaque action, qu’elle soit utile ou non. Il n’a aucune notion de « ce qui existe déjà ».' },
      { id: 'tf', prompt: 'Et au second « terraform apply » ?', choices: ['Il recrée les machines', 'Il affiche une erreur', 'Il constate que le monde correspond déjà à la description (« No changes »)'], correct: 2, explain: 'Terraform compare ce que tu veux avec ce qui existe, puis ne fait que la différence. Le code décrit un résultat, pas des étapes.' },
    ],
    steps: [
      { title: 'Deux façons de dire la même chose', learn: 'Imagine que tu veux une pizza.\n• Façon « impérative » : tu donnes la recette pas à pas (pétris la pâte, étale, garnis, enfourne 10 minutes). Si on te redonne la recette, on refait une pizza de plus.\n• Façon « déclarative » : tu dis seulement « je veux une pizza margherita sur la table ». Si elle y est déjà, personne ne cuisine.\n\nDeux fichiers vont te permettre de comparer. creer.sh est un script : une liste d’ordres. main.tf est une description : il dit ce qu’on veut, pas comment.', do: [{ open: 'atelier/creer.sh', note: 'Lis le script : deux ordres « cloud create » (le # commence un commentaire).' }, { open: 'atelier/main.tf', note: 'Lis la description (Terraform) : elle décrit un réseau et une machine, sans dire comment les créer.' }], expect: 'Les deux fichiers produisent le même genre de résultat : un réseau et une machine.' },
      { title: 'Lancer le script', learn: '« bash » exécute les lignes d’un fichier script, l’une après l’autre.', do: [{ cmd: 'bash creer.sh', note: 'Exécute le script : il crée un réseau et une machine.' }], expect: 'Deux lignes « … créé ». Dans le schéma, deux boîtes violettes apparaissent (elles existent, mais aucun code Terraform ne les décrit).', until: { done: 'script' } },
      { title: 'Rejouer le script', learn: 'Que se passe-t-il si on relance exactement la même commande ? Fais l’essai avant de répondre.', do: [{ cmd: 'bash creer.sh', note: 'Relance le même script, une seconde fois.' }], expect: 'Des messages d’erreur rouges : les objets existent déjà.', ask: ['script'], until: { done: 'q:script' } },
      { title: 'Lancer la description', learn: 'Terraform lit main.tf. Il a besoin de deux choses avant de travailler :\n1. « terraform init » prépare le dossier (il choisit le fournisseur « cloudpeda »).\n2. « terraform apply » compare ta description avec ce qui existe, affiche ce qu’il va faire, puis te demande confirmation : tape « yes » puis Entrée.', do: [{ cmd: 'terraform init', note: 'Prépare le dossier de travail. À faire une seule fois.' }, { cmd: 'terraform apply', note: 'Calcule et propose les changements. Réponds « yes » quand il te le demande.' }, { cmd: 'yes', note: 'Confirme l’application.' }], expect: '« Plan: 2 to add, 0 to change, 0 to destroy », puis « Apply complete! Resources: 2 added ». Les boîtes du schéma deviennent vertes.', until: { done: 'tf' } },
      { title: 'Rejouer la description', learn: 'Relance exactement la même commande. Terraform va comparer ta description avec la réalité.', do: [{ cmd: 'terraform apply', note: 'Relance l’application. Aucune confirmation ne sera demandée s’il n’y a rien à faire.' }], expect: '« No changes. Your infrastructure matches the configuration. » : rien n’est refait.', ask: ['tf'], until: { done: 'q:tf' } },
      { title: 'Ce qu’il faut retenir', learn: 'Le script dit quoi faire : le rejouer refait (ou échoue). La description dit ce qu’on veut : la rejouer ne fait que ce qui manque.\n\nC’est le principe de l’infrastructure « décrite dans du code » : on écrit l’état voulu, l’outil se charge du chemin. Dans l’étape 1, tu vas écrire toi-même ces descriptions.' },
    ],
    hints: ['« bash creer.sh » deux fois : regarde les messages du second passage.', 'terraform init une fois, puis terraform apply et la réponse yes.', 'Au second terraform apply, il n’y a rien à confirmer.'],
    solution: [
      { run: 'bash creer.sh' }, { run: 'bash creer.sh' }, { answer: 'script' },
      { run: 'terraform init' }, { run: 'terraform apply' }, { run: 'yes' }, { run: 'terraform apply' }, { answer: 'tf' },
    ],
  },
];
