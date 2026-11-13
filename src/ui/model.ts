/** Modèle de la vue « code / état / monde » : pur et testable, sans DOM. */
import { filesIn, readFile, join } from '../shell/vfs';
import type { Guest, State } from '../state';
import { instAddr } from '../terraform/tfstate';

export type Status = 'ok' | 'new' | 'orphan' | 'unmanaged';
export interface ViewItem { key: string; type: string; label: string; detail: string[]; status: Status; id?: string; links: string[] }
export interface View { code: ViewItem[]; state: ViewItem[]; world: ViewItem[] }

const SHORT: Record<string, string> = { cloudpeda_network: 'réseau', cloudpeda_vm: 'machine', cloudpeda_firewall_rule: 'pare-feu', cloudpeda_dns_record: 'DNS', cloudpeda_volume: 'volume' };
export const shortType = (t: string): string => SHORT[t] ?? t;

function codeBlocks(st: State, dir: string): { type: string; name: string }[] {
  const out: { type: string; name: string }[] = [];
  for (const [f, text] of Object.entries(filesIn(st, dir))) {
    if (!f.endsWith('.tf')) continue;
    for (const m of text.matchAll(/^\s*resource\s+"([^"]+)"\s+"([^"]+)"/gm)) out.push({ type: m[1]!, name: m[2]! });
  }
  return out;
}

function stateInstances(st: State, dir: string): { addr: string; type: string; name: string; attrs: Record<string, any> }[] {
  const raw = readFile(st, join(dir, 'terraform.tfstate'));
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as { resources?: { type: string; name: string; instances: { index_key?: number | string; attributes: Record<string, any> }[] }[] };
    return (j.resources ?? []).flatMap(r => r.instances.map(i => ({ addr: instAddr(r.type, r.name, i.index_key), type: r.type, name: r.name, attrs: i.attributes })));
  } catch { return []; }
}

/** Libellé lisible d'un objet selon son type (une règle de pare-feu n'a pas de nom : on affiche son port). */
function describe(type: string, a: Record<string, any>): { label: string; extra: string[] } {
  const id = String(a['id']);
  switch (type) {
    case 'cloudpeda_firewall_rule': return { label: `port ${String(a['port'])}/${String(a['protocol'] ?? 'tcp')}`, extra: [`sur ${String(a['vm_id'])}`, `depuis ${String(a['source'] ?? '0.0.0.0/0')}`] };
    case 'cloudpeda_dns_record': return { label: String(a['name'] ?? id), extra: [`→ ${String(a['target_ip'])}`] };
    case 'cloudpeda_volume': return { label: String(a['name'] ?? id), extra: [`${String(a['size_gb'])} Go`, a['vm_id'] ? `sur ${String(a['vm_id'])}` : 'non attaché'] };
    case 'cloudpeda_network': return { label: String(a['name'] ?? id), extra: [String(a['cidr'])] };
    default: return { label: String(a['name'] ?? id), extra: [] };
  }
}

const guestLines = (g: Guest): string[] => {
  const pk = g.packages.filter(p => !['openssh-server', 'python3', 'sudo', 'snapd'].includes(p));
  const sv = Object.entries(g.services).filter(([n]) => n !== 'ssh').map(([n, s]) => `${n} ${s.active ? '▶' : '■'}`);
  return [...(pk.length ? [`paquets : ${pk.join(', ')}`] : []), ...(sv.length ? [`services : ${sv.join(', ')}`] : [])];
};

export function buildView(st: State, dir: string): View {
  const blocks = codeBlocks(st, dir);
  const insts = stateInstances(st, dir);
  const hasState = (b: { type: string; name: string }): boolean => insts.some(i => i.type === b.type && i.name === b.name);
  const code: ViewItem[] = blocks.map(b => ({ key: `${b.type}.${b.name}`, type: b.type, label: b.name, detail: [`${b.type}.${b.name}`], status: hasState(b) ? 'ok' : 'new', links: [] }));
  const state: ViewItem[] = insts.map(i => ({
    key: i.addr, type: i.type, label: describe(i.type, i.attrs).label, detail: [i.addr, ...describe(i.type, i.attrs).extra, `id = ${String(i.attrs['id'])}`],
    status: blocks.some(b => b.type === i.type && b.name === i.name) ? 'ok' : 'orphan', id: String(i.attrs['id']), links: [`${i.type}.${i.name}`],
  }));
  const managed = new Set(insts.map(i => `${i.type}:${String(i.attrs['id'])}`));
  const world: ViewItem[] = [];
  for (const [type, table] of Object.entries(st.cloud)) {
    for (const o of Object.values(table)) {
      const id = String(o['id']);
      const d = describe(type, o);
      const detail = [id, ...d.extra, ...(type === 'cloudpeda_vm' ? [`ip ${String(o['ip'])}`, ...guestLines(o['guest'] as Guest)] : [])];
      world.push({ key: `${type}:${id}`, type, label: d.label, detail, status: managed.has(`${type}:${id}`) ? 'ok' : 'unmanaged', id, links: [] });
    }
  }
  return { code, state, world };
}
