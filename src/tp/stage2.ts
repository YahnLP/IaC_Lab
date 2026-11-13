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
    skills: ['B2.2.4'], myth: 'Terraform retrouve ce qui existe en interrogeant le fournisseur à chaque fois.',
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
    hints: ['Le terminal est ouvert dans le dossier brasserie.', 'terraform state show prend l’adresse : cloudpeda_vm.caisse', 'Dans l’éditeur, ouvrez terraform.tfstate (colonne de gauche).'],
    solution: [{ run: 'terraform state list' }, { run: 'terraform state show cloudpeda_vm.caisse' }, { answer: 'list' }, { answer: 'contenu' }, { answer: 'perdu' }],
  },
  {
    id: '2.2', num: '2.2', stage: 2, minutes: 25, dir: 'brasserie', title: 'Provoquer la dérive',
    intention: 'Modifier le monde à la main, détecter l’écart sans rien changer, puis le corriger par le code.',
    skills: ['B2.3.5'], myth: 'Si quelqu’un change la machine à la main, Terraform le sait tout de suite.',
    bilan: 'Un changement à la main crée une dérive que seul un plan fait apparaître. La bonne correction est dans le code ; sinon l’écart revient.',
    brief: `J’anticipe : un collègue « dépanne » en changeant la taille de la machine à la main. Faites-le : cloud set vm-0001 size grande.\n\nDétectez l’écart sans rien modifier : terraform plan -refresh-only. Puis remettez le monde d’aplomb avec le code (terraform apply).`,
    files: { 'brasserie/main.tf': `${PROV}\n${NET}\n${VM}` },
    setup: applied('brasserie'),
    objectives: [
      { id: 'derive', label: 'Vous avez provoqué la dérive (machine passée en « grande » à la main)', check: st => vmByName(st, 'caisse')?.['size'] === 'grande' },
      after('retour', 'Le monde a été remis en conformité avec le code', 'derive', st => vmByName(st, 'caisse')?.['size'] === 'petite' && planClean('x', '', 'brasserie').check(st)),
    ],
    questions: [{ id: 'detect', prompt: 'Quelle commande détecte la dérive sans modifier l’infrastructure ?', choices: ['terraform apply', 'terraform plan -refresh-only', 'terraform destroy'], correct: 1, explain: 'Avec -refresh-only, le plan compare l’état avec le monde réel et montre la dérive, sans rien changer.' }],
    hints: ['cloud set vm-0001 size grande modifie la machine hors du code.', 'terraform plan -refresh-only affiche « Objects have changed outside of Terraform ».', 'Le code dit « petite » : terraform apply remet la machine à la taille décrite.'],
    solution: [
      { run: 'cloud set vm-0001 size grande' }, { run: 'terraform plan -refresh-only' }, { answer: 'detect' }, { run: 'terraform apply -auto-approve' },
    ],
  },
  {
    id: '2.3', num: '2.3', stage: 2, minutes: 20, dir: 'test', title: 'Test puis production',
    intention: 'Utiliser les mêmes fichiers avec des valeurs différentes pour deux environnements.',
    skills: ['B2.2.5', 'B2.2.6'],
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
    hints: ['Lisez le message d’erreur : il nomme la ressource en conflit.', 'Ouvrez prod/terraform.tfvars : la valeur de environnement.', 'Mettez environnement = "prod" puis relancez terraform apply.'],
    solution: [
      { run: 'terraform init' }, { run: 'terraform apply -auto-approve' },
      { run: 'cd ../prod' }, { run: 'terraform init' }, { run: 'terraform apply -auto-approve' }, { answer: 'erreur' },
      { write: 'prod/terraform.tfvars', content: `environnement = "prod"\ncidr          = "198.51.100.0/24"\n` },
      { run: 'terraform apply -auto-approve' },
    ],
  },
];
