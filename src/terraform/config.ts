/** Chargement et validation statique d'une configuration Terraform (les fichiers *.tf d'un dossier). */
import { HclError, type Block, type Body, type Expr } from '../hcl/ast';
import { collectRefs, evalExpr, EvalError, type EvalCtx } from '../hcl/eval';
import { parseFile } from '../hcl/parser';
import { PROVIDER_NAME, PROVIDER_SOURCE, RESOURCES, validateArgs, withDefaults } from '../world/provider';
import { TfError, type Diag } from './diag';

export interface VarDef { name: string; type?: Expr; hasDefault: boolean; def?: Expr; description?: string; sensitive: boolean; file: string; line: number }
export interface ResDef {
  type: string; name: string; addr: string; file: string; line: number; ctx: string;
  args: Record<string, { expr: Expr; line: number }>;
  count?: { expr: Expr; line: number }; forEach?: { expr: Expr; line: number };
  dependsOn: Expr[]; preventDestroy: boolean;
}
export interface OutDef { name: string; value: Expr; sensitive: boolean; description?: string; file: string; line: number }
export interface Config {
  dir: string;
  files: Record<string, string>;
  requiredProviders: Record<string, { source?: string; version?: string }>;
  providers: Record<string, { file: string; line: number }>;
  variables: Record<string, VarDef>;
  locals: Record<string, { expr: Expr; file: string; line: number }>;
  resources: ResDef[];
  outputs: OutDef[];
  diags: Diag[];
}

const NO_REFS: EvalCtx = {
  variable() { throw new EvalError('ref', '', 0); },
  local() { throw new EvalError('ref', '', 0); },
  resource() { throw new EvalError('ref', '', 0); },
};

/** Évalue une expression ne contenant aucune référence (littéraux, listes, fonctions). */
export function evalConst(e: Expr): any { return evalExpr(e, NO_REFS); }

function hclDiag(e: HclError, file: string): Diag {
  return { severity: 'Error', summary: e.summary, detail: e.detail, file, line: e.line };
}

const lit = (e: Expr | undefined): any => { try { return e ? evalConst(e) : undefined; } catch { return undefined; } };

export function loadConfig(dir: string, files: Record<string, string>): Config {
  const cfg: Config = { dir, files, requiredProviders: {}, providers: {}, variables: {}, locals: {}, resources: [], outputs: [], diags: [] };
  const err = (d: Omit<Diag, 'severity'>): void => { cfg.diags.push({ severity: 'Error', ...d }); };
  const names = Object.keys(files).filter(f => f.endsWith('.tf')).sort();
  for (const f of names) {
    let body: Body;
    try { body = parseFile(files[f]!, f); } catch (e) {
      if (e instanceof HclError) { cfg.diags.push(hclDiag(e, f)); continue; }
      throw e;
    }
    for (const [n, a] of Object.entries(body.attrs)) err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here.`, file: f, line: a.line });
    for (const b of body.blocks) readBlock(cfg, b, f, err);
  }
  return cfg;
}

function readBlock(cfg: Config, b: Block, file: string, err: (d: Omit<Diag, 'severity'>) => void): void {
  const need = (n: number, what: string): boolean => {
    if (b.labels.length === n) return true;
    err({ summary: 'Missing name for ' + what, detail: `All ${b.type} blocks must have ${n} label${n > 1 ? 's' : ''}.`, file, line: b.line });
    return false;
  };
  switch (b.type) {
    case 'terraform': {
      for (const sub of b.body.blocks) {
        if (sub.type === 'required_providers') {
          for (const [n, a] of Object.entries(sub.body.attrs)) {
            const v = lit(a.expr);
            cfg.requiredProviders[n] = v && typeof v === 'object' ? { source: v.source, version: v.version } : {};
          }
        } else err({ summary: 'Unsupported block type', detail: `Blocks of type "${sub.type}" are not expected here.`, file, line: sub.line });
      }
      for (const [n, a] of Object.entries(b.body.attrs)) if (n !== 'required_version') err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here.`, file, line: a.line });
      return;
    }
    case 'provider': {
      if (!need(1, 'provider')) return;
      cfg.providers[b.labels[0]!] = { file, line: b.line };
      for (const [n, a] of Object.entries(b.body.attrs)) {
        if (!['zone', 'token'].includes(n)) err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here.`, file, line: a.line, ctx: `in provider "${b.labels[0]}"` });
      }
      return;
    }
    case 'variable': {
      if (!need(1, 'variable')) return;
      const name = b.labels[0]!;
      const ctx = `in variable "${name}"`;
      if (cfg.variables[name]) { err({ summary: 'Duplicate variable declaration', detail: `A variable named "${name}" was already declared.`, file, line: b.line }); return; }
      const at = b.body.attrs;
      for (const [n, a] of Object.entries(at)) if (!['type', 'default', 'description', 'sensitive'].includes(n)) err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here.`, file, line: a.line, ctx });
      for (const sub of b.body.blocks) err({ summary: 'Unsupported block type', detail: `Blocks of type "${sub.type}" are not expected here.`, file, line: sub.line, ctx });
      cfg.variables[name] = {
        name, type: at['type']?.expr, hasDefault: 'default' in at, def: at['default']?.expr,
        description: lit(at['description']?.expr), sensitive: lit(at['sensitive']?.expr) === true, file, line: b.line,
      };
      return;
    }
    case 'locals': {
      for (const [n, a] of Object.entries(b.body.attrs)) {
        if (cfg.locals[n]) err({ summary: 'Duplicate local value definition', detail: `A local value named "${n}" was already defined.`, file, line: a.line, ctx: 'in locals' });
        else cfg.locals[n] = { expr: a.expr, file, line: a.line };
      }
      return;
    }
    case 'output': {
      if (!need(1, 'output')) return;
      const ctx = `in output "${b.labels[0]}"`;
      const at = b.body.attrs;
      for (const [n, a] of Object.entries(at)) if (!['value', 'description', 'sensitive', 'depends_on'].includes(n)) err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here.`, file, line: a.line, ctx });
      if (!at['value']) { err({ summary: 'Missing required argument', detail: 'The argument "value" is required, but no definition was found.', file, line: b.line, ctx }); return; }
      cfg.outputs.push({ name: b.labels[0]!, value: at['value'].expr, sensitive: lit(at['sensitive']?.expr) === true, description: lit(at['description']?.expr), file, line: b.line });
      return;
    }
    case 'resource': {
      if (!need(2, 'resource')) return;
      const [type, name] = b.labels as [string, string];
      const addr = `${type}.${name}`;
      const ctx = `in resource "${type}" "${name}"`;
      if (cfg.resources.some(r => r.addr === addr)) { err({ summary: 'Duplicate resource configuration', detail: `A cloudpeda resource ${JSON.stringify(type)} named ${JSON.stringify(name)} was already declared.`, file, line: b.line }); return; }
      const at = { ...b.body.attrs };
      const res: ResDef = { type, name, addr, file, line: b.line, ctx, args: {}, dependsOn: [], preventDestroy: false };
      for (const meta of ['count', 'for_each', 'depends_on'] as const) {
        const a = at[meta];
        if (!a) continue;
        delete at[meta];
        if (meta === 'count') res.count = a; else if (meta === 'for_each') res.forEach = a;
        else if (a.expr.k === 'list') res.dependsOn = a.expr.items;
        else err({ summary: 'Invalid depends_on', detail: 'depends_on must be a list of references to resources.', file, line: a.line, ctx });
      }
      if (res.count && res.forEach) err({ summary: 'Invalid combination of "count" and "for_each"', detail: 'The "count" and "for_each" meta-arguments are mutually exclusive, only one should be used to be explicit about the number of resources to be created.', file, line: res.count.line, ctx });
      for (const sub of b.body.blocks) {
        if (sub.type === 'lifecycle') {
          for (const [n, a] of Object.entries(sub.body.attrs)) {
            if (n === 'prevent_destroy') res.preventDestroy = lit(a.expr) === true;
            else err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here. IaC Lab only supports "prevent_destroy".`, file, line: a.line, ctx });
          }
        } else err({ summary: 'Unsupported block type', detail: `Blocks of type "${sub.type}" are not expected here.`, file, line: sub.line, ctx });
      }
      res.args = at;
      cfg.resources.push(res);
      return;
    }
    default:
      err({
        summary: 'Unsupported block type',
        detail: ['data', 'module', 'moved', 'import'].includes(b.type)
          ? `Blocks of type "${b.type}" are not supported by IaC Lab (see "Ce que le simulateur simplifie").`
          : `Blocks of type "${b.type}" are not expected here.`,
        file, line: b.line,
      });
  }
}

export type NodeKey = string;
export interface Graph { deps: Map<NodeKey, Set<NodeKey>>; order: NodeKey[]; }

/** Références d'un nœud, sous forme de clés de nœuds (locals, ressources) et de variables. */
function refsOf(exprs: Expr[]): ReturnType<typeof collectRefs> { const out: ReturnType<typeof collectRefs> = []; for (const e of exprs) collectRefs(e, out); return out; }

export function resourceExprs(r: ResDef): Expr[] {
  return [...Object.values(r.args).map(a => a.expr), ...(r.count ? [r.count.expr] : []), ...(r.forEach ? [r.forEach.expr] : []), ...r.dependsOn];
}

export function buildGraph(cfg: Config): Graph {
  const deps = new Map<NodeKey, Set<NodeKey>>();
  const add = (key: NodeKey, exprs: Expr[]): void => {
    const s = new Set<NodeKey>();
    for (const r of refsOf(exprs)) {
      if (r.kind === 'local' && cfg.locals[r.name]) s.add(`local.${r.name}`);
      else if (r.kind === 'res' && !r.name.startsWith('?') && cfg.resources.some(x => x.addr === r.name)) s.add(r.name);
    }
    deps.set(key, s);
  };
  for (const [n, l] of Object.entries(cfg.locals)) add(`local.${n}`, [l.expr]);
  for (const r of cfg.resources) add(r.addr, resourceExprs(r));
  for (const o of cfg.outputs) add(`output.${o.name}`, [o.value]);
  // Tri topologique stable (ordre alphabétique parmi les nœuds prêts) et détection de cycle.
  const order: NodeKey[] = []; const done = new Set<NodeKey>();
  const remaining = new Set(deps.keys());
  while (remaining.size) {
    const ready = [...remaining].filter(k => [...deps.get(k)!].every(d => done.has(d))).sort();
    if (!ready.length) {
      const cyc = findCycle(deps, remaining);
      throw new TfError([{ severity: 'Error', summary: `Cycle: ${cyc.join(', ')}` }]);
    }
    const k = ready[0]!;
    remaining.delete(k); done.add(k); order.push(k);
  }
  return { deps, order };
}

function findCycle(deps: Map<NodeKey, Set<NodeKey>>, within: Set<NodeKey>): NodeKey[] {
  // Les nœuds restants contiennent au moins un cycle : on garde ceux qui en font partie.
  const inCycle = new Set<NodeKey>();
  for (const start of within) {
    const seen = new Set<NodeKey>(); const stack = [...(deps.get(start) ?? [])].filter(d => within.has(d));
    while (stack.length) {
      const n = stack.pop()!;
      if (n === start) { inCycle.add(start); break; }
      if (seen.has(n)) continue;
      seen.add(n);
      for (const d of deps.get(n) ?? []) if (within.has(d)) stack.push(d);
    }
  }
  return [...inCycle].sort();
}

/** Ressources dont dépend un nœud, en traversant les valeurs locales (pour l'ordre de destruction). */
export function resourceDeps(g: Graph, key: NodeKey): string[] {
  const out = new Set<string>(); const seen = new Set<string>();
  const walk = (k: string): void => {
    for (const d of g.deps.get(k) ?? []) {
      if (seen.has(d)) continue;
      seen.add(d);
      if (d.startsWith('local.')) walk(d); else out.add(d);
    }
  };
  walk(key);
  return [...out].sort();
}

/** Validation statique (`terraform validate`) : retourne les diagnostics, sans lire le monde. */
export function validateConfig(cfg: Config): Diag[] {
  const ds = [...cfg.diags];
  const err = (d: Omit<Diag, 'severity'>): void => { ds.push({ severity: 'Error', ...d }); };
  const known = new Set(cfg.resources.map(r => r.addr));
  const checkRefs = (exprs: Expr[], file: string, ctx: string, allow: { each?: boolean; count?: boolean }): void => {
    for (const r of refsOf(exprs)) {
      const line = r.line;
      if (r.kind === 'var' && !cfg.variables[r.name]) {
        err({ summary: 'Reference to undeclared input variable', detail: `An input variable with the name "${r.name}" has not been declared. This variable can be declared with a variable "${r.name}" {} block.`, file, line, ctx });
      } else if (r.kind === 'local' && !cfg.locals[r.name]) {
        err({ summary: 'Reference to undeclared local value', detail: `A local value with the name "${r.name}" has not been declared.`, file, line, ctx });
      } else if (r.kind === 'each' && !allow.each) {
        err({ summary: 'Reference to "each" in context without for_each', detail: 'The "each" object can be used only in "resource" blocks, and only when the "for_each" argument is set.', file, line, ctx });
      } else if (r.kind === 'count' && !allow.count) {
        err({ summary: 'Reference to "count" in non-counted context', detail: 'The "count" object can only be used in "resource" blocks, and only when the "count" argument is set.', file, line, ctx });
      } else if (r.kind === 'res') {
        if (r.name.startsWith('?')) err({ summary: 'Unknown variable', detail: `There is no variable named "${r.name.slice(1)}".`, file, line, ctx });
        else if (!known.has(r.name)) {
          const [t, n] = r.name.split('.') as [string, string];
          err({ summary: 'Reference to undeclared resource', detail: `A managed resource "${t}" "${n}" has not been declared in the root module.`, file, line, ctx });
        }
      }
    }
  };
  for (const v of Object.values(cfg.variables)) if (v.def) checkRefs([v.def], v.file, `in variable "${v.name}"`, {});
  for (const l of Object.values(cfg.locals)) checkRefs([l.expr], l.file, 'in locals', {});
  for (const o of cfg.outputs) checkRefs([o.value], o.file, `in output "${o.name}"`, {});
  for (const r of cfg.resources) {
    const def = RESOURCES[r.type];
    if (!def) {
      err({ summary: 'Invalid resource type', detail: `The provider ${PROVIDER_SOURCE} does not support resource type "${r.type}".`, file: r.file, line: r.line, ctx: r.ctx });
      continue;
    }
    for (const [n, a] of Object.entries(r.args)) {
      const d = def.attrs[n];
      if (!d) err({ summary: 'Unsupported argument', detail: `An argument named "${n}" is not expected here.`, file: r.file, line: a.line, ctx: r.ctx });
      else if (d.computed) err({ summary: 'Unsupported argument', detail: `Can't configure a value for "${n}": its value will be decided automatically based on the result of applying this configuration.`, file: r.file, line: a.line, ctx: r.ctx });
    }
    for (const [n, d] of Object.entries(def.attrs)) {
      if (d.required && !(n in r.args)) err({ summary: 'Missing required argument', detail: `The argument "${n}" is required, but no definition was found.`, file: r.file, line: r.line, ctx: r.ctx });
    }
    checkRefs(resourceExprs(r), r.file, r.ctx, { each: !!r.forEach, count: !!r.count });
    // Valeurs littérales : énumérations, formats.
    const consts: Record<string, any> = {};
    for (const [n, a] of Object.entries(r.args)) {
      if (refsOf([a.expr]).length) continue;
      try { consts[n] = evalConst(a.expr); } catch (e) { if (e instanceof EvalError && e.summary !== 'ref') err({ summary: e.summary, detail: e.detail, file: r.file, line: a.line, ctx: r.ctx }); }
    }
    for (const bad of validateArgs(r.type, withDefaults(r.type, consts))) {
      if (bad.attr in consts) err({ summary: 'Invalid value for argument', detail: bad.message, file: r.file, line: r.args[bad.attr]!.line, ctx: r.ctx });
    }
  }
  // Une valeur issue d'une variable sensible ne peut pas sortir d'un « output » non marqué sensible.
  const sensitiveLocal = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false; seen.add(name);
    const l = cfg.locals[name]; if (!l) return false;
    return refsOf([l.expr]).some(r => (r.kind === 'var' && cfg.variables[r.name]?.sensitive) || (r.kind === 'local' && sensitiveLocal(r.name, seen)));
  };
  for (const o of cfg.outputs) {
    if (o.sensitive) continue;
    if (refsOf([o.value]).some(r => (r.kind === 'var' && cfg.variables[r.name]?.sensitive) || (r.kind === 'local' && sensitiveLocal(r.name)))) {
      err({ summary: 'Output refers to sensitive values', detail: 'To reduce the risk of accidentally exporting sensitive data that was intended to be only internal, Terraform requires that any root module output containing sensitive data be explicitly marked as sensitive, to confirm your intent.\n\nIf you do intend to export this data, annotate the output value as sensitive by adding the following argument:\n    sensitive = true', file: o.file, line: o.line, ctx: `in output "${o.name}"` });
    }
  }
  if (!ds.some(d => d.severity === 'Error')) {
    try { buildGraph(cfg); } catch (e) { if (e instanceof TfError) ds.push(...e.diags); else throw e; }
  }
  return ds;
}

/** Fournisseurs nécessaires à la configuration (préfixe du type de ressource). */
export function neededProviders(cfg: Config): string[] {
  return [...new Set(cfg.resources.map(r => r.type.split('_')[0]!))].sort();
}

export { PROVIDER_NAME };
