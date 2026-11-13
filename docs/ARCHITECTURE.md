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
