/**
 * Noyau : un état JSON unique, modifié uniquement par des commandes.
 * Chaque commande est journalisée ; restaurer = rejouer le journal sur un état vierge (comme DockerLab).
 * Aucun Math.random() ni Date.now() : le moteur est déterministe.
 */
export interface Result {
  ok: boolean;
  /** Texte affiché dans le terminal. */
  output?: string;
  /** Code de sortie (0 = succès). */
  code?: number;
  /** Le moteur attend une réponse (« yes ») avant d'agir ; rien n'a été modifié. */
  awaiting?: 'apply' | 'destroy';
}

export type Handler<S> = (state: S, payload: any) => Result;
export interface JournalEntry { type: string; payload: any }
export interface Snapshot { app: 'iaclab'; v: 1; journal: JournalEntry[] }

/** Commande refusée : l'état est restauré tel qu'avant l'appel. */
export class CommandRefused extends Error {}

export class Store<S> {
  private handlers = new Map<string, Handler<S>>();
  private state: S;
  private journal: JournalEntry[] = [];

  constructor(private readonly initial: () => S) { this.state = initial(); }

  register(type: string, h: Handler<S>): void { this.handlers.set(type, h); }
  getState(): Readonly<S> { return this.state; }
  getJournal(): readonly JournalEntry[] { return this.journal; }

  dispatch(type: string, payload: any = {}): Result {
    const h = this.handlers.get(type);
    if (!h) throw new Error(`Commande inconnue : ${type}`);
    const backup = structuredClone(this.state);
    try {
      const r = h(this.state, payload);
      this.journal.push({ type, payload: structuredClone(payload) });
      return r;
    } catch (e) {
      this.state = backup;
      if (e instanceof CommandRefused) return { ok: false, output: e.message, code: 1 };
      throw e;
    }
  }

  snapshot(): Snapshot { return { app: 'iaclab', v: 1, journal: structuredClone(this.journal) }; }

  /** Reconstruit un état identique en rejouant le journal. */
  restore(snap: Snapshot): void {
    if (!snap || snap.app !== 'iaclab' || !Array.isArray(snap.journal)) throw new Error('fichier IaC Lab invalide');
    this.state = this.initial();
    this.journal = [];
    for (const e of snap.journal) this.dispatch(e.type, e.payload);
  }
}
