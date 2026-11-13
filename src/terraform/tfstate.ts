/**
 * Fichier d'état Terraform (terraform.tfstate), version simplifiée : même allure que l'original
 * (version, serial, lineage, outputs, resources/instances/attributes) mais sans les champs techniques.
 */
import { PROVIDER_SOURCE } from '../world/provider';

export interface InstState {
  addr: string; type: string; name: string; key?: number | string;
  attrs: Record<string, any>;
  /** Ressources dont celle-ci dépend (« type.nom »), pour détruire dans le bon ordre. */
  deps: string[];
}
export interface TfState {
  serial: number;
  lineage: string;
  outputs: Record<string, { value: any; sensitive: boolean }>;
  instances: Record<string, InstState>;
}

export const TERRAFORM_VERSION = '1.9.0';

export const instAddr = (type: string, name: string, key?: number | string): string =>
  `${type}.${name}${key === undefined ? '' : typeof key === 'number' ? `[${key}]` : `["${key}"]`}`;

/** Identifiant de lignée déterministe, dérivé du dossier. */
export function lineageFor(dir: string): string {
  let h = 2166136261;
  for (const c of `iaclab:${dir}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h); const b = hex(Math.imul(h, 2654435761)); const c = hex(Math.imul(h, 40503));
  return `${a}-${b.slice(0, 4)}-${b.slice(4)}-${c.slice(0, 4)}-${c.slice(4)}${a.slice(0, 4)}`;
}

export function emptyTfState(dir: string): TfState { return { serial: 0, lineage: lineageFor(dir), outputs: {}, instances: {} }; }

export function serialize(s: TfState): string {
  const groups = new Map<string, InstState[]>();
  for (const i of Object.values(s.instances)) {
    const k = `${i.type}.${i.name}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const resources = [...groups.keys()].sort().map(k => {
    const list = groups.get(k)!.sort((a, b) => a.addr.localeCompare(b.addr));
    return {
      mode: 'managed', type: list[0]!.type, name: list[0]!.name, provider: `provider["${PROVIDER_SOURCE}"]`,
      instances: list.map(i => ({ ...(i.key !== undefined ? { index_key: i.key } : {}), schema_version: 0, attributes: i.attrs, dependencies: i.deps })),
    };
  });
  const outputs: Record<string, unknown> = {};
  for (const [k, o] of Object.entries(s.outputs).sort(([a], [b]) => a.localeCompare(b))) outputs[k] = { value: o.value, type: typeof o.value === 'object' ? (Array.isArray(o.value) ? 'list' : 'object') : typeof o.value, ...(o.sensitive ? { sensitive: true } : {}) };
  return JSON.stringify({ version: 4, terraform_version: TERRAFORM_VERSION, serial: s.serial, lineage: s.lineage, outputs, resources }, null, 2) + '\n';
}

export function parseState(text: string): TfState {
  const j = JSON.parse(text) as any;
  const s: TfState = { serial: j.serial ?? 0, lineage: j.lineage ?? '', outputs: {}, instances: {} };
  for (const [k, o] of Object.entries<any>(j.outputs ?? {})) s.outputs[k] = { value: o.value, sensitive: !!o.sensitive };
  for (const r of j.resources ?? []) {
    for (const i of r.instances ?? []) {
      const key = i.index_key as number | string | undefined;
      const addr = instAddr(r.type, r.name, key);
      s.instances[addr] = { addr, type: r.type, name: r.name, ...(key !== undefined ? { key } : {}), attrs: i.attributes ?? {}, deps: i.dependencies ?? [] };
    }
  }
  return s;
}
