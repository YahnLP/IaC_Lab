/** Différences entre deux contenus, au format « unified » simplifié (un seul bloc). */
function lines(s: string): string[] {
  if (s === '') return [];
  const l = s.split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l;
}

export function unifiedDiff(path: string, before: string | null, after: string, newFileLabel?: string): string {
  const a = before === null ? [] : lines(before);
  const b = lines(after);
  // PLSC (programmation dynamique) puis parcours.
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  type Op = { t: ' ' | '-' | '+'; s: string };
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ t: ' ', s: a[i]! }); i++; j++; }
    else if (j < m && (i === n || L[i]![j + 1]! >= L[i + 1]![j]!)) { ops.push({ t: '+', s: b[j]! }); j++; }
    else { ops.push({ t: '-', s: a[i]! }); i++; }
  }
  const first = ops.findIndex(o => o.t !== ' ');
  if (first < 0) return '';
  let last = ops.length - 1; while (ops[last]!.t === ' ') last--;
  const from = Math.max(0, first - 3); const to = Math.min(ops.length - 1, last + 3);
  const hunk = ops.slice(from, to + 1);
  const before0 = ops.slice(0, from).filter(o => o.t !== '+').length;
  const after0 = ops.slice(0, from).filter(o => o.t !== '-').length;
  const cOld = hunk.filter(o => o.t !== '+').length; const cNew = hunk.filter(o => o.t !== '-').length;
  const f = (start: number, c: number): string => c === 1 ? `${start}` : `${start},${c}`;
  const sOld = cOld === 0 ? before0 : before0 + 1; const sNew = cNew === 0 ? after0 : after0 + 1;
  return [`--- before${before === null ? '' : `: ${path}`}`, `+++ after: ${newFileLabel ?? path}`, `@@ -${f(sOld, cOld)} +${f(sNew, cNew)} @@`, ...hunk.map(o => `${o.t}${o.s}`)].join('\n');
}
