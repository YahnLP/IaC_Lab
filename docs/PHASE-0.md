# IaC Lab : document de phase 0

> **Décisions de l'auteur (13 novembre 2026), qui l'emportent sur le texte ci-dessous.**
> 1. Le parcours du simulateur est **indépendant de la formation** : ce sera un « pour aller plus loin » de S08. Il n'y a donc **pas de parcours court de 2 h** ; la section 4 reste valable pour le parcours complet.
> 2. Fil rouge : **Brasserie du Port**.
> 3. Environnements test et production : **répertoires séparés + fichiers de valeurs** (pas de workspaces).
> 4. C'est un **simulateur** : il n'a pas à reproduire les vrais outils à l'octet près, mais à y ressembler assez pour faire comprendre les notions. Les sorties sont fidèles dans la forme ; l'encadré « Ce que le simulateur simplifie » le dit. La question 4 (vérifier contre un binaire réel) est donc **close** ; les réserves « à vérifier » de la section 7 restent valables pour le **texte des pages** (licence, OpenTofu, commandes de « Maintenant en vrai »).
> 5. Rattachement aux compétences (section 4) : toujours **à valider**.

*Proposition à valider avant tout code. Auteur du simulateur : Yahn LE PRETTRE. Rédigé après lecture de S06 à S08 (`bts2-sio-sisr-bloc2`), du référentiel, et du code d'InfraLab, DockerLab et ProtoLab (clones en lecture seule, rien modifié).*

## 0. Ce que j'ai lu, ce que j'ai pu vérifier

| Source | Constat |
|---|---|
| S06, S07 | Vocabulaire à reprendre : *modèle* (template), *clone complet / lié*, *preseed*, *cloud-init* (cité dans le tableau des méthodes de S07), *reproductible*, *versionnable*. S07 renvoie déjà vers S08 pour « versionner ». |
| S08 | Cours de 4 h, **TP réel de 2 h 40** (Git, inventaire, playbook, idempotence, dérive sur 3 VM Debian). Terraform n'apparaît qu'une fois, dans la phrase « Puppet, Salt, Chef, Terraform pour l'infrastructure ». Le cours définit déjà *idempotence*, *dérive*, *source de vérité* : IaC Lab doit réemployer ces mots tels quels. |
| Glossaire | Aucune entrée Terraform, état, plan, provisionner : à ajouter (je prépare les entrées, sans les pousser). |
| InfraLab | TypeScript strict, Vite, Vitest, `vite-plugin-singlefile`. État JSON unique, écriture **uniquement par commandes** (`store.dispatch`), événements chaînés, scénarios de TP en **données typées** (`Scenario` : étapes cours/tâches/bilan, objectifs = `check` ou `question`, indices, solution rejouable). Chaque TP est auto-testé : état initial sans objectif atteint, solution = 100 / 100. |
| DockerLab | JS vanilla, sauvegarde **par rejeu du journal** (graine + horloge + lignes saisies), vérificateur qui interroge l'état, parseur YAML maison (~100 lignes), minishell, build en fichier unique. |
| ProtoLab | Fichier HTML unique, sans dépendance. Peu à reprendre côté moteur. |
| Référentiel | Les codes `B2.x.y` sont des **étiquettes du site** (le texte officiel ne numérote pas les compétences). J'utilise exactement ceux du référentiel, listés en section 4. |

**Ce que je n'ai pas pu faire dans cet environnement** (à lire avec attention) :

- Les sites de documentation officielle (developer.hashicorp.com, docs.ansible.com, opentofu.org) sont **refusés** par la lecture web de la session, et les binaires Terraform et OpenTofu sont **inaccessibles** (releases.hashicorp.com : pas de réponse ; GitHub releases : 403). **Je n'ai donc pas pu exécuter Terraform.**
- **Ansible** : `ansible-core` s'installe par pip. J'ai **exécuté** un playbook réel (version 2.22.0, connexion locale) : le comportement décrit en section 3 est vérifié par l'exécution, pas par la doc.
- **Terraform** : le format du plan et le comportement de la dérive sont recoupés sur des pages de tutoriels (dont des pages HashiCorp indexées par la recherche) et sur des sorties de tests d'équivalence du dépôt Terraform. Ce n'est **pas** une lecture de la référence officielle : tout ce qui est marqué « à vérifier » le reste jusqu'à ce que vous ou une session avec accès au site le confirme.

## 1. Nom et dépôt

- **Nom : IaC Lab** (dépôt `YahnLP/IaCLab`, comme `InfraLab`, `DockerLab`). Je ne l'ai pas créé : à votre feu vert.
- **Licence : EUPL 1.2**, comme InfraLab. Mention « © Yahn LE PRETTRE - Formaxion Landes ».
- **Cas fictif.** « JackCelair » est cité dans votre prompt comme celui de S17, mais **je ne le trouve nulle part** dans les sources de `bts2-sio-sisr-bloc2` (recherche sur tout le dépôt). Je propose donc **« Brasserie du Port »** (site web interne + serveur de base de données), domaine `brasserie.example`, adresses `203.0.113.0/24` (test) et `198.51.100.0/24` (production). **À confirmer.**

## 2. Périmètre : les deux sous-ensembles

### Terraform (sous-ensemble)

| Domaine | Inclus | Hors périmètre (dit dans l'interface) |
|---|---|---|
| Langage | blocs `terraform`, `provider`, `resource`, `variable`, `output`, `locals` ; références `type.nom.attribut` ; interpolation `"${…}"` et `var.`, `local.` ; types `string`, `number`, `bool`, `list`, `map` ; `default`, `description`, `sensitive` ; `depends_on` | expressions complexes, fonctions (sauf 3 ou 4 : `format`, `join`, `length`, `lower`), `dynamic`, `data` |
| Avancé | `count`, `for_each`, **un** module local (`module "site"`) | modules distants, `lifecycle` (sauf `prevent_destroy`, à voir), `moved`, `import` |
| Commandes | `init`, `fmt`, `validate`, `plan` (`-var`, `-var-file`, `-destroy`, `-refresh-only`), `apply` (confirmation `yes`), `destroy`, `show`, `output`, `state list`, `state show` | `taint`, `state mv/rm`, `workspace`, backends distants, verrou d'état |
| Dérive | **`terraform plan -refresh-only`** et `apply -refresh-only` | `terraform refresh` seul : **déprécié** au profit de `-refresh-only` (plusieurs sources concordantes, à vérifier dans la doc). Je ne l'enseigne pas. |
| Environnements | un répertoire par environnement + `*.tfvars` ; le module en avancé | Workspaces : écartés (voir question 3) |

Format du plan reproduit (recoupé, à vérifier ligne à ligne) : phrase d'ouverture sur les symboles, `+ create`, `~ update in-place`, `- destroy`, `-/+ destroy and then create replacement`, titre `# type.nom will be created / updated in-place / destroyed / must be replaced`, `(known after apply)`, ligne `Plan: X to add, Y to change, Z to destroy.`, invite `Do you want to perform these actions?` avec « Only 'yes' will be accepted to approve. », `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`, et, pour la dérive, l'encadré `Note: Objects have changed outside of Terraform`. **À vérifier** : le texte exact de `init`, `validate` (`Success! The configuration is valid.`), `destroy` (`Destroy complete!`), le contenu du `.terraform.lock.hcl`, et la valeur affichée d'une variable `sensitive`.

Un point de vigilance pédagogique : les versions récentes de Terraform **masquent** parfois la section « Objects have changed outside of Terraform » lors d'un `plan` ordinaire quand elle n'est pas liée à une action proposée (message d'un contributeur HashiCorp sur leur forum). Je ferai donc de `plan -refresh-only` le geste de détection, et je montrerai que `plan` tout court **propose de corriger** la dérive.

### Ansible (sous-ensemble) : vérifié par exécution

| Domaine | Inclus |
|---|---|
| Inventaire INI | hôtes, groupes `[web]`, `[web:vars]`, `ansible_host`, `ansible_user` (la connexion SSH est simulée) |
| Playbook YAML | `name`, `hosts`, `become`, `vars`, `tasks`, `handlers`, `notify`, `when` (comparaisons `==`, `!=`, `is defined`), `loop` avec `item` |
| Modules (noms complets `ansible.builtin.…`, comme S08) | `ping`, `apt`, `service`, `copy`, `template`, `file`, `user`, `lineinfile`, `command` (avec et sans `creates`), `debug` |
| Modèle | Jinja2 limité aux variables `{{ var }}` |
| Commandes | `ansible <cible> -m ping`, `ansible-playbook` (`--check`, `--diff`, `--limit`, `--syntax-check`), `ansible-inventory --list` |
| Ne sera pas simulé | rôles, Vault (traité en lecture et en question seulement), facts complets, `register`, boucles complexes |

Constats issus de l'exécution réelle (ansible-core 2.22.0) qui **changent le contenu des TP** :

1. `Gathering Facts` est compté dans `ok` : un playbook de 4 tâches et 1 handler déclenché affiche `ok=6`, pas `ok=5`. Mon simulateur affichera la même arithmétique, sinon l'étudiant comparera à la VM et ne retrouvera pas ses chiffres. Le chiffre `ok=5 changed=3` du cours S08 est donc illustratif.
2. Le récapitulatif réel a **sept** compteurs : `ok`, `changed`, `unreachable`, `failed`, `skipped`, `rescued`, `ignored`. S08 en montre quatre : je reprends les sept en repliant `rescued` et `ignored` dans « Comment lire ».
3. **Le piège de `command` est subtil.** Sans `creates`, `command` est `changed` à **chaque** exécution (idempotence rompue, vérifié). Mais en `--check` il est **ignoré** (`skipping`), donc `--check` **ne révèle pas** ce piège. Excellent TD : « pourquoi `--check` dit tout va bien alors que `changed=1` à chaque fois ? ».
4. Le handler ne tourne que sur changement (vérifié : présent à la 1re exécution, absent à la 2e).
5. En `--check --diff`, `template` montre un différentiel `before / after` avec un chemin temporaire côté contrôleur. Le simulateur affichera un chemin plus lisible et le dira dans l'encadré « Ce que le simulateur simplifie ».
6. `apt` et `service` : **non exécutés** (pas de Debian ici). Leur comportement `changed/ok` est celui décrit par S08 ; à confirmer en classe, comme S08 le note déjà pour lui-même.

## 3. Fournisseur fictif et modèle de données

**Fournisseur : `cloudpeda`** (« cloud pédagogique »), source `registry.example/ecole/cloudpeda` (adresse de registre fictive, sans lien avec le vrai registre). Ressources :

| Ressource | Attributs principaux | Remplacement si modifié |
|---|---|---|
| `cloudpeda_network` | `name`, `cidr` | `cidr` : oui (`-/+`) |
| `cloudpeda_vm` | `name`, `network_id`, `size` (`petite`, `moyenne`), `image` (`debian-12`) ; calculés : `id`, `ip`, `state` | `image` : oui ; `size` : modification sur place |
| `cloudpeda_firewall_rule` | `vm_id`, `port`, `protocol`, `source` | non |
| `cloudpeda_dns_record` | `name` (en `.example`), `target_ip` | non |
| `cloudpeda_volume` | `name`, `size_gb`, `vm_id` | `size_gb` : décroissance interdite, erreur du fournisseur |

**Une seule vérité simulée, trois regards** (le cœur pédagogique) :

```
Monde (réel, côté fournisseur)  :  réseaux, VM (+ contenu invité), règles, DNS, volumes
Fichier d'état Terraform        :  copie JSON de ce que Terraform croit avoir créé
Code                            :  fichiers .tf / .yml dans le projet (système de fichiers virtuel)
```

La **VM du fournisseur porte son état invité** (paquets, services, fichiers, utilisateurs). Quand Terraform crée une VM, elle naît avec l'image de base (ssh, python3, quelques paquets). Quand Ansible la configure, il agit sur ce même objet : c'est ce qui rend l'étape 4 (« Terraform crée, Ansible configure ») cohérente sans artifice. Une VM détruite emporte sa configuration.

Écart assumé à signaler : le vrai fichier d'état Terraform est un JSON de format versionné (`version`, `serial`, `lineage`, `resources[].instances[].attributes` d'après mes souvenirs, **à vérifier**). Je montrerai une **version simplifiée**, étiquetée comme telle.

## 4. Parcours détaillé (5 h 30 visées)

Chaque TP : intention, action, observation, phrase de bilan. Les durées sont des estimations d'auteur, à ajuster à l'essai. Compétences : codes du référentiel, **choix de ma part, à valider**.

| # | Titre | Objectif en une phrase | Durée | Compétences |
|---|---|---|---|---|
| **0** | **Pourquoi décrire l'infra en code** | | **0 h 30** | |
| 0.1 | Monter, puis refaire à la main | Constater qu'une infra refaite à la main (console du fournisseur) diffère de la première (un port oublié). | 15 min | B2.2.6 |
| 0.2 | Déclaratif ou impératif | Distinguer « fais ceci » et « je veux cela » en rejouant deux fois un script puis une description. | 15 min | B2.3.2 |
| **1** | **Provisionner (Terraform)** | | **1 h 30** | |
| 1.1 | Première ressource | Dérouler `init`, `validate`, `plan`, `apply` pour un réseau. | 25 min | B2.2.1, B2.2.6 |
| 1.2 | Lire un plan, le modifier | Prédire puis lire `~` (modification sur place) et `-/+` (remplacement). | 20 min | B2.2.5 |
| 1.3 | Variables, locals, sorties | Paramétrer une description et lire une sortie. | 15 min | B2.3.2 |
| 1.4 | Dépendances et `destroy` | Voir l'ordre créé / détruit suivre les références ; provoquer une dépendance circulaire. | 20 min | B2.2.1 |
| TD1 | Que fait ce plan ? | Lire cinq plans et dire ce qui sera créé, modifié, détruit. | 10 min | B2.2.5 |
| **2** | **L'état et la dérive** | | **1 h 00** | |
| 2.1 | Le fichier d'état | Relier code, état, monde ; `state list`, `state show`. | 15 min | B2.2.4 |
| 2.2 | Provoquer la dérive | Modifier à la main, détecter par `plan -refresh-only`, corriger par le code (« J'anticipe »). | 25 min | B2.3.5 |
| 2.3 | Test puis production | Deux environnements, mêmes fichiers, valeurs différentes ; erreur « ressource déjà existante ». | 20 min | B2.2.5, B2.2.6 |
| **3** | **Configurer (Ansible)** | | **1 h 30** | |
| 3.1 | Inventaire et `ping` | Décrire des machines en groupes et joindre le groupe. | 15 min | B2.3.1 |
| 3.2 | Première tâche, idempotence | Appliquer deux fois, lire `changed` puis `changed=0`. | 20 min | B2.3.2 |
| 3.3 | Playbook complet | Paquet, service, modèle, handler. | 25 min | B2.2.1, B2.3.2 |
| 3.4 | `--check`, `--diff`, dérive | Détecter une modification manuelle sans rien changer. | 15 min | B2.3.5 |
| 3.5 | Le piège de `command` | Comprendre pourquoi `command` casse l'idempotence et que `--check` ne le voit pas. | 10 min | B2.3.2 |
| TD3 | Que va faire ce playbook ? | Prédire `ok / changed` sur quatre cas. | 5 min | B2.3.2 |
| **4** | **Les deux ensemble** | | **1 h 00** | |
| 4.1 | Mini-projet vérifié | Terraform crée web + base de données en test, Ansible les configure à partir de l'inventaire produit par la sortie Terraform. | 35 min | B2.2.6, B2.3.2 |
| 4.2 | Changement et bonnes pratiques | Ouvrir un port et ajouter un paquet **par le code** ; commit Git ; secrets hors du dépôt ; plan relu ; passage en production. | 25 min | B2.2.5, B2.2.4 |
| **5** | **Bilan** | Quiz, carte « quel outil pour quoi ? », auto-évaluation, compte rendu. | **0 h 20** | |

Total : **5 h 50**, soit environ 5 h 30 en retirant les TD si le temps manque. À arbitrer à l'essai.

**Parcours court de 2 h.** S08 contient déjà un TP Ansible réel de 2 h 40, donc refaire l'étape 3 en simulation fait double emploi avec la salle. Deux options (question 1) :

- **Option A (recommandée) : « ce que S08 n'a pas ».** 0.2 (15) + 1.1 (25) + 1.2 (20) + 2.2 (25) + 4.2 avec un code Ansible fourni (35) = **2 h**. Ansible est vu en vrai dans le TP de S08.
- **Option B : équilibré.** 0.2 + 1.1 + 1.2 + 3.2 + 3.4 + 4.2 allégé.

Les **idées reçues** confrontées (liste de départ) : « le code décrit les étapes à suivre », « `apply` recrée tout à chaque fois », « Terraform installe les logiciels dans la VM », « `--check` garantit que tout est idempotent », « supprimer un mot de passe du dépôt suffit » (rappel de S08).

## 5. Architecture technique

**Pile** : TypeScript strict, Vite, Vitest, `vite-plugin-singlefile` (identique à InfraLab, donc même CI et même savoir-faire). Node 22 est disponible ici. Aucune dépendance d'exécution : éditeur maison (`textarea` + calque coloré + numéros de ligne, ce qui reste accessible au clavier et aux lecteurs d'écran), pas de CodeMirror.

```
src/core/       store (dispatch de commandes), journal, horloge simulée, rng, ids
src/world/      monde fournisseur : réseaux, VM + état invité, règles, DNS, volumes
src/hcl/        lexeur, parseur, évaluateur, graphe de dépendances, erreurs avec ligne
src/terraform/  init, fmt, validate, plan, apply, destroy, state, output ; fichier d'état
src/yaml/       sous-ensemble YAML ; src/ini/ ; src/jinja/ (variables seulement)
src/ansible/    inventaire, playbook, modules, exécuteur, PLAY RECAP, check / diff
src/shell/      vfs, terminal : ls cat cd, git status / diff / add / commit minimal
src/scenarios/  types, catalogue, vérifications, moteur, compte rendu (modèle InfraLab)
src/ui/         éditeur, terminal, vue SVG à trois colonnes, panneaux, thèmes
tests/          unitaires par moteur, auto-test de chaque TP, e2e Playwright, axe-core
```

Principes repris : état JSON pur ; mutation uniquement par commandes ; ni `Math.random()` ni `Date.now()` ; **sauvegarde par rejeu du journal** (DockerLab) avec instantané de contrôle pour détecter une dérive de version ; chaque TP est résolu par un script de test (état initial : 0 objectif ; solution : 100 / 100). Les identifiants générés (`vm-3f9a…`) viennent d'un compteur déterministe.

**Vue à trois colonnes** : *Code* (fichiers) | *État Terraform* | *Monde réel*, avec les écarts surlignés **et décrits en texte** (accessibilité : jamais la couleur seule). Sous chaque machine : paquets, services, fichiers, utilisateurs.

**Jalons** : ceux de votre prompt (M1 à M8), un commit par jalon, tests verts. M1 commence par le lexeur HCL et le plan, car c'est la partie que je ne peux pas vérifier contre l'outil réel.

## 6. Limites assumées (encadré « Ce que le simulateur simplifie »)

- Aucun vrai fournisseur, aucun vrai réseau : le délai de création des VM est simulé par une horloge.
- Plan : seuls les attributs du fournisseur fictif apparaissent ; pas de `# (n unchanged attributes hidden)` générique si je ne l'ai pas vérifié.
- État : version simplifiée, un seul état local, pas de verrou, pas de backend.
- Ansible : SSH est simulé, les facts se réduisent à quelques variables, les modules ne réalisent que l'effet décrit sur l'état simulé.
- Les sorties sont **fidèles dans la forme, pas octet par octet** (versions différentes d'outils, chemins temporaires, avertissements d'interpréteur).

## 7. « Maintenant en vrai » : pistes et doutes

| Sujet | Piste | Doute |
|---|---|---|
| Ansible | VM du TP S08 (déjà prévue) ; ou conteneur ; ou `ansible_connection=local`, que j'ai testé | `apt` / `service` non exécutés |
| Terraform sans compte cloud | ressource intégrée `terraform_data` (aucun fournisseur à télécharger), ou fournisseur `local` (`local_file`) | à vérifier : disponibilité de `terraform_data` selon la version (mon souvenir : 1.4+), nécessité de télécharger le fournisseur `local` depuis un registre (réseau du lycée) |
| Licence | Selon des sources secondaires : Terraform sous **BUSL 1.1** depuis la version 1.6.0 (août 2023), la 1.5.7 étant la dernière en MPL 2.0 ; **OpenTofu** = fork MPL 2.0 sous la Linux Foundation, version 1.6.0 en janvier 2024, commandes `tofu init / plan / apply` | **À vérifier sur les textes officiels**, surtout : la portée exacte de la clause d'usage de la BUSL pour un établissement de formation, l'état actuel d'OpenTofu, le rachat de HashiCorp par IBM (annoncé comme en 2025 par des sources secondaires), et la numérotation actuelle de Terraform (une source mentionne la 1.16 en août 2026, non confirmée). Je ne l'affirmerai dans aucune page avant relecture. |
| Choix de l'outil réel | Sans trancher : Terraform pour coller à la séance, OpenTofu comme alternative libre | à décider avec vous |

## 8. Questions qui bloquent la suite

1. **Parcours court de 2 h** : option A (Terraform d'abord, Ansible couvert par le TP réel de S08) ou option B (équilibré) ?
2. **Fil rouge** : « Brasserie du Port » vous convient-il, ou voulez-vous un autre nom ? (« JackCelair » est introuvable dans le dépôt.)
3. **Environnements test / production** : répertoires séparés + fichiers de valeurs (ma proposition, plus lisible, évite d'enseigner les *workspaces* que la documentation déconseille, d'après mes souvenirs, **à vérifier**) ou workspaces ?
4. **Vérification contre l'outil réel** : voulez-vous que la phase M1 attende une session qui accède à developer.hashicorp.com et à un binaire (Terraform ou OpenTofu), pour comparer mes sorties à de vraies sorties ? Sinon je procède en marquant chaque sortie « non vérifiée » dans le code et dans le rapport.
5. **Compétences** : le rattachement de la section 4 est une proposition ; le valider ou l'amender.

## 9. Risques

- **Fidélité des sorties Terraform** (non exécuté ici) : c'est le premier risque. Mitigation : une table unique de messages (`messages.ts`), marquée vérifié / à vérifier, plus un test de format sur chaque ligne emblématique.
- **Charge** : deux moteurs plus HCL, YAML, Jinja, vue et éditeur. M1 et M2 sont indépendants ; si le temps manque, le module et `count / for_each` sautent en premier.
- **Doublon avec S08** : traité par le parcours court.
