/** Constructeurs d'objectifs : chaque fonction renvoie un `Objective` lisible dans un énoncé de TP. */
import { readFile } from '../shell/vfs';
import type { Guest, State } from '../state';
import { runTerraform } from '../terraform/commands';
import type { Objective } from './types';

const vms = (st: Readonly<State>): Record<string, any>[] => Object.values(st.cloud['cloudpeda_vm'] ?? {});
export const vmByName = (st: Readonly<State>, name: string): Record<string, any> | undefined => vms(st).find(v => v['name'] === name);

export const fileContains = (id: string, label: string, path: string, re: RegExp): Objective => ({
  id, label, check: st => re.test(readFile(st, path) ?? ''),
});

export const worldHas = (id: string, label: string, type: string, match: Record<string, unknown>): Objective => ({
  id, label, check: st => Object.values(st.cloud[type] ?? {}).some(o => Object.entries(match).every(([k, v]) => o[k] === v)),
});

export const worldEmpty = (id: string, label: string): Objective => ({
  id, label, check: st => Object.values(st.cloud).every(t => Object.keys(t).length === 0),
});

/** `terraform plan` ne prévoit rien (sur une copie : l'état réel n'est pas touché). */
export const planClean = (id: string, label: string, dir: string): Objective => ({
  id, label,
  check: st => {
    if (readFile(st, `${dir}/terraform.tfstate`) === undefined) return false;
    const copy = structuredClone(st) as State;
    const r = runTerraform(copy, { dir, args: ['plan', '-detailed-exitcode'] });
    return r.ok && r.code === 0;
  },
});

export const stateHas = (id: string, label: string, dir: string, addr: string): Objective => ({
  id, label, check: st => (readFile(st, `${dir}/terraform.tfstate`) ?? '').includes(`"name": "${addr.split('.')[1] ?? ''}"`) && (readFile(st, `${dir}/terraform.tfstate`) ?? '').includes(`"type": "${addr.split('.')[0] ?? ''}"`),
});

export const guest = (id: string, label: string, vm: string, test: (g: Guest) => boolean): Objective => ({
  id, label, check: st => { const v = vmByName(st, vm); return !!v && test(v['guest'] as Guest); },
});
