/** Affichage du plan, de l'état et des sorties, à la manière de Terraform (format simplifié). */
import { isUnknown } from '../hcl/eval';
import { RESOURCES } from '../world/provider';
import type { Drift, InstPlan, OutChange, PlanResult } from './walk';
import { same } from './walk';
import type { InstState, TfState } from './tfstate';

const SEP = '─'.repeat(77);

export function fmtScalar(v: any): string {
  if (isUnknown(v)) return '(known after apply)';
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(fmtScalar).join(', ')}]`;
  if (typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${k} = ${fmtScalar(x)}`).join(', ')} }`;
  return String(v);
}

/** Valeur multi-lignes (commande `output`, section « Outputs: »). */
export function fmtMulti(v: any, indent = ''): string {
  if (Array.isArray(v) && v.length) return `[\n${v.map(x => `${indent}  ${fmtMulti(x, indent + '  ')},`).join('\n')}\n${indent}]`;
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) {
    return `{\n${Object.entries(v).map(([k, x]) => `${indent}  ${k} = ${fmtMulti(x, indent + '  ')}`).join('\n')}\n${indent}}`;
  }
  if (Array.isArray(v)) return '[]';
  if (v && typeof v === 'object') return '{}';
  return fmtScalar(v);
}

const isSensitive = (type: string, attr: string): boolean => !!RESOURCES[type]?.attrs[attr]?.sensitive;
const show = (type: string, attr: string, v: any): string => (isSensitive(type, attr) && v !== undefined && v !== null) ? '(sensitive value)' : fmtScalar(v);

function pad(rows: { k: string }[]): number { return rows.reduce((m, r) => Math.max(m, r.k.length), 0); }

/** Bloc d'une ressource dans un plan (création, modification, remplacement, destruction). */
export function planBlock(i: InstPlan): string {
  const sym = { create: '+', update: '~', replace: '-/+', delete: '-', noop: ' ' }[i.action];
  const comment = {
    create: `# ${i.addr} will be created`, update: `# ${i.addr} will be updated in-place`,
    replace: `# ${i.addr} must be replaced`, delete: `# ${i.addr} will be destroyed`, noop: '',
  }[i.action];
  const out: string[] = [`  ${comment}`];
  if (i.action === 'delete' && i.reason) out.push(`  # (because ${i.reason})`);
  out.push(`${sym.length === 1 ? `  ${sym} ` : `${sym} `}resource "${i.type}" "${i.name}" {`);

  const prior = i.prior ?? {}; const planned = i.planned ?? {};
  const rows: { mark: string; k: string; v: string }[] = [];
  let hidden = 0;
  if (i.action === 'create') {
    for (const k of Object.keys(planned).sort()) if (planned[k] !== undefined && planned[k] !== null) rows.push({ mark: '+', k, v: show(i.type, k, planned[k]) });
  } else if (i.action === 'delete') {
    for (const k of Object.keys(prior).sort()) rows.push({ mark: '-', k, v: `${show(i.type, k, prior[k])} -> null` });
  } else {
    for (const k of [...new Set([...Object.keys(prior), ...Object.keys(planned)])].sort()) {
      const p = prior[k] === undefined ? null : prior[k];
      const n = planned[k] === undefined ? null : planned[k];
      const diff = isUnknown(n) ? !isUnknown(p) : !same(p, n);
      if (diff) {
        const forces = i.forces.includes(k) ? ' # forces replacement' : '';
        if (p === null) rows.push({ mark: '+', k, v: `${show(i.type, k, n)}${forces}` });
        else if (n === null) rows.push({ mark: '-', k, v: `${show(i.type, k, p)} -> null${forces}` });
        else rows.push({ mark: '~', k, v: `${show(i.type, k, p)} -> ${show(i.type, k, n)}${forces}` });
      } else if (k === 'id') rows.push({ mark: ' ', k, v: show(i.type, k, p) });
      else if (p !== null) hidden++;
    }
  }
  const w = pad(rows);
  const lines = rows.map(r => `${r.mark === ' ' ? '        ' : `      ${r.mark} `}${r.k.padEnd(w)} = ${r.v}`);
  if (hidden) lines.push(`        # (${hidden} unchanged attribute${hidden > 1 ? 's' : ''} hidden)`);
  return [...out, ...lines, '    }'].join('\n');
}

function counts(p: PlanResult): { add: number; change: number; destroy: number } {
  let add = 0, change = 0, destroy = 0;
  for (const i of p.instances) {
    if (i.action === 'create') add++;
    else if (i.action === 'update') change++;
    else if (i.action === 'delete') destroy++;
    else if (i.action === 'replace') { add++; destroy++; }
  }
  return { add, change, destroy };
}
export const planCounts = counts;

export function hasChanges(p: PlanResult): boolean {
  return p.instances.some(i => i.action !== 'noop') || p.outChanges.length > 0;
}

function outLine(c: OutChange): string {
  const val = (o?: { value: any; sensitive: boolean }): string => !o ? 'null' : o.sensitive ? '(sensitive value)' : fmtScalar(o.value);
  if (c.kind === 'create') return `  + ${c.name} = ${val(c.after)}`;
  if (c.kind === 'delete') return `  - ${c.name} = ${val(c.before)} -> null`;
  return `  ~ ${c.name} = ${val(c.before)} -> ${val(c.after)}`;
}

function driftBlock(d: Drift): string {
  const head = d.kind === 'deleted' ? `  # ${d.addr} has been deleted` : `  # ${d.addr} has changed`;
  const lines: string[] = [head];
  if (d.kind === 'deleted') {
    const keys = Object.keys(d.before).sort(); const w = Math.max(...keys.map(k => k.length));
    lines.push(`  - resource "${d.type}" "${d.addr.slice(d.type.length + 1).replace(/[[].*$/, '')}" {`);
    for (const k of keys) lines.push(`      - ${k.padEnd(w)} = ${show(d.type, k, d.before[k])} -> null`);
    lines.push('    }');
    return lines.join('\n');
  }
  const after = d.after ?? {};
  const keys = [...new Set([...Object.keys(d.before), ...Object.keys(after)])].sort();
  const rows: string[][] = []; let hidden = 0;
  for (const k of keys) {
    const p = d.before[k] ?? null; const n = after[k] ?? null;
    if (!same(p, n)) rows.push(['~', k, `${p === null ? 'null' : show(d.type, k, p)} -> ${n === null ? 'null' : show(d.type, k, n)}`]);
    else if (k === 'id') rows.push([' ', k, show(d.type, k, p)]);
    else if (p !== null) hidden++;
  }
  const w = Math.max(...rows.map(r => r[1]!.length));
  lines.push(`  ~ resource "${d.type}" "${d.addr.slice(d.type.length + 1).replace(/[[].*$/, '')}" {`);
  for (const r of rows) lines.push(r[0] === '~' ? `      ~ ${r[1]!.padEnd(w)} = ${r[2]!}` : `        ${r[1]!.padEnd(w)} = ${r[2]!}`);
  if (hidden) lines.push(`        # (${hidden} unchanged attribute${hidden > 1 ? 's' : ''} hidden)`);
  lines.push('    }');
  return lines.join('\n');
}

export function driftSection(p: PlanResult, refreshOnly: boolean): string {
  // Comme l'outil réel, un plan ordinaire ne montre que les écarts liés à une action proposée.
  const related = refreshOnly ? p.drift : p.drift.filter(d => p.instances.some(i => i.addr === d.addr && i.action !== 'noop'));
  if (!related.length) return '';
  const intro = refreshOnly
    ? 'Terraform detected the following changes made outside of Terraform since the\nlast "terraform apply":'
    : 'Terraform detected the following changes made outside of Terraform since the\nlast "terraform apply" which may have affected this plan:';
  const tail = refreshOnly ? '' : '\n\nUnless you have made equivalent changes to your configuration, or ignored the\nrelevant attributes using ignore_changes, the following plan may include\nactions to undo or respond to these changes.\n\n' + SEP;
  return `Note: Objects have changed outside of Terraform\n\n${intro}\n\n${related.map(d => driftBlock(d)).join('\n\n')}${tail}`;
}

/** Texte complet d'un plan (hors lignes « Refreshing state… »). */
export function renderPlan(p: PlanResult): string {
  const refreshOnly = p.mode === 'refresh-only';
  const drift = driftSection(p, refreshOnly);
  const parts: string[] = [];
  if (refreshOnly) {
    if (!drift) {
      parts.push('No changes. Your infrastructure still matches the configuration.\n\nTerraform has checked that the real remote objects still match the result of your most recent changes, and found no differences.');
    } else {
      parts.push(drift, 'This is a refresh-only plan, so Terraform will not take any actions to undo these.\nIf you were expecting these changes then you can apply this plan to record the\nupdated values in the Terraform state without changing any remote objects.');
    }
    return parts.join('\n\n');
  }
  if (drift) parts.push(drift);
  const acts = p.instances.filter(i => i.action !== 'noop');
  if (!acts.length && !p.outChanges.length) {
    parts.push('No changes. Your infrastructure matches the configuration.\n\nTerraform has compared your real infrastructure against your configuration\nand found no differences, so no changes are needed.');
    return parts.join('\n\n');
  }
  if (acts.length) {
    const sy: string[] = [];
    if (acts.some(i => i.action === 'create')) sy.push('  + create');
    if (acts.some(i => i.action === 'update')) sy.push('  ~ update in-place');
    if (acts.some(i => i.action === 'delete')) sy.push('  - destroy');
    if (acts.some(i => i.action === 'replace')) sy.push('-/+ destroy and then create replacement');
    parts.push(`Terraform used the selected providers to generate the following execution plan.\nResource actions are indicated with the following symbols:\n${sy.join('\n')}\n\nTerraform will perform the following actions:\n\n${acts.map(planBlock).join('\n\n')}`);
    const c = counts(p);
    parts.push(`Plan: ${c.add} to add, ${c.change} to change, ${c.destroy} to destroy.`);
  }
  if (p.outChanges.length) parts.push(`Changes to Outputs:\n${p.outChanges.map(outLine).join('\n')}`);
  return parts.join('\n\n');
}

/** Bloc d'une ressource dans `terraform show` / `state show`. */
export function stateBlock(i: InstState): string {
  const keys = Object.keys(i.attrs).filter(k => i.attrs[k] !== null && i.attrs[k] !== undefined).sort();
  const w = Math.max(0, ...keys.map(k => k.length));
  return [`# ${i.addr}:`, `resource "${i.type}" "${i.name}" {`, ...keys.map(k => `    ${k.padEnd(w)} = ${show(i.type, k, i.attrs[k])}`), '}'].join('\n');
}

export function outputLine(name: string, o: { value: any; sensitive: boolean }): string {
  return `${name} = ${o.sensitive ? '<sensitive>' : fmtMulti(o.value)}`;
}

export function renderState(ts: TfState): string {
  const list = Object.values(ts.instances).sort((a, b) => a.addr.localeCompare(b.addr));
  if (!list.length && !Object.keys(ts.outputs).length) return 'The state file is empty. No resources are represented.';
  const out = [list.map(stateBlock).join('\n\n')];
  const outs = Object.entries(ts.outputs).sort(([a], [b]) => a.localeCompare(b));
  if (outs.length) out.push(`\nOutputs:\n\n${outs.map(([n, o]) => outputLine(n, o)).join('\n')}`);
  return out.filter(Boolean).join('\n');
}
