/** Projet d'essai pour les tests de l'interface (indépendant du catalogue de TP). */
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
};
