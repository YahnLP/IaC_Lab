/** Génère les documents dérivés du catalogue (une seule source de vérité : le code). */
import { CATALOG } from '../src/tp/catalog';
import { EN_VRAI, SIMPLIFICATIONS } from '../src/ui/info';

const STAGES: Record<number, string> = { 0: 'Pourquoi décrire l’infrastructure en code', 1: 'Provisionner (Terraform)', 2: 'L’état et la dérive', 3: 'Configurer (Ansible)', 4: 'Les deux ensemble', 5: 'Bilan' };
const COMP: Record<string, string> = {
  'B2.2': 'Installer, tester et déployer une solution d’infrastructure réseau',
  'B2.3': 'Exploiter, dépanner et superviser une solution d’infrastructure réseau',
  'B3.4': 'Garantir la disponibilité, l’intégrité et la confidentialité des services informatiques et des données de l’organisation face à des cyberattaques',
};
const hm = (m: number): string => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
const NOTE = '> Document généré par `npm run docs` à partir du catalogue de TP. Ne pas modifier à la main.\n';

export function couverture(): string {
  const L: string[] = ['# Couverture des compétences', '', NOTE,
    'Les codes sont ceux du [référentiel du site](https://github.com/YahnLP/BTS-SIO1-gustave-eiffel/blob/main/docs/ressources/referentiel.md) (B2.2, B2.3, B3.4 : usage courant, pas des codes de l’arrêté). **Le rattachement de chaque TP à une compétence est une proposition de l’auteur, à valider par l’enseignant.**', ''];
  L.push('## Par TP', '', '| TP | Titre | Durée estimée | Compétences |', '|---|---|---|---|');
  for (const t of CATALOG) L.push(`| ${t.num} | ${t.title} | ${t.minutes} min | ${t.skills.join(', ') || '—'} |`);
  L.push('', '## Par compétence', '');
  for (const [code, label] of Object.entries(COMP)) {
    const tps = CATALOG.filter(t => t.skills.includes(code));
    L.push(`### ${code} – ${label}`, '', tps.length ? tps.map(t => `- ${t.num} ${t.title}`).join('\n') : '_Aucun TP._', '');
  }
  L.push('## Durées estimées par étape', '', '| Étape | Titre | Durée |', '|---|---|---|');
  let total = 0;
  for (const [n, title] of Object.entries(STAGES)) { const m = CATALOG.filter(t => t.stage === Number(n)).reduce((a, t) => a + t.minutes, 0); total += m; L.push(`| ${n} | ${title} | ${hm(m)} |`); }
  L.push(`| | **Total** | **${hm(total)}** |`, '', 'Les durées sont des estimations d’auteur, à ajuster après un essai avec des élèves.', '');
  return L.join('\n');
}

export function corriges(): string {
  const L: string[] = ['# Corrigés des TP', '', NOTE, '> Attention : ce fichier donne les solutions. S’il se trouve dans un dépôt public, les élèves peuvent le lire.', ''];
  for (const t of CATALOG) {
    L.push(`## ${t.num} — ${t.title}`, '', `*Idée reçue visée :* ${t.myth ?? '—'}`, '');
    t.solution.forEach((s, i) => {
      if ('write' in s) L.push(`${i + 1}. Écrire \`${s.write}\` :`, '', '```', s.content.replace(/\n$/, ''), '```', '');
      else if ('run' in s) L.push(`${i + 1}. Terminal : \`${s.run}\``);
      else { const q = t.questions?.find(x => x.id === s.answer); L.push(`${i + 1}. Question « ${q?.prompt ?? s.answer} » : **${q?.choices[q.correct] ?? '?'}**`); }
    });
    if (!t.solution.length) L.push('_Pas de manipulation : auto-évaluation personnelle._');
    L.push('', `*Phrase de bilan :* ${t.bilan}`, '');
  }
  return L.join('\n');
}

const sections = (title: string, intro: string, s: { title: string; text: string }[]): string => [`# ${title}`, '', NOTE, intro, '', ...s.flatMap(x => [`## ${x.title}`, '', x.text, ''])].join('\n');

export function buildDocs(): Record<string, string> {
  return {
    'docs/couverture-competences.md': couverture(),
    'docs/corriges.md': corriges(),
    'docs/SIMPLIFICATIONS.md': sections('Ce que le simulateur simplifie', 'Même texte que l’encadré de l’interface.', SIMPLIFICATIONS),
    'docs/EN-VRAI.md': sections('Maintenant en vrai (facultatif)', 'Même texte que la fenêtre de l’interface. **Rien de ce qui suit n’a été exécuté avec les vrais outils par l’auteur du simulateur.**', EN_VRAI),
  };
}
