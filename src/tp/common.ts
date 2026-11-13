import type { SetupCommand } from './types';

export const PROV = `terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}
`;

/** Prépare le monde en appliquant le code déjà écrit dans `dir` (init puis apply sans confirmation). */
export const applied = (dir: string): SetupCommand[] => [
  { type: 'tf.exec', payload: { dir, line: 'terraform init' } },
  { type: 'tf.exec', payload: { dir, line: 'terraform apply -auto-approve' } },
];

export const cloud = (type: string, args: Record<string, unknown>): SetupCommand => ({ type: 'cloud.create', payload: { type: `cloudpeda_${type}`, args } });

export const NET = `resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}
`;
export const VM = `resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
}
`;
