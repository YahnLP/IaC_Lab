import { PROV, NET, VM, applied } from './common';
import { after, fileContains, planClean, vmByName, worldHas } from './checks';
import type { Tp } from './types';

const read = (st: Readonly<import('../state').State>, p: string): string => st.files[p] ?? '';

export const STAGE1: Tp[] = [
  {
    id: '1.1', num: '1.1', stage: 1, minutes: 25, dir: 'brasserie', title: 'Première ressource',
    intention: 'Dérouler init, validate, plan puis apply pour créer un réseau.',
    skills: ['B2.2'], myth: 'terraform apply recrée tout à chaque fois.',
    bilan: 'Le cycle est toujours le même : init (préparer), validate (vérifier la syntaxe), plan (voir), apply (faire).',
    brief: `La Brasserie du Port a besoin d’un réseau « reseau-brasserie » en 203.0.113.0/24.\n\nDans main.tf, écrivez la ressource cloudpeda_network « principal » avec les attributs name et cidr. Puis, dans le terminal : terraform init, terraform validate, terraform plan, terraform apply.`,
    files: { 'brasserie/main.tf': `${PROV}\n# À vous : décrivez le réseau ici.\n` },
    objectives: [
      fileContains('code', 'main.tf décrit le réseau « reseau-brasserie »', 'brasserie/main.tf', /resource\s+"cloudpeda_network"[\s\S]*reseau-brasserie/),
      worldHas('monde', 'Le réseau existe dans le monde réel', 'cloudpeda_network', { name: 'reseau-brasserie', cidr: '203.0.113.0/24' }),
      planClean('sync', 'terraform plan ne prévoit plus aucun changement', 'brasserie'),
    ],
    steps: [
      { title: 'À quoi sert ce TP', learn: 'Jusqu’ici tu as créé des objets avec « cloud create ». Maintenant, tu vas les décrire dans un fichier, et c’est Terraform qui les créera.\n\nTerraform a besoin d’un « fournisseur » (provider) : un module qui sait parler à une plateforme (ici, le cloud fictif « cloudpeda »). Le fichier main.tf contient déjà, tout en haut, la déclaration de ce fournisseur : ne la touche pas.\n\nLa Brasserie du Port a besoin d’un réseau « reseau-brasserie », d’adresses 203.0.113.0/24 (une plage d’adresses IP réservée à la documentation). Regarde le schéma à droite : il est vide, rien n’existe encore.', do: [{ open: 'brasserie/main.tf', note: 'Ouvre main.tf : tu y vois la déclaration du fournisseur et un commentaire « À vous ».' }], expect: 'Les trois colonnes du schéma sont vides : tu n’as rien écrit, Terraform n’a rien noté, rien n’existe.' },
      { title: 'Écrire la ressource', learn: 'Une ressource se décrit ainsi :\n\nresource "TYPE" "NOM_LOCAL" { attribut = valeur … }\n\n• TYPE : ce qu’on veut créer (ici cloudpeda_network, un réseau).\n• NOM_LOCAL : un surnom, pour pouvoir y faire référence ailleurs dans le code (ici « principal »). Il n’existe que dans tes fichiers, pas chez le fournisseur.\n• Les attributs : name (le nom réel du réseau) et cidr (sa plage d’adresses).', do: [{ insert: { path: 'brasserie/main.tf', text: 'resource "cloudpeda_network" "principal" {\n  name = "reseau-brasserie"\n  cidr = "203.0.113.0/24"\n}\n' }, note: 'Ajoute ce bloc à main.tf (tu peux aussi le taper à la main, c’est un très bon exercice), puis enregistre avec Ctrl+S.' }], expect: 'Dans le schéma, une boîte apparaît dans la colonne « Code », en orange (« à créer ») : tu l’as écrite, mais ni Terraform ni le monde réel ne la connaissent.', until: { done: 'code' } },
      { title: 'Préparer le dossier : init', learn: '« terraform init » prépare le dossier de travail : il lit le fournisseur déclaré et le met en place. On le fait une fois, au début, et à chaque fois qu’on change de fournisseur.', do: [{ cmd: 'terraform init', note: 'Initialise le dossier.' }], expect: '« Terraform has been successfully initialized! »', until: { ran: '^terraform init' } },
      { title: 'Vérifier : validate', learn: '« terraform validate » relit ton code et cherche les erreurs d’écriture (une accolade oubliée, un attribut inconnu…). Il ne touche à rien.', do: [{ cmd: 'terraform validate', note: 'Vérifie la syntaxe de ton code.' }], expect: '« Success! The configuration is valid. » En cas d’erreur, le message donne le fichier et la ligne : corrige, enregistre, relance.', until: { ran: '^terraform validate' } },
      { title: 'Prévoir : plan', learn: '« terraform plan » compare trois choses : ton code, ce que Terraform a noté (l’état) et le monde réel. Il affiche ce qu’il ferait, sans rien faire. Lis-le toujours avant d’appliquer.\n\nUn « + » devant une ligne veut dire « sera créé ».', do: [{ cmd: 'terraform plan', note: 'Affiche le plan.' }], expect: 'Un bloc « + cloudpeda_network.principal will be created » et la ligne « Plan: 1 to add, 0 to change, 0 to destroy. »', until: { ran: '^terraform plan' } },
      { title: 'Appliquer : apply', learn: '« terraform apply » refait le plan, puis demande confirmation. Tape « yes » pour accepter : Terraform crée le réseau chez le fournisseur et note son identifiant dans l’état.', do: [{ cmd: 'terraform apply', note: 'Lance l’application ; il va te demander « Enter a value: ».' }, { cmd: 'yes', note: 'Confirme.' }], expect: '« Apply complete! Resources: 1 added ». Dans le schéma, la boîte est verte dans les trois colonnes, reliées par des flèches : code → état → monde réel.', until: { done: 'monde' } },
      { title: 'Rejouer : plus rien à faire', learn: 'Relance le plan. Le code décrit un réseau, il existe déjà : il n’y a plus rien à faire. C’est ce qu’on appelle l’idempotence : on peut relancer sans risque.', do: [{ cmd: 'terraform plan', note: 'Relance le plan.' }], expect: '« No changes. Your infrastructure matches the configuration. »', until: { done: 'sync' } },
    ],
    hints: ['Un bloc : resource "cloudpeda_network" "principal" { … }', 'Deux attributs : name = "reseau-brasserie" et cidr = "203.0.113.0/24".', 'Relancez terraform apply : il doit répondre « No changes ».'],
    solution: [
      { write: 'brasserie/main.tf', content: `${PROV}\n${NET}` },
      { run: 'terraform init' }, { run: 'terraform validate' }, { run: 'terraform plan' }, { run: 'terraform apply -auto-approve' },
    ],
  },
  {
    id: '1.2', num: '1.2', stage: 1, minutes: 20, dir: 'brasserie', title: 'Lire un plan, le modifier',
    intention: 'Prédire puis lire « ~ » (modification sur place) et « -/+ » (remplacement).',
    skills: ['B2.2'],
    bilan: 'Toujours lire le plan avant de confirmer : un « -/+ » détruit et recrée, donc change l’identifiant et l’adresse IP.',
    brief: `La machine « caisse » est trop petite. Passez-la en size = "moyenne" dans main.tf, lancez terraform plan, lisez, puis apply. Notez que l’identifiant de la machine ne change pas.\n\nEnsuite, la direction veut Ubuntu : changez image = "ubuntu-24.04". Lisez le plan avant de confirmer.`,
    files: { 'brasserie/main.tf': `${PROV}\n${NET}\n${VM}` },
    setup: applied('brasserie'),
    objectives: [
      { id: 'place', label: 'La machine est « moyenne » et a gardé son identifiant (modifiée sur place)', check: st => { const v = vmByName(st, 'caisse'); return v?.['size'] === 'moyenne' && v['id'] === 'vm-0001'; } },
      { id: 'remplacee', label: 'La machine est en Ubuntu et a un nouvel identifiant (remplacée)', check: (st, d) => { const v = vmByName(st, 'caisse'); return !!d?.has('place') && v?.['image'] === 'ubuntu-24.04' && v['id'] !== 'vm-0001'; } },
    ],
    questions: [
      { id: 'sym1', prompt: 'Changer la taille : quel symbole le plan affiche-t-il devant la machine ?', choices: ['+', '~', '-/+'], correct: 1, explain: '« ~ » : modification sur place. La machine continue d’exister, seule sa taille change.' },
      { id: 'sym2', prompt: 'Changer l’image : quel symbole, et pourquoi ?', choices: ['~ : on change juste un champ', '-/+ : l’image ne peut pas changer sur une machine existante, il faut la remplacer', '- : la machine disparaît'], correct: 1, explain: '« -/+ » (must be replaced) : l’attribut impose un remplacement. Ancien identifiant détruit, nouveau créé.' },
    ],
    hints: ['Modifiez la ligne size dans la ressource cloudpeda_vm.', 'Dans la ressource, ajoutez image = "ubuntu-24.04" et lisez la ligne « forces replacement ».', 'Après le plan, terraform apply et répondre yes.'],
    solution: [
      { write: 'brasserie/main.tf', content: `${PROV}\n${NET}\nresource "cloudpeda_vm" "caisse" {\n  name       = "caisse"\n  network_id = cloudpeda_network.principal.id\n  size       = "moyenne"\n}\n` },
      { run: 'terraform plan' }, { run: 'terraform apply -auto-approve' }, { answer: 'sym1' },
      { write: 'brasserie/main.tf', content: `${PROV}\n${NET}\nresource "cloudpeda_vm" "caisse" {\n  name       = "caisse"\n  network_id = cloudpeda_network.principal.id\n  size       = "moyenne"\n  image      = "ubuntu-24.04"\n}\n` },
      { run: 'terraform plan' }, { run: 'terraform apply -auto-approve' }, { answer: 'sym2' },
    ],
  },
  {
    id: '1.3', num: '1.3', stage: 1, minutes: 15, dir: 'brasserie', title: 'Variables, locals, sorties',
    intention: 'Paramétrer un nom avec une variable et lire une valeur calculée avec une sortie.',
    skills: ['B2.2'],
    bilan: 'Les variables rendent le même code réutilisable ; les sorties exposent ce que le fournisseur a calculé (adresse IP…).',
    brief: `Le nom de la machine doit dépendre de l’environnement. Ajoutez une variable « environnement » (valeur par défaut « test ») et nommez la machine "caisse-\${var.environnement}".\n\nAjoutez aussi une sortie « ip_caisse » qui affiche l’adresse IP de la machine. Appliquez, puis lisez la sortie.`,
    files: { 'brasserie/main.tf': `${PROV}\n${NET}\n${VM}` },
    setup: applied('brasserie'),
    objectives: [
      { id: 'var', label: 'Une variable « environnement » est déclarée', check: st => /variable\s+"environnement"/.test(read(st, 'brasserie/main.tf')) },
      { id: 'out', label: 'Une sortie « ip_caisse » est déclarée', check: st => /output\s+"ip_caisse"/.test(read(st, 'brasserie/main.tf')) },
      worldHas('monde', 'La machine s’appelle maintenant « caisse-test »', 'cloudpeda_vm', { name: 'caisse-test' }),
      after('sync', 'terraform plan ne prévoit plus aucun changement', 'monde', st => planClean('x', '', 'brasserie').check(st)),
    ],
    questions: [{ id: 'cmd', prompt: 'Quelle commande relit les sorties sans rien modifier ?', choices: ['terraform apply', 'terraform output', 'terraform init'], correct: 1, explain: '« terraform output » lit les sorties dans l’état, sans toucher à l’infrastructure.' }],
    hints: ['variable "environnement" { default = "test" }', 'output "ip_caisse" { value = cloudpeda_vm.caisse.ip }', 'Le nom devient : name = "caisse-${var.environnement}"'],
    solution: [
      { write: 'brasserie/main.tf', content: `${PROV}\n${NET}\nvariable "environnement" {\n  default = "test"\n}\n\nresource "cloudpeda_vm" "caisse" {\n  name       = "caisse-\${var.environnement}"\n  network_id = cloudpeda_network.principal.id\n}\n\noutput "ip_caisse" {\n  value = cloudpeda_vm.caisse.ip\n}\n` },
      { run: 'terraform apply -auto-approve' }, { run: 'terraform output' }, { answer: 'cmd' },
    ],
  },
  {
    id: '1.4', num: '1.4', stage: 1, minutes: 20, dir: 'brasserie', title: 'Dépendances et destroy',
    intention: 'Voir l’ordre de création et de destruction suivre les références ; provoquer une dépendance circulaire.',
    skills: ['B2.2'],
    bilan: 'Une référence crée une dépendance : on crée dans l’ordre des dépendances, on détruit dans l’ordre inverse.',
    brief: `Ajoutez une règle de pare-feu ouvrant le port 443 de la machine « caisse » (vm_id = cloudpeda_vm.caisse.id). Appliquez : observez l’ordre de création.\n\nPuis lancez terraform destroy et observez l’ordre inverse.\n\nBonus : dans le dossier « essai », deux ressources se référencent mutuellement. Placez-vous dedans (cd essai), puis terraform init et terraform validate.`,
    files: {
      'brasserie/main.tf': `${PROV}\n${NET}\n${VM}`,
      'brasserie/essai/cycle.tf': `${PROV}\nresource "cloudpeda_vm" "a" {\n  name           = "a"\n  network_id     = "net-0001"\n  admin_password = cloudpeda_dns_record.d.name\n}\n\nresource "cloudpeda_dns_record" "d" {\n  name      = "d.example"\n  target_ip = cloudpeda_vm.a.ip\n}\n`,
    },
    objectives: [
      { id: 'regle', label: 'La règle du port 443 existe dans le monde réel', check: st => Object.values(st.cloud['cloudpeda_firewall_rule'] ?? {}).some(r => r['port'] === 443) },
      after('detruit', 'Tout a été détruit avec terraform destroy', 'regle', st => Object.values(st.cloud).every(t => Object.keys(t).length === 0)),
    ],
    questions: [
      { id: 'ordre', prompt: 'Dans quel ordre le destroy supprime-t-il les trois ressources ?', choices: ['Réseau, machine, règle', 'Règle, machine, réseau', 'Dans l’ordre alphabétique'], correct: 1, explain: 'Ce qui dépend d’une ressource est détruit avant elle : la règle (dépend de la machine), la machine (dépend du réseau), puis le réseau.' },
      { id: 'cycle', prompt: 'Que répond terraform validate dans « essai » ?', choices: ['Tout est valide', 'Une dépendance circulaire (Cycle) est détectée', 'Le fournisseur est introuvable'], correct: 1, explain: 'A dépend de d et d dépend de A : aucun ordre de création n’est possible. Terraform refuse avant même de toucher au monde.' },
    ],
    hints: ['resource "cloudpeda_firewall_rule" "https" { vm_id = cloudpeda_vm.caisse.id  port = 443 }', 'terraform apply, répondre yes, puis terraform destroy, répondre yes.', 'cd essai, terraform init, terraform validate.'],
    solution: [
      { write: 'brasserie/main.tf', content: `${PROV}\n${NET}\n${VM}\nresource "cloudpeda_firewall_rule" "https" {\n  vm_id = cloudpeda_vm.caisse.id\n  port  = 443\n}\n` },
      { run: 'terraform init' }, { run: 'terraform apply -auto-approve' }, { run: 'terraform destroy -auto-approve' }, { answer: 'ordre' },
      { run: 'cd essai' }, { run: 'terraform init' }, { run: 'terraform validate' }, { answer: 'cycle' },
    ],
  },
  {
    id: 'TD1', num: 'TD1', stage: 1, minutes: 10, dir: 'brasserie', title: 'Que fait ce plan ?',
    intention: 'Lire cinq plans et dire ce qui sera créé, modifié, détruit.',
    skills: ['B2.2'],
    bilan: 'Le plan est un contrat : si vous savez le lire, rien de ce qui suit n’est une surprise.',
    brief: `Plan A :\n  + cloudpeda_vm.web\nPlan: 1 to add, 0 to change, 0 to destroy.\n\nPlan B :\n  ~ cloudpeda_vm.web\n      ~ size = "petite" -> "moyenne"\nPlan: 0 to add, 1 to change, 0 to destroy.\n\nPlan C :\n-/+ cloudpeda_vm.web (must be replaced)\n  ~ image = "debian-12" -> "ubuntu-24.04" # forces replacement\nPlan: 1 to add, 0 to change, 1 to destroy.\n\nPlan D :\n  - cloudpeda_firewall_rule.ssh\nPlan: 0 to add, 0 to change, 1 to destroy.\n\nPlan E :\nNo changes. Your infrastructure matches the configuration.`,
    files: { 'brasserie/main.tf': '' },
    objectives: [],
    questions: [
      { id: 'a', prompt: 'Plan A : que se passera-t-il ?', choices: ['Une machine est créée', 'Une machine est modifiée', 'Une machine est supprimée'], correct: 0, explain: '« + » : création.' },
      { id: 'b', prompt: 'Plan B : que devient la machine ?', choices: ['Elle est détruite puis recréée', 'Elle est modifiée sur place et garde son identifiant', 'Rien'], correct: 1, explain: '« ~ » : modification sur place.' },
      { id: 'c', prompt: 'Plan C : que devient la machine ?', choices: ['Elle est modifiée sur place', 'Elle est détruite puis recréée : nouvel identifiant, nouvelle adresse IP', 'Elle est seulement arrêtée'], correct: 1, explain: '« -/+ » avec « forces replacement » : l’image impose le remplacement.' },
      { id: 'd', prompt: 'Plan D : d’où vient cette destruction ?', choices: ['Le bloc de la règle SSH a été retiré du code', 'La règle SSH est cassée', 'Terraform ménage les règles inutilisées de lui-même'], correct: 0, explain: 'Ce qui n’est plus décrit dans le code et figure dans l’état est détruit.' },
      { id: 'e', prompt: 'Plan E : que fera apply ?', choices: ['Il recrée tout par prudence', 'Rien : le monde correspond déjà au code', 'Il échoue'], correct: 1, explain: 'Code, état et monde coïncident : apply ne fait rien.' },
    ],
    hints: ['« + » crée, « ~ » modifie sur place, « - » détruit, « -/+ » remplace.'],
    solution: [{ answer: 'a' }, { answer: 'b' }, { answer: 'c' }, { answer: 'd' }, { answer: 'e' }],
  },
];
void vmByName;
