import { PROV, NET, VM, applied } from './common';
import { after, planClean, vmByName, worldHas } from './checks';
import type { Tp } from './types';

const ENV_MAIN = `${PROV}
variable "environnement" {
  type = string
}

variable "cidr" {
  type = string
}

resource "cloudpeda_network" "reseau" {
  name = "reseau-\${var.environnement}"
  cidr = var.cidr
}
`;

export const STAGE2: Tp[] = [
  {
    id: '2.1', num: '2.1', stage: 2, minutes: 15, dir: 'brasserie', title: 'Le fichier d’état',
    intention: 'Relier le code, l’état et le monde réel ; lire l’état avec state list et state show.',
    skills: ['B2.2'], myth: 'Terraform retrouve ce qui existe en interrogeant le fournisseur à chaque fois.',
    bilan: 'L’état est la mémoire de Terraform : il relie chaque bloc du code à un objet réel précis. Sans lui, Terraform ne sait plus ce qui lui appartient.',
    brief: `Le réseau et la machine de la Brasserie ont déjà été créés. Regardez la colonne « État » de la vue à droite.\n\nDans le terminal : terraform state list, puis terraform state show cloudpeda_vm.caisse. Ouvrez aussi terraform.tfstate dans l’éditeur.\n\nSans enregistrer de modification : répondez ensuite aux questions.`,
    files: { 'brasserie/main.tf': `${PROV}\n${NET}\n${VM}` },
    setup: applied('brasserie'),
    objectives: [],
    questions: [
      { id: 'list', prompt: 'Quelle commande liste les ressources que Terraform suit ?', choices: ['terraform plan', 'terraform state list', 'terraform output'], correct: 1, explain: '« terraform state list » affiche les adresses présentes dans l’état.' },
      { id: 'contenu', prompt: 'Qu’y a-t-il dans l’état que le code ne contient pas ?', choices: ['Les identifiants et adresses réellement attribués par le fournisseur', 'Le code source', 'Le mot de passe du compte cloud'], correct: 0, explain: 'Le code dit ce qu’on veut ; l’état garde ce qui existe (id, ip…). Il peut contenir des valeurs sensibles : il ne se publie pas.' },
      { id: 'perdu', prompt: 'On supprime terraform.tfstate sans toucher au monde. Que prévoira ensuite le plan ?', choices: ['Rien à faire', 'Tout recréer (« 2 to add ») alors que tout existe déjà', 'Tout détruire'], correct: 1, explain: 'Sans mémoire, Terraform croit que rien n’existe. Le plan propose de tout créer, et l’apply échouerait sur « existe déjà ».' },
    ],
    steps: [
      { title: 'Trois mondes à ne pas confondre', learn: 'Terraform manipule trois choses différentes :\n1. Le code : ce que tu as écrit dans les fichiers .tf (ce que tu veux).\n2. Le monde réel : ce qui existe vraiment chez le fournisseur.\n3. L’état : un fichier (terraform.tfstate) où Terraform note ce qu’il a créé, avec l’identifiant de chaque objet.\n\nPourquoi cette troisième chose ? Dans ton code, la machine s’appelle « caisse » ; chez le fournisseur, elle s’appelle vm-0001. L’état fait le lien entre les deux : « mon bloc cloudpeda_vm.caisse, c’est l’objet vm-0001 ».\n\nLe réseau et la machine de la Brasserie ont déjà été créés. Regarde le schéma à droite : les boîtes sont reliées de colonne en colonne par des flèches.', expect: 'Une boîte verte dans chaque colonne pour le réseau, et pour la machine, reliées entre elles.' },
      { title: 'Lister ce que Terraform suit', learn: 'La commande « terraform state list » affiche la liste des ressources présentes dans l’état : ce que Terraform considère comme « à lui ».', do: [{ cmd: 'terraform state list', note: 'Liste les ressources de l’état.' }], expect: 'Deux lignes : cloudpeda_network.principal et cloudpeda_vm.caisse.', ask: ['list'], until: { done: 'q:list' } },
      { title: 'Regarder le détail', learn: '« terraform state show » affiche tout ce que l’état sait d’une ressource. Ouvre ensuite le fichier terraform.tfstate lui-même : c’est un fichier texte (au format JSON).', do: [{ cmd: 'terraform state show cloudpeda_vm.caisse', note: 'Affiche les attributs enregistrés pour la machine.' }, { open: 'brasserie/terraform.tfstate', note: 'Ouvre le fichier d’état brut. Ne le modifie pas : Terraform l’écrit lui-même.' }], expect: 'Tu y vois l’identifiant (id), l’adresse IP et la taille de la machine : des valeurs que ton code ne contient pas.', ask: ['contenu'], until: { done: 'q:contenu' } },
      { title: 'Et si l’état disparaît ?', learn: 'Imagine que quelqu’un supprime terraform.tfstate sans toucher au monde réel. Terraform ne se souvient plus de rien : il croit que rien n’existe. Réfléchis à ce qu’il proposera.', ask: ['perdu'], until: { done: 'q:perdu' } },
      { title: 'Ce qu’il faut retenir', learn: 'L’état est la mémoire de Terraform : il relie chaque bloc du code à un objet réel précis. Il contient des informations sensibles (mots de passe, adresses) : on ne le publie jamais, et on le sauvegarde. Plus tard, tu verras comment le partager entre plusieurs personnes.' },
    ],
    hints: ['Le terminal est ouvert dans le dossier brasserie.', 'terraform state show prend l’adresse : cloudpeda_vm.caisse', 'Dans l’éditeur, ouvrez terraform.tfstate (colonne de gauche).'],
    solution: [{ run: 'terraform state list' }, { run: 'terraform state show cloudpeda_vm.caisse' }, { answer: 'list' }, { answer: 'contenu' }, { answer: 'perdu' }],
  },
  {
    id: '2.2', num: '2.2', stage: 2, minutes: 25, dir: 'brasserie', title: 'Provoquer la dérive',
    intention: 'Modifier le monde à la main, détecter l’écart sans rien changer, puis le corriger par le code.',
    skills: ['B2.3'], myth: 'Si quelqu’un change la machine à la main, Terraform le sait tout de suite.',
    bilan: 'Un changement à la main crée une dérive que seul un plan fait apparaître. La bonne correction est dans le code ; sinon l’écart revient.',
    brief: `J’anticipe : un collègue « dépanne » en changeant la taille de la machine à la main. Faites-le : cloud set vm-0001 size grande.\n\nDétectez l’écart sans rien modifier : terraform plan -refresh-only. Puis remettez le monde d’aplomb avec le code (terraform apply).`,
    files: { 'brasserie/main.tf': `${PROV}\n${NET}\n${VM}` },
    setup: applied('brasserie'),
    objectives: [
      { id: 'derive', label: 'Vous avez provoqué la dérive (machine passée en « grande » à la main)', check: st => vmByName(st, 'caisse')?.['size'] === 'grande' },
      after('retour', 'Le monde a été remis en conformité avec le code', 'derive', st => vmByName(st, 'caisse')?.['size'] === 'petite' && planClean('x', '', 'brasserie').check(st)),
    ],
    questions: [{ id: 'detect', prompt: 'Quelle commande détecte la dérive sans modifier l’infrastructure ?', choices: ['terraform apply', 'terraform plan -refresh-only', 'terraform destroy'], correct: 1, explain: 'Avec -refresh-only, le plan compare l’état avec le monde réel et montre la dérive, sans rien changer.' }],
    steps: [
      { title: 'Qu’est-ce qu’une dérive ?', learn: 'Le code, l’état et le monde réel doivent rester d’accord. Mais le monde réel peut changer sans passer par Terraform : un collègue qui « dépanne » dans la console du fournisseur, par exemple. L’écart qui en résulte s’appelle une dérive (drift).\n\nTerraform ne le sait pas tout de suite : il ne regarde le monde que quand on le lui demande. Tu vas provoquer une dérive, puis la détecter, puis la corriger.\n\nLa machine « caisse » existe, en taille « petite » (c’est ce que dit ton code).', do: [{ open: 'brasserie/main.tf', note: 'Ouvre main.tf : la machine n’a pas d’attribut size, donc elle est « petite » par défaut.' }], expect: 'Le schéma montre le réseau et la machine, tous verts.' },
      { title: 'Provoquer la dérive', learn: 'Joue le rôle du collègue : change la taille de la machine directement chez le fournisseur, sans passer par le code. « cloud set » modifie un attribut d’un objet réel.', do: [{ cmd: 'cloud set vm-0001 size grande', note: 'Change la taille de vm-0001 à la main.' }], expect: 'La machine est maintenant « grande » dans le monde réel, mais ton code et l’état disent toujours « petite ».', until: { done: 'derive' } },
      { title: 'Détecter sans rien changer', learn: '« terraform plan -refresh-only » compare l’état avec le monde réel (il « rafraîchit » la mémoire) et signale ce qui a changé, sans modifier l’infrastructure.', do: [{ cmd: 'terraform plan -refresh-only', note: 'Cherche les changements faits hors de Terraform.' }], expect: '« Objects have changed outside of Terraform » avec la ligne « ~ size = "petite" -> "grande" ».', ask: ['detect'], until: { done: 'q:detect' } },
      { title: 'Que ferait un apply ?', learn: 'Lance un plan ordinaire. Il compare maintenant ton code (« petite ») au monde réel (« grande ») : lis ce qu’il propose.', do: [{ cmd: 'terraform plan', note: 'Calcule ce qu’il faut faire pour ramener le monde au code.' }], expect: 'Un « ~ » : size passe de « grande » à « petite ». Terraform remettra le monde conforme au code.' },
      { title: 'Corriger par le code', learn: 'Le code est la source de vérité : on remet le monde d’aplomb en appliquant. Si la machine devait vraiment être grande, il aurait fallu modifier le code, pas la machine à la main, sinon l’écart revient au prochain apply.', do: [{ cmd: 'terraform apply', note: 'Ramène la machine à la taille décrite.' }, { cmd: 'yes', note: 'Confirme.' }], expect: 'La machine redevient « petite ». Un nouveau plan afficherait « No changes ».', until: { done: 'retour' } },
      { title: 'Ce qu’il faut retenir', learn: 'Un changement à la main crée une dérive que seul un plan fait apparaître. -refresh-only la montre sans rien toucher ; l’apply la corrige en faveur du code. Règle d’équipe : on ne modifie l’infrastructure que par le code.' },
    ],
    hints: ['cloud set vm-0001 size grande modifie la machine hors du code.', 'terraform plan -refresh-only affiche « Objects have changed outside of Terraform ».', 'Le code dit « petite » : terraform apply remet la machine à la taille décrite.'],
    solution: [
      { run: 'cloud set vm-0001 size grande' }, { run: 'terraform plan -refresh-only' }, { answer: 'detect' }, { run: 'terraform apply -auto-approve' },
    ],
  },
  {
    id: '2.3', num: '2.3', stage: 2, minutes: 20, dir: 'test', title: 'Test puis production',
    intention: 'Utiliser les mêmes fichiers avec des valeurs différentes pour deux environnements.',
    skills: ['B2.2'],
    bilan: 'Le code est le même ; ce qui change, ce sont les valeurs. Un nom en doublon ou une valeur recopiée par erreur se voit dès le plan ou l’apply.',
    brief: `Deux dossiers, « test » et « prod », contiennent le même main.tf. Seul terraform.tfvars diffère (les valeurs de l’environnement).\n\nDans « test » : terraform init puis apply. Puis cd ../prod, init, apply. L’apply de prod échoue : lisez le message, corrigez le fichier de valeurs, relancez.`,
    files: {
      'test/main.tf': ENV_MAIN, 'prod/main.tf': ENV_MAIN,
      'test/terraform.tfvars': `environnement = "test"\ncidr          = "203.0.113.0/24"\n`,
      'prod/terraform.tfvars': `environnement = "test"\ncidr          = "198.51.100.0/24"\n`,
    },
    objectives: [
      worldHas('test', 'Le réseau « reseau-test » existe', 'cloudpeda_network', { name: 'reseau-test', cidr: '203.0.113.0/24' }),
      worldHas('prod', 'Le réseau « reseau-prod » existe', 'cloudpeda_network', { name: 'reseau-prod', cidr: '198.51.100.0/24' }),
      planClean('syncprod', 'Le plan de prod ne prévoit plus rien', 'prod'),
    ],
    questions: [{ id: 'erreur', prompt: 'Pourquoi l’apply de prod échoue-t-il d’abord ?', choices: ['Le fournisseur est en panne', 'Le fichier de valeurs de prod porte encore le nom « test » : le réseau existe déjà', 'Le CIDR de prod est invalide'], correct: 1, explain: 'La valeur recopiée donne « reseau-test » : un nom déjà pris. Le défaut est dans les valeurs, pas dans le code partagé.' }],
    steps: [
      { title: 'Le même code, deux environnements', learn: 'La Brasserie veut un environnement de test et un de production, avec les mêmes ressources mais des valeurs différentes (nom, plage d’adresses).\n\nOn utilise deux dossiers, « test » et « prod », qui contiennent le même main.tf. Ce fichier déclare des variables sans valeur par défaut. Les valeurs sont données dans un fichier à part, terraform.tfvars, que Terraform lit automatiquement : c’est lui seul qui change d’un dossier à l’autre.\n\nChaque dossier a son propre état : test et prod ne se mélangent pas.', do: [{ open: 'test/main.tf', note: 'Le code partagé : deux variables et un réseau dont le nom dépend de l’environnement.' }, { open: 'test/terraform.tfvars', note: 'Les valeurs de test.' }, { open: 'prod/terraform.tfvars', note: 'Les valeurs de prod. Compare avec celles de test.' }], expect: 'main.tf est identique dans les deux dossiers ; seuls les tfvars diffèrent.' },
      { title: 'Créer l’environnement de test', learn: 'Le terminal est dans le dossier « test ». Initialise, puis applique.', do: [{ cmd: 'terraform init', note: 'Prépare le dossier test.' }, { cmd: 'terraform apply', note: 'Propose de créer le réseau de test.' }, { cmd: 'yes', note: 'Confirme.' }], expect: 'Le réseau « reseau-test » (203.0.113.0/24) est créé.', until: { done: 'test' } },
      { title: 'Créer la production', learn: 'Change de dossier avec « cd ../prod » (« .. » veut dire « le dossier parent »). Regarde le prompt : il indique où tu es. Puis initialise et applique.', do: [{ cmd: 'cd ../prod', note: 'Va dans le dossier prod.' }, { cmd: 'terraform init', note: 'Prépare le dossier prod.' }, { cmd: 'terraform apply', note: 'Propose de créer le réseau de prod.' }, { cmd: 'yes', note: 'Confirme.' }], expect: 'Une erreur rouge : un réseau du même nom existe déjà.', ask: ['erreur'], until: { done: 'q:erreur' } },
      { title: 'Corriger les valeurs', learn: 'Le défaut n’est pas dans le code partagé, mais dans les valeurs de prod : l’environnement y est resté « test », donc le nom demandé est « reseau-test », déjà pris. Corrige le fichier de valeurs, puis relance.', do: [{ edit: { path: 'prod/terraform.tfvars', from: 'environnement = "test"', to: 'environnement = "prod"' }, note: 'Met « prod » comme valeur de environnement dans prod/terraform.tfvars.' }, { cmd: 'terraform apply', note: 'Relance l’application.' }, { cmd: 'yes', note: 'Confirme.' }], expect: 'Le réseau « reseau-prod » (198.51.100.0/24) est créé.', until: { done: 'prod' } },
      { title: 'Vérifier', learn: 'Un dernier plan dans prod pour vérifier que tout est en ordre.', do: [{ cmd: 'terraform plan', note: 'Vérifie qu’il n’y a plus rien à faire.' }], expect: '« No changes. »', until: { done: 'syncprod' } },
      { title: 'Ce qu’il faut retenir', learn: 'Le code est écrit une fois ; ce qui change d’un environnement à l’autre, ce sont les valeurs. Une valeur recopiée par erreur est un classique : l’erreur se lit dans le message de l’apply, et se corrige dans le fichier de valeurs.' },
    ],
    hints: ['Lisez le message d’erreur : il nomme la ressource en conflit.', 'Ouvrez prod/terraform.tfvars : la valeur de environnement.', 'Mettez environnement = "prod" puis relancez terraform apply.'],
    solution: [
      { run: 'terraform init' }, { run: 'terraform apply -auto-approve' },
      { run: 'cd ../prod' }, { run: 'terraform init' }, { run: 'terraform apply -auto-approve' }, { answer: 'erreur' },
      { write: 'prod/terraform.tfvars', content: `environnement = "prod"\ncidr          = "198.51.100.0/24"\n` },
      { run: 'terraform apply -auto-approve' },
    ],
  },
];
