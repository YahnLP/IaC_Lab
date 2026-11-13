/** Système de fichiers virtuel à plat : « chemin/complet » → contenu. Les dossiers sont déduits des chemins. */
import type { State } from '../state';

export function normalize(path: string, cwd = ''): string {
  const raw = path.startsWith('/') ? path : (cwd ? `${cwd}/${path}` : path);
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}

export const join = (dir: string, name: string): string => normalize(name, dir);
export const dirOf = (path: string): string => { const i = path.lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i); };
export const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export function readFile(st: Readonly<State>, path: string): string | undefined { return st.files[normalize(path)]; }
export function writeFile(st: State, path: string, content: string): void { st.files[normalize(path)] = content; }
export function removeFile(st: State, path: string): boolean { const p = normalize(path); if (!(p in st.files)) return false; delete st.files[p]; return true; }

export function isDir(st: Readonly<State>, path: string): boolean {
  const p = normalize(path);
  if (p === '') return true;
  return Object.keys(st.files).some(f => f.startsWith(`${p}/`));
}

/** Entrées directes d'un dossier : fichiers et sous-dossiers (suffixe « / »), triés. */
export function list(st: Readonly<State>, dir: string): string[] {
  const d = normalize(dir);
  const prefix = d === '' ? '' : `${d}/`;
  const names = new Set<string>();
  for (const f of Object.keys(st.files)) {
    if (!f.startsWith(prefix)) continue;
    const rest = f.slice(prefix.length);
    const slash = rest.indexOf('/');
    names.add(slash < 0 ? rest : `${rest.slice(0, slash)}/`);
  }
  return [...names].sort();
}

/** Fichiers situés directement dans un dossier : nom → contenu. */
export function filesIn(st: Readonly<State>, dir: string): Record<string, string> {
  const d = normalize(dir);
  const prefix = d === '' ? '' : `${d}/`;
  const out: Record<string, string> = {};
  for (const [f, c] of Object.entries(st.files)) {
    if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) out[f.slice(prefix.length)] = c;
  }
  return out;
}
