import type { State } from '../state';

/** Un objectif vérifiable : le vérificateur lit l'état du laboratoire, il ne le modifie jamais. */
export interface Objective {
  id: string;
  label: string;
  /** Vrai si l'objectif est atteint. */
  /** `done` : objectifs déjà validés dans l'ordre de l'énoncé (permet d'exiger une séquence). */
  check(st: Readonly<State>, done?: ReadonlySet<string>): boolean;
}

export interface SetupCommand { type: string; payload: Record<string, unknown> }

export interface SelfItem { id: string; text: string }

export interface Question { id: string; prompt: string; choices: string[]; correct: number; explain: string }

/** Une étape de la solution de référence, rejouée par les tests (chaque TP doit pouvoir être résolu à 100 %). */
export type SolutionStep =
  | { write: string; content: string }
  | { run: string }
  | { answer: string };

/** Une action concrète demandée à l'élève dans une étape. */
export type Action =
  | { cmd: string; note: string }                          // à taper dans le terminal
  | { open: string; note: string }                         // à ouvrir dans l'éditeur
  | { insert: { path: string; text: string }; note: string } // extrait de code à ajouter à un fichier

/** Une étape guidée : pourquoi, quoi faire, quoi observer, comment savoir que c'est fait. */
export interface Step {
  title: string;
  /** Contexte et explication, en phrases courtes (paragraphes séparés par une ligne vide). */
  learn: string;
  do?: Action[];
  /** Ce qu'on doit voir si tout se passe bien. */
  expect?: string;
  /** Questions posées dans cette étape (identifiants). */
  ask?: string[];
  /** Quand l'étape est terminée : un objectif validé (`done`), ou une commande tapée (`ran`, expression régulière). */
  until?: { done?: string; ran?: string };
}

export interface Tp {
  id: string;
  stage: number;
  title: string;
  /** Numéro lisible : « 1.2 », « TD1 »… */
  num: string;
  minutes: number;
  /** Pourquoi on fait ce TP, en une phrase. */
  intention: string;
  /** Codes de compétences : proposition d'auteur, à valider. */
  skills: string[];
  /** Idée reçue confrontée, s'il y en a une. */
  myth?: string;
  /** Phrase de bilan affichée à la réussite. */
  bilan: string;
  questions?: Question[];
  /** Parcours guidé pas à pas. Sans étapes, la consigne `brief` est affichée telle quelle. */
  steps?: Step[];
  /** Auto-évaluation : une échelle de 0 à 3 par énoncé. */
  selfEval?: SelfItem[];
  solution: SolutionStep[];
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
