import type { Question, Tp } from './types';

const q = (id: string, prompt: string, choices: string[], correct: number, explain: string): Question => ({ id, prompt, choices, correct, explain });

const QUIZ: Question[] = [
  q('q1', 'Un fichier Terraform décrit…', ['la suite des commandes à exécuter', 'l’état souhaité de l’infrastructure', 'l’historique des changements'], 1, 'Terraform est déclaratif : on décrit le résultat voulu, l’outil calcule ce qu’il faut faire.'),
  q('q2', 'Que fait « terraform plan » ?', ['Il crée les ressources', 'Il montre ce qui serait fait, sans rien modifier', 'Il supprime l’état'], 1, 'Le plan est une prévision. Seul apply agit.'),
  q('q3', 'À quoi sert le fichier d’état ?', ['À sauvegarder le code', 'À relier chaque bloc du code à l’objet réel correspondant', 'À stocker les mots de passe des utilisateurs'], 1, 'L’état est la mémoire de Terraform : sans lui, il ne sait plus ce qui lui appartient.'),
  q('q4', 'Pourquoi ne publie-t-on pas terraform.tfstate dans un dépôt Git ?', ['Il est trop gros', 'Il peut contenir des valeurs sensibles et appartient à un environnement précis', 'Git refuse les fichiers JSON'], 1, 'L’état contient les valeurs réelles (parfois des secrets) ; il se stocke à part, de façon protégée.'),
  q('q5', 'Dans un plan, « -/+ » signifie…', ['créer puis modifier', 'détruire puis recréer (remplacement)', 'ne rien faire'], 1, 'Un attribut impose le remplacement : nouvel identifiant, nouvelle adresse.'),
  q('q6', 'Quelqu’un change une machine à la main. Comment le voit-on ?', ['Terraform prévient tout seul', 'Un plan (avec actualisation) montre l’écart', 'On ne peut pas le voir'], 1, 'La dérive se détecte en comparant l’état et le monde réel lors d’un plan.'),
  q('q7', 'Une tâche Ansible est idempotente si…', ['elle est rapide', 'la relancer donne le même résultat et ne change que ce qui manque', 'elle ne produit aucun message'], 1, 'Idempotence : état voulu atteint, rien de plus à faire au second passage.'),
  q('q8', 'Quand un handler s’exécute-t-il ?', ['À chaque passage', 'Quand une tâche qui le notifie a produit un changement', 'Au démarrage de la machine'], 1, 'Un handler réagit à un changement, pas à l’exécution.'),
  q('q9', 'Ansible agit sur les machines de l’inventaire…', ['en y lisant un agent installé en permanence', 'par une connexion distante (SSH), sans agent dédié', 'uniquement depuis le fournisseur cloud'], 1, 'Ansible est « sans agent » : il se connecte (SSH) et exécute des modules.'),
  q('q10', 'Pourquoi préférer le module apt à « command: apt install » ?', ['apt est plus rapide', 'Le module connaît l’état et reste idempotent ; command est toujours « changed »', 'command est interdit'], 1, 'Un module dédié constate avant d’agir ; une commande libre ne sait pas ce qui existe.'),
  q('q11', 'Pour avoir un environnement de test et un de production identiques…', ['On copie à la main', 'On garde les mêmes fichiers et on change les valeurs', 'On écrit deux codes différents'], 1, 'Même code, valeurs différentes : les écarts sont dans les valeurs, donc visibles.'),
  q('q12', 'Un mot de passe a été commité puis supprimé. Que faire ?', ['Rien, il a disparu', 'Le changer : il reste dans l’historique', 'Vider le cache du navigateur'], 1, 'L’historique conserve tout. Un secret exposé est un secret à remplacer.'),
];

const TOOLS = ['Terraform', 'Ansible', 'Terraform puis Ansible'];
const MAP: Question[] = [
  q('o1', 'Créer un réseau et des machines chez le fournisseur', TOOLS, 0, 'Créer l’infrastructure : Terraform.'),
  q('o2', 'Installer nginx et déposer sa configuration dans une machine', TOOLS, 1, 'Le contenu des machines : Ansible.'),
  q('o3', 'Ouvrir le port 443 sur le pare-feu du fournisseur', TOOLS, 0, 'La règle de pare-feu est une ressource du fournisseur : Terraform.'),
  q('o4', 'Redémarrer un service après un changement de configuration', TOOLS, 1, 'Handler Ansible.'),
  q('o5', 'Déployer un serveur web prêt à l’emploi à partir de rien', TOOLS, 2, 'Terraform crée la machine, Ansible la configure.'),
  q('o6', 'Créer un utilisateur système dans une machine existante', TOOLS, 1, 'Dans la machine : Ansible (module user).'),
  q('o7', 'Détecter qu’une machine a été agrandie à la main chez le fournisseur', TOOLS, 0, 'La dérive d’une ressource du fournisseur se voit avec Terraform (plan).'),
  q('o8', 'Donner les adresses des machines créées à l’outil qui les configure', TOOLS, 2, 'Une sortie Terraform alimente l’inventaire d’Ansible : les deux ensemble.'),
];

export const STAGE5: Tp[] = [
  {
    id: '5.1', num: '5.1', stage: 5, minutes: 10, dir: 'bilan', title: 'Quiz de fin de parcours',
    intention: 'Vérifier les notions des étapes 0 à 4 sur douze questions.', skills: ['B2.2', 'B2.3'],
    bilan: 'Les erreurs repérées ici disent quels TP reprendre.',
    brief: 'Douze questions à choix. Chaque explication est affichée après la réponse (sauf en mode examen).',
    files: { 'bilan/.keep': '' }, objectives: [], questions: QUIZ, hints: ['Reprenez le TP concerné dans la liste.'],
    solution: QUIZ.map(x => ({ answer: x.id })),
  },
  {
    id: '5.2', num: '5.2', stage: 5, minutes: 5, dir: 'bilan', title: 'Quel outil pour quoi ?',
    intention: 'Associer chaque besoin à l’outil qui le traite.', skills: ['B2.2'],
    myth: 'Terraform et Ansible font la même chose.',
    bilan: 'Terraform crée et décrit ce qui existe chez le fournisseur ; Ansible décrit ce qu’il y a dans les machines ; les deux s’enchaînent.',
    brief: 'Pour chaque besoin, choisissez : Terraform, Ansible, ou les deux à la suite.',
    files: { 'bilan/.keep': '' }, objectives: [], questions: MAP, hints: ['Demandez-vous : « est-ce une ressource du fournisseur, ou un contenu dans la machine ? »'],
    solution: MAP.map(x => ({ answer: x.id })),
  },
  {
    id: '5.3', num: '5.3', stage: 5, minutes: 5, dir: 'bilan', title: 'Auto-évaluation',
    intention: 'Situer ses acquis, énoncé par énoncé.', skills: [],
    bilan: 'Votre auto-évaluation figure dans le compte rendu : elle sert de point de départ à la discussion avec l’enseignant.',
    brief: 'Pour chaque énoncé, choisissez votre niveau (vocabulaire des grilles nationales), honnêtement : cette auto-évaluation prépare l’examen, elle ne le remplace pas.',
    files: { 'bilan/.keep': '' }, objectives: [],
    selfEval: [
      { id: 's1', text: 'Je distingue un fichier déclaratif d’un script' },
      { id: 's2', text: 'Je lis un plan Terraform (+, ~, -, -/+)' },
      { id: 's3', text: 'J’explique à quoi sert le fichier d’état' },
      { id: 's4', text: 'Je détecte et corrige une dérive' },
      { id: 's5', text: 'J’écris un inventaire Ansible avec des groupes' },
      { id: 's6', text: 'J’écris un playbook idempotent' },
      { id: 's7', text: 'J’explique le rôle d’un handler' },
      { id: 's8', text: 'J’enchaîne Terraform puis Ansible' },
      { id: 's9', text: 'Je garde l’état et les secrets hors du dépôt' },
      { id: 's10', text: 'Je choisis l’outil adapté à un besoin' },
    ],
    hints: [], solution: [],
  },
];
