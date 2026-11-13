/** Assemble le laboratoire : état, commandes et journal. */
import { CommandRefused, Store, type Result } from './core/store';
import { removeFile, writeFile } from './shell/vfs';
import { splitWords } from './shell/words';
import { newState, type State } from './state';
import { runTerraform } from './terraform/commands';
import { ProviderError, createResource, deleteResource, setAttribute } from './world/provider';

export type Lab = Store<State>;

export function createLab(): Lab {
  const lab = new Store<State>(newState);

  lab.register('fs.write', (st, p: { path: string; content: string }) => { writeFile(st, p.path, p.content); return { ok: true }; });
  lab.register('fs.remove', (st, p: { path: string }) => ({ ok: removeFile(st, p.path) }));

  /** Ligne de commande « terraform … » exécutée dans un dossier ; `answer` répond à l'invite « Enter a value: ». */
  lab.register('tf.exec', (st, p: { dir: string; line: string; answer?: string }): Result => {
    const words = splitWords(p.line);
    if (words[0] !== 'terraform') return { ok: false, output: `${words[0] ?? ''}: command not found`, code: 127 };
    return runTerraform(st, { dir: p.dir, args: words.slice(1), ...(p.answer !== undefined ? { answer: p.answer } : {}) });
  });

  /** Console du fournisseur : actions faites « à la main », hors de tout code. */
  const guard = <T>(fn: () => T): T => { try { return fn(); } catch (e) { if (e instanceof ProviderError) throw new CommandRefused(e.message); throw e; } };
  lab.register('cloud.create', (st, p: { type: string; args: Record<string, any> }) => ({ ok: true, output: JSON.stringify(guard(() => createResource(st, p.type, p.args))) }));
  lab.register('cloud.set', (st, p: { type: string; id: string; attr: string; value: any }) => { guard(() => setAttribute(st, p.type, p.id, p.attr, p.value)); return { ok: true }; });
  lab.register('cloud.delete', (st, p: { type: string; id: string }) => { guard(() => deleteResource(st, p.type, p.id)); return { ok: true }; });
  return lab;
}

/** Aides pour les tests et les TP rejouables. */
export function write(lab: Lab, path: string, content: string): void { lab.dispatch('fs.write', { path, content }); }
export function tf(lab: Lab, dir: string, line: string, answer?: string): Result {
  return lab.dispatch('tf.exec', { dir, line: line.startsWith('terraform') ? line : `terraform ${line}`, ...(answer !== undefined ? { answer } : {}) });
}
