import { cloud } from './common';
import { ruleOn, worldHas } from './checks';
import type { Tp } from './types';

export const STAGE0: Tp[] = [
  {
    id: '0.1', num: '0.1', stage: 0, minutes: 15, dir: 'atelier', title: 'Monter, puis refaire à la main',
    intention: 'Constater qu’une infrastructure refaite à la main ne ressemble jamais tout à fait à la première.',
    skills: ['B2.2'], myth: 'Une infrastructure bien documentée se refait à l’identique.',
    bilan: 'Sans description écrite et relisible, la copie diffère de l’original et personne ne sait en quoi : c’est le problème que le code résout.',
    brief: `La Brasserie du Port a une machine « caisse » en production. Il faut en monter une copie de recette. Julien, parti en congés, a laissé la fiche « recette.txt ».\n\nSuivez la fiche en tapant ses commandes dans le terminal (cloud create …). Ensuite comparez recette et production avec « cloud list ».`,
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
    hints: ['Tapez les trois commandes de la fiche, une par une.', '« cloud list » affiche tout ce qui existe : comparez les lignes « firewall_rule ».', 'Pour corriger : cloud create firewall_rule vm_id=vm-0002 port=443'],
    solution: [
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
    brief: `Deux fichiers font la même chose : creer.sh (une suite de commandes) et main.tf (une description).\n\nLancez « bash creer.sh » deux fois. Puis « terraform init », « terraform apply » deux fois. Comparez ce qui se passe au second passage.`,
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
      { id: 'tf', prompt: 'Et au second « terraform apply » ?', choices: ['Il recrée les machines', 'Il affiche une erreur', 'Il constate que le monde correspond déjà à la description (« No changes »)'], correct: 2, explain: 'Terraform compare ce que vous voulez avec ce qui existe, puis ne fait que la différence. Le code décrit un résultat, pas des étapes.' },
    ],
    hints: ['bash creer.sh, deux fois : regardez les messages d’erreur du second passage.', 'terraform init une fois, puis terraform apply (répondez yes), deux fois.', 'Le script a besoin d’être joué avant ou après : les deux marchent, car les noms diffèrent.'],
    solution: [
      { run: 'bash creer.sh' }, { run: 'bash creer.sh' }, { answer: 'script' },
      { run: 'terraform init' }, { run: 'terraform apply -auto-approve' }, { run: 'terraform apply -auto-approve' }, { answer: 'tf' },
    ],
  },
];
