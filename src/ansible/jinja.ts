/** Jinja2 minimal : `{{ variable }}`, accès par point, quelques filtres. Pas de blocs `{% … %}` (limite assumée). */
export class JinjaError extends Error {}

export type Vars = Record<string, any>;

function lookup(path: string, vars: Vars): any {
  const parts = path.split('.');
  let v: any = vars;
  for (const p of parts) {
    if (v === null || typeof v !== 'object' || !(p in v)) throw new JinjaError(`'${parts[0] === p ? p : path}' is undefined`.replace(/^'(.*)'$/, (_m, x: string) => `'${x}'`));
    v = v[p];
  }
  return v;
}

function literal(s: string): { ok: true; v: any } | { ok: false } {
  const t = s.trim();
  if (/^"(.*)"$/.test(t) || /^'(.*)'$/.test(t)) return { ok: true, v: t.slice(1, -1) };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { ok: true, v: Number(t) };
  if (t === 'true' || t === 'True') return { ok: true, v: true };
  if (t === 'false' || t === 'False') return { ok: true, v: false };
  return { ok: false };
}

/** Évalue le contenu d'une accolade double : `var`, `var | default('x')`, `"texte" | upper`. */
export function evalMoustache(expr: string, vars: Vars): any {
  const [head, ...filters] = expr.split('|').map(s => s.trim());
  let undef = false; let v: any;
  const lit = literal(head!);
  if (lit.ok) v = lit.v;
  else if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(head!)) { try { v = lookup(head!, vars); } catch (e) { if (e instanceof JinjaError) { undef = true; v = undefined; } else throw e; } }
  else throw new JinjaError(`unsupported expression: ${expr}`);
  for (const f of filters) {
    const m = /^([a-z_]+)(?:\((.*)\))?$/.exec(f);
    if (!m) throw new JinjaError(`unsupported filter: ${f}`);
    const arg = m[2] !== undefined ? literal(m[2]) : undefined;
    switch (m[1]) {
      case 'default': if (undef) { v = arg && arg.ok ? arg.v : ''; undef = false; } break;
      case 'upper': v = String(v).toUpperCase(); break;
      case 'lower': v = String(v).toLowerCase(); break;
      case 'length': v = Array.isArray(v) || typeof v === 'string' ? v.length : Object.keys(v ?? {}).length; break;
      case 'join': v = (v as any[]).join(arg && arg.ok ? String(arg.v) : ''); break;
      case 'int': v = parseInt(String(v), 10); break;
      default: throw new JinjaError(`No filter named '${m[1]}'`);
    }
  }
  if (undef) throw new JinjaError(`'${head}' is undefined`);
  return v;
}

/** Remplace les `{{ … }}` d'une chaîne. Une chaîne qui est exactement `{{ x }}` garde le type natif (liste, nombre…). */
export function render(s: string, vars: Vars): any {
  const whole = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(s);
  if (whole) return evalMoustache(whole[1]!, vars);
  if (s.includes('{%')) throw new JinjaError('Les blocs {% … %} ne sont pas pris en charge par IaC Lab (variables seulement).');
  return s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, e: string) => {
    const v = evalMoustache(e, vars);
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
  });
}

/** Rend récursivement les chaînes d'une structure. */
export function renderDeep(x: any, vars: Vars): any {
  if (typeof x === 'string') return render(x, vars);
  if (Array.isArray(x)) return x.map(i => renderDeep(i, vars));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, renderDeep(v, vars)]));
  return x;
}

// ------------------------------------------------------------------ conditions (when:)

type CTok = { t: 'str' | 'num' | 'id' | 'op'; v: string };
function ctoks(s: string): CTok[] {
  const out: CTok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") { const j = s.indexOf(c, i + 1); if (j < 0) throw new JinjaError('unterminated string in condition'); out.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('()<>[],'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    const m = /^-?\d+(\.\d+)?/.exec(s.slice(i));
    if (m) { out.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    throw new JinjaError(`unexpected character in condition: ${c}`);
  }
  return out;
}

/** Évalue une condition `when:` : comparaisons, and / or / not, `in`, `is defined`, `is not defined`. */
export function evalCondition(src: string | boolean, vars: Vars): boolean {
  if (typeof src === 'boolean') return src;
  const toks = ctoks(src); let p = 0;
  const peek = (): CTok | undefined => toks[p];
  const isId = (v: string): boolean => peek()?.t === 'id' && peek()!.v === v;
  function orE(): any { let l = andE(); while (isId('or')) { p++; const r = andE(); l = Boolean(l) || Boolean(r); } return l; }
  function andE(): any { let l = notE(); while (isId('and')) { p++; const r = notE(); l = Boolean(l) && Boolean(r); } return l; }
  function notE(): any { if (isId('not')) { p++; return !notE(); } return cmp(); }
  function cmp(): any {
    const l = atom();
    const t = peek();
    if (t?.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      p++; const r = atom();
      switch (t.v) { case '==': return l === r; case '!=': return l !== r; case '<': return l < r; case '>': return l > r; case '<=': return l <= r; default: return l >= r; }
    }
    if (isId('in')) { p++; const r = atom(); return Array.isArray(r) ? r.includes(l) : String(r).includes(String(l)); }
    if (isId('not') && toks[p + 1]?.v === 'in') { p += 2; const r = atom(); return !(Array.isArray(r) ? r.includes(l) : String(r).includes(String(l))); }
    return l;
  }
  function atom(): any {
    const t = toks[p++];
    if (!t) throw new JinjaError('incomplete condition');
    if (t.t === 'str') return t.v;
    if (t.t === 'num') return Number(t.v);
    if (t.t === 'op' && t.v === '(') { const v = orE(); p++; return v; }
    if (t.t === 'op' && t.v === '[') { const a: any[] = []; while (peek() && peek()!.v !== ']') { a.push(atom()); if (peek()?.v === ',') p++; } p++; return a; }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'True') return true;
      if (t.v === 'false' || t.v === 'False') return false;
      let defined = true; let v: any;
      try { v = lookup(t.v, vars); } catch { defined = false; }
      if (isId('is')) {
        p++; let neg = false; if (isId('not')) { p++; neg = true; }
        if (!isId('defined')) throw new JinjaError('only "is defined" tests are supported');
        p++; return neg ? !defined : defined;
      }
      if (!defined) throw new JinjaError(`The conditional check '${src}' failed. The error was: error while evaluating conditional (${src}): '${t.v}' is undefined`);
      return v;
    }
    throw new JinjaError(`unexpected token in condition: ${t.v}`);
  }
  const r = orE();
  if (p < toks.length) throw new JinjaError(`unexpected token in condition: ${toks[p]!.v}`);
  return Boolean(r);
}
