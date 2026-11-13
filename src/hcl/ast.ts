/** Arbre syntaxique du sous-ensemble HCL pris en charge. */
export type Step = { t: 'attr'; name: string; line: number } | { t: 'idx'; e: Expr; line: number };

export type Expr =
  | { k: 'lit'; v: any; line: number }
  | { k: 'tmpl'; parts: (string | Expr)[]; line: number }
  | { k: 'id'; name: string; line: number }
  | { k: 'trav'; base: Expr; steps: Step[]; line: number }
  | { k: 'call'; name: string; args: Expr[]; line: number }
  | { k: 'list'; items: Expr[]; line: number }
  | { k: 'obj'; items: { key: Expr; value: Expr }[]; line: number }
  | { k: 'un'; op: string; e: Expr; line: number }
  | { k: 'bin'; op: string; l: Expr; r: Expr; line: number }
  | { k: 'cond'; c: Expr; t: Expr; f: Expr; line: number };

export interface Attr { expr: Expr; line: number }
export interface Block { type: string; labels: string[]; body: Body; line: number; file: string }
export interface Body { attrs: Record<string, Attr>; blocks: Block[]; line: number }

/** Message d'erreur de syntaxe, avec la ligne fautive. */
export class HclError extends Error {
  constructor(public summary: string, public detail: string, public line: number) { super(`${summary}: ${detail}`); }
}
