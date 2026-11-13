import { describe, expect, it } from 'vitest';
import { createLab } from '../../src/engine';
import { SEED } from './seed';
import { buildView } from '../../src/ui/model';
import { Session } from '../../src/ui/session';

function fresh() {
  const lab = createLab();
  for (const [p, c] of Object.entries(SEED)) lab.dispatch('fs.write', { path: p, content: c });
  return { lab, s: new Session(lab, 'brasserie') };
}
const text = (ls: { text: string }[]) => ls.map(l => l.text).join('\n');

describe('session', () => {
  it('apply demande confirmation puis applique', () => {
    const { s } = fresh();
    s.exec('terraform init');
    s.exec('terraform apply');
    expect(s.pendingAnswer).not.toBeNull();
    expect(text(s.exec('yes'))).toContain('Apply complete! Resources: 2 added');
    expect(s.pendingAnswer).toBeNull();
  });
  it('commandes de base', () => {
    const { s } = fresh();
    expect(text(s.exec('ls'))).toContain('main.tf');
    expect(text(s.exec('cat inexistant'))).toContain('No such file');
    s.exec('cd ..'); expect(s.cwd).toBe('');
    expect(text(s.exec('foo'))).toContain('command not found');
    s.exec('edit brasserie/main.tf'); expect(s.openRequest).toBe('brasserie/main.tf');
  });
});

describe('vue code / état / monde', () => {
  it('à créer, synchronisé, hors Terraform, orphelin', () => {
    const { lab, s } = fresh();
    expect(buildView(lab.getState() as any, 'brasserie').code.every(i => i.status === 'new')).toBe(true);
    s.exec('terraform init'); s.exec('terraform apply'); s.exec('yes');
    expect(buildView(lab.getState() as any, 'brasserie').world.every(i => i.status === 'ok')).toBe(true);
    s.exec('cloud set vm-0001 size grande');
    s.exec('cloud vms');
    lab.dispatch('cloud.create', { type: 'cloudpeda_volume', args: { name: 'v', size_gb: 10 } });
    const v = buildView(lab.getState() as any, 'brasserie');
    expect(v.world.some(i => i.status === 'unmanaged')).toBe(true);
    lab.dispatch('fs.write', { path: 'brasserie/main.tf', content: '' });
    expect(buildView(lab.getState() as any, 'brasserie').state.every(i => i.status === 'orphan')).toBe(true);
  });
});
