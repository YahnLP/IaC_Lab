/**
 * Fournisseur fictif « cloudpeda » (cloud pédagogique) : réseau, machine virtuelle, règle de pare-feu,
 * enregistrement DNS, volume. Il joue le rôle de l'API d'un vrai fournisseur : Terraform lui parle,
 * la console (jalon M3) aussi, et Ansible agira sur l'état invité des machines (jalon M2).
 */
import type { CloudObject, Guest, State } from '../state';

export const PROVIDER_SOURCE = 'registry.example/ecole/cloudpeda';
export const PROVIDER_VERSION = '1.0.0';
export const PROVIDER_NAME = 'cloudpeda';

export type AttrType = 'string' | 'number' | 'bool';
export interface AttrDef {
  type: AttrType;
  required?: boolean;
  optional?: boolean;
  /** Décidé par le fournisseur (identifiant, adresse IP). */
  computed?: boolean;
  /** Modifier cet attribut oblige à détruire puis recréer la ressource. */
  forceNew?: boolean;
  enum?: readonly string[];
  sensitive?: boolean;
  default?: string | number | boolean;
  /** Retourne un message d'erreur si la valeur est invalide. */
  validate?: (v: any) => string | undefined;
}

export interface ResourceDef {
  type: string;
  attrs: Record<string, AttrDef>;
  /** Durées simulées, en secondes. */
  durations: { create: number; update: number; delete: number };
  /** Attribut utilisé pour détecter une homonymie (« existe déjà »). */
  uniqueName?: boolean;
}

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const validCidr = (v: any): string | undefined => {
  const m = CIDR.exec(String(v));
  if (!m || [m[1], m[2], m[3], m[4]].some(x => Number(x) > 255) || Number(m[5]) < 16 || Number(m[5]) > 30) {
    return `"${String(v)}" is not a valid IPv4 network (expected a:b:c:d/n with n between 16 and 30).`;
  }
  return undefined;
};
const validIp = (v: any): string | undefined => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(v)) && String(v).split('.').every(x => Number(x) <= 255) ? undefined : `"${String(v)}" is not a valid IPv4 address.`;

export const RESOURCES: Record<string, ResourceDef> = {
  cloudpeda_network: {
    type: 'cloudpeda_network', uniqueName: true, durations: { create: 2, update: 1, delete: 2 },
    attrs: {
      id: { type: 'string', computed: true },
      name: { type: 'string', required: true },
      cidr: { type: 'string', required: true, forceNew: true, validate: validCidr },
    },
  },
  cloudpeda_vm: {
    type: 'cloudpeda_vm', uniqueName: true, durations: { create: 18, update: 6, delete: 8 },
    attrs: {
      id: { type: 'string', computed: true },
      ip: { type: 'string', computed: true },
      name: { type: 'string', required: true },
      network_id: { type: 'string', required: true, forceNew: true },
      size: { type: 'string', optional: true, default: 'petite', enum: ['petite', 'moyenne', 'grande'] },
      image: { type: 'string', optional: true, forceNew: true, default: 'debian-12', enum: ['debian-12', 'ubuntu-24.04'] },
      admin_password: { type: 'string', optional: true, sensitive: true },
    },
  },
  cloudpeda_firewall_rule: {
    type: 'cloudpeda_firewall_rule', durations: { create: 1, update: 1, delete: 1 },
    attrs: {
      id: { type: 'string', computed: true },
      vm_id: { type: 'string', required: true, forceNew: true },
      port: { type: 'number', required: true, validate: v => Number.isInteger(v) && v >= 1 && v <= 65535 ? undefined : 'port must be an integer between 1 and 65535.' },
      protocol: { type: 'string', optional: true, default: 'tcp', enum: ['tcp', 'udp'] },
      source: { type: 'string', optional: true, default: '0.0.0.0/0', validate: v => /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(String(v)) ? undefined : `"${String(v)}" is not a valid IPv4 range (expected a:b:c:d/n).` },
    },
  },
  cloudpeda_dns_record: {
    type: 'cloudpeda_dns_record', uniqueName: true, durations: { create: 1, update: 1, delete: 1 },
    attrs: {
      id: { type: 'string', computed: true },
      name: { type: 'string', required: true, forceNew: true, validate: v => /^[a-z0-9.-]+\.example$/.test(String(v)) ? undefined : `"${String(v)}" must be a name in the .example zone.` },
      target_ip: { type: 'string', required: true, validate: validIp },
    },
  },
  cloudpeda_volume: {
    type: 'cloudpeda_volume', uniqueName: true, durations: { create: 3, update: 4, delete: 2 },
    attrs: {
      id: { type: 'string', computed: true },
      name: { type: 'string', required: true },
      size_gb: { type: 'number', required: true, validate: v => Number.isInteger(v) && v >= 1 && v <= 1000 ? undefined : 'size_gb must be an integer between 1 and 1000.' },
      vm_id: { type: 'string', optional: true },
    },
  },
};

export class ProviderError extends Error {}

const ID_PREFIX: Record<string, string> = {
  cloudpeda_network: 'net', cloudpeda_vm: 'vm', cloudpeda_firewall_rule: 'fw', cloudpeda_dns_record: 'dns', cloudpeda_volume: 'vol',
};
const KIND: Record<string, string> = {
  cloudpeda_network: 'network', cloudpeda_vm: 'virtual machine', cloudpeda_firewall_rule: 'firewall rule', cloudpeda_dns_record: 'DNS record', cloudpeda_volume: 'volume',
};

export const IMAGES: Record<string, () => Guest> = {
  'debian-12': () => ({
    packages: ['openssh-server', 'python3', 'sudo'],
    services: { ssh: { enabled: true, active: true } },
    files: { '/etc/hostname': { content: '', mode: '0644', owner: 'root' } },
    users: ['root', 'utilisateur'],
  }),
  'ubuntu-24.04': () => ({
    packages: ['openssh-server', 'python3', 'sudo', 'snapd'],
    services: { ssh: { enabled: true, active: true } },
    files: { '/etc/hostname': { content: '', mode: '0644', owner: 'root' } },
    users: ['root', 'utilisateur'],
  }),
};

function table(st: State, type: string): Record<string, CloudObject> { return (st.cloud[type] ??= {}); }
export function nextId(st: State, type: string): string {
  const p = ID_PREFIX[type] ?? 'obj';
  st.seq[p] = (st.seq[p] ?? 0) + 1;
  return `${p}-${String(st.seq[p]).padStart(4, '0')}`;
}

/** Attributs visibles par Terraform (ceux du schéma). */
export function publicAttrs(type: string, obj: CloudObject): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(RESOURCES[type]!.attrs)) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

export function exists(st: State, type: string, id: string): boolean { return !!st.cloud[type]?.[id]; }

function findByName(st: State, type: string, name: string, except?: string): CloudObject | undefined {
  return Object.values(table(st, type)).find(o => o.name === name && o.id !== except);
}

function allocateIp(st: State, net: CloudObject): string {
  const m = CIDR.exec(String(net.cidr))!;
  const prefix = Number(m[5]);
  const base = ((Number(m[1]) << 24) | (Number(m[2]) << 16) | (Number(m[3]) << 8) | Number(m[4])) >>> 0;
  const size = 2 ** (32 - prefix);
  const used = new Set(Object.values(table(st, 'cloudpeda_vm')).filter(v => v.network_id === net.id).map(v => v.ip));
  for (let off = 10; off < size - 1; off++) {
    const ip = (base + off) >>> 0;
    const s = `${ip >>> 24}.${(ip >>> 16) & 255}.${(ip >>> 8) & 255}.${ip & 255}`;
    if (!used.has(s)) return s;
  }
  throw new ProviderError(`network "${String(net.name)}" has no free address left`);
}

/** Valeurs par défaut du schéma appliquées aux arguments fournis. */
export function withDefaults(type: string, args: Record<string, any>): Record<string, any> {
  const out = { ...args };
  for (const [k, d] of Object.entries(RESOURCES[type]!.attrs)) if (out[k] === undefined && d.default !== undefined) out[k] = d.default;
  return out;
}

/** Messages d'erreur de validation de valeurs connues (enum, plages, formats). */
export function validateArgs(type: string, args: Record<string, any>): { attr: string; message: string }[] {
  const def = RESOURCES[type]!;
  const errs: { attr: string; message: string }[] = [];
  for (const [k, v] of Object.entries(args)) {
    const a = def.attrs[k];
    if (!a || v === null || v === undefined) continue;
    if (a.enum && !a.enum.includes(String(v))) errs.push({ attr: k, message: `expected ${k} to be one of [${a.enum.map(x => `"${x}"`).join(', ')}], got ${JSON.stringify(v)}.` });
    else if (a.validate) { const m = a.validate(v); if (m) errs.push({ attr: k, message: m }); }
  }
  return errs;
}

export function createResource(st: State, type: string, args: Record<string, any>): Record<string, any> {
  const def = RESOURCES[type];
  if (!def) throw new ProviderError(`unknown resource type ${type}`);
  const a = withDefaults(type, args);
  const bad = validateArgs(type, a)[0];
  if (bad) throw new ProviderError(`invalid value for ${bad.attr}: ${bad.message}`);
  if (def.uniqueName && findByName(st, type, a.name)) {
    throw new ProviderError(`creating ${KIND[type]} "${String(a.name)}": a ${KIND[type]} with this name already exists`);
  }
  const t = table(st, type);
  const obj: CloudObject = { ...a };
  switch (type) {
    case 'cloudpeda_vm': {
      const net = table(st, 'cloudpeda_network')[a.network_id];
      if (!net) throw new ProviderError(`creating ${KIND[type]} "${String(a.name)}": network "${String(a.network_id)}" not found`);
      obj.ip = allocateIp(st, net);
      obj.guest = IMAGES[a.image]!();
      obj.guest.files['/etc/hostname']!.content = `${String(a.name)}\n`;
      break;
    }
    case 'cloudpeda_firewall_rule': {
      if (!exists(st, 'cloudpeda_vm', a.vm_id)) throw new ProviderError(`creating ${KIND[type]}: virtual machine "${String(a.vm_id)}" not found`);
      const dup = Object.values(t).find(r => r.vm_id === a.vm_id && r.port === a.port && r.protocol === a.protocol);
      if (dup) throw new ProviderError(`creating ${KIND[type]}: a rule for ${String(a.protocol)}/${String(a.port)} already exists on this virtual machine`);
      break;
    }
    case 'cloudpeda_volume':
      if (a.vm_id && !exists(st, 'cloudpeda_vm', a.vm_id)) throw new ProviderError(`creating ${KIND[type]} "${String(a.name)}": virtual machine "${String(a.vm_id)}" not found`);
      break;
    default: break;
  }
  obj.id = nextId(st, type);
  t[obj.id] = obj;
  return publicAttrs(type, obj);
}

export function readResource(st: Readonly<State>, type: string, id: string): Record<string, any> | null {
  const o = st.cloud[type]?.[id];
  return o ? publicAttrs(type, o) : null;
}

export function updateResource(st: State, type: string, id: string, args: Record<string, any>): Record<string, any> {
  const def = RESOURCES[type]!;
  const t = table(st, type);
  const cur = t[id];
  if (!cur) throw new ProviderError(`updating ${KIND[type]} "${id}": not found`);
  const a = withDefaults(type, args);
  const bad = validateArgs(type, a)[0];
  if (bad) throw new ProviderError(`invalid value for ${bad.attr}: ${bad.message}`);
  if (def.uniqueName && a.name !== cur.name && findByName(st, type, a.name, id)) {
    throw new ProviderError(`updating ${KIND[type]} "${String(a.name)}": a ${KIND[type]} with this name already exists`);
  }
  if (type === 'cloudpeda_volume' && a.size_gb < cur.size_gb) {
    throw new ProviderError(`updating volume "${String(cur.name)}": a volume cannot be shrunk (${String(cur.size_gb)} GB to ${String(a.size_gb)} GB)`);
  }
  if (type === 'cloudpeda_volume' && a.vm_id && !exists(st, 'cloudpeda_vm', a.vm_id)) {
    throw new ProviderError(`updating volume "${String(cur.name)}": virtual machine "${String(a.vm_id)}" not found`);
  }
  for (const [k, d] of Object.entries(def.attrs)) {
    if (d.computed) continue;
    if (a[k] === undefined || a[k] === null) delete cur[k]; else cur[k] = a[k];
  }
  return publicAttrs(type, cur);
}

export function deleteResource(st: State, type: string, id: string): void {
  const t = table(st, type);
  const cur = t[id];
  if (!cur) throw new ProviderError(`deleting ${KIND[type]} "${id}": not found`);
  if (type === 'cloudpeda_network' && Object.values(table(st, 'cloudpeda_vm')).some(v => v.network_id === id)) {
    throw new ProviderError(`deleting network "${String(cur.name)}": the network still has virtual machines attached`);
  }
  if (type === 'cloudpeda_vm') {
    if (Object.values(table(st, 'cloudpeda_firewall_rule')).some(r => r.vm_id === id)) throw new ProviderError(`deleting virtual machine "${String(cur.name)}": firewall rules are still attached to it`);
    if (Object.values(table(st, 'cloudpeda_volume')).some(v => v.vm_id === id)) throw new ProviderError(`deleting virtual machine "${String(cur.name)}": volumes are still attached to it`);
  }
  delete t[id];
}

/** Modification « à la main » (console du fournisseur) : sans passer par Terraform. */
export function setAttribute(st: State, type: string, id: string, attr: string, value: any): void {
  const cur = st.cloud[type]?.[id];
  const def = RESOURCES[type];
  if (!cur || !def) throw new ProviderError(`${type} "${id}" not found`);
  const d = def.attrs[attr];
  if (!d || d.computed) throw new ProviderError(`attribute ${attr} cannot be changed`);
  const bad = validateArgs(type, { [attr]: value })[0];
  if (bad) throw new ProviderError(`invalid value for ${attr}: ${bad.message}`);
  cur[attr] = value;
}
