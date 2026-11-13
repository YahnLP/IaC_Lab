/** Interface : arborescence, éditeur, terminal et vue SVG. Tout le texte est inséré via textContent. */
import type { Lab } from '../engine';
import { buildView, shortType, type Status, type ViewItem } from './model';
import { Session } from './session';

const NS = 'http://www.w3.org/2000/svg';
const COLOR: Record<Status, string> = { ok: 'var(--ok)', new: 'var(--new)', orphan: 'var(--bad)', unmanaged: 'var(--unm)' };
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function startApp(lab: Lab, hooks: { save(): void; reset(): void }): void {
  const sess = new Session(lab, 'brasserie');
  let current: string | null = null;
  const history: string[] = []; let hpos = 0;
  const out = $('out'), cmd = $<HTMLInputElement>('cmd'), ed = $<HTMLTextAreaElement>('ed');

  function print(text: string, cls = ''): void {
    const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text === '' ? ' ' : text; out.appendChild(d); out.scrollTop = out.scrollHeight;
  }
  function refreshPrompt(): void { $('prompt').textContent = sess.prompt; }

  function renderTree(): void {
    const tree = $('tree'); tree.replaceChildren();
    const all = Object.keys(lab.getState().files).sort().filter(f => !f.endsWith('.keep') && !f.includes('/.terraform/'));
    let lastDir = '';
    for (const f of all) {
      const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
      if (dir !== lastDir) { const d = document.createElement('li'); d.className = 'dir'; d.textContent = `${dir || '/'}/`; tree.appendChild(d); lastDir = dir; }
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      b.textContent = f.slice(f.lastIndexOf('/') + 1); b.title = f; if (f === current) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => openFile(f)); li.appendChild(b); tree.appendChild(li);
    }
  }
  function gutter(): void { const n = ed.value.split('\n').length; $('gutter').textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  function openFile(path: string): void {
    const c = lab.getState().files[path]; if (c === undefined) return;
    current = path; ed.disabled = false; ed.value = c; $<HTMLButtonElement>('save').disabled = false;
    $('edtitle').textContent = `Éditeur — ${path}`; $('edmsg').textContent = ''; gutter(); renderTree();
  }
  function save(): void {
    if (!current) return;
    lab.dispatch('fs.write', { path: current, content: ed.value }); $('edmsg').textContent = 'Enregistré.'; hooks.save(); refresh();
  }

  function box(svg: SVGSVGElement, x: number, y: number, w: number, it: ViewItem): void {
    const g = document.createElementNS(NS, 'g');
    const h = 22 + it.detail.length * 14;
    const r = document.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: h, rx: 6, fill: 'var(--panel2)', stroke: COLOR[it.status], 'stroke-width': 2 })) r.setAttribute(k, String(v));
    g.appendChild(r);
    const t = document.createElementNS(NS, 'text'); t.setAttribute('x', String(x + 8)); t.setAttribute('y', String(y + 15)); t.textContent = `${shortType(it.type)} · ${it.label}`; g.appendChild(t);
    it.detail.forEach((d, i) => { const m = document.createElementNS(NS, 'text'); m.setAttribute('class', 'mut'); m.setAttribute('x', String(x + 8)); m.setAttribute('y', String(y + 30 + i * 14)); m.textContent = d; g.appendChild(m); });
    const title = document.createElementNS(NS, 'title'); title.textContent = `${it.label} — ${({ ok: 'synchronisé', new: 'à créer', orphan: 'orphelin', unmanaged: 'hors Terraform' } as const)[it.status]}`; g.appendChild(title);
    svg.appendChild(g);
  }
  function drawView(): void {
    const v = buildView(lab.getState(), sess.cwd);
    const cols: [string, ViewItem[]][] = [['Code (.tf)', v.code], ['État (tfstate)', v.state], ['Monde réel', v.world]];
    const W = 170, GAP = 24; const heights = cols.map(([, items]) => items.reduce((a, i) => a + 22 + i.detail.length * 14 + 10, 30));
    const H = Math.max(120, ...heights) + 10;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${3 * W + 2 * GAP} ${H}`); svg.setAttribute('width', '100%'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Code : ${v.code.length} ressources, état : ${v.state.length}, monde réel : ${v.world.length}`);
    const pos = new Map<string, { x: number; y: number }>();
    cols.forEach(([title, items], c) => {
      const x = c * (W + GAP); const t = document.createElementNS(NS, 'text'); t.setAttribute('x', String(x)); t.setAttribute('y', '14'); t.setAttribute('class', 'mut'); t.textContent = title; svg.appendChild(t);
      let y = 24;
      for (const it of items) { box(svg, x, y, W, it); pos.set(`${c}:${it.key}`, { x: x + W, y: y + 11 }); y += 22 + it.detail.length * 14 + 10; }
    });
    const arrow = (a: { x: number; y: number } | undefined, b: { x: number; y: number } | undefined): void => {
      if (!a || !b) return; const l = document.createElementNS(NS, 'line');
      for (const [k, val] of Object.entries({ x1: a.x, y1: a.y, x2: b.x - W, y2: b.y, stroke: 'var(--mut)', 'stroke-width': 1, 'stroke-dasharray': '3 3' })) l.setAttribute(k, String(val));
      svg.insertBefore(l, svg.firstChild);
    };
    for (const s of v.state) { arrow(pos.get(`0:${s.links[0]}`), pos.get(`1:${s.key}`)); const w = v.world.find(o => o.type === s.type && o.id === s.id); if (w) arrow(pos.get(`1:${s.key}`), pos.get(`2:${w.key}`)); }
    $('svgwrap').replaceChildren(svg);
  }
  function refresh(): void { renderTree(); drawView(); refreshPrompt(); }

  function run(line: string): void {
    print(`${sess.prompt}${line}`, 'in');
    if (line.trim() && !sess.pendingAnswer) history.push(line); hpos = history.length;
    for (const l of sess.exec(line)) { if (l.text === '\f') out.replaceChildren(); else print(l.text, l.kind === 'out' ? '' : l.kind); }
    if (sess.openRequest) { openFile(sess.openRequest); sess.openRequest = null; }
    hooks.save(); refresh();
    if (current && lab.getState().files[current] !== undefined && document.activeElement !== ed) ed.value = lab.getState().files[current]!, gutter();
  }

  cmd.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const l = cmd.value; cmd.value = ''; run(l); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) cmd.value = history[--hpos] ?? ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cmd.value = ++hpos < history.length ? history[hpos]! : ''; if (hpos > history.length) hpos = history.length; }
  });
  ed.addEventListener('input', gutter);
  ed.addEventListener('scroll', () => { $('gutter').scrollTop = ed.scrollTop; });
  ed.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = ed.selectionStart; ed.setRangeText('  ', s, ed.selectionEnd, 'end'); gutter(); }
  });
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', () => { if (confirm('Repartir de zéro ? Vos fichiers et le monde simulé seront effacés.')) hooks.reset(); });

  print('IaC Lab — tapez « help ». Premier pas : terraform init', 'info'); print('', '');
  refresh(); openFile('brasserie/main.tf'); cmd.focus();
}
