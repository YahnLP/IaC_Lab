import type { State } from '../state';

/** Un objectif vérifiable : le vérificateur lit l'état du laboratoire, il ne le modifie jamais. */
export interface Objective {
  id: string;
  label: string;
  /** Vrai si l'objectif est atteint. */
  check(st: Readonly<State>): boolean;
}

export interface SetupCommand { type: string; payload: Record<string, unknown> }

export interface Tp {
  id: string;
  stage: number;
  title: string;
  /** Texte de la mission, en prose courte (paragraphes séparés par une ligne vide). */
  brief: string;
  /** Dossier de travail ouvert au démarrage. */
  dir: string;
  /** Fichiers de départ. */
  files: Record<string, string>;
  /** Commandes rejouées au démarrage pour préparer le monde (machines existantes, etc.). */
  setup?: SetupCommand[];
  objectives: Objective[];
  /** Indices progressifs ; chaque indice demandé est comptabilisé. */
  hints: string[];
}
