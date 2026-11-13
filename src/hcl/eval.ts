import type { Expr } from './ast';

/** Valeur inconnue avant l'application (« known after apply »). Contagieuse dans les expressions. */
export const UNKNOWN: any = Object.freeze({ __unknown: true });
export const isUnknown = (v: unknown): boolean => v === UNKNOWN;

export class EvalError extends Error {
  constructor(public summary: string, public detail: string, public line: number) { super(`${summary}: ${detail}`); }
}

export interface EvalCtx {
  variable(name: string, line: number): any;
  local(name: string, line: number): any;
  resource(type: string, name: string, line: number): any;
  count?: number;
  each?: { key: any; value: any };
}

const typeName = (v: any): string => v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'object' : typeof v;

export function toStr(v: any, line: number): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new EvalError('Invalid template interpolation value', `Cannot include the given value in a string template: string required (found ${typeName(v)}).`, line);
}

const deepEq = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

function applyStep(v: any, step: { t: 'attr'; name: string; line: number } | { t: 'idx'; value: any; line: number }): any {
  if (isUnknown(v)) return UNKNOWN;
  if (step.t === 'attr') {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (!(step.name in v)) throw new EvalError('Unsupported attribute', `This object does not have an attribute named "${step.name}".`, step.line);
      return v[step.name];
    }
    throw new EvalError('Unsupported attribute', `Can't access attributes on a value of type ${typeName(v)}.`, step.line);
  }
  const idx = step.value;
  if (isUnknown(idx)) return UNKNOWN;
  if (Array.isArray(v)) {
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= v.length) throw new EvalError('Invalid index', 'The given key does not identify an element in this collection value.', step.line);
    return v[idx];
  }
  if (v !== null && typeof v === 'object') {
    const k = String(idx);
    if (!(k in v)) throw new EvalError('Invalid index', 'The given key does not identify an element in this collection value.', step.line);
    return v[k];
  }
  throw new EvalError('Invalid index', `This value does not have any indices (found ${typeName(v)}).`, step.line);
}

function fmt(spec: string, args: any[], line: number): string {
  let i = 0;
  return spec.replace(/%([sdv%])/g, (_m, c: string) => {
    if (c === '%') return '%';
    if (i >= args.length) throw new EvalError('Error in function call', 'Not enough arguments for format string.', line);
    const a = args[i++];
    if (c === 'd' && typeof a !== 'number') throw new EvalError('Error in function call', 'Format verb %d requires a number.', line);
    return toStr(a, line);
  });
}

const FUNCS: Record<string, (args: any[], line: number) => any> = {
  format: (a, l) => fmt(String(a[0]), a.slice(1), l),
  join: (a) => (a[1] as any[]).map(String).join(String(a[0])),
  length: (a, l) => { const v = a[0]; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (v && typeof v === 'object') return Object.keys(v).length; throw new EvalError('Error in function call', 'Invalid value for "value" parameter: argument must be a string, a collection or a structural value.', l); },
  lower: (a) => String(a[0]).toLowerCase(),
  upper: (a) => String(a[0]).toUpperCase(),
  tostring: (a) => String(a[0]),
  tonumber: (a, l) => { const n = Number(a[0]); if (Number.isNaN(n)) throw new EvalError('Error in function call', `Cannot convert "${String(a[0])}" to number.`, l); return n; },
  concat: (a) => ([] as any[]).concat(...a),
  contains: (a) => (a[0] as any[]).includes(a[1]),
  lookup: (a, l) => { const m = a[0]; const k = String(a[1]); if (k in m) return m[k]; if (a.length > 2) return a[2]; throw new EvalError('Error in function call', `Invalid value for "inputMap" parameter: the given key "${k}" does not exist.`, l); },
  keys: (a) => Object.keys(a[0]).sort(),
  values: (a) => Object.keys(a[0]).sort().map(k => a[0][k]),
  max: (a) => Math.max(...a.map(Number)),
  min: (a) => Math.min(...a.map(Number)),
  toset: (a) => [...new Set(a[0] as any[])].sort(),
  tolist: (a) => [...(a[0] as any[])],
};

export function evalExpr(e: Expr, c: EvalCtx): any {
  switch (e.k) {
    case 'lit': return e.v;
    case 'tmpl': {
      let out = '';
      for (const p of e.parts) {
        if (typeof p === 'string') { out += p; continue; }
        const v = evalExpr(p, c);
        if (isUnknown(v)) return UNKNOWN;
        out += toStr(v, e.line);
      }
      return out;
    }
    case 'id': return evalRoot(e.name, [], c, e.line).value;
    case 'trav': {
      let rest = e.steps.map(s => s);
      let v: any;
      if (e.base.k === 'id') {
        const r = evalRoot(e.base.name, e.steps, c, e.base.line);
        v = r.value; rest = e.steps.slice(r.used);
      } else v = evalExpr(e.base, c);
      for (const s of rest) {
        v = s.t === 'attr' ? applyStep(v, s) : applyStep(v, { t: 'idx', value: evalExpr(s.e, c), line: s.line });
      }
      return v;
    }
    case 'list': return e.items.map(i => evalExpr(i, c));
    case 'obj': {
      const o: Record<string, any> = {};
      for (const it of e.items) {
        const k = evalExpr(it.key, c);
        if (isUnknown(k)) return UNKNOWN;
        o[String(k)] = evalExpr(it.value, c);
      }
      return o;
    }
    case 'call': {
      const f = FUNCS[e.name];
      if (!f) throw new EvalError('Call to unknown function', `There is no function named "${e.name}".`, e.line);
      const args = e.args.map(a => evalExpr(a, c));
      if (args.some(isUnknown)) return UNKNOWN;
      return f(args, e.line);
    }
    case 'un': {
      const v = evalExpr(e.e, c);
      if (isUnknown(v)) return UNKNOWN;
      if (e.op === '!') { if (typeof v !== 'boolean') throw new EvalError('Invalid operand', 'Unsuitable value for the ! operator: a bool is required.', e.line); return !v; }
      if (typeof v !== 'number') throw new EvalError('Invalid operand', 'Unsuitable value for the - operator: a number is required.', e.line);
      return -v;
    }
    case 'bin': {
      if (e.op === '&&' || e.op === '||') {
        const l = evalExpr(e.l, c);
        if (!isUnknown(l) && typeof l === 'boolean') {
          if (e.op === '&&' && !l) return false;
          if (e.op === '||' && l) return true;
        }
        const r = evalExpr(e.r, c);
        if (isUnknown(l) || isUnknown(r)) return UNKNOWN;
        if (typeof l !== 'boolean' || typeof r !== 'boolean') throw new EvalError('Invalid operand', `Unsuitable value for the ${e.op} operator: a bool is required.`, e.line);
        return e.op === '&&' ? l && r : l || r;
      }
      const l = evalExpr(e.l, c); const r = evalExpr(e.r, c);
      if (isUnknown(l) || isUnknown(r)) return UNKNOWN;
      if (e.op === '==') return deepEq(l, r);
      if (e.op === '!=') return !deepEq(l, r);
      if (e.op === '+' && typeof l === 'string' && typeof r === 'string') {
        throw new EvalError('Invalid operand', 'Unsuitable value for the + operator: a number is required. Use a template string ("${a}${b}") to join strings.', e.line);
      }
      if (typeof l !== 'number' || typeof r !== 'number') throw new EvalError('Invalid operand', `Unsuitable value for the ${e.op} operator: a number is required.`, e.line);
      switch (e.op) {
        case '+': return l + r; case '-': return l - r; case '*': return l * r;
        case '/': if (r === 0) throw new EvalError('Invalid operand', 'Division by zero.', e.line); return l / r;
        case '%': return l % r;
        case '<': return l < r; case '>': return l > r; case '<=': return l <= r; default: return l >= r;
      }
    }
    case 'cond': {
      const cv = evalExpr(e.c, c);
      if (isUnknown(cv)) return UNKNOWN;
      if (typeof cv !== 'boolean') throw new EvalError('Incorrect condition type', 'The condition expression must be of type bool.', e.line);
      return evalExpr(cv ? e.t : e.f, c);
    }
  }
}

/** Résout le début d'une référence (var.x, local.x, each.key, count.index, type.nom…). `used` = étapes consommées. */
function evalRoot(name: string, steps: readonly ({ t: 'attr'; name: string; line: number } | { t: 'idx'; e: Expr; line: number })[], c: EvalCtx, line: number): { value: any; used: number } {
  const first = steps[0];
  const attr = first && first.t === 'attr' ? first.name : undefined;
  switch (name) {
    case 'var':
      if (attr === undefined) throw new EvalError('Invalid reference', 'The "var" object cannot be accessed directly. Instead, access one of its attributes.', line);
      return { value: c.variable(attr, first!.line), used: 1 };
    case 'local':
      if (attr === undefined) throw new EvalError('Invalid reference', 'The "local" object cannot be accessed directly. Instead, access one of its attributes.', line);
      return { value: c.local(attr, first!.line), used: 1 };
    case 'count':
      if (c.count === undefined) throw new EvalError('Reference to "count" in non-counted context', 'The "count" object can only be used in "resource" blocks, and only when the "count" argument is set.', line);
      if (attr !== 'index') throw new EvalError('Unsupported attribute', 'The "count" object only has the attribute "index".', line);
      return { value: c.count, used: 1 };
    case 'each':
      if (!c.each) throw new EvalError('Reference to "each" in context without for_each', 'The "each" object can be used only in "resource" blocks, and only when the "for_each" argument is set.', line);
      if (attr === 'key') return { value: c.each.key, used: 1 };
      if (attr === 'value') return { value: c.each.value, used: 1 };
      throw new EvalError('Unsupported attribute', 'The "each" object has only the attributes "key" and "value".', line);
    default:
      if (attr === undefined) throw new EvalError('Unknown variable', `There is no variable named "${name}".`, line);
      return { value: c.resource(name, attr, first!.line), used: 1 };
  }
}

export interface Ref { kind: 'var' | 'local' | 'res' | 'each' | 'count'; name: string; line: number }

/** Références contenues dans une expression (pour le graphe de dépendances et la validation statique). */
export function collectRefs(e: Expr, out: Ref[] = []): Ref[] {
  switch (e.k) {
    case 'tmpl': for (const p of e.parts) if (typeof p !== 'string') collectRefs(p, out); break;
    case 'id': out.push({ kind: 'res', name: `?${e.name}`, line: e.line }); break;
    case 'trav': {
      if (e.base.k === 'id') {
        const f = e.steps[0];
        const a = f && f.t === 'attr' ? f.name : '';
        const r = e.base.name;
        if (r === 'var') out.push({ kind: 'var', name: a, line: e.base.line });
        else if (r === 'local') out.push({ kind: 'local', name: a, line: e.base.line });
        else if (r === 'each') out.push({ kind: 'each', name: a, line: e.base.line });
        else if (r === 'count') out.push({ kind: 'count', name: a, line: e.base.line });
        else out.push({ kind: 'res', name: `${r}.${a}`, line: e.base.line });
      } else collectRefs(e.base, out);
      for (const s of e.steps) if (s.t === 'idx') collectRefs(s.e, out);
      break;
    }
    case 'call': for (const a of e.args) collectRefs(a, out); break;
    case 'list': for (const a of e.items) collectRefs(a, out); break;
    case 'obj': for (const it of e.items) { collectRefs(it.key, out); collectRefs(it.value, out); } break;
    case 'un': collectRefs(e.e, out); break;
    case 'bin': collectRefs(e.l, out); collectRefs(e.r, out); break;
    case 'cond': collectRefs(e.c, out); collectRefs(e.t, out); collectRefs(e.f, out); break;
    case 'lit': break;
  }
  return out;
}
