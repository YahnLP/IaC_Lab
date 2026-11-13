import { HclError, type Attr, type Block, type Body, type Expr, type Step } from './ast';
import { lex, type Tok } from './lexer';

const PREC: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

class Parser {
  p = 0;
  constructor(private toks: Tok[], private baseLine = 0) {}

  private peek(o = 0): Tok { return this.toks[Math.min(this.p + o, this.toks.length - 1)]!; }
  private next(): Tok { const t = this.peek(); if (t.t !== 'eof') this.p++; return t; }
  private isOp(v: string, o = 0): boolean { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  private accept(v: string): boolean { if (this.isOp(v)) { this.p++; return true; } return false; }
  private skipNl(): void { while (this.peek().t === 'nl') this.p++; }
  private line(t: Tok): number { return t.line + this.baseLine; }
  private err(summary: string, detail: string, t: Tok = this.peek()): never { throw new HclError(summary, detail, this.line(t)); }
  private expectOp(v: string, summary: string, detail: string): Tok {
    if (!this.isOp(v)) this.err(summary, detail);
    return this.next();
  }

  parseFile(file: string): Body {
    return this.parseBody(true, file, 1);
  }

  private parseBody(top: boolean, file: string, openLine: number): Body {
    const attrs: Record<string, Attr> = {};
    const blocks: Block[] = [];
    for (;;) {
      this.skipNl();
      const t = this.peek();
      if (t.t === 'eof') {
        if (top) break;
        this.err('Unclosed configuration block', 'There is no closing brace for this block before the end of the file. This may be caused by incorrect brace nesting elsewhere in this file.', { ...t, line: openLine - this.baseLine });
      }
      if (this.isOp('}')) {
        if (top) this.err('Unbalanced closing brace', 'Closing brace found without a matching opening brace.');
        break;
      }
      if (t.t !== 'id') this.err('Argument or block definition required', 'An argument or block definition is required here.');
      this.next();
      const name = t.v;
      if (this.isOp('=')) {
        this.next();
        if (name in attrs) this.err('Attribute redefined', `The argument "${name}" was already set. Each argument may be set only once.`, t);
        const expr = this.parseExpr();
        attrs[name] = { expr, line: this.line(t) };
        const after = this.peek();
        if (!(after.t === 'nl' || after.t === 'eof' || (after.t === 'op' && after.v === '}'))) {
          this.err('Missing newline after argument', 'An argument definition must end with a newline.', after);
        }
        continue;
      }
      const labels: string[] = [];
      while (this.peek().t === 'str' || this.peek().t === 'id') {
        const l = this.next();
        if (l.t === 'id') labels.push(l.v);
        else {
          if (!l.parts!.every(x => typeof x === 'string')) this.err('Invalid block definition', 'Block labels must be literal strings, without interpolation.', l);
          labels.push(l.parts!.join(''));
        }
      }
      if (!this.isOp('{')) this.err('Invalid block definition', `Either a quoted string block label or an opening brace ("{") is expected here.`);
      const open = this.next();
      const body = this.parseBody(false, file, this.line(open));
      this.expectOp('}', 'Unclosed configuration block', 'There is no closing brace for this block before the end of the file.');
      blocks.push({ type: name, labels, body, line: this.line(t), file });
    }
    return { attrs, blocks, line: openLine };
  }

  parseExpr(): Expr {
    const c = this.parseBin(0);
    if (this.isOp('?')) {
      const q = this.next();
      const t = this.parseExpr();
      this.expectOp(':', 'Invalid conditional expression', 'The conditional operator requires a colon (":") between the two result values.');
      const f = this.parseExpr();
      return { k: 'cond', c, t, f, line: this.line(q) };
    }
    return c;
  }

  private parseBin(min: number): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const pr = t.t === 'op' ? PREC[t.v] : undefined;
      if (pr === undefined || pr <= min) return l;
      this.next();
      const r = this.parseBin(pr);
      l = { k: 'bin', op: t.v, l, r, line: this.line(t) };
    }
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.t === 'op' && (t.v === '!' || t.v === '-')) {
      this.next();
      return { k: 'un', op: t.v, e: this.parseUnary(), line: this.line(t) };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    const base = this.parsePrimary();
    const steps: Step[] = [];
    for (;;) {
      if (this.isOp('.')) {
        const dot = this.next();
        const n = this.peek();
        if (n.t === 'id') { this.next(); steps.push({ t: 'attr', name: n.v, line: this.line(n) }); }
        else if (n.t === 'num') { this.next(); steps.push({ t: 'idx', e: { k: 'lit', v: Number(n.v), line: this.line(n) }, line: this.line(n) }); }
        else this.err('Invalid attribute name', 'An attribute name is required after a dot.', dot);
      } else if (this.isOp('[')) {
        const br = this.next();
        this.skipNl();
        const e = this.parseExpr();
        this.skipNl();
        this.expectOp(']', 'Missing close bracket on index', 'The index operator must end with a closing bracket ("]").');
        steps.push({ t: 'idx', e, line: this.line(br) });
      } else break;
    }
    return steps.length ? { k: 'trav', base, steps, line: base.line } : base;
  }

  private parsePrimary(): Expr {
    const t = this.next();
    const line = this.line(t);
    if (t.t === 'num') return { k: 'lit', v: Number(t.v), line };
    if (t.t === 'str') {
      const parts = t.parts!.map(x => typeof x === 'string' ? x : parseSub(x.src, x.line + this.baseLine - 1));
      if (parts.every(x => typeof x === 'string')) return { k: 'lit', v: parts.join(''), line };
      return { k: 'tmpl', parts, line };
    }
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true, line };
      if (t.v === 'false') return { k: 'lit', v: false, line };
      if (t.v === 'null') return { k: 'lit', v: null, line };
      if (this.isOp('(')) {
        this.next();
        const args: Expr[] = [];
        this.skipNl();
        while (!this.isOp(')')) {
          args.push(this.parseExpr());
          this.skipNl();
          if (!this.accept(',')) break;
          this.skipNl();
        }
        this.expectOp(')', 'Missing close parenthesis', 'The argument list of a function call must end with a closing parenthesis.');
        return { k: 'call', name: t.v, args, line };
      }
      return { k: 'id', name: t.v, line };
    }
    if (t.t === 'op' && t.v === '(') {
      this.skipNl();
      const e = this.parseExpr();
      this.skipNl();
      this.expectOp(')', 'Missing close parenthesis', 'Expected a closing parenthesis here.');
      return e;
    }
    if (t.t === 'op' && t.v === '[') {
      const items: Expr[] = [];
      this.skipNl();
      while (!this.isOp(']')) {
        items.push(this.parseExpr());
        this.skipNl();
        if (!this.accept(',')) break;
        this.skipNl();
      }
      this.expectOp(']', 'Missing close bracket', 'A list must end with a closing bracket ("]").');
      return { k: 'list', items, line };
    }
    if (t.t === 'op' && t.v === '{') {
      const items: { key: Expr; value: Expr }[] = [];
      for (;;) {
        this.skipNl();
        if (this.isOp('}')) break;
        const kt = this.peek();
        let key: Expr;
        if (kt.t === 'id' && (this.isOp('=', 1) || this.isOp(':', 1))) { this.next(); key = { k: 'lit', v: kt.v, line: this.line(kt) }; }
        else key = this.parseBin(0);
        if (!this.accept('=') && !this.accept(':')) this.err('Missing key/value separator', 'Expected an equals sign ("=") or colon (":") to mark the beginning of the attribute value.');
        const value = this.parseExpr();
        items.push({ key, value });
        if (!this.accept(',')) { const a = this.peek(); if (a.t !== 'nl' && !(a.t === 'op' && a.v === '}')) this.err('Missing item separator', 'Expected a comma to mark the beginning of the next item.', a); }
      }
      this.expectOp('}', 'Unclosed object', 'An object constructor must end with a closing brace ("}").');
      return { k: 'obj', items, line };
    }
    this.err('Invalid expression', 'Expected the start of an expression, but found an invalid expression token.', t);
  }
}

function parseSub(src: string, line: number): Expr {
  const ps = new Parser(lex(src), line);
  const e = ps.parseExpr();
  return e;
}

/** Analyse un fichier .tf (ou .tfvars). Lève HclError en cas d'erreur de syntaxe. */
export function parseFile(src: string, file = 'main.tf'): Body {
  return new Parser(lex(src)).parseFile(file);
}

/** Analyse une expression isolée (par exemple une valeur passée par -var). */
export function parseExpression(src: string): Expr {
  const ps = new Parser(lex(src));
  const e = ps.parseExpr();
  return e;
}
