/** Modules Ansible simulés : chacun lit et modifie l'état invité (`Guest`) d'une machine. */
import type { Guest } from '../state';
import { unifiedDiff } from './diff';

export interface ModResult {
  changed: boolean;
  failed?: boolean;
  skipped?: boolean;
  msg?: string;
  diff?: string;
  /** Données supplémentaires affichées par certains modules (ping, command). */
  data?: Record<string, any>;
}

export interface ModCtx {
  guest: Guest;
  hostname: string;
  check: boolean;
  diff: boolean;
  become: boolean;
  /** Date simulée, pour `uptime`. */
  clock: number;
  /** Lit un fichier du projet (pour copy/template). */
  readSource(kind: 'copy' | 'template', src: string): string | undefined;
  /** Rend un modèle Jinja2 avec les variables de la machine. */
  renderTemplate(text: string): string;
}

export const MODULES = ['ping', 'apt', 'service', 'copy', 'template', 'file', 'user', 'lineinfile', 'command', 'shell', 'debug'] as const;
export type ModuleName = typeof MODULES[number];

/** Résout « ansible.builtin.apt » ou « apt » ; retourne undefined si le module n'existe pas. */
export function resolveModule(key: string): ModuleName | undefined {
  const short = key.startsWith('ansible.builtin.') ? key.slice('ansible.builtin.'.length) : key;
  return (MODULES as readonly string[]).includes(short) ? short as ModuleName : undefined;
}

// ------------------------------------------------------------------ paquets

interface Pkg { services?: { name: string; active: boolean; enabled: boolean }[]; dirs?: string[]; files?: Record<string, string> }
export const PACKAGES: Record<string, Pkg> = {
  apache2: { services: [{ name: 'apache2', active: true, enabled: true }], dirs: ['/etc/apache2', '/var/www', '/var/www/html'], files: { '/var/www/html/index.html': '<html><body><h1>Apache2 Debian Default Page</h1></body></html>\n' } },
  nginx: { services: [{ name: 'nginx', active: true, enabled: true }], dirs: ['/etc/nginx', '/var/www', '/var/www/html'], files: { '/var/www/html/index.nginx-debian.html': '<html><body><h1>Welcome to nginx!</h1></body></html>\n' } },
  postgresql: { services: [{ name: 'postgresql', active: true, enabled: true }], dirs: ['/etc/postgresql'] },
  'mariadb-server': { services: [{ name: 'mariadb', active: true, enabled: true }], dirs: ['/etc/mysql'] },
  fail2ban: { services: [{ name: 'fail2ban', active: true, enabled: true }], dirs: ['/etc/fail2ban'] },
  ufw: { services: [{ name: 'ufw', active: false, enabled: false }] },
  chrony: { services: [{ name: 'chrony', active: true, enabled: true }], dirs: ['/etc/chrony'] },
  curl: {}, 'vim-tiny': {}, vim: {}, git: {}, htop: {}, tree: {}, rsync: {}, 'net-tools': {}, sudo: {}, python3: {}, 'openssh-server': {}, snapd: {},
};

const BASE_DIRS = new Set(['/', '/etc', '/etc/ssh', '/etc/ssh/sshd_config.d', '/etc/default', '/var', '/var/log', '/home', '/home/utilisateur', '/tmp', '/opt', '/srv', '/root', '/usr', '/usr/local']);
const dirExists = (g: Guest, p: string): boolean => BASE_DIRS.has(p) || g.files[p]?.dir === true || Object.keys(g.files).some(f => f.startsWith(`${p}/`));
const parentOf = (p: string): string => p.slice(0, p.lastIndexOf('/')) || '/';
const writable = (p: string, become: boolean): boolean => become || p.startsWith('/tmp/') || p.startsWith('/home/utilisateur/') || p === '/tmp';
const names = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const bool = (v: unknown): boolean | undefined => v === undefined || v === null ? undefined : v === true || v === 'yes' || v === 'true';
const fail = (msg: string): ModResult => ({ changed: false, failed: true, msg });
const modeOf = (v: unknown): string | undefined => v === undefined || v === null ? undefined : String(v).padStart(4, '0');

/** Écrit un fichier et dit si quelque chose a changé (contenu, droits, propriétaire). */
function putFile(c: ModCtx, dest: string, content: string | null, mode: string | undefined, owner: string | undefined, label?: string): ModResult {
  const g = c.guest;
  const cur = g.files[dest];
  if (cur?.dir) return fail(`can not use content with a dir as dest`);
  if (!dirExists(g, parentOf(dest))) return fail(`Destination directory ${parentOf(dest)} does not exist`);
  if (!writable(dest, c.become)) return fail(`Destination directory ${parentOf(dest)} not writable`);
  const newContent = content ?? cur?.content ?? '';
  const newMode = mode ?? cur?.mode ?? '0644';
  const newOwner = owner ?? cur?.owner ?? 'root';
  const changed = !cur || cur.content !== newContent || cur.mode !== newMode || cur.owner !== newOwner;
  const diff = changed && c.diff && (!cur || cur.content !== newContent) ? unifiedDiff(dest, cur ? cur.content : null, newContent, label) : undefined;
  if (changed && !c.check) g.files[dest] = { content: newContent, mode: newMode, owner: newOwner };
  return { changed, ...(diff ? { diff } : {}) };
}

function serviceExists(g: Guest, n: string): string | undefined {
  const name = n.replace(/\.service$/, '');
  const alias = name === 'sshd' ? 'ssh' : name;
  return g.services[alias] ? alias : undefined;
}

function sh(c: ModCtx, cmd: string): ModResult {
  const w = cmd.trim().split(/\s+/);
  const g = c.guest;
  const out = (stdout: string, extra: Partial<ModResult> = {}): ModResult => ({ changed: true, data: { rc: 0, stdout }, ...extra });
  switch (w[0]) {
    case 'uptime': { const s = c.clock % 86400; const hh = String(Math.floor(s / 3600)).padStart(2, '0'); const mm = String(Math.floor(s / 60) % 60).padStart(2, '0'); return out(` ${hh}:${mm}:${String(s % 60).padStart(2, '0')} up 1 min,  1 user,  load average: 0.00, 0.01, 0.00`); }
    case 'hostname': return out(c.hostname);
    case 'whoami': return out(c.become ? 'root' : 'utilisateur');
    case 'echo': return out(w.slice(1).join(' '));
    case 'touch': case 'mkdir': case 'rm': {
      const target = w.filter(x => !x.startsWith('-')).pop() ?? '';
      if (!writable(target, c.become)) return { changed: true, failed: true, msg: 'non-zero return code', data: { rc: w[0] === 'touch' ? 1 : 1, stderr: `${w[0]}: cannot ${w[0] === 'rm' ? 'remove' : w[0] === 'touch' ? 'touch' : 'create directory'} '${target}': Permission denied` } };
      if (w[0] === 'touch') { if (!dirExists(g, parentOf(target))) return { changed: true, failed: true, msg: 'non-zero return code', data: { rc: 1, stderr: `touch: cannot touch '${target}': No such file or directory` } }; if (!g.files[target]) g.files[target] = { content: '', mode: '0644', owner: c.become ? 'root' : 'utilisateur' }; }
      else if (w[0] === 'mkdir') g.files[target] = { content: '', mode: '0755', owner: c.become ? 'root' : 'utilisateur', dir: true };
      else delete g.files[target];
      return out('');
    }
    case 'systemctl': case 'service': {
      const [verb, name] = w[0] === 'service' ? [w[2], w[1]] : [w[1], w[2]];
      const svc = name ? serviceExists(g, name) : undefined;
      if (!svc) return { changed: true, failed: true, msg: 'non-zero return code', data: { rc: 5, stderr: `Failed to ${verb ?? 'act on'} ${name ?? ''}.service: Unit ${name ?? ''}.service not found.` } };
      if (verb === 'restart' || verb === 'start') g.services[svc]!.active = true;
      if (verb === 'stop') g.services[svc]!.active = false;
      if (verb === 'enable') g.services[svc]!.enabled = true;
      if (verb === 'disable') g.services[svc]!.enabled = false;
      return out('');
    }
    default: return out('');
  }
}

export function runModule(mod: ModuleName, a: Record<string, any>, c: ModCtx): ModResult {
  const g = c.guest;
  switch (mod) {
    case 'ping': return { changed: false, data: { ping: String(a['data'] ?? 'pong') } };
    case 'debug': return { changed: false, msg: a['msg'] !== undefined ? String(a['msg']) : 'Hello world!' };

    case 'apt': {
      if (!c.become) return fail('This command has to be run under the root user.');
      const state = String(a['state'] ?? 'present');
      const list = names(a['name'] ?? a['pkg']);
      if (!list.length) { if (a['update_cache']) return { changed: false }; return fail('one of the following is required: name, deb, upgrade'); }
      let changed = false;
      for (const p of list) {
        const def = PACKAGES[p];
        if (!def && state !== 'absent') return fail(`No package matching '${p}' is available`);
        const has = g.packages.includes(p);
        if (state === 'absent') {
          if (has) { changed = true; if (!c.check) { g.packages = g.packages.filter(x => x !== p); for (const s of def?.services ?? []) delete g.services[s.name]; } }
        } else if (!has) {
          changed = true;
          if (!c.check) {
            g.packages.push(p);
            for (const s of def!.services ?? []) g.services[s.name] = { enabled: s.enabled, active: s.active };
            for (const d of def!.dirs ?? []) if (!dirExists(g, d)) g.files[d] = { content: '', mode: '0755', owner: 'root', dir: true };
            for (const [f, content] of Object.entries(def!.files ?? {})) g.files[f] = { content, mode: '0644', owner: 'root' };
          }
        }
      }
      return { changed };
    }

    case 'service': {
      if (!c.become) return fail(`Failed to ${a['state'] === 'stopped' ? 'stop' : 'start'} ${String(a['name'])}.service: Interactive authentication required.`);
      const name = String(a['name'] ?? '');
      const svc = serviceExists(g, name);
      if (!svc) return fail(`Could not find the requested service ${name}: host`);
      const s = g.services[svc]!;
      let changed = false;
      const state = a['state'] as string | undefined;
      const enabled = bool(a['enabled']);
      if (state === 'started' && !s.active) { changed = true; if (!c.check) s.active = true; }
      if (state === 'stopped' && s.active) { changed = true; if (!c.check) s.active = false; }
      if (state === 'restarted') { changed = true; if (!c.check) s.active = true; }
      if (state === 'reloaded') { changed = true; if (!c.check) s.active = true; }
      if (enabled !== undefined && s.enabled !== enabled) { changed = true; if (!c.check) s.enabled = enabled; }
      return { changed };
    }

    case 'copy': case 'template': {
      const dest = String(a['dest'] ?? '');
      if (!dest) return fail(`missing required arguments: dest`);
      let content: string | null;
      if (mod === 'copy' && a['content'] !== undefined) content = String(a['content']);
      else {
        const src = String(a['src'] ?? '');
        if (!src) return fail('src (or content) is required');
        const raw = c.readSource(mod, src);
        if (raw === undefined) return fail(`Could not find or access '${src}'\nSearched in:\n\t${mod === 'template' ? 'templates/' : 'files/'}${src}\n\t${src}`);
        content = mod === 'template' ? c.renderTemplate(raw) : raw;
      }
      const r = putFile(c, dest, content, modeOf(a['mode']), a['owner'] === undefined ? undefined : String(a['owner']), mod === 'template' ? String(a['src']) : undefined);
      return r;
    }

    case 'file': {
      const path = String(a['path'] ?? a['dest'] ?? '');
      const state = String(a['state'] ?? 'file');
      if (!path) return fail('missing required arguments: path');
      if (!writable(path, c.become)) return fail(`Error, could not touch target: [Errno 13] Permission denied: '${path}'`);
      const cur = g.files[path];
      const mode = modeOf(a['mode']); const owner = a['owner'] === undefined ? undefined : String(a['owner']);
      if (state === 'absent') { if (cur || dirExists(g, path)) { if (!c.check) for (const k of Object.keys(g.files)) if (k === path || k.startsWith(`${path}/`)) delete g.files[k]; return { changed: true }; } return { changed: false }; }
      if (state === 'directory') {
        if (!dirExists(g, parentOf(path)) && !a['recurse']) return fail(`Error, could not create directory: parent ${parentOf(path)} does not exist`);
        const exists = dirExists(g, path);
        const want = mode ?? (cur?.mode ?? '0755');
        const changed = !exists || (cur?.dir === true && (cur.mode !== want || (owner !== undefined && cur.owner !== owner)));
        if (changed && !c.check) g.files[path] = { content: '', mode: want, owner: owner ?? cur?.owner ?? 'root', dir: true };
        return { changed };
      }
      if (state === 'touch') { if (!c.check) g.files[path] = { content: cur?.content ?? '', mode: mode ?? cur?.mode ?? '0644', owner: owner ?? cur?.owner ?? 'root' }; return { changed: true }; }
      if (!cur) return fail(`file (${path}) is absent, cannot continue`);
      const changed = (mode !== undefined && cur.mode !== mode) || (owner !== undefined && cur.owner !== owner);
      if (changed && !c.check) { if (mode) cur.mode = mode; if (owner) cur.owner = owner; }
      return { changed };
    }

    case 'user': {
      if (!c.become) return fail('useradd: Permission denied.');
      const name = String(a['name'] ?? '');
      const state = String(a['state'] ?? 'present');
      const has = g.users.includes(name);
      if (state === 'absent') { if (has && !c.check) g.users = g.users.filter(u => u !== name); return { changed: has }; }
      if (!has && !c.check) { g.users.push(name); g.files[`/home/${name}`] = { content: '', mode: '0755', owner: name, dir: true }; }
      return { changed: !has };
    }

    case 'lineinfile': {
      const path = String(a['path'] ?? a['dest'] ?? '');
      const line = a['line'] === undefined ? undefined : String(a['line']);
      const regexp = a['regexp'] === undefined ? undefined : new RegExp(String(a['regexp']));
      const state = String(a['state'] ?? 'present');
      if (!path) return fail('missing required arguments: path');
      if (!c.become && !writable(path, false)) return fail(`Destination ${path} not writable`);
      const cur = g.files[path];
      if (!cur && !bool(a['create'])) return fail(`Destination ${path} does not exist !`);
      if (!cur && !dirExists(g, parentOf(path))) return fail(`Destination directory ${parentOf(path)} does not exist`);
      const before = cur?.content ?? '';
      const ls = before === '' ? [] : before.replace(/\n$/, '').split('\n');
      let out = [...ls];
      if (state === 'absent') out = ls.filter(l => !(regexp ? regexp.test(l) : l === line));
      else {
        if (line === undefined) return fail('one of the following is required: line');
        let idx = -1;
        if (regexp) { for (let k = ls.length - 1; k >= 0; k--) if (regexp.test(ls[k]!)) { idx = k; break; } }
        else idx = ls.lastIndexOf(line);
        if (idx >= 0) out[idx] = line; else out.push(line);
      }
      const after = out.length ? out.join('\n') + '\n' : '';
      const changed = !cur || after !== before;
      const diff = changed && c.diff && after !== before ? unifiedDiff(path, cur ? before : null, after) : undefined;
      if (changed && !c.check) g.files[path] = { content: after, mode: modeOf(a['mode']) ?? cur?.mode ?? '0644', owner: cur?.owner ?? 'root' };
      return { changed, ...(diff ? { diff } : {}) };
    }

    case 'command': case 'shell': {
      const cmd = String(a['cmd'] ?? a['_raw'] ?? '');
      if (!cmd) return fail('no command given');
      if (a['creates'] !== undefined && (g.files[String(a['creates'])] || dirExists(g, String(a['creates'])))) {
        return { changed: false, msg: `Did not run command since '${String(a['creates'])}' exists`, data: { rc: 0, stdout: `skipped, since ${String(a['creates'])} exists` } };
      }
      if (a['removes'] !== undefined && !(g.files[String(a['removes'])] || dirExists(g, String(a['removes'])))) {
        return { changed: false, msg: `Did not run command since '${String(a['removes'])}' does not exist` };
      }
      if (c.check) return { changed: false, skipped: true, msg: 'Command would have run if not in check mode' };
      return sh(c, cmd);
    }
  }
}
