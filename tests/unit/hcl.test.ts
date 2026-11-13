import { HclError } from '../../src/hcl/ast';
import { UNKNOWN, evalExpr, type EvalCtx } from '../../src/hcl/eval';
import { parseExpression, parseFile } from '../../src/hcl/parser';
import { formatHcl } from '../../src/terraform/fmt';

const ctx = (vars: Record<string, any> = {}): EvalCtx => ({
  variable: n => vars[n],
  local: n => vars[`local_${n}`],
  resource: (t, n) => vars[`${t}.${n}`],
});
const ev = (src: string, vars: Record<string, any> = {}): any => evalExpr(parseExpression(src), ctx(vars));

describe('HCL : analyse', () => {
  it('lit blocs, arguments, commentaires et numéros de ligne', () => {
    const body = parseFile(`# commentaire\nresource "a_b" "x" {\n  // autre\n  name = "n" /* inline */\n  port = 80\n}\n`);
    const b = body.blocks[0]!;
    expect(b.type).toBe('resource'); expect(b.labels).toEqual(['a_b', 'x']); expect(b.line).toBe(2);
    expect(b.body.attrs['name']!.line).toBe(4); expect(b.body.attrs['port']!.line).toBe(5);
  });
  it('signale un bloc non fermé avec la ligne d\'ouverture', () => {
    try { parseFile('resource "a" "b" {\n  x = 1\n'); throw new Error('aurait dû échouer'); } catch (e) {
      expect(e).toBeInstanceOf(HclError); expect((e as HclError).summary).toBe('Unclosed configuration block'); expect((e as HclError).line).toBe(1);
    }
  });
  it('signale un argument sans fin de ligne et une chaîne non fermée', () => {
    expect(() => parseFile('a = 1 b = 2\n')).toThrow(/newline/);
    expect(() => parseFile('a = "oups\n')).toThrow(/Unterminated/);
  });
  it('accepte les objets, listes, blocs sur une ligne et interpolations imbriquées', () => {
    const b = parseFile('v {\n  m = { a = 1, b = "x" }\n  l = [\n    1,\n    2,\n  ]\n  s = "x-${upper("y")}-z"\n}\nw { k = 1 }\n');
    expect(b.blocks).toHaveLength(2);
  });
});

describe('HCL : évaluation', () => {
  it('calcule arithmétique, comparaisons et conditionnelles', () => {
    expect(ev('1 + 2 * 3')).toBe(7); expect(ev('(1 + 2) * 3')).toBe(9); expect(ev('2 > 1 && 1 == 1')).toBe(true);
    expect(ev('var.env == "prod" ? 3 : 1', { env: 'test' })).toBe(1);
  });
  it('interpole des chaînes et appelle des fonctions', () => {
    expect(ev('"web-${var.env}-${1 + 1}"', { env: 'test' })).toBe('web-test-2');
    expect(ev('format("%s-%d", "a", 3)')).toBe('a-3'); expect(ev('join(",", ["a", "b"])')).toBe('a,b');
    expect(ev('length(["a", "b", "c"])')).toBe(3); expect(ev('upper("x")')).toBe('X');
  });
  it('lit objets et listes avec index', () => {
    expect(ev('var.m["a"]', { m: { a: 5 } })).toBe(5); expect(ev('var.l[1]', { l: [1, 2] })).toBe(2); expect(ev('var.o.k', { o: { k: 'v' } })).toBe('v');
  });
  it('propage l\'inconnu et refuse les erreurs de type', () => {
    expect(ev('"x-${var.a}"', { a: UNKNOWN })).toBe(UNKNOWN); expect(ev('var.a + 1', { a: UNKNOWN })).toBe(UNKNOWN);
    expect(() => ev('"a" + "b"')).toThrow(/number is required/);
    expect(() => ev('nope(1)')).toThrow(/unknown function/);
    expect(() => ev('var.l[9]', { l: [1] })).toThrow(/Invalid index/);
  });
});

describe('terraform fmt', () => {
  it('réindente et aligne les signes égal', () => {
    const out = formatHcl('resource "a" "b" {\nname = "x"\n    cidr  =   "y"\n\n  port = 1\n}\n');
    expect(out).toBe('resource "a" "b" {\n  name = "x"\n  cidr = "y"\n\n  port = 1\n}\n');
  });
  it('est idempotent', () => {
    const once = formatHcl('variable "x" {\n type = string\n default = [\n"a",\n"b",\n ]\n}\n');
    expect(formatHcl(once)).toBe(once);
  });
});
