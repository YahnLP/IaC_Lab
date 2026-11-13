/** Interface : arborescence, éditeur, terminal et vue SVG. Tout le texte est inséré via textContent. */
import type { Lab } from '../engine';
import { CATALOG, tpById } from '../tp/catalog';
import { SELF_LEVELS, answerQuestion, checkTp, exportSave, importSave, isComplete, nextHint, rateSelf, startTp, type Progress } from '../tp/engine';
import type { Tp } from '../tp/types';
import { buildReport, reportHtml, reportJson } from '../tp/report';
import { buildView, shortType, type Status, type ViewItem } from './model';
import { Session } from './session';

const NS = 'http://www.w3.org/2000/svg';
const COLOR: Record<Status, string> = { ok: 'var(--ok)', new: 'var(--new)', orphan: 'var(--bad)', unmanaged: 'var(--unm)' };
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function startApp(init: { tp: string; lab: Lab; progress: Progress }, hooks: { save(text: string): void; reset(): void }): void {
  let lab = init.lab; let progress = init.progress; let tp: Tp = tpById(init.tp) ?? CATALOG[0]!;
  let sess = new Session(lab, tp.dir);
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
    lab.dispatch('fs.write', { path: current, content: ed.value }); $('edmsg').textContent = 'Enregistré.'; persist(); refresh();
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
  function persist(): void { checkTp(tp, lab.getState(), progress); hooks.save(exportSave(tp.id, lab, progress)); }
  function renderMission(): void {
    const sel = $<HTMLSelectElement>('tpsel');
    if (!sel.options.length) for (const t of CATALOG) { const o = document.createElement('option'); o.value = t.id; o.textContent = `${t.num} — ${t.title}`; sel.appendChild(o); }
    sel.value = tp.id;
    const para = (t: string, cls = ''): HTMLParagraphElement => { const p = document.createElement('p'); p.textContent = t; if (cls) p.className = cls; return p; };
    $('brief').replaceChildren(
      para(`${tp.num} · ${tp.minutes} min · compétences (à valider) : ${tp.skills.join(', ')}`, 'mut'),
      para(tp.intention, 'mut'),
      ...(tp.myth ? [para(`Idée reçue : « ${tp.myth} »`, 'mut')] : []),
      ...tp.brief.split('\n\n').map(t => para(t)));
    const res = checkTp(tp, lab.getState(), progress);
    $('objs').replaceChildren(...res.filter(r => !r.objective.id.startsWith('q:')).map(r => { const li = document.createElement('li'); li.textContent = `${progress.exam ? '•' : r.ok ? '✔' : '○'} ${r.objective.label}`; li.className = progress.exam ? '' : `${r.ok ? 'ok' : ''} ${r.sticky ? 'sticky' : ''}`.trim(); return li; }));
    const qbox = $('quest'); qbox.replaceChildren();
    for (const q of tp.questions ?? []) {
      const field = document.createElement('fieldset'); const lg = document.createElement('legend');
      const okQ = res.find(r => r.objective.id === `q:${q.id}`)?.ok ?? false; lg.textContent = `${okQ && !progress.exam ? '✔ ' : ''}${q.prompt}`; field.appendChild(lg);
      const fb = document.createElement('div'); fb.setAttribute('role', 'status');
      q.choices.forEach((c, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
        b.addEventListener('click', () => { const r = answerQuestion(tp, progress, q.id, i); persist(); renderMission(); const again = $('quest').querySelector(`[data-q="${q.id}"]`); if (again) again.textContent = progress.exam ? 'Réponse enregistrée.' : `${r.ok ? 'Exact. ' : 'Pas tout à fait. '}${r.ok ? r.explain : 'Relisez la consigne et réessayez.'}`; });
        field.appendChild(b);
      });
      fb.dataset['q'] = q.id; field.appendChild(fb); qbox.appendChild(field);
    }
    const sbox = $('self'); sbox.replaceChildren();
    for (const it of tp.selfEval ?? []) {
      const f = document.createElement('fieldset'); const lg = document.createElement('legend'); lg.textContent = it.text; f.appendChild(lg);
      SELF_LEVELS.forEach((lv, i) => {
        const lab2 = document.createElement('label'); const r = document.createElement('input'); r.type = 'radio'; r.name = `self-${it.id}`; r.checked = progress.self[it.id] === i;
        r.addEventListener('change', () => { rateSelf(tp, progress, it.id, i); persist(); renderMission(); });
        lab2.append(r, ` ${lv}`); f.appendChild(lab2);
      });
      sbox.appendChild(f);
    }
    $<HTMLButtonElement>('hintbtn').disabled = progress.exam;
    $<HTMLInputElement>('exam').checked = progress.exam;
    if (isComplete(res) && !progress.exam) $('hint').textContent = `Mission accomplie. ${tp.bilan}`;
    else if (isComplete(res)) $('hint').textContent = 'Toutes les consignes sont traitées. Le détail est dans le compte rendu.';
  }
  function load(next: { tp: string; lab: Lab; progress: Progress }): void {
    lab = next.lab; progress = next.progress; tp = tpById(next.tp) ?? CATALOG[0]!; sess = new Session(lab, tp.dir);
    current = null; ed.value = ''; ed.disabled = true; out.replaceChildren(); $('hint').textContent = ''; $<HTMLButtonElement>('save').disabled = true; $('edtitle').textContent = 'Éditeur';
    print(`${tp.num} — ${tp.title}. Tapez « help » pour la liste des commandes.`, 'info'); print('', '');
    persist(); refresh(); const first = Object.keys(lab.getState().files).sort().find(f => f.endsWith('.tf') || f.endsWith('.yml')); if (first) openFile(first); cmd.focus();
  }
  function refresh(): void { renderMission(); renderTree(); drawView(); refreshPrompt(); }

  function run(line: string): void {
    print(`${sess.prompt}${line}`, 'in');
    if (line.trim() && !sess.pendingAnswer) history.push(line); hpos = history.length;
    for (const l of sess.exec(line)) { if (l.text === '\f') out.replaceChildren(); else print(l.text, l.kind === 'out' ? '' : l.kind); }
    if (sess.openRequest) { openFile(sess.openRequest); sess.openRequest = null; }
    progress.commands[tp.id] = (progress.commands[tp.id] ?? 0) + (line.trim() ? 1 : 0);
    persist(); refresh();
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
  $('tpsel').addEventListener('change', () => { const t = tpById($<HTMLSelectElement>('tpsel').value); if (t) load({ tp: t.id, lab: startTp(t), progress }); });
  $('restart').addEventListener('click', () => { if (confirm('Recommencer ce TP ? Votre travail dans ce TP sera effacé.')) { delete progress.done[tp.id]; load({ tp: tp.id, lab: startTp(tp), progress }); } });
  $('hintbtn').addEventListener('click', () => { if (progress.exam) return; const h = nextHint(tp, progress); $('hint').textContent = h ?? 'Plus d’indice : demandez à votre enseignant.'; persist(); });
  $('exam').addEventListener('change', () => { progress.exam = $<HTMLInputElement>('exam').checked; $('hint').textContent = progress.exam ? 'Mode examen : pas d’indices, pas de retour sur les réponses.' : ''; persist(); renderMission(); });
  const report = () => buildReport(CATALOG, progress, { tp: tp.id, state: lab.getState() }, { student: $<HTMLInputElement>('repname').value.trim(), group: $<HTMLInputElement>('repgroup').value.trim(), date: new Date().toLocaleDateString('fr-FR') });
  const download = (name: string, text: string, type: string): void => { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
  $('report').addEventListener('click', () => $<HTMLDialogElement>('repdlg').showModal());
  $('rephtml').addEventListener('click', () => download('iaclab-compte-rendu.html', reportHtml(report()), 'text/html'));
  $('repjson').addEventListener('click', () => download('iaclab-compte-rendu.json', reportJson(report()), 'application/json'));
  $('repopen').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([reportHtml(report())], { type: 'text/html' })); window.open(url, '_blank'); });
  $('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([exportSave(tp.id, lab, progress)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `iaclab-${tp.id}.json`; a.click(); URL.revokeObjectURL(url);
  });
  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async e => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    try { const s = importSave(await f.text()); if (!tpById(s.tp)) throw new Error('TP inconnu dans cette version.'); load(s); }
    catch (err) { print(err instanceof Error ? err.message : String(err), 'err'); }
    (e.target as HTMLInputElement).value = '';
  });
  $('reset').addEventListener('click', () => { if (confirm('Repartir de zéro ? Vos fichiers et le monde simulé seront effacés.')) hooks.reset(); });

  load({ tp: tp.id, lab, progress });
}
