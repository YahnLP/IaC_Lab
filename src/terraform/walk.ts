/**
 * Cœur du moteur : parcourt le graphe de dépendances et calcule, pour chaque instance de ressource,
 * ce qu'il faut faire (créer, modifier, remplacer, détruire) en comparant le code, l'état et le monde réel.
 * Le même parcours sert à planifier (valeurs inconnues) et à appliquer (valeurs réelles, via un exécuteur).
 */
import { UNKNOWN, evalExpr, isUnknown, EvalError, type EvalCtx } from '../hcl/eval';
import type { State } from '../state';
import { RESOURCES, readResource, validateArgs, withDefaults, type AttrDef } from '../world/provider';
import { evalConst, resourceDeps, type Config, type Graph, type ResDef } from './config';
import { TfError, type Diag } from './diag';
import { instAddr, type InstState, type TfState } from './tfstate';

export type Action = 'create' | 'update' | 'replace' | 'delete' | 'noop';
export type Mode = 'normal' | 'destroy' | 'refresh-only';
export type Attrs = Record<string, any>;

export interface InstPlan {
  addr: string; type: string; name: string; key?: number | string;
  action: Action;
  prior?: Attrs; planned?: Attrs;
  /** Attributs de configuration dont la valeur change. */
  changed: string[];
  /** Attributs qui imposent le remplacement. */
  forces: string[];
  /** Ressources dont dépend l'instance (« type.nom »), d'après le code. */
  deps: string[];
  /** Dépendances enregistrées dans l'état (pour détruire dans le bon ordre). */
  priorDeps: string[];
  /** Pour une destruction : pourquoi. */
  reason?: string;
  res?: ResDef;
}

export interface Drift { addr: string; type: string; name: string; kind: 'changed' | 'deleted'; before: Attrs; after?: Attrs }
export interface OutChange { name: string; kind: 'create' | 'update' | 'delete'; before?: { value: any; sensitive: boolean }; after?: { value: any; sensitive: boolean } }
export interface PlanResult {
  mode: Mode;
  instances: InstPlan[];
  drift: Drift[];
  outputs: Record<string, { value: any; sensitive: boolean }>;
  outChanges: OutChange[];
}

export interface Executor {
  create(inst: InstPlan, args: Attrs): Attrs;
  update(inst: InstPlan, args: Attrs): Attrs;
}

export const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

/** Relit chaque ressource de l'état dans le monde réel : met l'état à jour et note les écarts (dérive). */
export function refresh(world: Readonly<State>, ts: TfState): { ts: TfState; drift: Drift[] } {
  const next: TfState = structuredClone(ts);
  const drift: Drift[] = [];
  for (const inst of Object.values(next.instances)) {
    const cur = readResource(world, inst.type, String(inst.attrs['id']));
    if (!cur) {
      drift.push({ addr: inst.addr, type: inst.type, name: inst.name, kind: 'deleted', before: inst.attrs });
      delete next.instances[inst.addr];
    } else if (!same(cur, inst.attrs)) {
      drift.push({ addr: inst.addr, type: inst.type, name: inst.name, kind: 'changed', before: inst.attrs, after: cur });
      inst.attrs = cur;
    }
  }
  drift.sort((a, b) => a.addr.localeCompare(b.addr));
  return { ts: next, drift };
}

function coerce(name: string, d: AttrDef, v: any): { ok: true; v: any } | { ok: false; msg: string } {
  if (isUnknown(v) || v === null) return { ok: true, v };
  if (d.type === 'string') {
    if (typeof v === 'string') return { ok: true, v };
    if (typeof v === 'number' || typeof v === 'boolean') return { ok: true, v: String(v) };
    return { ok: false, msg: `Inappropriate value for attribute "${name}": string required.` };
  }
  if (d.type === 'number') {
    if (typeof v === 'number') return { ok: true, v };
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return { ok: true, v: Number(v) };
    return { ok: false, msg: `Inappropriate value for attribute "${name}": number required.` };
  }
  if (typeof v === 'boolean') return { ok: true, v };
  if (v === 'true' || v === 'false') return { ok: true, v: v === 'true' };
  return { ok: false, msg: `Inappropriate value for attribute "${name}": bool required.` };
}

export interface WalkIn {
  world: State;
  cfg: Config;
  graph: Graph;
  /** État de travail (déjà rafraîchi). Modifié par l'exécuteur en phase d'application. */
  ts: TfState;
  vars: Record<string, any>;
  mode: Mode;
  exec?: Executor;
  /** Instances de l'état à ignorer parce qu'elles viennent d'être détruites (remplacement). */
  drift: Drift[];
}

interface Expanded { key?: number | string; ctx: EvalCtx }

function fail(res: ResDef, e: unknown, fallbackLine: number): Diag {
  if (e instanceof EvalError) return { severity: 'Error', summary: e.summary, detail: e.detail, file: res.file, line: e.line || fallbackLine, ctx: res.ctx };
  throw e;
}

function fullObject(type: string, attrs: Attrs): Attrs {
  const o: Attrs = {};
  for (const k of Object.keys(RESOURCES[type]!.attrs)) o[k] = attrs[k] === undefined ? null : attrs[k];
  return o;
}

export function walk(w: WalkIn): PlanResult {
  const { cfg, graph, ts, mode } = w;
  const instances: InstPlan[] = [];
  const outputs: PlanResult['outputs'] = {};
  const localVals: Record<string, any> = {};
  const resVals: Record<string, any> = {};
  const seen = new Set<string>();

  const base: EvalCtx = {
    variable: (n, line) => {
      if (!(n in w.vars)) throw new EvalError('Reference to undeclared input variable', `An input variable with the name "${n}" has not been declared.`, line);
      return w.vars[n];
    },
    local: (n, line) => {
      if (!(n in localVals)) throw new EvalError('Reference to undeclared local value', `A local value with the name "${n}" has not been evaluated yet.`, line);
      return localVals[n];
    },
    resource: (t, n, line) => {
      const k = `${t}.${n}`;
      if (!(k in resVals)) throw new EvalError('Reference to undeclared resource', `A managed resource "${t}" "${n}" has not been declared in the root module.`, line);
      return resVals[k];
    },
  };

  for (const node of graph.order) {
    if (node.startsWith('local.')) {
      const name = node.slice(6);
      const l = cfg.locals[name]!;
      try { localVals[name] = evalExpr(l.expr, base); } catch (e) {
        if (e instanceof EvalError) throw new TfError([{ severity: 'Error', summary: e.summary, detail: e.detail, file: l.file, line: e.line || l.line, ctx: 'in locals' }]);
        throw e;
      }
      continue;
    }
    if (node.startsWith('output.')) {
      const o = cfg.outputs.find(x => `output.${x.name}` === node)!;
      try { outputs[o.name] = { value: evalExpr(o.value, base), sensitive: o.sensitive }; } catch (e) {
        if (e instanceof EvalError) throw new TfError([{ severity: 'Error', summary: e.summary, detail: e.detail, file: o.file, line: e.line || o.line, ctx: `in output "${o.name}"` }]);
        throw e;
      }
      continue;
    }
    const res = cfg.resources.find(r => r.addr === node)!;
    const def = RESOURCES[res.type]!;
    const deps = resourceDeps(graph, node);

    // Instances à produire (count / for_each), ou instances connues de l'état en mode « refresh-only ».
    let expanded: Expanded[];
    const diags: Diag[] = [];
    if (mode === 'refresh-only') {
      expanded = Object.values(ts.instances).filter(i => i.type === res.type && i.name === res.name).map(i => ({ ...(i.key !== undefined ? { key: i.key } : {}), ctx: base }));
    } else expanded = expand(res, base, diags);
    if (diags.length) throw new TfError(diags);

    const produced: { key?: number | string; attrs: Attrs }[] = [];
    for (const ex of expanded) {
      const addr = instAddr(res.type, res.name, ex.key);
      seen.add(addr);
      const prior = ts.instances[addr];
      if (mode === 'refresh-only') {
        produced.push({ ...(ex.key !== undefined ? { key: ex.key } : {}), attrs: prior ? prior.attrs : {} });
        if (prior) instances.push({ addr, type: res.type, name: res.name, ...(ex.key !== undefined ? { key: ex.key } : {}), action: 'noop', prior: prior.attrs, planned: prior.attrs, changed: [], forces: [], deps, priorDeps: prior.deps, res });
        continue;
      }
      // Arguments
      const args: Attrs = {};
      for (const [n, a] of Object.entries(res.args)) {
        const d = def.attrs[n]!;
        let v: any;
        try { v = evalExpr(a.expr, ex.ctx); } catch (e) { diags.push(fail(res, e, a.line)); continue; }
        const c = coerce(n, d, v);
        if (!c.ok) { diags.push({ severity: 'Error', summary: 'Incorrect attribute value type', detail: c.msg, file: res.file, line: a.line, ctx: res.ctx }); continue; }
        if (c.v !== null) args[n] = c.v;
      }
      if (diags.length) throw new TfError(diags);
      const withDef = withDefaults(res.type, args);
      const known = Object.fromEntries(Object.entries(withDef).filter(([, v]) => !isUnknown(v)));
      for (const bad of validateArgs(res.type, known)) {
        diags.push({ severity: 'Error', summary: 'Invalid value for argument', detail: bad.message, file: res.file, line: res.args[bad.attr]?.line ?? res.line, ctx: res.ctx });
      }
      if (diags.length) throw new TfError(diags);

      const planned: Attrs = { ...withDef };
      const computed = Object.entries(def.attrs).filter(([, d]) => d.computed).map(([k]) => k);
      for (const k of computed) planned[k] = prior ? prior.attrs[k] : UNKNOWN;

      // Comparaison avec l'existant
      const changed: string[] = []; const forces: string[] = [];
      let action: Action;
      if (!prior) action = 'create';
      else {
        for (const k of new Set([...Object.keys(def.attrs), ...Object.keys(prior.attrs)])) {
          const d = def.attrs[k];
          if (!d || d.computed) continue;
          const p = planned[k] === undefined ? null : planned[k];
          const q = prior.attrs[k] === undefined ? null : prior.attrs[k];
          if (isUnknown(p) || !same(p, q)) { changed.push(k); if (d.forceNew) forces.push(k); }
        }
        action = forces.length ? 'replace' : changed.length ? 'update' : 'noop';
        if (action === 'replace') for (const k of computed) planned[k] = UNKNOWN;
      }

      if ((action === 'replace') && res.preventDestroy) {
        throw new TfError([{ severity: 'Error', summary: 'Instance cannot be destroyed', detail: `Resource ${addr} has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed. To avoid this error and continue with the plan, either disable lifecycle.prevent_destroy or adjust the scope of the plan.`, file: res.file, line: res.line, ctx: res.ctx }]);
      }

      const inst: InstPlan = { addr, type: res.type, name: res.name, ...(ex.key !== undefined ? { key: ex.key } : {}), action, ...(prior ? { prior: prior.attrs } : {}), planned, changed, forces, deps, priorDeps: prior?.deps ?? [], res };

      // Application réelle
      if (w.exec) {
        let result: Attrs | undefined;
        const concrete = Object.fromEntries(Object.entries(withDef).filter(([, v]) => !isUnknown(v)));
        if (action === 'create') result = w.exec.create(inst, concrete);
        else if (action === 'update') result = w.exec.update(inst, concrete);
        else result = prior?.attrs;
        if (result) {
          inst.planned = result;
          const st: InstState = { addr, type: res.type, name: res.name, ...(ex.key !== undefined ? { key: ex.key } : {}), attrs: result, deps };
          ts.instances[addr] = st;
        }
      }
      instances.push(inst);
      produced.push({ ...(ex.key !== undefined ? { key: ex.key } : {}), attrs: inst.planned! });
    }

    // Valeur de la ressource pour les expressions qui la référencent
    const objs = produced.map(p => ({ key: p.key, o: fullObject(res.type, p.attrs) }));
    if (res.count) resVals[node] = objs.sort((a, b) => Number(a.key) - Number(b.key)).map(x => x.o);
    else if (res.forEach) resVals[node] = Object.fromEntries(objs.map(x => [String(x.key), x.o]));
    else resVals[node] = objs[0]?.o ?? {};
  }

  // Ce qui n'est plus décrit dans le code, ou qu'on veut détruire
  for (const inst of Object.values(ts.instances)) {
    if (mode === 'refresh-only') break;
    if (seen.has(inst.addr)) continue;
    if (w.exec) continue; // les destructions sont faites avant, par l'application
    const res = cfg.resources.find(r => r.type === inst.type && r.name === inst.name);
    const reason = !res ? `${inst.type}.${inst.name} is not in configuration`
      : res.count ? `index [${String(inst.key)}] is out of range for count`
        : res.forEach ? `key ["${String(inst.key)}"] is not in for_each map` : `${inst.addr} is not in configuration`;
    instances.push({ addr: inst.addr, type: inst.type, name: inst.name, ...(inst.key !== undefined ? { key: inst.key } : {}), action: 'delete', prior: inst.attrs, changed: [], forces: [], deps: [], priorDeps: inst.deps, reason });
  }
  instances.sort((a, b) => a.addr.localeCompare(b.addr));

  // Sorties
  const outChanges: OutChange[] = [];
  for (const [name, after] of Object.entries(outputs)) {
    const before = ts.outputs[name];
    if (!before) outChanges.push({ name, kind: 'create', after });
    else if (isUnknown(after.value) || !same(before.value, after.value) || before.sensitive !== after.sensitive) outChanges.push({ name, kind: 'update', before, after });
  }
  for (const [name, before] of Object.entries(ts.outputs)) if (!(name in outputs) && mode !== 'refresh-only') outChanges.push({ name, kind: 'delete', before });
  outChanges.sort((a, b) => a.name.localeCompare(b.name));
  if (mode === 'refresh-only') {
    // En mode « refresh-only » les sorties suivent l'état rafraîchi.
    return { mode, instances, drift: w.drift, outputs: Object.fromEntries(Object.entries(outputs)), outChanges };
  }
  return { mode, instances, drift: w.drift, outputs, outChanges };
}

function expand(res: ResDef, base: EvalCtx, diags: Diag[]): Expanded[] {
  const line = res.count?.line ?? res.forEach?.line ?? res.line;
  const bad = (summary: string, detail: string): Expanded[] => { diags.push({ severity: 'Error', summary, detail, file: res.file, line, ctx: res.ctx }); return []; };
  if (res.count) {
    let v: any;
    try { v = evalExpr(res.count.expr, base); } catch (e) { diags.push(fail(res, e, line)); return []; }
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) v = Number(v);
    if (isUnknown(v)) return bad('Invalid count argument', 'The "count" value depends on resource attributes that cannot be determined until apply, so Terraform cannot predict how many instances will be created. To work around this, apply only the resources that the count depends on first.');
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return bad('Invalid count argument', 'The "count" argument must be a whole number, zero or greater.');
    return Array.from({ length: v }, (_x, i) => ({ key: i, ctx: { ...base, count: i } }));
  }
  if (res.forEach) {
    let v: any;
    try { v = evalExpr(res.forEach.expr, base); } catch (e) { diags.push(fail(res, e, line)); return []; }
    if (isUnknown(v)) return bad('Invalid for_each argument', 'The "for_each" map includes keys derived from resource attributes that cannot be determined until apply, and so Terraform cannot determine the full set of keys that will identify the instances of this resource.');
    if (Array.isArray(v)) {
      if (!v.every(x => typeof x === 'string')) return bad('Invalid for_each argument', 'The given "for_each" argument value is unsuitable: "for_each" supports maps and sets of strings, but you have provided a list of other values.');
      return [...new Set<string>(v)].sort().map(k => ({ key: k, ctx: { ...base, each: { key: k, value: k } } }));
    }
    if (v && typeof v === 'object') return Object.keys(v).sort().map(k => ({ key: k, ctx: { ...base, each: { key: k, value: v[k] } } }));
    return bad('Invalid for_each argument', 'The given "for_each" argument value is unsuitable: the "for_each" argument must be a map, or set of strings.');
  }
  return [{ ctx: base }];
}

export { evalConst };
