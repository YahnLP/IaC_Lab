import { HclError } from './ast';

export interface Tok {
  t: 'id' | 'num' | 'str' | 'op' | 'nl' | 'eof';
  v: string;
  line: number;
  /** Pour une chaîne : morceaux de texte et expressions `${…}` (source brute). */
  parts?: (string | { src: string; line: number })[];
}

const OPS2 = ['==', '!=', '<=', '>=', '&&', '||', '=>'];
const OPS1 = '=,.:?!+-*/%<>(){}[]';

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0; let line = 1; const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '\n') { toks.push({ t: 'nl', v: '\n', line }); line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new HclError('Unterminated multi-line comment', 'Expected a terminating "*/" to mark the end of the comment.', line);
      for (const ch of src.slice(i, end)) if (ch === '\n') line++;
      i = end + 2; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_-]/.test(src[j]!)) j++;
      toks.push({ t: 'id', v: src.slice(i, j), line }); i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(src[j]!)) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) { j++; while (j < n && /[0-9]/.test(src[j]!)) j++; }
      toks.push({ t: 'num', v: src.slice(i, j), line }); i = j; continue;
    }
    if (c === '"') {
      const startLine = line; i++;
      const parts: (string | { src: string; line: number })[] = []; let buf = '';
      for (;;) {
        if (i >= n || src[i] === '\n') throw new HclError('Unterminated template string', 'No closing quote was found for this string.', startLine);
        const ch = src[i]!;
        if (ch === '"') { i++; break; }
        if (ch === '\\') {
          const nx = src[i + 1] ?? '';
          buf += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx; i += 2; continue;
        }
        if (ch === '$' && src[i + 1] === '$' && src[i + 2] === '{') { buf += '${'; i += 3; continue; }
        if (ch === '$' && src[i + 1] === '{') {
          let depth = 1; let j = i + 2;
          while (j < n && depth > 0) {
            const d = src[j]!;
            if (d === '{') depth++;
            else if (d === '}') depth--;
            else if (d === '"') { j++; while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; j++; } }
            j++;
          }
          if (depth > 0) throw new HclError('Unterminated template interpolation', 'No closing brace was found for this "${" sequence.', startLine);
          if (buf) { parts.push(buf); buf = ''; }
          parts.push({ src: src.slice(i + 2, j - 1), line });
          i = j; continue;
        }
        buf += ch; i++;
      }
      if (buf || parts.length === 0) parts.push(buf);
      toks.push({ t: 'str', v: '', line: startLine, parts });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two, line }); i += 2; continue; }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c, line }); i++; continue; }
    throw new HclError('Invalid character', `This character is not used within the language: « ${c} ».`, line);
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}
