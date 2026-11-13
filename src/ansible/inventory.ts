/** Inventaire au format INI : hôtes, groupes, [groupe:vars], [groupe:children]. */
export interface Inventory {
  hosts: Record<string, Record<string, any>>;
  groups: Record<string, { hosts: string[]; vars: Record<string, any>; children: string[] }>;
}

export class InventoryError extends Error { constructor(public msg: string, public line: number) { super(msg); } }

function value(s: string): any {
  const t = s.trim().replace(/^(["'])(.*)\1$/, '$2');
  if (/^-?\d+$/.test(t)) return Number(t);
  if (t === 'true' || t === 'True') return true;
  if (t === 'false' || t === 'False') return false;
  return t;
}

function words(s: string): string[] {
  const out: string[] = []; let cur = ''; let q: string | null = null;
  for (const c of s) {
    if (q) { if (c === q) q = null; else cur += c; }
    else if (c === '"' || c === "'") q = c;
    else if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseInventory(text: string): Inventory {
  const inv: Inventory = { hosts: {}, groups: { all: { hosts: [], vars: {}, children: [] }, ungrouped: { hosts: [], vars: {}, children: [] } } };
  let cur = 'ungrouped'; let kind: 'hosts' | 'vars' | 'children' = 'hosts';
  const grp = (g: string): Inventory['groups'][string] => (inv.groups[g] ??= { hosts: [], vars: {}, children: [] });
  const lines = text.split('\n');
  lines.forEach((raw, k) => {
    const line = raw.replace(/\s+[#;].*$/, '').replace(/^\s*[#;].*$/, '').trim();
    if (!line) return;
    const h = /^\[([^\]:]+)(?::(vars|children))?\]$/.exec(line);
    if (h) { cur = h[1]!; kind = (h[2] as 'vars' | 'children' | undefined) ?? 'hosts'; grp(cur); return; }
    if (line.startsWith('[')) throw new InventoryError(`Invalid section entry: '${line}'. Please make sure that there are no spaces or other characters in the section entry.`, k + 1);
    if (kind === 'vars') {
      const eq = line.indexOf('=');
      if (eq < 1) throw new InventoryError(`Invalid variable assignment: '${line}'. Expected key=value.`, k + 1);
      grp(cur).vars[line.slice(0, eq).trim()] = value(line.slice(eq + 1));
      return;
    }
    if (kind === 'children') { grp(cur).children.push(line); grp(line); return; }
    const [name, ...rest] = words(line);
    const vars: Record<string, any> = {};
    for (const w of rest) {
      const eq = w.indexOf('=');
      if (eq < 1) throw new InventoryError(`Expected key=value host variable assignment, got: ${w}`, k + 1);
      vars[w.slice(0, eq)] = value(w.slice(eq + 1));
    }
    inv.hosts[name!] = { ...(inv.hosts[name!] ?? {}), ...vars };
    if (!grp(cur).hosts.includes(name!)) grp(cur).hosts.push(name!);
  });
  // « all » contient tout ; « ungrouped » les hôtes sans groupe.
  const grouped = new Set<string>();
  for (const [g, d] of Object.entries(inv.groups)) if (g !== 'all' && g !== 'ungrouped') for (const x of membersOf(inv, g)) grouped.add(x);
  inv.groups['ungrouped']!.hosts = Object.keys(inv.hosts).filter(x => !grouped.has(x));
  inv.groups['all']!.hosts = Object.keys(inv.hosts);
  return inv;
}

export function membersOf(inv: Inventory, g: string, seen = new Set<string>()): string[] {
  if (seen.has(g)) return [];
  seen.add(g);
  const gr = inv.groups[g];
  if (!gr) return [];
  const out = new Set(gr.hosts);
  for (const c of gr.children) for (const h of membersOf(inv, c, seen)) out.add(h);
  return [...out];
}

/** Groupes auxquels appartient un hôte (hors « all »). */
export function groupsOf(inv: Inventory, host: string): string[] {
  return Object.keys(inv.groups).filter(g => g !== 'all' && g !== 'ungrouped' && membersOf(inv, g).includes(host)).sort();
}

/** Variables d'un hôte : « all », puis groupes (enfants prioritaires), puis variables de l'hôte. */
export function hostVars(inv: Inventory, host: string): Record<string, any> {
  const out: Record<string, any> = { ...inv.groups['all']!.vars };
  for (const g of groupsOf(inv, host)) Object.assign(out, inv.groups[g]!.vars);
  return Object.assign(out, inv.hosts[host]);
}

/** Sélection d'hôtes : « all », un groupe, un hôte, ou plusieurs séparés par « : » (« !x » exclut). */
export function selectHosts(inv: Inventory, pattern: string): string[] {
  const out: string[] = [];
  const excl = new Set<string>();
  for (const p of pattern.split(/[:,]/).map(x => x.trim()).filter(Boolean)) {
    const neg = p.startsWith('!');
    const name = neg ? p.slice(1) : p;
    const list = name === 'all' || name === '*' ? Object.keys(inv.hosts) : inv.groups[name] ? membersOf(inv, name) : inv.hosts[name] ? [name] : [];
    if (neg) list.forEach(x => excl.add(x)); else for (const x of list) if (!out.includes(x)) out.push(x);
  }
  return out.filter(x => !excl.has(x));
}
