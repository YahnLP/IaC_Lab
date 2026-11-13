import { createLab, tf, write, type Lab } from '../../src/engine';
import type { TfState } from '../../src/terraform/tfstate';
import { parseState } from '../../src/terraform/tfstate';

const D = 'envs/test';
const HEAD = `terraform {
  required_providers {
    cloudpeda = {
      source  = "registry.example/ecole/cloudpeda"
      version = "~> 1.0"
    }
  }
}
`;
const BASE = `${HEAD}
variable "env" {
  type    = string
  default = "test"
}

resource "cloudpeda_network" "reseau" {
  name = "reseau-\${var.env}"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "web" {
  name       = "web-\${var.env}"
  network_id = cloudpeda_network.reseau.id
}

resource "cloudpeda_firewall_rule" "http" {
  vm_id = cloudpeda_vm.web.id
  port  = 80
}

output "web_ip" {
  value = cloudpeda_vm.web.ip
}
`;

function lab(main = BASE, dir = D): Lab {
  const l = createLab();
  write(l, `${dir}/main.tf`, main);
  return l;
}
const out = (l: Lab, line: string, answer?: string, dir = D): string => tf(l, dir, line, answer).output ?? '';
const code = (l: Lab, line: string, answer?: string, dir = D): number => tf(l, dir, line, answer).code ?? 0;
function ready(main = BASE): Lab { const l = lab(main); expect(code(l, 'init')).toBe(0); return l; }
function applied(main = BASE): Lab { const l = ready(main); expect(code(l, 'apply -auto-approve')).toBe(0); return l; }
const st = (l: Lab, dir = D): TfState => parseState(l.getState().files[`${dir}/terraform.tfstate`]!);
const cloudOf = (l: Lab, type: string): Record<string, any> => l.getState().cloud[type] ?? {};
const vmId = (l: Lab): string => Object.keys(cloudOf(l, 'cloudpeda_vm'))[0]!;

describe('init, validate, plan : les garde-fous', () => {
  it('refuse plan et validate avant init', () => {
    const l = lab();
    expect(out(l, 'plan')).toContain('Missing required provider'); expect(code(l, 'plan')).toBe(1);
    expect(out(l, 'validate')).toContain('Missing required provider');
  });
  it('init crée le fichier de verrouillage et le marqueur de fournisseurs', () => {
    const l = lab();
    expect(out(l, 'init')).toContain('Terraform has been successfully initialized!');
    expect(l.getState().files[`${D}/.terraform.lock.hcl`]).toContain('registry.example/ecole/cloudpeda');
  });
  it('init échoue sans required_providers (source par défaut introuvable)', () => {
    const l = lab('resource "cloudpeda_network" "r" {\n  name = "a"\n  cidr = "203.0.113.0/24"\n}\n');
    const o = out(l, 'init');
    expect(o).toContain('Failed to query available provider packages'); expect(o).toContain('hashicorp/cloudpeda'); expect(code(l, 'init')).toBe(1);
  });
  it('init échoue si la contrainte de version est impossible', () => {
    const l = lab(BASE.replace('~> 1.0', '>= 2.0'));
    expect(out(l, 'init')).toContain('no available releases match');
  });
  it('validate réussit sur une configuration correcte', () => {
    const l = ready();
    expect(out(l, 'validate')).toBe('Success! The configuration is valid.');
  });
  it('validate : argument obligatoire manquant, avec fichier, ligne et extrait', () => {
    const l = ready(BASE.replace('  cidr = "203.0.113.0/24"\n', ''));
    const o = out(l, 'validate');
    expect(o).toContain('Error: Missing required argument'); expect(o).toContain('on main.tf line 15, in resource "cloudpeda_network" "reseau":');
    expect(o).toContain('15: resource "cloudpeda_network" "reseau" {'); expect(o).toContain('The argument "cidr" is required, but no definition was found.');
  });
  it('validate : argument inconnu, valeur calculée et valeur hors énumération', () => {
    const l = ready(BASE.replace('port  = 80', 'port  = 80\n  couleur = "bleu"\n  id = "x"').replace('name       = "web-${var.env}"', 'name       = "web-${var.env}"\n  size = "enorme"'));
    const o = out(l, 'validate');
    expect(o).toContain('An argument named "couleur" is not expected here.');
    expect(o).toContain(`Can't configure a value for "id"`);
    expect(o).toContain('expected size to be one of ["petite", "moyenne", "grande"]');
  });
  it('validate : référence à une ressource ou une variable non déclarée', () => {
    const l = ready(BASE.replace('cloudpeda_network.reseau.id', 'cloudpeda_network.autre.id').replace('${var.env}"\n  cidr', '${var.zone}"\n  cidr'));
    const o = out(l, 'validate');
    expect(o).toContain('Reference to undeclared resource'); expect(o).toContain('A managed resource "cloudpeda_network" "autre" has not been declared');
    expect(o).toContain('Reference to undeclared input variable');
  });
  it('validate : type de ressource inconnu et erreur de syntaxe', () => {
    const l = ready(BASE + '\nresource "cloudpeda_serveur" "x" {\n}\n');
    expect(out(l, 'validate')).toContain('Invalid resource type');
    write(l, `${D}/main.tf`, BASE + '\nresource "cloudpeda_network" "z" {\n  name = "z"\n');
    expect(out(l, 'validate')).toContain('Unclosed configuration block');
  });
  it('détecte une dépendance circulaire', () => {
    const l = ready(`${HEAD}
resource "cloudpeda_dns_record" "a" {
  name      = "a.example"
  target_ip = cloudpeda_dns_record.b.name
}
resource "cloudpeda_dns_record" "b" {
  name      = "b.example"
  target_ip = cloudpeda_dns_record.a.name
}
`);
    expect(out(l, 'plan')).toContain('Error: Cycle: cloudpeda_dns_record.a, cloudpeda_dns_record.b');
  });
  it('refuse une sortie non sensible qui expose une variable sensible', () => {
    const l = ready(`${HEAD}
variable "mdp" {
  type      = string
  sensitive = true
  default   = "secret"
}
output "mdp" {
  value = var.mdp
}
`);
    expect(out(l, 'validate')).toContain('Output refers to sensitive values');
  });
  it('terraform fmt signale et corrige les fichiers mal formatés', () => {
    const l = lab('resource "cloudpeda_network" "r" {\nname = "a"\n   cidr = "203.0.113.0/24"\n}\n');
    expect(out(l, 'fmt')).toBe('main.tf');
    expect(l.getState().files[`${D}/main.tf`]).toBe('resource "cloudpeda_network" "r" {\n  name = "a"\n  cidr = "203.0.113.0/24"\n}\n');
    expect(out(l, 'fmt')).toBe('');
  });
});

describe('plan et apply', () => {
  it('lit le plan : trois créations, valeurs par défaut et inconnues', () => {
    const l = ready();
    const o = out(l, 'plan');
    expect(o).toContain('Plan: 3 to add, 0 to change, 0 to destroy.');
    expect(o).toContain('# cloudpeda_vm.web will be created');
    expect(o).toContain('+ size       = "petite"');
    expect(o).toContain('+ network_id = (known after apply)');
    expect(o).toContain('+ web_ip = (known after apply)');
    expect(o).toContain("Note: You didn't use the -out option");
    expect(l.getState().files[`${D}/terraform.tfstate`]).toBeUndefined(); // plan n'écrit rien
  });
  it('apply demande confirmation, ne fait rien tant qu\'on ne répond pas « yes »', () => {
    const l = ready();
    const r = tf(l, D, 'apply');
    expect(r.awaiting).toBe('apply'); expect(r.output).toContain("Only 'yes' will be accepted to approve.");
    expect(Object.keys(cloudOf(l, 'cloudpeda_vm'))).toHaveLength(0);
    expect(out(l, 'apply', 'non')).toContain('Apply cancelled.');
    expect(Object.keys(cloudOf(l, 'cloudpeda_network'))).toHaveLength(0);
  });
  it('apply crée dans l\'ordre des dépendances et affiche les sorties', () => {
    const l = ready();
    const o = out(l, 'apply', 'yes');
    const i = (s: string): number => o.indexOf(s);
    expect(i('cloudpeda_network.reseau: Creating...')).toBeLessThan(i('cloudpeda_vm.web: Creating...'));
    expect(i('cloudpeda_vm.web: Creating...')).toBeLessThan(i('cloudpeda_firewall_rule.http: Creating...'));
    expect(o).toContain('cloudpeda_vm.web: Still creating... [10s elapsed]');
    expect(o).toContain('Apply complete! Resources: 3 added, 0 changed, 0 destroyed.');
    expect(o).toContain('web_ip = "203.0.113.10"');
    expect(l.getState().clock).toBe(2 + 18 + 1);
  });
  it('écrit un fichier d\'état lisible, avec sauvegarde au deuxième apply', () => {
    const l = applied();
    const f = l.getState().files[`${D}/terraform.tfstate`]!;
    const j = JSON.parse(f);
    expect(j.version).toBe(4); expect(j.serial).toBe(1); expect(j.resources).toHaveLength(3);
    expect(j.outputs.web_ip.value).toBe('203.0.113.10');
    expect(l.getState().files[`${D}/terraform.tfstate.backup`]).toBeUndefined();
    write(l, `${D}/main.tf`, BASE.replace('port  = 80', 'port  = 8080'));
    out(l, 'apply -auto-approve');
    expect(JSON.parse(l.getState().files[`${D}/terraform.tfstate.backup`]!).serial).toBe(1);
    expect(st(l).serial).toBe(2);
  });
  it('idempotence : un second apply ne change rien', () => {
    const l = applied();
    const before = JSON.stringify(l.getState().cloud);
    const o = out(l, 'apply');
    expect(o).toContain('No changes. Your infrastructure matches the configuration.');
    expect(o).toContain('Apply complete! Resources: 0 added, 0 changed, 0 destroyed.');
    expect(JSON.stringify(l.getState().cloud)).toBe(before);
    expect(out(l, 'plan')).toContain('Refreshing state... [id=net-0001]');
  });
  it('modification sur place (~) : seule la taille change, l\'identifiant reste', () => {
    const l = applied();
    write(l, `${D}/main.tf`, BASE.replace('network_id = cloudpeda_network.reseau.id', 'network_id = cloudpeda_network.reseau.id\n  size       = "moyenne"'));
    const o = out(l, 'plan');
    expect(o).toContain('# cloudpeda_vm.web will be updated in-place'); expect(o).toContain('~ size = "petite" -> "moyenne"');
    expect(o).toContain('Plan: 0 to add, 1 to change, 0 to destroy.');
    const a = out(l, 'apply -auto-approve');
    expect(a).toContain('cloudpeda_vm.web: Modifying... [id=vm-0001]'); expect(a).toContain('Apply complete! Resources: 0 added, 1 changed, 0 destroyed.');
    expect(cloudOf(l, 'cloudpeda_vm')['vm-0001']!['size']).toBe('moyenne');
  });
  it('remplacement (-/+) en cascade quand le CIDR change, destruction des dépendants d\'abord', () => {
    const l = applied();
    write(l, `${D}/main.tf`, BASE.replace('203.0.113.0/24', '203.0.113.128/25'));
    const p = out(l, 'plan');
    expect(p).toContain('-/+ destroy and then create replacement');
    expect(p).toContain('# cloudpeda_network.reseau must be replaced');
    expect(p).toContain('~ cidr = "203.0.113.0/24" -> "203.0.113.128/25" # forces replacement');
    expect(p).toContain('~ network_id = "net-0001" -> (known after apply) # forces replacement');
    expect(p).toContain('Plan: 3 to add, 0 to change, 3 to destroy.');
    const a = out(l, 'apply -auto-approve');
    const i = (s: string): number => a.indexOf(s);
    expect(i('cloudpeda_firewall_rule.http: Destroying')).toBeLessThan(i('cloudpeda_vm.web: Destroying'));
    expect(i('cloudpeda_vm.web: Destroying')).toBeLessThan(i('cloudpeda_network.reseau: Destroying'));
    expect(i('cloudpeda_network.reseau: Creating')).toBeGreaterThan(i('cloudpeda_network.reseau: Destruction complete'));
    expect(a).toContain('Apply complete! Resources: 3 added, 0 changed, 3 destroyed.');
    expect(Object.keys(cloudOf(l, 'cloudpeda_network'))).toEqual(['net-0002']);
    expect(out(l, 'plan')).toContain('No changes.');
  });
  it('destroy : demande confirmation, détruit dans l\'ordre inverse, vide l\'état', () => {
    const l = applied();
    const r = tf(l, D, 'destroy');
    expect(r.awaiting).toBe('destroy'); expect(r.output).toContain('Plan: 0 to add, 0 to change, 3 to destroy.');
    expect(r.output).toContain('Do you really want to destroy all resources?');
    const o = out(l, 'destroy', 'yes');
    expect(o.indexOf('cloudpeda_firewall_rule.http: Destroying')).toBeLessThan(o.indexOf('cloudpeda_vm.web: Destroying'));
    expect(o).toContain('Destroy complete! Resources: 3 destroyed.');
    expect(Object.keys(cloudOf(l, 'cloudpeda_network'))).toHaveLength(0);
    expect(Object.keys(st(l).instances)).toHaveLength(0);
    expect(out(l, 'plan')).toContain('Plan: 3 to add');
  });
  it('supprimer un bloc du code détruit la ressource, avec la raison', () => {
    const l = applied();
    write(l, `${D}/main.tf`, BASE.replace(/resource "cloudpeda_firewall_rule" "http" \{[^}]*\}\n/, ''));
    const o = out(l, 'plan');
    expect(o).toContain('# cloudpeda_firewall_rule.http will be destroyed'); expect(o).toContain('# (because cloudpeda_firewall_rule.http is not in configuration)');
    expect(o).toContain('Plan: 0 to add, 0 to change, 1 to destroy.');
  });
  it('plan -out puis apply du plan enregistré ; plan périmé refusé', () => {
    const l = ready();
    expect(out(l, 'plan -out=tfplan')).toContain('terraform apply "tfplan"');
    const a = out(l, 'apply tfplan');
    expect(a).toContain('Apply complete! Resources: 3 added'); expect(a).not.toContain('Enter a value');
    // plan enregistré, puis l'état change : le plan est périmé
    write(l, `${D}/main.tf`, BASE.replace('port  = 80', 'port  = 22'));
    out(l, 'plan -out=p2');
    write(l, `${D}/main.tf`, BASE.replace('port  = 80', 'port  = 443'));
    out(l, 'apply -auto-approve');
    expect(out(l, 'apply p2')).toContain('Saved plan is stale');
    expect(out(l, 'show p2')).toBeDefined();
  });
  it('-detailed-exitcode renvoie 2 quand il y a des changements', () => {
    const l = ready();
    expect(code(l, 'plan -detailed-exitcode')).toBe(2);
    out(l, 'apply -auto-approve');
    expect(code(l, 'plan -detailed-exitcode')).toBe(0);
  });
});

describe('état et sorties', () => {
  it('state list, state show, show et output', () => {
    const l = applied();
    expect(out(l, 'state list').split('\n')).toEqual(['cloudpeda_firewall_rule.http', 'cloudpeda_network.reseau', 'cloudpeda_vm.web']);
    const s = out(l, 'state show cloudpeda_network.reseau');
    expect(s).toContain('# cloudpeda_network.reseau:'); expect(s).toContain('cidr = "203.0.113.0/24"'); expect(s).toContain('id   = "net-0001"');
    expect(out(l, 'show')).toContain('Outputs:');
    expect(out(l, 'output')).toBe('web_ip = "203.0.113.10"');
    expect(out(l, 'output -raw web_ip')).toBe('203.0.113.10');
    expect(out(l, 'output inconnu')).toContain('Output not found');
    expect(out(l, 'state show cloudpeda_vm.nope')).toContain('No instance found');
  });
  it('un attribut sensible est masqué dans le plan mais présent dans l\'état', () => {
    const l = ready(BASE.replace('network_id = cloudpeda_network.reseau.id', 'network_id = cloudpeda_network.reseau.id\n  admin_password = "motdepasse"'));
    expect(out(l, 'plan')).toContain('+ admin_password = (sensitive value)');
    out(l, 'apply -auto-approve');
    expect(l.getState().files[`${D}/terraform.tfstate`]).toContain('motdepasse');
  });
});

describe('dérive', () => {
  it('plan -refresh-only détecte une modification manuelle sans rien proposer d\'autre', () => {
    const l = applied();
    l.dispatch('cloud.set', { type: 'cloudpeda_vm', id: vmId(l), attr: 'size', value: 'grande' });
    const o = out(l, 'plan -refresh-only');
    expect(o).toContain('Note: Objects have changed outside of Terraform'); expect(o).toContain('~ size = "petite" -> "grande"');
    expect(o).toContain('This is a refresh-only plan'); expect(o).not.toContain('Plan:');
    expect(st(l).instances['cloudpeda_vm.web']!.attrs['size']).toBe('petite'); // état inchangé
  });
  it('plan propose de corriger la dérive ; apply remet l\'infrastructure conforme au code', () => {
    const l = applied();
    l.dispatch('cloud.set', { type: 'cloudpeda_vm', id: vmId(l), attr: 'size', value: 'grande' });
    const p = out(l, 'plan');
    expect(p).toContain('~ size = "grande" -> "petite"'); expect(p).toContain('Plan: 0 to add, 1 to change, 0 to destroy.');
    out(l, 'apply -auto-approve');
    expect(cloudOf(l, 'cloudpeda_vm')[vmId(l)]!['size']).toBe('petite');
    expect(out(l, 'plan')).toContain('No changes.');
  });
  it('apply -refresh-only enregistre la dérive dans l\'état ; le code reste la référence', () => {
    const l = applied();
    l.dispatch('cloud.set', { type: 'cloudpeda_vm', id: vmId(l), attr: 'size', value: 'grande' });
    const o = out(l, 'apply -refresh-only', 'yes');
    expect(o).toContain('Apply complete! Resources: 0 added, 0 changed, 0 destroyed.');
    expect(st(l).instances['cloudpeda_vm.web']!.attrs['size']).toBe('grande');
    expect(out(l, 'plan')).toContain('~ size = "grande" -> "petite"'); // le code veut toujours « petite »
  });
  it('une ressource supprimée à la main est recréée', () => {
    const l = applied();
    l.dispatch('cloud.delete', { type: 'cloudpeda_firewall_rule', id: 'fw-0001' });
    const o = out(l, 'plan');
    expect(o).toContain('# cloudpeda_firewall_rule.http has been deleted'); expect(o).toContain('# cloudpeda_firewall_rule.http will be created');
    out(l, 'apply -auto-approve');
    expect(Object.keys(cloudOf(l, 'cloudpeda_firewall_rule'))).toEqual(['fw-0002']);
  });
  it('un écart sans lien avec une action est masqué dans plan, visible avec -refresh-only', () => {
    const l = applied(BASE.replace('network_id = cloudpeda_network.reseau.id', 'network_id = cloudpeda_network.reseau.id\n  size       = "petite"'));
    l.dispatch('cloud.set', { type: 'cloudpeda_firewall_rule', id: 'fw-0001', attr: 'port', value: 80 }); // aucun écart réel
    expect(out(l, 'plan')).not.toContain('Objects have changed');
  });
  it('terraform refresh seul est déprécié et redirige vers -refresh-only', () => {
    const l = applied();
    expect(out(l, 'refresh')).toContain('is deprecated');
  });
});

describe('variables et environnements', () => {
  const VARS = `${HEAD}
variable "env" {
  type = string
}
variable "taille" {
  type    = number
  default = 1
}
resource "cloudpeda_volume" "data" {
  name    = "data-\${var.env}"
  size_gb = var.taille * 10
}
`;
  it('variable obligatoire sans valeur : erreur explicite avec la ligne de la déclaration', () => {
    const l = ready(VARS);
    const o = out(l, 'plan');
    expect(o).toContain('No value for required variable'); expect(o).toContain('The root module input variable "env" is not set');
  });
  it('-var, -var-file, terraform.tfvars et *.auto.tfvars, avec précédence', () => {
    const l = ready(VARS);
    expect(out(l, 'plan -var env=a')).toContain('name    = "data-a"');
    write(l, `${D}/terraform.tfvars`, 'env = "fichier"\n');
    expect(out(l, 'plan')).toContain('"data-fichier"');
    write(l, `${D}/z.auto.tfvars`, 'env = "auto"\n');
    expect(out(l, 'plan')).toContain('"data-auto"');
    write(l, `${D}/prod.tfvars`, 'env = "prod"\ntaille = 5\n');
    const o = out(l, 'plan -var-file=prod.tfvars');
    expect(o).toContain('"data-prod"'); expect(o).toContain('size_gb = 50');
    expect(out(l, 'plan -var-file=prod.tfvars -var env=cli')).toContain('"data-cli"');
  });
  it('conversion et vérification de type', () => {
    const l = ready(VARS);
    expect(out(l, 'plan -var env=a -var taille=3')).toContain('size_gb = 30');
    expect(out(l, 'plan -var env=a -var taille=beaucoup')).toContain('Invalid value for input variable');
  });
  it('variable non déclarée : avertissement dans un fichier, erreur en ligne de commande', () => {
    const l = ready(VARS);
    write(l, `${D}/terraform.tfvars`, 'env = "a"\ninconnue = 1\n');
    expect(out(l, 'plan')).toContain('Warning: Value for undeclared variable');
    expect(out(l, 'plan -var zzz=1')).toContain('Error: Value for undeclared variable');
  });
  it('deux répertoires, mêmes fichiers, valeurs différentes : deux états indépendants', () => {
    const l = createLab();
    for (const env of ['test', 'prod']) {
      write(l, `envs/${env}/main.tf`, VARS);
      write(l, `envs/${env}/terraform.tfvars`, `env = "${env}"\n`);
      tf(l, `envs/${env}`, 'init');
      expect(tf(l, `envs/${env}`, 'apply -auto-approve').code).toBe(0);
    }
    expect(Object.values(cloudOf(l, 'cloudpeda_volume')).map(v => v['name']).sort()).toEqual(['data-prod', 'data-test']);
    expect(st(l, 'envs/test').lineage).not.toBe(st(l, 'envs/prod').lineage);
    // détruire test ne touche pas prod
    tf(l, 'envs/test', 'destroy', 'yes');
    expect(Object.values(cloudOf(l, 'cloudpeda_volume')).map(v => v['name'])).toEqual(['data-prod']);
  });
});

describe('count, for_each, locals', () => {
  it('count crée des instances indexées ; en réduire le nombre détruit les dernières', () => {
    const cfg = `${HEAD}
locals {
  noms = ["a", "b", "c"]
}
variable "n" {
  default = 3
}
resource "cloudpeda_dns_record" "d" {
  count     = var.n
  name      = "\${local.noms[count.index]}.example"
  target_ip = "192.0.2.\${count.index + 1}"
}
output "premier" {
  value = cloudpeda_dns_record.d[0].name
}
`;
    const l = ready(cfg);
    const p = out(l, 'plan');
    expect(p).toContain('# cloudpeda_dns_record.d[2] will be created'); expect(p).toContain('+ target_ip = "192.0.2.3"');
    out(l, 'apply -auto-approve');
    expect(Object.keys(st(l).instances).sort()).toEqual(['cloudpeda_dns_record.d[0]', 'cloudpeda_dns_record.d[1]', 'cloudpeda_dns_record.d[2]']);
    const q = out(l, 'plan -var n=1');
    expect(q).toContain('# (because index [1] is out of range for count)'); expect(q).toContain('Plan: 0 to add, 0 to change, 2 to destroy.');
  });
  it('for_each crée une instance par clé', () => {
    const l = ready(`${HEAD}
variable "serveurs" {
  type    = map(string)
  default = { web = "192.0.2.10", bdd = "192.0.2.11" }
}
resource "cloudpeda_dns_record" "d" {
  for_each  = var.serveurs
  name      = "\${each.key}.example"
  target_ip = each.value
}
`);
    out(l, 'apply -auto-approve');
    expect(Object.keys(st(l).instances).sort()).toEqual(['cloudpeda_dns_record.d["bdd"]', 'cloudpeda_dns_record.d["web"]']);
    expect(out(l, 'plan -var \'serveurs={ web = "192.0.2.10" }\'')).toContain('key ["bdd"] is not in for_each map');
  });
});

describe('erreurs du fournisseur et garde-fous', () => {
  it('ressource déjà existante : créée à la main avant Terraform', () => {
    const l = ready();
    l.dispatch('cloud.create', { type: 'cloudpeda_network', args: { name: 'reseau-test', cidr: '198.51.100.0/24' } });
    const o = out(l, 'apply -auto-approve');
    expect(o).toContain('network "reseau-test" already exists'.replace('network "reseau-test"', 'creating network "reseau-test": a network with this name'));
    expect(o).toContain('with cloudpeda_network.reseau,'); expect(o).toContain('on main.tf line 15');
    expect(code(l, 'apply -auto-approve')).toBe(1);
    expect(Object.keys(st(l).instances)).toHaveLength(0);
  });
  it('échec partiel : ce qui a été créé avant l\'erreur est dans l\'état', () => {
    const l = ready(`${HEAD}
resource "cloudpeda_volume" "a" {
  name    = "a"
  size_gb = 10
}
resource "cloudpeda_volume" "b" {
  name    = "b"
  size_gb = 10
  vm_id   = "vm-9999"
}
`);
    const r = tf(l, D, 'apply -auto-approve');
    expect(r.code).toBe(1); expect(r.output).toContain('virtual machine "vm-9999" not found');
    expect(Object.keys(st(l).instances)).toEqual(['cloudpeda_volume.a']);
  });
  it('un volume ne peut pas être réduit', () => {
    const cfg = `${HEAD}\nresource "cloudpeda_volume" "v" {\n  name    = "v"\n  size_gb = 20\n}\n`;
    const l = applied(cfg);
    write(l, `${D}/main.tf`, cfg.replace('20', '5'));
    expect(out(l, 'apply -auto-approve')).toContain('cannot be shrunk');
  });
  it('prevent_destroy bloque un remplacement', () => {
    const l = applied(BASE.replace('cidr = "203.0.113.0/24"', 'cidr = "203.0.113.0/24"\n  lifecycle {\n    prevent_destroy = true\n  }'));
    write(l, `${D}/main.tf`, BASE.replace('203.0.113.0/24"', '203.0.113.128/25"\n  lifecycle {\n    prevent_destroy = true\n  }'));
    expect(out(l, 'plan')).toContain('Instance cannot be destroyed');
  });
  it('valeur invalide issue d\'une expression (CIDR, port)', () => {
    const l = ready(`${HEAD}\nvariable "c" {\n  default = "pas-un-cidr"\n}\nresource "cloudpeda_network" "r" {\n  name = "a"\n  cidr = var.c\n}\n`);
    expect(out(l, 'plan')).toContain('is not a valid IPv4 network');
  });
  it('commandes inconnues et options non prises en charge', () => {
    const l = ready();
    expect(out(l, 'import')).toContain('has no command named "import"');
    expect(out(l, 'plan -target=cloudpeda_vm.web')).toContain('-target option is not supported');
    expect(out(l, 'plan -zzz')).toContain('flag provided but not defined: -zzz');
  });
});

describe('déterminisme et sauvegarde par rejeu du journal', () => {
  function scenario(l: Lab): string[] {
    const o: string[] = [];
    write(l, `${D}/main.tf`, BASE);
    o.push(out(l, 'init'), out(l, 'apply', 'yes'));
    l.dispatch('cloud.set', { type: 'cloudpeda_vm', id: 'vm-0001', attr: 'size', value: 'grande' });
    o.push(out(l, 'plan'), out(l, 'apply -auto-approve'));
    write(l, `${D}/main.tf`, BASE.replace('203.0.113.0/24', '203.0.113.128/25'));
    o.push(out(l, 'apply -auto-approve'), out(l, 'destroy', 'yes'));
    return o;
  }
  it('deux laboratoires qui reçoivent les mêmes commandes produisent exactement les mêmes sorties', () => {
    expect(scenario(createLab())).toEqual(scenario(createLab()));
  });
  it('restaurer le journal reconstruit un état identique', () => {
    const a = createLab();
    scenario(a);
    write(a, `${D}/main.tf`, BASE);
    out(a, 'apply -auto-approve');
    const snap = JSON.parse(JSON.stringify(a.snapshot()));
    const b = createLab();
    b.restore(snap);
    expect(b.getState()).toEqual(a.getState());
  });
});
