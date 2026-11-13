/** Sous-ensemble de YAML utilisé par les playbooks : mappings, listes, scalaires, blocs « | » et « > », listes et mappings en ligne. */
export class YamlError extends Error {
  constructor(public msg: string, public line: number, public column = 1) { super(msg); }
}

interface Line { indent: number; text: string; no: number; raw: string; blank: boolean }

const QUOTES_HINT = 'We could be wrong, but this one looks like it might be an issue with missing quotes. Always quote template expression brackets when they start a value.';

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; }
    else if (c === '"' || c === "'") { if (i === 0 || /[\s[{,:]/.test(s[i - 1]!)) q = c; }
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let q: string | null = null; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { cur += c; if (c === '\\' && q === '"') { cur += s[++i] ?? ''; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out;
}

export function parseScalar(raw: string, line: number): any {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s[0] === '"') {
    if (s.length < 2 || s[s.length - 1] !== '"') throw new YamlError('found unexpected end of stream while scanning a quoted scalar', line);
    return s.slice(1, -1).replace(/\\(.)/g, (_m, c: string) => c === 'n' ? '\n' : c === 't' ? '\t' : c);
  }
  if (s[0] === "'") {
    if (s.length < 2 || s[s.length - 1] !== "'") throw new YamlError('found unexpected end of stream while scanning a quoted scalar', line);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === '[') {
    if (s[s.length - 1] !== ']') throw new YamlError("did not find expected ',' or ']'", line);
    return splitTop(s.slice(1, -1)).map(x => parseScalar(x, line));
  }
  if (s[0] === '{') {
    if (s[s.length - 1] !== '}') throw new YamlError("did not find expected ',' or '}'", line);
    const inner = s.slice(1, -1);
    if (inner.trim().startsWith('{')) throw new YamlError(QUOTES_HINT, line);
    const o: Record<string, any> = {};
    for (const part of splitTop(inner)) {
      const i = part.indexOf(':');
      if (i < 0) throw new YamlError(QUOTES_HINT, line);
      o[String(parseScalar(part.slice(0, i), line))] = parseScalar(part.slice(i + 1), line);
    }
    return o;
  }
  if (/^(true|True|TRUE|yes|Yes|YES|on|On|ON)$/.test(s)) return true;
  if (/^(false|False|FALSE|no|No|NO|off|Off|OFF)$/.test(s)) return false;
  if (/^-?(0|[1-9]\d*)$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}

const KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#'"[\]{}][^:#]*?|[^\s:#'"[\]{},][^#]*?)\s*:(?:\s+(.*))?$/;

export function parseYaml(text: string): any {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const lines: Line[] = rawLines.map((raw, k) => {
    const lead = /^[ \t]*/.exec(raw)![0];
    const body = raw.slice(lead.length);
    const blank = body === '' || body.startsWith('#');
    if (!blank && lead.includes('\t')) throw new YamlError('found character \'\\t\' that cannot start any token', k + 1);
    return { indent: lead.length, text: blank ? '' : stripComment(body), no: k + 1, raw, blank };
  });
  let i = 0;
  const skip = (): void => { while (i < lines.length && (lines[i]!.blank || lines[i]!.text === '---' || lines[i]!.text === '...')) i++; };

  function parseBlock(indent: number): any {
    skip();
    const l = lines[i]!;
    if (/^-(\s|$)/.test(l.text)) return parseList(l.indent);
    return parseMap(indent);
  }

  function parseList(indent: number): any[] {
    const items: any[] = [];
    for (;;) {
      skip();
      const l = lines[i];
      if (!l || l.indent !== indent || !/^-(\s|$)/.test(l.text)) break;
      const rest = l.text.slice(1).trimStart();
      const offset = l.text.length - rest.length;
      if (rest === '') {
        i++; skip();
        const n = lines[i];
        items.push(n && n.indent > indent ? parseBlock(n.indent) : null);
      } else if (/^-(\s|$)/.test(rest)) {
        lines[i] = { ...l, indent: indent + offset, text: rest };
        items.push(parseList(indent + offset));
      } else if (KEY.test(rest) && !/^["'[{]/.test(rest) || (/^["']/.test(rest) && KEY.test(rest))) {
        lines[i] = { ...l, indent: indent + offset, text: rest };
        items.push(parseMap(indent + offset));
      } else {
        i++;
        items.push(parseScalar(rest, l.no));
      }
    }
    return items;
  }

  function parseMap(indent: number): Record<string, any> {
    const obj: Record<string, any> = {};
    for (;;) {
      skip();
      const l = lines[i];
      if (!l || l.indent < indent) break;
      if (l.indent > indent) throw new YamlError('mapping values are not allowed here', l.no, l.indent + 1);
      if (/^-(\s|$)/.test(l.text)) break;
      const m = KEY.exec(l.text);
      if (!m) {
        if (/^\{\{/.test(l.text) || /\{\{/.test(l.text)) throw new YamlError(QUOTES_HINT, l.no);
        throw new YamlError("could not find expected ':'", l.no, l.indent + 1);
      }
      const key = String(parseScalar(m[1]!, l.no));
      if (key in obj) throw new YamlError(`found duplicate key "${key}"`, l.no);
      const rest = m[2] === undefined ? '' : stripComment(m[2]);
      if (rest === '') {
        i++; skip();
        const n = lines[i];
        if (n && n.indent > indent) obj[key] = parseBlock(n.indent);
        else if (n && n.indent === indent && /^-(\s|$)/.test(n.text)) obj[key] = parseList(indent);
        else obj[key] = null;
      } else if (/^[|>][+-]?$/.test(rest)) {
        i++;
        const body: string[] = []; let blockIndent = -1;
        while (i < lines.length) {
          const b = lines[i]!;
          if (!b.raw.trim()) { body.push(''); i++; continue; }
          const ind = /^ */.exec(b.raw)![0].length;
          if (ind <= indent) break;
          if (blockIndent < 0) blockIndent = ind;
          body.push(b.raw.slice(Math.min(blockIndent, ind)));
          i++;
        }
        while (body.length && body[body.length - 1] === '') body.pop();
        obj[key] = (rest[0] === '|' ? body.join('\n') : body.join(' ')) + (rest.endsWith('-') ? '' : '\n');
      } else {
        if (/^\{\{/.test(rest) || (rest[0] === '{' && /\}\}\s*$/.test(rest) && rest.startsWith('{{'))) throw new YamlError(QUOTES_HINT, l.no);
        obj[key] = parseScalar(rest, l.no);
        i++;
        skip();
        const n = lines[i];
        if (n && n.indent > indent) throw new YamlError('mapping values are not allowed here', n.no, n.indent + 1);
      }
    }
    return obj;
  }

  skip();
  if (i >= lines.length) return null;
  const root = parseBlock(lines[i]!.indent);
  skip();
  if (i < lines.length) throw new YamlError('did not find expected <document start>', lines[i]!.no);
  return root;
}
