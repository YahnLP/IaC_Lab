// Audit d'accessibilité automatisé (axe-core, règles WCAG 2.1 A/AA) sur la version construite (dist/index.html).
// Usage : npm run build && npm run a11y   (variable CHROMIUM pour indiquer un navigateur déjà installé)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const axeSrc = readFileSync(fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
const url = new URL('../dist/index.html', import.meta.url).href;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));

let total = 0;
async function audit(label) {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  total += r.violations.length;
  console.log(`${r.violations.length === 0 ? 'OK ' : 'KO '} ${label} (${r.passes.length} règles passées)`);
  for (const v of r.violations) console.log(`   - ${v.id} [${v.impact}] ${v.help} : ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
}

await page.goto(url);
for (const theme of ['dark', 'light']) {
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) await page.click('#theme');
  await audit(`écran principal, thème ${theme}`);
  await page.selectOption('#tpsel', '1.2'); await audit(`TP 1.2 (questions), thème ${theme}`);
  await page.fill('#cmd', 'terraform plan'); await page.press('#cmd', 'Enter'); await audit(`après une commande en erreur ou en sortie, thème ${theme}`);
  await page.selectOption('#tpsel', '5.3'); await audit(`auto-évaluation, thème ${theme}`);
  for (const [btn, name] of [['#simplif', 'simplifications'], ['#envrai', 'en vrai'], ['#report', 'compte rendu']]) {
    await page.click(btn); await audit(`dialogue ${name}, thème ${theme}`); await page.keyboard.press('Escape');
  }
  await page.check('#exam'); await audit(`mode examen, thème ${theme}`); await page.uncheck('#exam');
}
// clavier : on doit pouvoir atteindre le terminal sans souris
await page.goto(url); await page.keyboard.press('Tab'); const first = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.slice(0, 40)}`);
console.log(`Premier élément focalisé au clavier : « ${first?.trim()} »`);
console.log(errors.length ? `Erreurs console : ${errors.join(' ; ')}` : 'Aucune erreur console');
await browser.close();
process.exit(total === 0 && errors.length === 0 ? 0 : 1);
