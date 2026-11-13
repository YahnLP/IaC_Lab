/** Git simulé, très réduit : init, add, commit, status, log. Les données vivent dans `<racine>/.git/…` (fichiers du projet). */
import type { Result } from '../core/store';
import type { State } from '../state';
import { baseOf, join, normalize } from './vfs';

interface Commit { id: string; message: string; files: Record<string, string> }
interface Repo { commits: Commit[]; staged: Record<string, string> }

const ok = (output: string, code = 0): Result => ({ ok: code === 0, output, code });

/** Racine du dépôt : dossier courant ou ancêtre contenant `.git/`. */
export function repoRoot(st: Readonly<State>, dir: string): string | undefined {
  let d = normalize(dir);
  for (;;) {
    if (`${d ? `${d}/` : ''}.git/repo.json` in st.files) return d;
    if (d === '') return undefined;
    d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '';
  }
}
export const loadRepo = (st: Readonly<State>, root: string): Repo => JSON.parse(st.files[join(root, '.git/repo.json')] ?? '{"commits":[],"staged":{}}') as Repo;
const save = (st: State, root: string, r: Repo): void => { st.files[join(root, '.git/repo.json')] = JSON.stringify(r); };

function patterns(st: Readonly<State>, root: string): string[] {
  return (st.files[join(root, '.gitignore')] ?? '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}
export function ignored(path: string, pats: string[]): boolean {
  return pats.some(p => {
    if (p.endsWith('/')) return path.startsWith(p) || path.includes(`/${p}`);
    if (p.includes('*')) { const re = new RegExp(`(^|/)${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`); return re.test(path); }
    return path === p || baseOf(path) === p;
  });
}

function working(st: Readonly<State>, root: string): Record<string, string> {
  const pre = root ? `${root}/` : ''; const pats = patterns(st, root); const out: Record<string, string> = {};
  for (const [f, c] of Object.entries(st.files)) {
    if (!f.startsWith(pre)) continue; const rel = f.slice(pre.length);
    if (rel.startsWith('.git/') || rel === '.keep' || rel.endsWith('/.keep') || ignored(rel, pats)) continue;
    out[rel] = c;
  }
  return out;
}

/** Fichiers du dernier commit (chemin relatif → contenu), pour les vérificateurs de TP. */
export function lastCommitFiles(st: Readonly<State>, root: string): Record<string, string> | undefined {
  if (!(`${root ? `${root}/` : ''}.git/repo.json` in st.files)) return undefined;
  const r = loadRepo(st, root); return r.commits[r.commits.length - 1]?.files;
}

export function runGit(st: State, dir: string, args: string[]): Result {
  const sub = args[0];
  if (sub === 'init') { if (!repoRoot(st, dir)) save(st, normalize(dir), { commits: [], staged: {} }); return ok(`Initialized empty Git repository in /${normalize(dir)}/.git/`); }
  const root = repoRoot(st, dir);
  if (root === undefined) return ok('fatal: not a git repository (or any of the parent directories): .git', 128);
  const repo = loadRepo(st, root);
  switch (sub) {
    case 'add': {
      const targets = args.slice(1); if (!targets.length) return ok('Nothing specified, nothing added.', 1);
      const w = working(st, root);
      for (const t of targets) {
        const rel = t === '.' ? '' : normalize(t, dir.slice(root.length).replace(/^\//, ''));
        const hit = Object.keys(w).filter(f => rel === '' || f === rel || f.startsWith(`${rel}/`));
        if (!hit.length && t !== '.') return ok(`fatal: pathspec '${t}' did not match any files`, 128);
        for (const f of hit) repo.staged[f] = w[f]!;
      }
      save(st, root, repo); return ok('');
    }
    case 'commit': {
      const i = args.indexOf('-m'); const msg = i >= 0 ? args[i + 1] : undefined;
      if (!msg) return ok('Aborting commit due to empty commit message.', 1);
      const last = repo.commits[repo.commits.length - 1]?.files ?? {};
      const files = { ...last, ...repo.staged };
      if (Object.keys(repo.staged).length === 0 || JSON.stringify(files) === JSON.stringify(last)) return ok('nothing to commit, working tree clean', 1);
      const id = (repo.commits.length + 1).toString(16).padStart(7, '0');
      repo.commits.push({ id, message: msg, files }); const n = Object.keys(repo.staged).length; repo.staged = {};
      save(st, root, repo); return ok(`[main ${id}] ${msg}\n ${n} file${n > 1 ? 's' : ''} changed`);
    }
    case 'log': {
      if (!repo.commits.length) return ok('fatal: your current branch \'main\' does not have any commits yet', 128);
      return ok([...repo.commits].reverse().map(c => `${c.id} ${c.message}`).join('\n'));
    }
    case 'status': {
      const w = working(st, root); const last = repo.commits[repo.commits.length - 1]?.files ?? {};
      const staged = Object.keys(repo.staged).filter(f => last[f] !== repo.staged[f]);
      const changed = Object.keys(w).filter(f => !(f in repo.staged) && f in last && last[f] !== w[f]);
      const untracked = Object.keys(w).filter(f => !(f in last) && !(f in repo.staged));
      const L = ['On branch main'];
      if (staged.length) L.push('Changes to be committed:', ...staged.map(f => `\t${f in last ? 'modified' : 'new file'}:   ${f}`));
      if (changed.length) L.push('Changes not staged for commit:', ...changed.map(f => `\tmodified:   ${f}`));
      if (untracked.length) L.push('Untracked files:', ...untracked.map(f => `\t${f}`));
      if (L.length === 1) L.push('nothing to commit, working tree clean');
      return ok(L.join('\n'));
    }
    default: return ok(`git: '${String(sub)}' is not supported in this simulator (init, add, commit, status, log).`, 1);
  }
}
