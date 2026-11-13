/** Commande `terraform` : init, fmt, validate, plan, apply, destroy, show, output, state, refresh. */
import { evalExpr, EvalError, isUnknown } from '../hcl/eval';
import { HclError } from '../hcl/ast';
import { parseExpression, parseFile } from '../hcl/parser';
import type { Result } from '../core/store';
import { baseOf, filesIn, join, normalize, readFile, removeFile, writeFile } from '../shell/vfs';
import type { State } from '../state';
import {
  PROVIDER_SOURCE, PROVIDER_VERSION, ProviderError, RESOURCES, createResource, deleteResource, updateResource,
} from '../world/provider';
import { buildGraph, evalConst, loadConfig, neededProviders, validateConfig, type Config, type Graph } from './config';
import { TfError, formatDiags, type Diag } from './diag';
import { formatHcl } from './fmt';
import {
  fmtMulti, hasChanges, outputLine, planCounts, renderPlan, renderState, stateBlock,
} from './render';
import { TERRAFORM_VERSION, emptyTfState, parseState, serialize, type TfState } from './tfstate';
import { refresh, walk, type Drift, type InstPlan, type Mode, type PlanResult } from './walk';

export interface TfCall { dir: string; args: string[]; answer?: string }

const ok = (output: string, code = 0): Result => ({ ok: code === 0, output, code });
const SEP = '─'.repeat(77);

const USAGE = `Usage: terraform [global options] <subcommand> [args]

The available commands for execution are listed below.
The primary workflow commands are given first, followed by
less common or more advanced commands.

Main commands:
  init          Prepare your working directory for other commands
  validate      Check whether the configuration is valid
  plan          Show changes required by the current configuration
  apply         Create or update infrastructure
  destroy       Destroy previously-created infrastructure

All other commands:
  fmt           Reformat your configuration in the standard style
  output        Show output values from your root module
  show          Show the current state or a saved plan
  state         Advanced state management
  version       Show the current Terraform version`;

interface Flags {
  vars: { kind: 'var'; name: string; raw: string }[] | never[];
  order: ({ kind: 'var'; name: string; raw: string } | { kind: 'file'; path: string })[];
  out?: string; autoApprove: boolean; destroy: boolean; refreshOnly: boolean; detailed: boolean;
  raw: boolean; json: boolean; positional: string[]; check: boolean;
}

function parseFlags(args: string[]): Flags | string {
  const f: Flags = { vars: [], order: [], autoApprove: false, destroy: false, refreshOnly: false, detailed: false, raw: false, json: false, positional: [], check: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const val = (name: string): string | undefined => {
      if (a === name) return args[++i];
      if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
      return undefined;
    };
    if (!a.startsWith('-')) { f.positional.push(a); continue; }
    let v: string | undefined;
    if (a === '-var' || a.startsWith('-var=')) {
      v = val('-var');
      const eq = (v ?? '').indexOf('=');
      if (v === undefined || eq < 1) return `Error: Invalid -var option\n\nThe given -var option "${v ?? ''}" is not correctly specified. Must be a variable name and value separated by an equals sign, like -var="key=value".`;
      f.order.push({ kind: 'var', name: v.slice(0, eq), raw: v.slice(eq + 1) });
    } else if (a === '-var-file' || a.startsWith('-var-file=')) {
      v = val('-var-file'); if (v === undefined) return 'Error: Failed to parse command-line flags\n\nflag needs an argument: -var-file';
      f.order.push({ kind: 'file', path: v });
    } else if (a === '-out' || a.startsWith('-out=')) { v = val('-out'); if (v === undefined) return 'Error: Failed to parse command-line flags\n\nflag needs an argument: -out'; f.out = v; }
    else if (a === '-auto-approve') f.autoApprove = true;
    else if (a === '-destroy') f.destroy = true;
    else if (a === '-refresh-only') f.refreshOnly = true;
    else if (a === '-detailed-exitcode') f.detailed = true;
    else if (a === '-raw') f.raw = true;
    else if (a === '-json') f.json = true;
    else if (a === '-check') f.check = true;
    else if (['-no-color', '-input=false', '-lock=false', '-compact-warnings', '-upgrade', '-reconfigure', '-recursive'].includes(a)) continue;
    else if (a.startsWith('-target')) return 'Error: Unsupported option\n\nThe -target option is not supported by IaC Lab (see "Ce que le simulateur simplifie").';
    else return `Error: Failed to parse command-line flags\n\nflag provided but not defined: ${a.split('=')[0]}`;
  }
  return f;
}

// ---------------------------------------------------------------- fichiers d'état et d'initialisation

const statePath = (dir: string): string => join(dir, 'terraform.tfstate');
const lockPath = (dir: string): string => join(dir, '.terraform.lock.hcl');
const markerPath = (dir: string): string => join(dir, '.terraform/providers.json');

function loadTfState(st: State, dir: string): TfState {
  const t = readFile(st, statePath(dir));
  return t ? parseState(t) : emptyTfState(dir);
}
function saveTfState(st: State, dir: string, ts: TfState): void {
  const prev = readFile(st, statePath(dir));
  if (prev) writeFile(st, `${statePath(dir)}.backup`, prev);
  ts.serial += 1;
  writeFile(st, statePath(dir), serialize(ts));
}
const isInitialized = (st: State, dir: string): boolean => readFile(st, lockPath(dir)) !== undefined && readFile(st, markerPath(dir)) !== undefined;

// ---------------------------------------------------------------- variables

type VarSource = { value: any; raw?: string; from: string };

function typeName(cfg: Config, name: string): string {
  const t = cfg.variables[name]?.type;
  if (!t) return 'any';
  if (t.k === 'id') return t.name;
  if (t.k === 'call') return t.name;
  return 'any';
}

function convertVar(cfg: Config, name: string, src: VarSource): { ok: true; v: any } | { ok: false; msg: string } {
  const t = typeName(cfg, name);
  let v = src.value;
  if (src.raw !== undefined) {
    if (t === 'string' || t === 'any') v = src.raw;
    else if (t === 'number') { v = src.raw.trim() === '' ? NaN : Number(src.raw); if (Number.isNaN(v)) return { ok: false, msg: 'number required.' }; }
    else if (t === 'bool') { if (src.raw !== 'true' && src.raw !== 'false') return { ok: false, msg: 'bool required.' }; v = src.raw === 'true'; }
    else { try { v = evalConst(parseExpression(src.raw)); } catch { return { ok: false, msg: `${t} required.` }; } }
  }
  switch (t) {
    case 'string': if (typeof v === 'number' || typeof v === 'boolean') return { ok: true, v: String(v) }; return typeof v === 'string' ? { ok: true, v } : { ok: false, msg: 'string required.' };
    case 'number': if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return { ok: true, v: Number(v) }; return typeof v === 'number' ? { ok: true, v } : { ok: false, msg: 'number required.' };
    case 'bool': if (v === 'true' || v === 'false') return { ok: true, v: v === 'true' }; return typeof v === 'boolean' ? { ok: true, v } : { ok: false, msg: 'bool required.' };
    case 'list': case 'set': return Array.isArray(v) ? { ok: true, v } : { ok: false, msg: 'list of string required.' };
    case 'map': case 'object': return v && typeof v === 'object' && !Array.isArray(v) ? { ok: true, v } : { ok: false, msg: 'map of string required.' };
    default: return { ok: true, v };
  }
}

function readVarFile(st: State, dir: string, files: Record<string, string>, path: string, explicit: boolean): { vals: Record<string, any>; diags: Diag[] } {
  const text = path in files ? files[path] : readFile(st, join(dir, path));
  const diags: Diag[] = [];
  if (text === undefined) {
    if (explicit) diags.push({ severity: 'Error', summary: 'Failed to read variables file', detail: `Given variables file ${path} does not exist.` });
    return { vals: {}, diags };
  }
  const vals: Record<string, any> = {};
  try {
    const body = parseFile(text, path);
    for (const [n, a] of Object.entries(body.attrs)) {
      try { vals[n] = evalConst(a.expr); } catch (e) {
        if (e instanceof EvalError) diags.push({ severity: 'Error', summary: e.summary, detail: e.detail, file: path, line: a.line });
        else throw e;
      }
    }
  } catch (e) {
    if (e instanceof HclError) diags.push({ severity: 'Error', summary: e.summary, detail: e.detail, file: path, line: e.line });
    else throw e;
  }
  return { vals, diags };
}

function resolveVars(st: State, dir: string, cfg: Config, files: Record<string, string>, order: Flags['order']): { vars: Record<string, any>; diags: Diag[] } {
  const diags: Diag[] = [];
  const chosen: Record<string, VarSource> = {};
  for (const v of Object.values(cfg.variables)) {
    if (v.def) {
      try { chosen[v.name] = { value: evalConst(v.def), from: 'default' }; } catch (e) {
        if (e instanceof EvalError) diags.push({ severity: 'Error', summary: e.summary, detail: e.detail, file: v.file, line: v.line, ctx: `in variable "${v.name}"` }); else throw e;
      }
    }
  }
  const fromFile = (path: string, explicit: boolean): void => {
    const r = readVarFile(st, dir, files, path, explicit);
    diags.push(...r.diags);
    for (const [n, val] of Object.entries(r.vals)) {
      if (!cfg.variables[n]) {
        diags.push({ severity: 'Warning', summary: 'Value for undeclared variable', detail: `The root module does not declare a variable named "${n}" but a value was found in file "${path}". If you meant to use this value, add a "variable" block to the configuration.` });
        continue;
      }
      chosen[n] = { value: val, from: path };
    }
  };
  fromFile('terraform.tfvars', false);
  for (const f of Object.keys(files).filter(f => f.endsWith('.auto.tfvars')).sort()) fromFile(f, false);
  for (const o of order) {
    if (o.kind === 'file') fromFile(o.path, true);
    else if (!cfg.variables[o.name]) diags.push({ severity: 'Error', summary: 'Value for undeclared variable', detail: `A variable named "${o.name}" was assigned on the command line, but the root module does not declare a variable of that name. To use this value, add a "variable" block to the configuration.` });
    else chosen[o.name] = { value: undefined, raw: o.raw, from: 'command line' };
  }
  const vars: Record<string, any> = {};
  for (const v of Object.values(cfg.variables)) {
    const src = chosen[v.name];
    if (!src) {
      diags.push({ severity: 'Error', summary: 'No value for required variable', detail: `The root module input variable "${v.name}" is not set, and has no default value. Use a -var or -var-file command line argument to provide a value for this variable.`, file: v.file, line: v.line });
      continue;
    }
    const c = convertVar(cfg, v.name, src);
    if (!c.ok) diags.push({ severity: 'Error', summary: 'Invalid value for input variable', detail: `The given value is not suitable for var.${v.name} declared at ${v.file}:${v.line},1-${('variable "' + v.name + '"').length + 1}: ${c.msg}`, ...(src.from === 'command line' ? {} : { file: src.from === 'default' ? v.file : src.from, line: v.line }) });
    else vars[v.name] = c.v;
  }
  return { vars, diags };
}

// ---------------------------------------------------------------- préparation commune

interface Prepared { cfg: Config; graph: Graph; vars: Record<string, any>; files: Record<string, string>; warnings: Diag[]; dir: string }

function errText(diags: Diag[], files: Record<string, string>): string { return formatDiags(diags, files); }

function prepare(st: State, dir: string, order: Flags['order'], over?: { files: Record<string, string>; vars: Record<string, any> }): Prepared | Result {
  const files = over?.files ?? filesIn(st, dir);
  if (!Object.keys(files).some(f => f.endsWith('.tf'))) {
    return ok(errText([{ severity: 'Error', summary: 'No configuration files', detail: 'Plan requires configuration to be present. Planning without a configuration would mark everything for destruction, which is normally not what is desired. If you would like to destroy everything, run plan with the -destroy option. Otherwise, create a Terraform configuration file (.tf file) and try again.' }], files), 1);
  }
  const cfg = loadConfig(dir, files);
  const syntax = cfg.diags.filter(d => d.severity === 'Error');
  if (syntax.length) return ok(errText(syntax, files), 1);
  if ((neededProviders(cfg).length || Object.keys(cfg.providers).length) && !isInitialized(st, dir)) {
    return ok(errText([{ severity: 'Error', summary: 'Missing required provider', detail: `This configuration requires provider ${PROVIDER_SOURCE}, but that provider isn't available. You may be able to install it automatically by running:\n  terraform init` }], files), 1);
  }
  const ds = validateConfig(cfg);
  const errs = ds.filter(d => d.severity === 'Error');
  if (errs.length) return ok(errText(ds, files), 1);
  let graph: Graph;
  try { graph = buildGraph(cfg); } catch (e) { if (e instanceof TfError) return ok(errText(e.diags, files), 1); throw e; }
  if (over) return { cfg, graph, vars: over.vars, files, warnings: [], dir };
  const rv = resolveVars(st, dir, cfg, files, order);
  const verr = rv.diags.filter(d => d.severity === 'Error');
  if (verr.length) return ok(errText(rv.diags, files), 1);
  return { cfg, graph, vars: rv.vars, files, warnings: rv.diags, dir };
}

const isResult = (x: Prepared | Result): x is Result => 'ok' in x;

function refreshLines(ts: TfState): string {
  const l = Object.values(ts.instances).sort((a, b) => a.addr.localeCompare(b.addr)).map(i => `${i.addr}: Refreshing state... [id=${String(i.attrs['id'])}]`);
  return l.length ? l.join('\n') + '\n\n' : '';
}

function makePlan(st: State, p: Prepared, ts0: TfState, mode: Mode): { plan: PlanResult; ts: TfState } {
  const { ts, drift } = refresh(st, ts0);
  if (mode === 'destroy') {
    const instances: InstPlan[] = Object.values(ts.instances).sort((a, b) => a.addr.localeCompare(b.addr)).map(i => ({
      addr: i.addr, type: i.type, name: i.name, ...(i.key !== undefined ? { key: i.key } : {}), action: 'delete' as const, prior: i.attrs, changed: [], forces: [], deps: [], priorDeps: i.deps,
    }));
    return { plan: { mode, instances, drift, outputs: {}, outChanges: Object.entries(ts.outputs).map(([name, before]) => ({ name, kind: 'delete' as const, before })) }, ts };
  }
  const plan = walk({ world: st, cfg: p.cfg, graph: p.graph, ts, vars: p.vars, mode, drift });
  return { plan, ts };
}

function withWarnings(p: Prepared, body: string): string {
  return p.warnings.length ? `${errText(p.warnings, p.files)}\n\n${body}` : body;
}

function catchTf(fn: () => Result, files: Record<string, string>): Result {
  try { return fn(); } catch (e) {
    if (e instanceof TfError) return ok(errText(e.diags, files), 1);
    throw e;
  }
}

// ---------------------------------------------------------------- exécution d'un plan

function destroyOrder(list: InstPlan[]): InstPlan[] {
  const base = (i: InstPlan): string => `${i.type}.${i.name}`;
  const out: InstPlan[] = []; const done = new Set<string>();
  const visit = (x: InstPlan): void => {
    if (done.has(x.addr)) return;
    done.add(x.addr);
    for (const y of list.filter(z => z !== x && [...z.priorDeps, ...z.deps].includes(base(x))).sort((a, b) => a.addr.localeCompare(b.addr))) visit(y);
    out.push(x);
  };
  for (const x of [...list].sort((a, b) => a.addr.localeCompare(b.addr))) visit(x);
  return out;
}

function steps(label: string, d: number, still: string, idSuffix = ''): string[] {
  const out: string[] = [];
  for (let t = 10; t < d; t += 10) out.push(`${label}: ${still}...${idSuffix ? ` [${idSuffix}, ${t}s elapsed]` : ` [${t}s elapsed]`}`);
  return out;
}

class ApplyFailure extends Error { constructor(public diag: Diag) { super(diag.summary); } }

function execute(st: State, p: Prepared, plan: PlanResult, ts: TfState): Result {
  const log: string[] = [];
  let added = 0, changed = 0, destroyed = 0;
  const finish = (failure?: Diag): Result => {
    saveTfState(st, p.dir, ts);
    if (failure) return ok(`${log.join('\n')}\n\n${errText([failure], p.files)}`, 1);
    return ok('');
  };
  try {
    // Phase 1 : destructions (dépendants d'abord)
    const doomed = plan.instances.filter(i => i.action === 'delete' || i.action === 'replace');
    for (const inst of destroyOrder(doomed)) {
      const id = String(inst.prior!['id']);
      const d = RESOURCES[inst.type]!.durations.delete;
      log.push(`${inst.addr}: Destroying... [id=${id}]`);
      try { deleteResource(st, inst.type, id); } catch (e) {
        if (e instanceof ProviderError) throw new ApplyFailure({ severity: 'Error', summary: e.message, with: inst.addr, ...(inst.res ? { file: inst.res.file, line: inst.res.line, ctx: inst.res.ctx } : {}) });
        throw e;
      }
      log.push(...steps(inst.addr, d, 'Still destroying', `id=${id}`));
      st.clock += d;
      log.push(`${inst.addr}: Destruction complete after ${d}s`);
      delete ts.instances[inst.addr];
      destroyed++;
    }
    // Phase 2 : créations et modifications (dépendances d'abord)
    if (plan.mode === 'normal') {
      const res = walk({
        world: st, cfg: p.cfg, graph: p.graph, ts, vars: p.vars, mode: 'normal', drift: [],
        exec: {
          create(inst, args) {
            const d = RESOURCES[inst.type]!.durations.create;
            log.push(`${inst.addr}: Creating...`);
            let attrs: Record<string, any>;
            try { attrs = createResource(st, inst.type, args); } catch (e) {
              if (e instanceof ProviderError) throw new ApplyFailure({ severity: 'Error', summary: e.message, with: inst.addr, file: inst.res!.file, line: inst.res!.line, ctx: inst.res!.ctx });
              throw e;
            }
            log.push(...steps(inst.addr, d, 'Still creating'));
            st.clock += d;
            log.push(`${inst.addr}: Creation complete after ${d}s [id=${String(attrs['id'])}]`);
            added++;
            return attrs;
          },
          update(inst, args) {
            const d = RESOURCES[inst.type]!.durations.update;
            const id = String(inst.prior!['id']);
            log.push(`${inst.addr}: Modifying... [id=${id}]`);
            let attrs: Record<string, any>;
            try { attrs = updateResource(st, inst.type, id, args); } catch (e) {
              if (e instanceof ProviderError) throw new ApplyFailure({ severity: 'Error', summary: e.message, with: inst.addr, file: inst.res!.file, line: inst.res!.line, ctx: inst.res!.ctx });
              throw e;
            }
            log.push(...steps(inst.addr, d, 'Still modifying', `id=${id}`));
            st.clock += d;
            log.push(`${inst.addr}: Modifications complete after ${d}s [id=${id}]`);
            changed++;
            return attrs;
          },
        },
      });
      ts.outputs = res.outputs;
    } else if (plan.mode === 'refresh-only') {
      ts.outputs = plan.outputs;
    } else ts.outputs = {};
  } catch (e) {
    if (e instanceof ApplyFailure) return finish(e.diag);
    throw e;
  }
  finish();
  const outs = Object.entries(ts.outputs).sort(([a], [b]) => a.localeCompare(b));
  const tail = plan.mode === 'destroy'
    ? `Destroy complete! Resources: ${destroyed} destroyed.`
    : `Apply complete! Resources: ${added} added, ${changed} changed, ${destroyed} destroyed.`;
  const outText = outs.length && plan.mode !== 'destroy' ? `\n\nOutputs:\n\n${outs.map(([n, o]) => outputLine(n, o)).join('\n')}` : '';
  return ok(`${log.length ? log.join('\n') + '\n' : ''}\n${tail}${outText}`);
}

// ---------------------------------------------------------------- sous-commandes

function cmdInit(st: State, dir: string): Result {
  const files = filesIn(st, dir);
  if (!Object.keys(files).some(f => f.endsWith('.tf'))) {
    return ok(errText([{ severity: 'Warning', summary: 'No configuration files', detail: 'Terraform initialized in an empty directory! The directory has no Terraform configuration files. You may begin working with Terraform immediately by creating Terraform configuration files.' }], files));
  }
  const cfg = loadConfig(dir, files);
  const syntax = cfg.diags.filter(d => d.severity === 'Error');
  if (syntax.length) return ok(errText(syntax, files), 1);
  const lines: string[] = ['Initializing the backend...', '', 'Initializing provider plugins...'];
  const lock: string[] = [];
  for (const prov of neededProviders(cfg)) {
    const rp = cfg.requiredProviders[prov];
    if (!rp) {
      return ok(`${lines.join('\n')}\n- Finding latest version of hashicorp/${prov}...\n${errText([{ severity: 'Error', summary: 'Failed to query available provider packages', detail: `Could not retrieve the list of available versions for provider hashicorp/${prov}: provider registry registry.terraform.io does not have a provider named registry.terraform.io/hashicorp/${prov}\n\nAll modules should specify their required_providers so that external consumers will get the correct providers when using a module. To see which modules are currently depending on hashicorp/${prov}, run the following command:\n    terraform providers` }], files)}`, 1);
    }
    const src = rp.source ?? `hashicorp/${prov}`;
    const constraint = rp.version;
    if (src !== PROVIDER_SOURCE) {
      return ok(`${lines.join('\n')}\n- Finding ${src} versions matching "${constraint ?? '*'}"...\n${errText([{ severity: 'Error', summary: 'Failed to query available provider packages', detail: `Could not retrieve the list of available versions for provider ${src}: provider registry ${src.split('/')[0]!.includes('.') ? src.split('/')[0]! : 'registry.terraform.io'} does not have a provider named ${src.includes('.') ? src : `registry.terraform.io/${src}`}` }], files)}`, 1);
    }
    if (constraint && !satisfies(PROVIDER_VERSION, constraint)) {
      return ok(`${lines.join('\n')}\n- Finding ${src} versions matching "${constraint}"...\n${errText([{ severity: 'Error', summary: 'Failed to query available provider packages', detail: `Could not retrieve the list of available versions for provider ${src}: no available releases match the given constraints ${constraint}` }], files)}`, 1);
    }
    lines.push(`- Finding ${src} versions matching "${constraint ?? '*'}"...`, `- Installing ${src} v${PROVIDER_VERSION}...`, `- Installed ${src} v${PROVIDER_VERSION} (simulated)`);
    lock.push(`provider "${src}" {\n  version     = "${PROVIDER_VERSION}"\n${constraint ? `  constraints = "${constraint}"\n` : ''}  hashes = [\n    "h1:iaclab-simulated-hash=",\n  ]\n}`);
  }
  writeFile(st, markerPath(dir), JSON.stringify({ providers: neededProviders(cfg) }) + '\n');
  writeFile(st, lockPath(dir), `# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\n${lock.join('\n\n')}${lock.length ? '\n' : ''}`);
  if (lock.length) lines.push('', 'Terraform has created a lock file .terraform.lock.hcl to record the provider', 'selections it made above. Include this file in your version control repository', 'so that Terraform can guarantee to make the same selections by default when', 'you run "terraform init" in the future.');
  lines.push('', 'Terraform has been successfully initialized!', '', 'You may now begin working with Terraform. Try running "terraform plan" to see', 'any changes that are required for your infrastructure. All Terraform commands', 'should now work.', '', 'If you ever set or change modules or backend configuration for Terraform,', 'rerun this command to reinitialize your working directory. If you forget, other', 'commands will detect it and remind you to do so if necessary.');
  return ok(lines.join('\n'));
}

function satisfies(version: string, constraint: string): boolean {
  const v = version.split('.').map(Number) as [number, number, number];
  for (const c of constraint.split(',').map(s => s.trim())) {
    const m = /^(~>|>=|<=|>|<|=|!=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(c);
    if (!m) return false;
    const op = m[1] ?? '='; const t = [Number(m[2]), Number(m[3] ?? 0), Number(m[4] ?? 0)] as [number, number, number];
    const cmp = v[0] - t[0] || v[1] - t[1] || v[2] - t[2];
    let good: boolean;
    switch (op) {
      case '=': good = cmp === 0; break; case '!=': good = cmp !== 0; break;
      case '>': good = cmp > 0; break; case '>=': good = cmp >= 0; break;
      case '<': good = cmp < 0; break; case '<=': good = cmp <= 0; break;
      default: good = cmp >= 0 && (m[4] !== undefined ? v[0] === t[0] && v[1] === t[1] : v[0] === t[0]);
    }
    if (!good) return false;
  }
  return true;
}

function cmdFmt(st: State, dir: string, f: Flags): Result {
  const files = filesIn(st, dir);
  const changed: string[] = [];
  for (const name of Object.keys(files).filter(n => n.endsWith('.tf') || n.endsWith('.tfvars')).sort()) {
    const next = formatHcl(files[name]!);
    if (next !== files[name]) { changed.push(name); if (!f.check) writeFile(st, join(dir, name), next); }
  }
  return ok(changed.join('\n'), f.check && changed.length ? 3 : 0);
}

function cmdValidate(st: State, dir: string): Result {
  const files = filesIn(st, dir);
  if (!Object.keys(files).some(f => f.endsWith('.tf'))) return ok('Success! The configuration is valid.');
  const cfg = loadConfig(dir, files);
  const syntax = cfg.diags.filter(d => d.severity === 'Error');
  if (syntax.length) return ok(errText(syntax, files), 1);
  if (neededProviders(cfg).length && !isInitialized(st, dir)) {
    return ok(errText([{ severity: 'Error', summary: 'Missing required provider', detail: `This configuration requires provider ${PROVIDER_SOURCE}, but that provider isn't available. You may be able to install it automatically by running:\n  terraform init` }], files), 1);
  }
  const ds = validateConfig(cfg);
  if (ds.some(d => d.severity === 'Error')) return ok(errText(ds, files), 1);
  return ok('Success! The configuration is valid.');
}

function promptApply(): string { return 'Do you want to perform these actions?\n  Terraform will perform the actions described above.\n  Only \'yes\' will be accepted to approve.\n\n  Enter a value: '; }
function promptDestroy(): string { return 'Do you really want to destroy all resources?\n  Terraform will destroy all your managed infrastructure, as shown above.\n  There is no undo. Only \'yes\' will be accepted to confirm.\n\n  Enter a value: '; }

function cmdPlan(st: State, dir: string, f: Flags): Result {
  const prep = prepare(st, dir, f.order);
  if (isResult(prep)) return prep;
  const ts0 = loadTfState(st, dir);
  const mode: Mode = f.destroy ? 'destroy' : f.refreshOnly ? 'refresh-only' : 'normal';
  const { plan } = makePlan(st, prep, ts0, mode);
  let body = refreshLines(ts0) + renderPlan(plan);
  if (mode === 'destroy' && !plan.instances.length) body = refreshLines(ts0) + 'No changes. No objects need to be destroyed.\n\nEither you have not created any objects yet or the existing objects were\nalready deleted outside of Terraform.';
  const changes = mode === 'refresh-only' ? plan.drift.length > 0 : hasChanges(plan);
  if (changes) {
    if (f.out) {
      st.plans[normalize(join(dir, f.out))] = { dir, serial: ts0.serial, mode, files: structuredClone(prep.files), vars: structuredClone(prep.vars) };
      body += `\n\n${SEP}\n\nSaved the plan to: ${f.out}\n\nTo perform exactly these actions, run the following command to apply:\n    terraform apply "${f.out}"`;
    } else if (mode !== 'refresh-only') {
      body += `\n\n${SEP}\n\nNote: You didn't use the -out option to save this plan, so Terraform can't\nguarantee to take exactly these actions if you run "terraform apply" now.`;
    }
  }
  return ok(withWarnings(prep, body), f.detailed && changes ? 2 : 0);
}

function cmdApply(st: State, call: TfCall, f: Flags, destroyCmd: boolean): Result {
  const dir = call.dir;
  let prep: Prepared | Result;
  let mode: Mode = destroyCmd || f.destroy ? 'destroy' : f.refreshOnly ? 'refresh-only' : 'normal';
  let saved = false;
  if (!destroyCmd && f.positional[0]) {
    const key = normalize(join(dir, f.positional[0]));
    const sp = st.plans[key];
    if (!sp) return ok(errText([{ severity: 'Error', summary: `Failed to load "${f.positional[0]}" as a plan file`, detail: `Error: stat ${f.positional[0]}: no such file or directory` }], {}), 1);
    const cur = loadTfState(st, dir);
    if (cur.serial !== sp.serial) return ok(errText([{ severity: 'Error', summary: 'Saved plan is stale', detail: 'The given plan file can no longer be applied because the state was changed by another operation after the plan was created.' }], {}), 1);
    prep = prepare(st, dir, [], { files: sp.files, vars: sp.vars });
    mode = sp.mode; saved = true;
  } else prep = prepare(st, dir, f.order);
  if (isResult(prep)) return prep;
  return catchTf(() => {
    const p = prep as Prepared;
    const ts0 = loadTfState(st, dir);
    const { plan, ts } = makePlan(st, p, ts0, mode);
    const noun = mode === 'destroy' ? 'Destroy' : 'Apply';
    const changes = mode === 'refresh-only' ? plan.drift.length > 0 : hasChanges(plan);
    const planText = refreshLines(ts0) + (mode === 'destroy' && !plan.instances.length
      ? 'No changes. No objects need to be destroyed.\n\nEither you have not created any objects yet or the existing objects were\nalready deleted outside of Terraform.'
      : renderPlan(plan));
    if (!changes) {
      const empty = mode === 'destroy' ? '\n\nDestroy complete! Resources: 0 destroyed.' : mode === 'refresh-only' ? '' : '\n\nApply complete! Resources: 0 added, 0 changed, 0 destroyed.';
      if (mode === 'normal') { ts.outputs = plan.outputs; saveTfState(st, dir, ts); }
      return ok(withWarnings(p, planText + empty));
    }
    if (!f.autoApprove && !saved) {
      if (call.answer === undefined) return { ok: true, output: withWarnings(p, `${planText}\n\n${mode === 'destroy' ? promptDestroy() : promptApply()}`), code: 0, awaiting: mode === 'destroy' ? 'destroy' : 'apply' };
      if (call.answer.trim() !== 'yes') return ok(`\n${noun} cancelled.`, 1);
    }
    const pre = call.answer === undefined ? withWarnings(p, `${planText}\n\n`) : '\n';
    const r = execute(st, p, plan, ts);
    return { ...r, output: pre + (r.output ?? '') };
  }, prep.files);
}

function cmdShow(st: State, dir: string, f: Flags): Result {
  if (f.positional[0]) {
    const sp = st.plans[normalize(join(dir, f.positional[0]))];
    if (!sp) return ok(errText([{ severity: 'Error', summary: `Failed to load "${f.positional[0]}" as a plan file`, detail: `Error: stat ${f.positional[0]}: no such file or directory` }], {}), 1);
    const prep = prepare(st, dir, [], { files: sp.files, vars: sp.vars });
    if (isResult(prep)) return prep;
    return catchTf(() => ok(renderPlan(makePlan(st, prep, loadTfState(st, dir), sp.mode).plan)), prep.files);
  }
  const ts = loadTfState(st, dir);
  if (!readFile(st, statePath(dir))) return ok('No state.');
  return ok(renderState(ts));
}

function cmdOutput(st: State, dir: string, f: Flags): Result {
  const ts = loadTfState(st, dir);
  const outs = Object.entries(ts.outputs).sort(([a], [b]) => a.localeCompare(b));
  const name = f.positional[0];
  if (name) {
    const o = ts.outputs[name];
    if (!o) return ok(errText([{ severity: 'Error', summary: 'Output not found', detail: `The output variable requested could not be found in the state file. If you recently added this to your configuration, be sure to run \`terraform apply\`, since the state won't be updated with new output variables until that command is run.` }], {}), 1);
    if (f.json) return ok(JSON.stringify(o.value, null, 2));
    if (f.raw) {
      if (o.sensitive) return ok('', 0);
      if (typeof o.value === 'object' && o.value !== null) return ok(errText([{ severity: 'Error', summary: 'Unsupported value for raw output', detail: 'The -raw option only supports strings, numbers, and boolean values, but output value "' + name + '" is not a primitive.' }], {}), 1);
      return ok(String(o.value));
    }
    return ok(outputLine(name, o));
  }
  if (!outs.length) return ok(errText([{ severity: 'Warning', summary: 'No outputs found', detail: 'The state file either has no outputs defined, or all the defined outputs are empty. Please define an output in your configuration with the `output` keyword and run `terraform refresh` for it to become available. If you are using interpolation, please verify the interpolated value is not empty.' }], {}));
  if (f.json) return ok(JSON.stringify(Object.fromEntries(outs.map(([n, o]) => [n, { sensitive: o.sensitive, value: o.value }])), null, 2));
  return ok(outs.map(([n, o]) => outputLine(n, o)).join('\n'));
}

function cmdState(st: State, dir: string, rest: string[]): Result {
  const [sub, ...more] = rest;
  const ts = loadTfState(st, dir);
  if (sub === 'list') {
    const addrs = Object.keys(ts.instances).sort();
    if (!addrs.length) return ok(errText([{ severity: 'Error', summary: 'No state file was found!', detail: 'State management commands require a state file. Run this command in a directory where Terraform has been run or use the -state flag to point the command to a specific state location.' }], {}), readFile(st, statePath(dir)) ? 0 : 1);
    return ok(addrs.join('\n'));
  }
  if (sub === 'show') {
    const a = more[0];
    const inst = a ? ts.instances[a] : undefined;
    if (!inst) return ok(errText([{ severity: 'Error', summary: 'No instance found for the given address!', detail: 'This command requires that the address references one specific instance. To view the available instances, use "terraform state list". Please modify the address to reference a specific instance.' }], {}), 1);
    return ok(stateBlock(inst));
  }
  return ok(`Error: Unsupported state subcommand "${sub ?? ''}"\n\nIaC Lab supports "terraform state list" and "terraform state show".`, 1);
}

function cmdRefresh(st: State, call: TfCall, f: Flags): Result {
  const warn = errText([{ severity: 'Warning', summary: 'The "terraform refresh" command is deprecated', detail: 'The "terraform refresh" command is deprecated because its default behavior is unsafe if you have misconfigured credentials for any of your providers. Use "terraform apply -refresh-only" (or "terraform plan -refresh-only" to preview) instead.' }], {});
  const r = cmdApply(st, { ...call, args: ['apply', '-refresh-only', '-auto-approve'] }, { ...f, refreshOnly: true, autoApprove: true }, false);
  return { ...r, output: `${warn}\n\n${r.output ?? ''}` };
}

export function runTerraform(st: State, call: TfCall): Result {
  const [sub, ...rest] = call.args;
  const dir = normalize(call.dir);
  if (sub === undefined || sub === '-help' || sub === 'help' || sub === '--help') return ok(USAGE);
  if (sub === 'version' || sub === '-version') return ok(`Terraform v${TERRAFORM_VERSION} (simulé par IaC Lab)\non linux_amd64\n+ provider ${PROVIDER_SOURCE} v${PROVIDER_VERSION}`);
  const f = parseFlags(sub === 'state' ? [] : rest);
  if (typeof f === 'string') return ok(f, 1);
  const files = filesIn(st, dir);
  switch (sub) {
    case 'init': return cmdInit(st, dir);
    case 'fmt': return cmdFmt(st, dir, f);
    case 'validate': return catchTf(() => cmdValidate(st, dir), files);
    case 'plan': return catchTf(() => cmdPlan(st, dir, f), files);
    case 'apply': return cmdApply(st, { ...call, dir }, f, false);
    case 'destroy': return cmdApply(st, { ...call, dir }, f, true);
    case 'refresh': return cmdRefresh(st, { ...call, dir }, f);
    case 'show': return cmdShow(st, dir, f);
    case 'output': return cmdOutput(st, dir, f);
    case 'state': return cmdState(st, dir, rest);
    default:
      return ok(`Terraform has no command named "${sub}".\n\nTo see all of Terraform's top-level commands, run:\n  terraform -help\n\n(IaC Lab ne simule qu'un sous-ensemble des commandes.)`, 1);
  }
}

export { baseOf, fmtMulti, planCounts, removeFile, isUnknown, evalExpr };
export type { Drift };
