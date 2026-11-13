# IaC Lab : architecture (état réel à l'issue de M1)

Voir `PHASE-0.md` pour la conception et le plan. Ce document dit ce qui **existe**.

## Principes (repris d'InfraLab et de DockerLab)
- État JSON unique (`src/state.ts`), modifié **uniquement par des commandes** (`src/core/store.ts`).
- **Sauvegarde par rejeu du journal** : `snapshot()` enregistre les commandes, `restore()` les rejoue.
- Déterministe : pas de `Math.random()` ni de `Date.now()` ; identifiants par compteurs, horloge simulée en secondes.
- TypeScript strict, Vitest.

## Modules livrés
| Chemin | Rôle |
|---|---|
| `src/core/store.ts` | Store à commandes, journal, retour arrière si une commande est refusée |
| `src/state.ts` | Forme de l'état : monde du fournisseur, fichiers du projet, plans enregistrés |
| `src/shell/` | Système de fichiers virtuel à plat (`vfs.ts`), découpage de ligne de commande (`words.ts`) |
| `src/world/provider.ts` | Fournisseur fictif `cloudpeda` : réseau, VM (avec état invité pour Ansible), règle de pare-feu, DNS, volume ; validation, unicité des noms, adresses IP |
| `src/hcl/` | Lexeur, parseur et évaluateur du sous-ensemble HCL (valeurs inconnues « known after apply ») |
| `src/terraform/config.ts` | Chargement des `.tf`, validation statique, graphe de dépendances, détection de cycle |
| `src/terraform/walk.ts` | Parcours du graphe : rafraîchissement (dérive), diff code/état/monde, count et for_each, remplacement, exécuteur |
| `src/terraform/render.ts` | Rendu du plan, de la dérive, de l'état et des sorties |
| `src/terraform/commands.ts` | `init`, `fmt`, `validate`, `plan`, `apply`, `destroy`, `show`, `output`, `state list/show`, `refresh` |
| `src/terraform/tfstate.ts` | Fichier `terraform.tfstate` simplifié (même allure que l'original) |
| `src/engine.ts` | Assemble le laboratoire ; commandes `fs.write`, `tf.exec`, `cloud.create/set/delete` (console du fournisseur) |

## Sous-ensemble Terraform pris en charge
Blocs `terraform` (`required_providers`), `provider`, `variable` (`type`, `default`, `description`, `sensitive`), `locals`, `resource` (`count`, `for_each`, `depends_on`, `lifecycle { prevent_destroy }`), `output` (`sensitive`). Expressions : littéraux, listes, objets, références, interpolation, opérateurs, conditionnelle, fonctions `format join length lower upper tostring tonumber concat contains lookup keys values max min toset tolist`. Variables : `default`, `terraform.tfvars`, `*.auto.tfvars`, `-var-file`, `-var`.

## Ce que le simulateur simplifie (à reprendre dans l'interface)
- Un seul fournisseur fictif ; pas de `data`, `module`, `import`, `moved`, workspaces, backends, verrou d'état.
- Variable obligatoire sans valeur : erreur immédiate (l'outil réel peut aussi interroger l'utilisateur).
- `apply` exécute d'abord toutes les destructions, puis les créations et modifications (l'outil réel parallélise selon le graphe).
- Un échec arrête l'application à la première erreur (l'outil réel poursuit les branches indépendantes).
- Fichier d'état simplifié ; plan enregistré (`-out`) conservé dans le laboratoire, pas dans un fichier binaire.
- Sorties fidèles dans la forme, pas à l'octet près.

## Reste à faire (jalons suivants)
M2 Ansible ; M3 interface ; M4 moteur de TP et vérificateur ; M5 à M8 contenu, bilan, accessibilité, build autonome, documentation, « Maintenant en vrai ». Le bloc `module` simple du plan de phase 0 (niveau avancé) n'est **pas** encore fait.

## Jalon M2 : moteur Ansible simulé

- `src/yaml` : sous-ensemble de YAML (mappings, listes, blocs `|` et `>`, listes en ligne).
- `src/ansible/inventory.ts` : inventaire INI (groupes, `:vars`, `:children`).
- `src/ansible/jinja.ts` : `{{ variable | filtre }}` et conditions `when:` (pas de blocs `{% %}`).
- `src/ansible/modules.ts` : ping, apt, service, copy, template, file, user, lineinfile, command/shell, debug, appliqués à l'état invité de la machine (`Guest`).
- `src/ansible/commands.ts` : `ansible`, `ansible-playbook` (`--check`, `--diff`, `--limit`, `--syntax-check`, handlers, loop, when, register, become) et `ansible-inventory` (`--list`, `--graph`).
- Machines atteintes par `ansible_host` (IP ou nom) ou par le nom de l'hôte ; sinon UNREACHABLE.
- Simplifications : pas de rôles, `include`, `block/rescue`, vault ni facts détaillés ; en `--check`, `apt` ne crée pas les dossiers (comme en vrai, une tâche suivante peut échouer).
- Commandes d'état « à la main » pour provoquer une dérive : `guest.write`, `guest.service`, `guest.package`.

## Jalon M3 : interface

- `index.html` + `src/main.ts` : mise en page 4 zones (fichiers, éditeur, terminal, vue), sauvegarde automatique du journal dans `localStorage` (try/catch), bouton Réinitialiser.
- `src/ui/session.ts` : terminal (cd, ls, cat, rm, mkdir, edit, `cloud …`, passerelle terraform/ansible, invite « Enter a value: » pour apply/destroy). Pur, testé.
- `src/ui/model.ts` : modèle de la vue SVG à 3 colonnes (code → état → monde réel) avec statuts synchronisé / à créer / orphelin / hors Terraform. Pur, testé.
- `src/ui/app.ts` : DOM et SVG (texte inséré uniquement par `textContent`).
- `src/ui/seed.ts` : projet de départ provisoire (les parcours de la Brasserie arrivent en M5-M6).
- Vérifié dans Chromium (Playwright) : init, apply, playbook, aucune erreur console. Accessibilité (axe-core, clavier complet) : jalon M8.

## Jalon M4 : moteur de TP, vérificateur, sauvegarde

- `src/tp/types.ts` : un TP = énoncé, fichiers de départ, commandes de préparation du monde (`setup`), objectifs, indices.
- `src/tp/checks.ts` : constructeurs d'objectifs (`fileContains`, `worldHas`, `planClean` sur une copie de l'état, `guest`…). Le vérificateur ne modifie jamais l'état.
- `src/tp/engine.ts` : `startTp` (laboratoire neuf reproductible), `checkTp` (objectifs conservés une fois validés), `nextHint` (indices comptés), `exportSave` / `importSave` (journal + progression, fichier JSON).
- `src/tp/catalog.ts` : 2 TP d'essai ; les étapes 0 à 5 arrivent en M5 et M6.
- Interface : panneau Mission (choix du TP, consigne, objectifs cochés en direct, indice, recommencer, export/import). Sauvegarde automatique dans `localStorage`.

## Jalon M5 : contenu des étapes 0, 1 et 2

- 10 TP dans `src/tp/stage0.ts`, `stage1.ts`, `stage2.ts` : 0.1, 0.2 ; 1.1 à 1.4, TD1 ; 2.1 à 2.3 (fil rouge : Brasserie du Port).
- Chaque TP porte : intention, durée, compétences (**proposition d'auteur, à valider**), idée reçue éventuelle, objectifs vérifiables, questions à choix (explication affichée), indices, phrase de bilan et **solution de référence** rejouée par les tests.
- Les tests `tp.test.ts` vérifient pour chaque TP : aucun objectif atteint au départ, solution = 100 %, textes complets, vérification sans effet sur l'état, plus des scénarios (script rejoué, `~` puis `-/+`, cycle, dérive, doublon prod).
- Nouveautés du terminal : `bash <fichier>` (script de lignes `cloud create …`), `cloud list`, `cloud create`.
- Séquences d'objectifs : `check(st, done)` permet d'exiger qu'un objectif précède un autre (ex. « remis en conformité » après « dérive provoquée »).
- Test / production : dossiers séparés, même `main.tf`, `terraform.tfvars` différent (pas de workspaces, décision d'auteur).

## Jalon M6 : étapes 3 et 4

- `src/tp/stage3.ts` : 3.1 à 3.5 et TD3 (Ansible : inventaire, idempotence, playbook complet avec handler, --check/--diff et dérive, piège de `command`).
- `src/tp/stage4.ts` : 4.1 (Terraform produit l'inventaire d'Ansible par une sortie) et 4.2 (changement par le code, plan relu, Git, secrets hors dépôt).
- Nouveautés du terminal : redirection `>` / `>>`, `guest <machine> write|cat|stop|start|status` (agir à la main dans une machine), `git init|add|commit|status|log`.
- `src/shell/git.ts` : Git simulé (instantanés dans `.git/repo.json`, `.gitignore` simple : nom exact, `*.ext`, `dossier/`). Les vérificateurs lisent le dernier commit.
- Vérificateur `playbookIdempotent` : rejoue le playbook deux fois sur une copie de l'état et exige `changed=0` au second passage.
- Simplifications : pas de rôles, pas de branches Git ni de dépôt distant, `git add` instantané du contenu.

## Jalon M7 : bilan, compte rendu, mode examen

- `src/tp/stage5.ts` : 5.1 quiz de 12 questions (étapes 0 à 4), 5.2 « quel outil pour quoi ? » (8 besoins : Terraform / Ansible / les deux à la suite), 5.3 auto-évaluation (10 énoncés, 4 niveaux).
- `src/tp/engine.ts` : `rateSelf` (auto-évaluation), `progress.self` et `progress.exam`. En examen, seule la dernière réponse à une question compte.
- Mode examen (case à cocher) : indices désactivés, pas de coches sur les objectifs, pas d'explication ni de bonne/mauvaise réponse affichée, pas de phrase de bilan. Le détail n'apparaît que dans le compte rendu.
- `src/tp/report.ts` : compte rendu (objectifs atteints par TP, indices, essais aux questions, commandes, auto-évaluation) en JSON ou en HTML imprimable (texte échappé). Nom, classe et date saisis dans l'interface (la date n'entre jamais dans le moteur, qui reste déterministe).
- Le pourcentage du compte rendu est un taux d'objectifs atteints, pas une note : aucune grille de notation n'est inventée.

## Jalon M8 : accessibilité, documentation, « en vrai »

- Interface : thèmes clair et sombre (préférence du système, mémorisée), lien d'évitement, panneau « Pourquoi ? » (`src/ui/why.ts`, pur), fenêtres « Ce que le simulateur simplifie » et « Maintenant en vrai » (`src/ui/info.ts`, source unique reprise dans `docs/`).
- Audit `npm run a11y` (axe-core, WCAG 2.1 A/AA) sur écran principal, TP à questions, auto-évaluation, mode examen et les trois fenêtres, en thème clair et sombre : 0 violation. Limites : audit automatisé seulement.
- Compétences : codes alignés sur le référentiel du site (B2.2, B2.3, B3.4). Niveaux d'auto-évaluation : vocabulaire des grilles nationales.
- Documents générés (`npm run docs`, vérifiés par un test) : `couverture-competences.md`, `corriges.md`, `SIMPLIFICATIONS.md`, `EN-VRAI.md`.
- CI et déploiement GitHub Pages : `.github/workflows/` (copiés d'InfraLab ; non exécutés tant que rien n'est poussé).
- Non fait : coloration syntaxique de l'éditeur ; module Terraform ; thèmes plus nombreux.
