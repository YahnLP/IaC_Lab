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
