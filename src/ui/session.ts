/** Session de terminal : répertoire courant, commandes de base, et passerelle vers terraform / ansible. */
import type { Lab } from '../engine';
import { isDir, join, list, normalize, readFile } from '../shell/vfs';
import { splitWords } from '../shell/words';

export interface Line { text: string; kind: 'out' | 'err' | 'in' | 'info' }

const HELP = `Commandes : ls, cat, cd, pwd, rm, mkdir, echo, clear, edit <fichier>
Outils : terraform init|validate|plan|apply|destroy|show|output|state|fmt|refresh
         ansible <hôtes> -m <module> -a "<args>", ansible-playbook <fichier>, ansible-inventory --list
Console du fournisseur (modifier « à la main ») : cloud vms | cloud set <id> <attribut> <valeur> | cloud delete <type> <id>
Dans l'éditeur : Ctrl+S enregistre.`;

export class Session {
  cwd = '';
  pendingAnswer: { line: string; prompt: string } | null = null;
  /** Fichier à ouvrir dans l'éditeur, demandé par `edit`. */
  openRequest: string | null = null;
  constructor(public lab: Lab, cwd = '') { this.cwd = cwd; }

  get prompt(): string { return this.pendingAnswer ? 'Enter a value: ' : `${this.cwd || '~'} $ `; }

  /** Exécute une ligne ; renvoie les lignes à afficher. */
  exec(input: string): Line[] {
    const line = input.trim();
    if (this.pendingAnswer) {
      const p = this.pendingAnswer; this.pendingAnswer = null;
      return this.run(p.line, line);
    }
    if (!line) return [];
    return this.run(line);
  }

  private run(line: string, answer?: string): Line[] {
    const w = splitWords(line);
    const cmd = w[0] ?? '';
    const st = this.lab.getState();
    const out = (s: string, kind: Line['kind'] = 'out'): Line[] => s === '' ? [] : s.split('\n').map(text => ({ text, kind }));
    if (cmd === 'terraform' || cmd === 'tofu') {
      const r = this.lab.dispatch('tf.exec', { dir: this.cwd, line: line.replace(/^tofu/, 'terraform'), ...(answer !== undefined ? { answer } : {}) });
      if (r.awaiting) { this.pendingAnswer = { line, prompt: 'Enter a value:' }; }
      return out(r.output ?? '', r.ok ? 'out' : 'err');
    }
    if (cmd.startsWith('ansible')) {
      const r = this.lab.dispatch('ans.exec', { dir: this.cwd, line });
      return out(r.output ?? '', r.ok ? 'out' : 'err');
    }
    switch (cmd) {
      case 'pwd': return out(`/${this.cwd}`);
      case 'clear': return [{ text: '\f', kind: 'info' }];
      case 'help': case '?': return out(HELP, 'info');
      case 'echo': return out(w.slice(1).join(' '));
      case 'ls': {
        const t = w[1] ? join(this.cwd, w[1]) : this.cwd;
        if (!isDir(st, t)) return readFile(st, t) !== undefined ? out(w[1]!) : out(`ls: cannot access '${w[1]}': No such file or directory`, 'err');
        return out(list(st, t).join('  '));
      }
      case 'cat': {
        if (!w[1]) return out('cat: missing file operand', 'err');
        const c = readFile(st, join(this.cwd, w[1]));
        return c === undefined ? out(`cat: ${w[1]}: No such file or directory`, 'err') : out(c.replace(/\n$/, ''));
      }
      case 'cd': {
        const t = normalize(w[1] ?? '', w[1]?.startsWith('/') ? '' : this.cwd);
        if (w[1] === undefined || w[1] === '~' || w[1] === '/') { this.cwd = ''; return []; }
        if (!isDir(st, t)) return out(`cd: ${w[1]}: No such file or directory`, 'err');
        this.cwd = t; return [];
      }
      case 'mkdir': { if (!w[1]) return out('mkdir: missing operand', 'err'); this.lab.dispatch('fs.write', { path: join(this.cwd, `${w[1]}/.keep`), content: '' }); return []; }
      case 'rm': {
        if (!w[1]) return out('rm: missing operand', 'err');
        const p = join(this.cwd, w[1]);
        const targets = w.includes('-r') ? Object.keys(st.files).filter(f => f === p || f.startsWith(`${p}/`)) : [p];
        let n = 0; for (const t of targets) if (this.lab.dispatch('fs.remove', { path: t }).ok) n++;
        return n ? [] : out(`rm: cannot remove '${w[1]}': No such file or directory`, 'err');
      }
      case 'edit': case 'nano': case 'vim': case 'vi': {
        if (!w[1]) return out(`usage: edit <fichier>`, 'err');
        this.openRequest = join(this.cwd, w[1]); return out(`Ouverture de ${w[1]} dans l'éditeur.`, 'info');
      }
      case 'cloud': return this.cloud(w.slice(1));
      default: return out(`${cmd}: command not found`, 'err');
    }
  }

  private cloud(a: string[]): Line[] {
    const out = (s: string, kind: Line['kind'] = 'out'): Line[] => s.split('\n').map(text => ({ text, kind }));
    const st = this.lab.getState();
    if (a[0] === 'vms') {
      const vms = Object.values(st.cloud['cloudpeda_vm'] ?? {});
      return out(vms.length ? vms.map(v => `${String(v['id'])}  ${String(v['name']).padEnd(14)} ${String(v['ip'])}  ${String(v['size'])}`).join('\n') : 'Aucune machine.');
    }
    try {
      if (a[0] === 'set' && a.length >= 4) {
        const type = Object.keys(st.cloud).find(t => st.cloud[t]?.[a[1]!]);
        if (!type) return out(`cloud: objet ${a[1]} introuvable`, 'err');
        const v = a[3]!; const value = /^-?\d+$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v;
        this.lab.dispatch('cloud.set', { type, id: a[1], attr: a[2], value }); return out(`${a[1]} : ${a[2]} modifié.`);
      }
      if (a[0] === 'delete' && a.length >= 3) { this.lab.dispatch('cloud.delete', { type: a[1], id: a[2] }); return out(`${a[2]} supprimé.`); }
    } catch (e) { return out(e instanceof Error ? e.message : String(e), 'err'); }
    return out('usage : cloud vms | cloud set <id> <attribut> <valeur> | cloud delete <type> <id>', 'err');
  }
}
