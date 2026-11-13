/** Diagnostics à la manière de Terraform (cadre « ╷ │ ╵ », fichier, ligne, extrait de code). */
export interface Diag {
  severity: 'Error' | 'Warning';
  summary: string;
  detail?: string;
  file?: string;
  line?: number;
  /** Contexte, par exemple « in resource "cloudpeda_vm" "web" ». */
  ctx?: string;
  /** Adresse de ressource concernée (« with cloudpeda_vm.web, »). */
  with?: string;
}

export class TfError extends Error {
  constructor(public diags: Diag[]) { super(diags[0]?.summary ?? 'erreur'); }
}

const WIDTH = 76;

function wrap(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') { out.push(''); continue; }
    if (/^\s/.test(para)) { out.push(para); continue; }
    let cur = '';
    for (const w of para.split(' ')) {
      if (cur && (cur + ' ' + w).length > WIDTH) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
  }
  return out;
}

export function formatDiag(d: Diag, sources: Record<string, string>): string {
  const lines: string[] = [`${d.severity}: ${d.summary}`];
  if (d.with || (d.file && d.line)) {
    lines.push('');
    if (d.with) lines.push(`  with ${d.with},`);
    if (d.file && d.line) {
      lines.push(`  on ${d.file} line ${d.line}${d.ctx ? `, ${d.ctx}` : ''}:`);
      const src = sources[d.file]?.split('\n')[d.line - 1];
      if (src !== undefined) lines.push(`${String(d.line).padStart(4)}: ${src.replace(/\r$/, '')}`);
    }
  }
  if (d.detail) { lines.push(''); lines.push(...wrap(d.detail)); }
  return ['╷', ...lines.map(l => (l ? `│ ${l}` : '│')), '╵'].join('\n');
}

export function formatDiags(ds: Diag[], sources: Record<string, string>): string {
  return ds.map(d => formatDiag(d, sources)).join('\n');
}
