/** Fichiers de départ : le projet de la Brasserie du Port (les parcours guidés arrivent aux jalons suivants). */
export const SEED: Record<string, string> = {
  'brasserie/main.tf': `terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
}
`,
  'brasserie/inventory.ini': `[caisse]
caisse

[all:vars]
ansible_become=true
`,
  'brasserie/site.yml': `- name: Configurer la caisse
  hosts: caisse
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present
`,
};
