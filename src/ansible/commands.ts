/** Commandes `ansible`, `ansible-playbook` et `ansible-inventory` simulées. */
import type { Result } from '../core/store';
import { dirOf, join, readFile } from '../shell/vfs';
import type { Guest, State } from '../state';
import { YamlError, parseYaml } from '../yaml/yaml';
import { InventoryError, groupsOf, hostVars, membersOf, parseInventory, selectHosts, type Inventory } from './inventory';
import { JinjaError, evalCondition, render, renderDeep, type Vars } from './jinja';
import { MODULES, resolveModule, runModule, type ModResult, type ModuleName } from './modules';

export interface AnsCall { dir: string; cmd: string; args: string[] }

// ------------------------------------------------------------------ outils d'affichage

/** JSON sur une ligne, au style d'Ansible : `{"changed": false, "msg": "…"}`. */
export function inlineJson(v: any): string {
  if (Array.isArray(v)) return `[${v.map(inlineJson).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inlineJson(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}
const pretty = (v: any): string => JSON.stringify(v, null, 4);
const banner = (s: string): string => `${s} ${'*'.repeat(Math.max(3, 79 - s.length - 1))}`;
const done = (output: string, code = 0): Result => ({ ok: code === 0, output, code });
const err = (msg: string, code = 1): Result => done(`ERROR! ${msg}`, code);

// ------------------------------------------------------------------ résolution des machines

interface Target { host: string; vmId?: string; guest?: Guest; vm?: Record<string, any>; unreachable?: string }

function resolve(st: State, host: string, vars: Vars): Target {
  const vms = Object.values(st.cloud['cloudpeda_vm'] ?? {});
  const addr = String(vars['ansible_host'] ?? host);
  const vm = vms.find(v => v['ip'] === addr || v['name'] === addr);
  const port = vars['ansible_port'] ?? 22;
  if (!vm) {
    const looksIp = /^\d+\.\d+\.\d+\.\d+$/.test(addr);
    return { host, unreachable: looksIp
      ? `Failed to connect to the host via ssh: ssh: connect to host ${addr} port ${port}: No route to host`
      : `Failed to connect to the host via ssh: ssh: Could not resolve hostname ${addr}: Name or service not known` };
  }
  const guest = vm['guest'] as Guest;
  if (!guest.services['ssh']?.active) return { host, vm, guest, vmId: vm['id'], unreachable: `Failed to connect to the host via ssh: ssh: connect to host ${addr} port ${port}: Connection refused` };
  return { host, vm, guest, vmId: vm['id'] };
}

// ------------------------------------------------------------------ chargement de l'inventaire

function loadInventory(st: State, dir: string, args: string[]): { inv: Inventory; path?: string } | { error: string } {
  let path: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i' || args[i] === '--inventory') path = args[++i];
    else if (args[i]?.startsWith('--inventory=')) path = args[i]!.slice(12);
  }
  if (!path) {
    const cfg = readFile(st, join(dir, 'ansible.cfg'));
    const m = cfg ? /^\s*inventory\s*=\s*(.+)$/m.exec(cfg) : null;
    if (m) path = m[1]!.trim();
  }
  if (!path) return { inv: parseInventory('') };
  const text = readFile(st, join(dir, path));
  if (text === undefined) return { error: `Unable to parse ${join(dir, path)} as an inventory source` };
  try { return { inv: parseInventory(text), path }; }
  catch (e) { if (e instanceof InventoryError) return { error: `${e.msg} (inventory ${path}, line ${e.line})` }; throw e; }
}

// ------------------------------------------------------------------ playbook

interface Task { name: string; mod: ModuleName; args: Record<string, any>; raw: Record<string, any>; handler?: boolean }
interface Play { name: string; hosts: string; become: boolean; gather: boolean; vars: Vars; tasks: Task[]; handlers: Task[] }

const TASK_KEYS = new Set(['name', 'when', 'loop', 'with_items', 'notify', 'become', 'register', 'vars', 'changed_when', 'failed_when', 'ignore_errors', 'tags', 'args', 'become_user', 'listen']);

class PlayError extends Error {}

function parseTask(raw: any, where: string): Task {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PlayError(`${where}: a task must be a mapping.`);
  const keys = Object.keys(raw).filter(k => !TASK_KEYS.has(k));
  if (keys.length === 0) throw new PlayError(`no module specified for task '${String(raw['name'] ?? '')}'`);
  if (keys.length > 1) throw new PlayError(`conflicting action statements: ${keys.join(', ')}`);
  const key = keys[0]!;
  const mod = resolveModule(key);
  if (!mod) throw new PlayError(`couldn't resolve module/action '${key}'. This often indicates a misspelling, missing collection, or incorrect module path.`);
  const v = raw[key];
  let args: Record<string, any> = {};
  if (typeof v === 'string') {
    if (mod === 'command' || mod === 'shell') args = { cmd: v };
    else for (const part of v.split(/\s+/).filter(Boolean)) { const i = part.indexOf('='); if (i > 0) args[part.slice(0, i)] = part.slice(i + 1); }
  } else if (v && typeof v === 'object') args = { ...v };
  if (raw['args'] && typeof raw['args'] === 'object') Object.assign(args, raw['args']);
  return { name: String(raw['name'] ?? `${key}`), mod, args, raw };
}

function parsePlaybook(text: string): Play[] {
  let doc: any;
  try { doc = parseYaml(text); } catch (e) { if (e instanceof YamlError) throw e; throw e; }
  if (!Array.isArray(doc)) throw new PlayError('A playbook must be a list of plays, got a mapping instead.');
  const plays = doc.map((p, i) => {
    if (!p || typeof p !== 'object' || !('hosts' in p)) throw new PlayError(`the field 'hosts' is required but was not set (play ${i + 1})`);
    const tasks = (Array.isArray(p['tasks']) ? p['tasks'] : []).map((t: any, k: number) => parseTask(t, `play ${i + 1}, task ${k + 1}`));
    const handlers = (Array.isArray(p['handlers']) ? p['handlers'] : []).map((t: any, k: number) => ({ ...parseTask(t, `play ${i + 1}, handler ${k + 1}`), handler: true }));
    const hn = new Set(handlers.flatMap((h: Task) => [h.name, ...(h.raw['listen'] ? [String(h.raw['listen'])] : [])]));
    for (const t of tasks) for (const n of [t.raw['notify']].flat().filter(Boolean)) if (!hn.has(String(n))) throw new PlayError(`The requested handler '${String(n)}' was not found in either the main handlers list nor in the listening handlers list`);
    return { name: String(p['name'] ?? ''), hosts: String(p['hosts']), become: p['become'] === true || p['become'] === 'yes', gather: p['gather_facts'] !== false && p['gather_facts'] !== 'no', vars: (p['vars'] ?? {}) as Vars, tasks, handlers } as Play;
  });
  return plays;
}

interface HostRun { target: Target; vars: Vars; dead: boolean; counts: { ok: number; changed: number; unreachable: number; failed: number; skipped: number; rescued: number; ignored: number } }
interface Opts { check: boolean; diff: boolean; limit?: string; dir: string; become?: boolean; verbose: boolean }

const asList = (v: any): any[] => v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

function execTask(st: State, t: Task, hr: HostRun, play: Play, o: Opts, out: string[]): { notified: string[] } {
  const notified: string[] = [];
  const h = hr.target.host;
  const baseVars: Vars = { ...hr.vars, ...(t.raw['vars'] ?? {}) };
  const c = hr.counts;
  let items: any[] | null = null;
  const loopSpec = t.raw['loop'] ?? t.raw['with_items'];
  try {
    if (loopSpec !== undefined) { const l = typeof loopSpec === 'string' ? render(loopSpec, baseVars) : renderDeep(loopSpec, baseVars); items = asList(l); }
    if (t.raw['when'] !== undefined) {
      const conds = asList(t.raw['when']);
      // la condition d'une tâche à boucle est évaluée par élément
      if (!items && !conds.every(w => evalCondition(typeof w === 'string' ? w : Boolean(w), baseVars))) { out.push(`skipping: [${h}]`); c.skipped++; return { notified }; }
    }
  } catch (e) {
    if (e instanceof JinjaError) { out.push(`fatal: [${h}]: FAILED! => ${inlineJson({ msg: `The conditional check '${String(t.raw['when'])}' failed. The error was: ${e.message}` })}`); c.failed++; hr.dead = true; return { notified }; }
    throw e;
  }
  const become = o.become || play.become || t.raw['become'] === true || t.raw['become'] === 'yes' || baseVars['ansible_become'] === true || baseVars['ansible_become'] === 'yes';
  const run = items ?? [undefined];
  let anyChanged = false; let failedItem = false; let skippedAll = true; const results: any[] = [];
  for (const item of run) {
    const vars: Vars = items ? { ...baseVars, item } : baseVars;
    const tag = items ? ` (item=${typeof item === 'object' ? inlineJson(item) : String(item)})` : '';
    const arrow = items ? ` (item=${typeof item === 'object' ? inlineJson(item) : String(item)})` : '';
    try {
      if (items && t.raw['when'] !== undefined && !asList(t.raw['when']).every(w => evalCondition(typeof w === 'string' ? w : Boolean(w), vars))) { out.push(`skipping: [${h}] =>${arrow}`.replace('=> (', '=> (')); results.push({ skipped: true }); continue; }
      skippedAll = false;
      const args = renderDeep(t.args, vars) as Record<string, any>;
      const g = hr.target.guest!;
      const res: ModResult = runModule(t.mod, args, {
        guest: g, hostname: h, check: o.check, diff: o.diff, become, clock: st.clock,
        readSource: (kind, src) => {
          const folder = kind === 'template' ? 'templates' : 'files';
          return readFile(st, join(o.dir, `${folder}/${src}`)) ?? readFile(st, join(o.dir, src));
        },
        renderTemplate: text => String(render(text, vars)),
      });
      // command / shell : changed par défaut, sauf indication contraire
      let changed = res.changed;
      if (t.mod === 'command' || t.mod === 'shell') {
        if (res.skipped) { out.push(`skipping: [${h}]${items ? ` =>${arrow}` : ''}`); results.push({ skipped: true }); c.skipped += items ? 0 : 1; continue; }
      }
      const reg = { changed, failed: !!res.failed, skipped: false, msg: res.msg, ...(res.data ?? {}), stdout_lines: String(res.data?.['stdout'] ?? '').split('\n').filter(Boolean) };
      if (t.raw['register']) { hr.vars[String(t.raw['register'])] = reg; vars[String(t.raw['register'])] = reg; }
      if (t.raw['changed_when'] !== undefined) changed = evalCondition(typeof t.raw['changed_when'] === 'string' ? t.raw['changed_when'] : Boolean(t.raw['changed_when']), { ...vars, ...(t.raw['register'] ? {} : { result: reg }) });
      let failed = !!res.failed || (res.data?.['rc'] !== undefined && res.data['rc'] !== 0 && t.raw['failed_when'] === undefined);
      if (t.raw['failed_when'] !== undefined) failed = evalCondition(typeof t.raw['failed_when'] === 'string' ? t.raw['failed_when'] : Boolean(t.raw['failed_when']), vars);
      if (res.diff && o.diff) out.push(res.diff);
      if (failed) {
        const body = { ...(res.data ?? {}), changed: false, msg: res.msg ?? 'non-zero return code' };
        out.push(items ? `failed: [${h}]${tag} => ${inlineJson(body)}` : `fatal: [${h}]: FAILED! => ${inlineJson(body)}`);
        if (t.raw['ignore_errors']) { out.push('...ignoring'); c.ignored++; continue; }
        failedItem = true; break;
      }
      if (t.mod === 'debug') { out.push(`ok: [${h}] => ${pretty({ msg: res.msg })}`); results.push({}); continue; }
      if (changed) { anyChanged = true; const ev = res.data && t.mod !== 'ping' && t.mod !== 'command' && t.mod !== 'shell' ? '' : ''; void ev; }
      const line = `${changed ? 'changed' : 'ok'}: [${h}]${items ? ` =>${arrow}` : ''}`;
      out.push(o.verbose && t.mod === 'ping' ? `${line} => ${inlineJson({ changed: false, ping: res.data?.['ping'] })}` : line);
      results.push({ changed });
      if (changed) notified.push(...asList(t.raw['notify']).map(String));
    } catch (e) {
      if (e instanceof JinjaError) {
        out.push(`fatal: [${h}]: FAILED! => ${inlineJson({ msg: `The task includes an option with an undefined variable. The error was: ${e.message}` })}`);
        if (t.raw['ignore_errors']) { out.push('...ignoring'); c.ignored++; continue; }
        failedItem = true; break;
      }
      throw e;
    }
  }
  if (failedItem) {
    if (items) out.push(`fatal: [${h}]: FAILED! => ${inlineJson({ msg: 'One or more items failed' })}`);
    c.failed++; hr.dead = true; return { notified: [] };
  }
  if (items && skippedAll) { c.skipped++; return { notified }; }
  c.ok++; if (anyChanged) c.changed++;
  return { notified };
}

function formatRecap(hosts: HostRun[]): string {
  const rows = hosts.map(hr => { const c = hr.counts; return `${hr.target.host.padEnd(26)} : ok=${String(c.ok).padEnd(4)} changed=${String(c.changed).padEnd(4)} unreachable=${String(c.unreachable).padEnd(4)} failed=${String(c.failed).padEnd(4)} skipped=${String(c.skipped).padEnd(4)} rescued=${String(c.rescued).padEnd(4)} ignored=${String(c.ignored).padEnd(4)}`; });
  return ['PLAY RECAP ' + '*'.repeat(68), ...rows].join('\n');
}

function playbook(st: State, call: AnsCall): Result {
  const a = call.args;
  const opts: Opts = { check: false, diff: false, dir: call.dir, verbose: false };
  const files: string[] = [];
  let syntaxOnly = false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    if (x === '--check' || x === '-C') opts.check = true;
    else if (x === '--diff' || x === '-D') opts.diff = true;
    else if (x === '--syntax-check') syntaxOnly = true;
    else if (x === '-b' || x === '--become') opts.become = true;
    else if (x === '-l' || x === '--limit') opts.limit = a[++i];
    else if (x.startsWith('--limit=')) opts.limit = x.slice(8);
    else if (x === '-i' || x === '--inventory') i++;
    else if (x.startsWith('--inventory=') || x === '-v' || x === '-vv' || x === '-vvv') { if (x.startsWith('-v')) opts.verbose = true; }
    else if (x.startsWith('-')) return done(`ansible-playbook: error: unrecognized arguments: ${x}`, 2);
    else files.push(x);
  }
  if (files.length === 0) return done('usage: ansible-playbook [-h] [--version] [-v] [-k] [--private-key PRIVATE_KEY_FILE]\n                        [-u REMOTE_USER] [-c CONNECTION] [-T TIMEOUT] [-i INVENTORY]\n                        [-l SUBSET] [-C] [-D] [-b] playbook [playbook ...]\nansible-playbook: error: the following arguments are required: playbook(s)', 2);
  const pbPath = join(call.dir, files[0]!);
  const text = readFile(st, pbPath);
  if (text === undefined) return err(`the playbook: ${files[0]} could not be found`);
  let plays: Play[];
  try { plays = parsePlaybook(text); }
  catch (e) {
    if (e instanceof YamlError) return err(`Syntax Error while loading YAML.\n  ${e.msg}\n\nThe error appears to be in '${pbPath}': line ${e.line}, column ${e.column}`, 4);
    if (e instanceof PlayError) return err(e.message, 4);
    throw e;
  }
  if (syntaxOnly) return done(`\nplaybook: ${files[0]}`);
  const invr = loadInventory(st, call.dir, a);
  if ('error' in invr) return done(`[WARNING]:  * Failed to parse inventory: ${invr.error}\n[WARNING]: No inventory was parsed, only implicit localhost is available`, 0);
  const inv = invr.inv;
  const out: string[] = [];
  if (!invr.path) out.push('[WARNING]: No inventory was parsed, only implicit localhost is available');
  const runs = new Map<string, HostRun>();
  const mk = (h: string): HostRun => {
    const vars = { ...hostVars(inv, h), inventory_hostname: h, group_names: groupsOf(inv, h) };
    return { target: resolve(st, h, vars), vars, dead: false, counts: { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 } };
  };
  let exit = 0;
  for (const play of plays) {
    let names = selectHosts(inv, play.hosts);
    if (opts.limit) { const lim = new Set(selectHosts(inv, opts.limit)); names = names.filter(n => lim.has(n)); }
    out.push('', banner(`PLAY [${play.name || play.hosts}]`));
    if (names.length === 0) { out.push('skipping: no hosts matched'); continue; }
    const hrs = names.map(n => { let r = runs.get(n); if (!r) { r = mk(n); runs.set(n, r); } r.vars = { ...r.vars, ...play.vars }; return r; });
    const gather = (): void => {
      out.push('', banner('TASK [Gathering Facts]'));
      for (const hr of hrs) {
        if (hr.dead) continue;
        if (hr.target.unreachable) {
          out.push(`fatal: [${hr.target.host}]: UNREACHABLE! => ${inlineJson({ changed: false, msg: hr.target.unreachable, unreachable: true })}`);
          hr.counts.unreachable++; hr.dead = true; exit = Math.max(exit, 4) === 4 && exit !== 2 ? 4 : exit; continue;
        }
        hr.vars['ansible_hostname'] = hr.target.guest!.files['/etc/hostname']?.content.trim() || hr.target.host;
        hr.vars['ansible_default_ipv4'] = { address: hr.target.vm!['ip'] };
        hr.counts.ok++; out.push(`ok: [${hr.target.host}]`);
      }
    };
    if (play.gather) gather();
    else for (const hr of hrs) if (hr.target.unreachable) { /* détecté à la première tâche */ }
    const pending: string[] = [];
    const runTask = (t: Task, label: string): string[] => {
      out.push('', banner(`${label} [${t.name}]`));
      const notified: string[] = [];
      for (const hr of hrs) {
        if (hr.dead) continue;
        if (hr.target.unreachable) {
          out.push(`fatal: [${hr.target.host}]: UNREACHABLE! => ${inlineJson({ changed: false, msg: hr.target.unreachable, unreachable: true })}`);
          hr.counts.unreachable++; hr.dead = true; continue;
        }
        notified.push(...execTask(st, t, hr, play, opts, out).notified);
      }
      return notified;
    };
    for (const t of play.tasks) pending.push(...runTask(t, 'TASK'));
    if (pending.length) {
      const wanted = new Set(pending);
      for (const hd of play.handlers) if (wanted.has(hd.name) || (hd.raw['listen'] && wanted.has(String(hd.raw['listen'])))) runTask(hd, 'RUNNING HANDLER');
    }
  }
  const all = [...runs.values()];
  if (all.some(h => h.counts.failed > 0)) exit = 2; else if (all.some(h => h.counts.unreachable > 0)) exit = 4;
  out.push('', formatRecap(all), '');
  return done(out.join('\n').replace(/^\n/, ''), exit);
}

// ------------------------------------------------------------------ ansible (ad hoc)

function adhoc(st: State, call: AnsCall): Result {
  const a = call.args;
  let pattern: string | undefined; let mod = 'command'; let margs = ''; let become = false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    if (x === '-m' || x === '--module-name') mod = a[++i] ?? 'command';
    else if (x === '-a' || x === '--args') margs = a[++i] ?? '';
    else if (x === '-b' || x === '--become') become = true;
    else if (x === '-i' || x === '--inventory') i++;
    else if (x.startsWith('-')) continue;
    else if (!pattern) pattern = x;
  }
  if (!pattern) return done('usage: ansible [-h] [--version] [-v] [-b] [-m MODULE_NAME] [-a MODULE_ARGS] [-i INVENTORY] pattern\nansible: error: the following arguments are required: pattern', 2);
  const invr = loadInventory(st, call.dir, a);
  if ('error' in invr) return done(`[WARNING]:  * Failed to parse inventory: ${invr.error}`, 0);
  const inv = invr.inv;
  const hosts = selectHosts(inv, pattern);
  if (hosts.length === 0) return done(`[WARNING]: Could not match supplied host pattern, ignoring: ${pattern}\n[ERROR]: Specified inventory, host pattern and/or --limit leaves us without hosts to target.`, 1);
  const m = resolveModule(mod);
  if (!m) return err(`couldn't resolve module/action '${mod}'. This often indicates a misspelling, missing collection, or incorrect module path.`, 1);
  const args: Record<string, any> = {};
  if (m === 'command' || m === 'shell') args['cmd'] = margs;
  else for (const part of margs.split(/\s+/).filter(Boolean)) { const i = part.indexOf('='); if (i > 0) args[part.slice(0, i)] = part.slice(i + 1); }
  const out: string[] = []; let exit = 0;
  for (const h of hosts) {
    const vars: Vars = { ...hostVars(inv, h), inventory_hostname: h };
    const t = resolve(st, h, vars);
    if (t.unreachable) { out.push(`${h} | UNREACHABLE! => ${pretty({ changed: false, msg: t.unreachable, unreachable: true })}`); exit = exit || 4; continue; }
    const bec = become || vars['ansible_become'] === true || vars['ansible_become'] === 'yes';
    const res = runModule(m, args, { guest: t.guest!, hostname: h, check: false, diff: false, become: bec, clock: st.clock, readSource: () => undefined, renderTemplate: x => x });
    const failed = !!res.failed || (res.data?.['rc'] !== undefined && res.data['rc'] !== 0);
    if (failed) { out.push(`${h} | FAILED! => ${pretty({ ...(res.data ?? {}), changed: false, msg: res.msg ?? 'non-zero return code' })}`); exit = 2; continue; }
    if (m === 'command' || m === 'shell') { out.push(`${h} | CHANGED | rc=${String(res.data?.['rc'] ?? 0)} >>\n${String(res.data?.['stdout'] ?? '')}`); continue; }
    out.push(`${h} | ${res.changed ? 'CHANGED' : 'SUCCESS'} => ${pretty({ changed: res.changed, ...(res.data ?? {}), ...(res.msg ? { msg: res.msg } : {}) })}`);
  }
  return done(out.join('\n'), exit);
}

// ------------------------------------------------------------------ ansible-inventory

function inventoryCmd(st: State, call: AnsCall): Result {
  const a = call.args;
  const invr = loadInventory(st, call.dir, a);
  if ('error' in invr) return done(`[WARNING]:  * Failed to parse inventory: ${invr.error}`, 0);
  const inv = invr.inv;
  if (a.includes('--graph')) {
    const lines: string[] = [];
    const walk = (g: string, depth: number, seen: string[]): void => {
      lines.push(`${'  |'.repeat(depth)}--@${g}:`);
      const gr = inv.groups[g]!;
      for (const c of gr.children) if (!seen.includes(c)) walk(c, depth + 1, [...seen, c]);
      for (const h of gr.hosts) lines.push(`${'  |'.repeat(depth + 1)}--${h}`);
    };
    walk('all', 0, ['all']);
    return done(lines.join('\n').replace(/^/, '@all:\n').split('\n').slice(1).join('\n').replace(/^--@all:/, '@all:'));
  }
  if (a.includes('--list')) {
    const hv: Record<string, any> = {};
    for (const h of Object.keys(inv.hosts)) hv[h] = hostVars(inv, h);
    const obj: Record<string, any> = { _meta: { hostvars: hv }, all: { children: ['ungrouped', ...Object.keys(inv.groups).filter(g => g !== 'all' && g !== 'ungrouped' && !Object.values(inv.groups).some(x => x.children.includes(g)))] } };
    for (const [g, gr] of Object.entries(inv.groups)) {
      if (g === 'all') continue;
      const e: Record<string, any> = {};
      if (gr.hosts.length) e['hosts'] = gr.hosts;
      if (gr.children.length) e['children'] = gr.children;
      if (Object.keys(e).length) obj[g] = e;
    }
    return done(JSON.stringify(obj, null, 4));
  }
  return done('usage: ansible-inventory [-h] [--version] [-v] [-i INVENTORY] [--list | --host HOST | --graph]\nansible-inventory: error: one of the arguments --graph --host --list is required', 2);
}

export function runAnsible(st: State, call: AnsCall): Result {
  switch (call.cmd) {
    case 'ansible-playbook': return playbook(st, call);
    case 'ansible': return adhoc(st, call);
    case 'ansible-inventory': return inventoryCmd(st, call);
    default: return done(`${call.cmd}: command not found`, 127);
  }
}
void MODULES; void dirOf; void membersOf;
