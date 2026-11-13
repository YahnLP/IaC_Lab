/** État complet du laboratoire (JSON pur). */

/** Contenu d'une machine : ce que configurera Ansible (jalon M2). */
export interface Guest {
  packages: string[];
  services: Record<string, { enabled: boolean; active: boolean }>;
  files: Record<string, { content: string; mode: string; owner: string; dir?: boolean }>;
  users: string[];
}

/** Une ressource du fournisseur fictif, telle qu'elle existe « vraiment » (attributs à plat). */
export type CloudObject = Record<string, any>;

export interface SavedPlan {
  dir: string;
  serial: number;
  mode: 'normal' | 'destroy' | 'refresh-only';
  files: Record<string, string>;
  vars: Record<string, unknown>;
}

export interface State {
  /** Compteurs d'identifiants par type, pour des identifiants déterministes. */
  seq: Record<string, number>;
  /** Horloge simulée, en secondes. */
  clock: number;
  /** Monde du fournisseur : type de ressource, puis identifiant. */
  cloud: Record<string, Record<string, CloudObject>>;
  /** Système de fichiers du projet : chemin complet, puis contenu. */
  files: Record<string, string>;
  /** Plans enregistrés par `terraform plan -out=…`. */
  plans: Record<string, SavedPlan>;
}

export function newState(): State {
  return { seq: {}, clock: 0, cloud: {}, files: {}, plans: {} };
}
