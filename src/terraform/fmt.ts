/** `terraform fmt` : indentation à deux espaces, signes « = » alignés dans les groupes d'arguments consécutifs. */

function stripStrings(line: string): string {
  // Remplace le contenu des chaînes et supprime les commentaires, pour compter les accolades.
  let out = ''; let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inStr) { if (c === '\\') { i++; continue; } if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += '"'; continue; }
    if (c === '#' || (c === '/' && line[i + 1] === '/')) break;
    out += c;
  }
  return out;
}

const ATTR = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/;

export function formatHcl(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: { text: string; depth: number; attr?: { name: string; value: string }; single: boolean }[] = [];
  let depth = 0;
  for (const raw of lines) {
    const t = raw.trim();
    if (t === '') { out.push({ text: '', depth: 0, single: false }); continue; }
    const code = stripStrings(t);
    const opens = (code.match(/[{[(]/g) ?? []).length;
    const closes = (code.match(/[}\])]/g) ?? []).length;
    const leading = /^[}\])]/.test(code) ? 1 : 0;
    const d = Math.max(0, depth - leading);
    const m = ATTR.exec(t);
    const single = !!m && opens === closes;
    out.push({ text: t, depth: d, ...(m && single ? { attr: { name: m[1]!, value: m[2]! } } : {}), single });
    depth = Math.max(0, depth + opens - closes);
  }
  // Alignement des « = » dans les groupes d'arguments consécutifs de même profondeur.
  let i = 0;
  const res: string[] = [];
  while (i < out.length) {
    const o = out[i]!;
    if (o.attr) {
      let j = i; const grp: typeof out = [];
      while (j < out.length && out[j]!.attr && out[j]!.depth === o.depth) { grp.push(out[j]!); j++; }
      const w = Math.max(...grp.map(g => g.attr!.name.length));
      for (const g of grp) res.push(`${'  '.repeat(g.depth)}${g.attr!.name.padEnd(w)} = ${g.attr!.value}`);
      i = j; continue;
    }
    res.push(o.text === '' ? '' : `${'  '.repeat(o.depth)}${o.text}`);
    i++;
  }
  // Pas de lignes vides en fin de fichier, une seule fin de ligne.
  while (res.length && res[res.length - 1] === '') res.pop();
  return res.join('\n') + '\n';
}
