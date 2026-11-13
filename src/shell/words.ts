/** Découpe une ligne de commande en mots, avec guillemets simples et doubles (sous-ensemble minimal du shell). */
export function splitWords(line: string): string[] {
  const out: string[] = [];
  let cur = ''; let has = false; let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null; else cur += c;
    } else if (c === '"' || c === "'") { quote = c; has = true; }
    else if (c === ' ' || c === '\t') { if (has || cur) { out.push(cur); cur = ''; has = false; } }
    else cur += c;
  }
  if (quote) throw new Error('guillemet non fermé');
  if (has || cur) out.push(cur);
  return out;
}
