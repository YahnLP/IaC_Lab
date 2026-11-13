/** Catalogue des TP. Contenu provisoire (2 TP) : les étapes 0 à 5 sont écrites aux jalons M5 et M6. */
import { fileContains, guest, planClean, worldHas } from './checks';
import type { Tp } from './types';

const PROV = `terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}
`;

export const CATALOG: Tp[] = [
  {
    id: 's1-premiere-vm', stage: 1, title: 'Première machine, décrite dans du code', dir: 'brasserie',
    brief: `La Brasserie du Port veut une machine « caisse » dans son réseau.\n\nÉcrivez-la dans main.tf (le réseau est déjà décrit), puis lancez terraform init, terraform plan et terraform apply.`,
    files: {
      'brasserie/main.tf': `${PROV}
resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

# À vous : ajoutez la machine « caisse » ici.
`,
    },
    objectives: [
      fileContains('code', 'main.tf décrit une machine « caisse »', 'brasserie/main.tf', /resource\s+"cloudpeda_vm"[\s\S]*name\s*=\s*"caisse"/),
      worldHas('monde', 'La machine « caisse » existe dans le monde réel', 'cloudpeda_vm', { name: 'caisse' }),
      planClean('sync', 'terraform plan ne prévoit plus aucun changement', 'brasserie'),
    ],
    hints: ['Une ressource machine s’écrit : resource "cloudpeda_vm" "nom" { … }.', 'Elle a besoin de name et de network_id.', 'network_id = cloudpeda_network.principal.id'],
  },
  {
    id: 's3-configurer', stage: 3, title: 'Configurer la machine avec Ansible', dir: 'brasserie',
    brief: `La machine « caisse » existe déjà. Il faut y installer nginx et y déposer une page d'accueil.\n\nCompletez site.yml puis lancez ansible-playbook. Relancez-le : rien ne doit changer.`,
    files: {
      'brasserie/inventory.ini': `[caisse]\ncaisse\n\n[all:vars]\nansible_become=true\n`,
      'brasserie/site.yml': `- name: Configurer la caisse\n  hosts: caisse\n  tasks: []\n`,
    },
    setup: [
      { type: 'cloud.create', payload: { type: 'cloudpeda_network', args: { name: 'reseau-brasserie', cidr: '203.0.113.0/24' } } },
      { type: 'cloud.create', payload: { type: 'cloudpeda_vm', args: { name: 'caisse', network_id: 'net-0001' } } },
    ],
    objectives: [
      guest('nginx', 'nginx est installé sur la caisse', 'caisse', g => g.packages.includes('nginx')),
      guest('actif', 'nginx tourne', 'caisse', g => g.services['nginx']?.active === true),
      guest('page', 'La page d’accueil de la brasserie est en place', 'caisse', g => /Brasserie du Port/.test(g.files['/var/www/html/index.html']?.content ?? '')),
    ],
    hints: ['Le module apt installe les paquets.', 'Le module copy dépose un fichier : dest et content.', 'Un second passage doit afficher changed=0.'],
  },
];

export const tpById = (id: string): Tp | undefined => CATALOG.find(t => t.id === id);
