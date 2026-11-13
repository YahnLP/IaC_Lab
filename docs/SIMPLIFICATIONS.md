# Ce que le simulateur simplifie

> Document généré par `npm run docs` à partir du catalogue de TP. Ne pas modifier à la main.

Même texte que l’encadré de l’interface.

## Un fournisseur fictif

« cloudpeda » n’existe pas. Il fournit cinq types de ressources : réseau, machine, règle de pare-feu, enregistrement DNS, volume. Les durées de création affichées sont simulées : rien ne fait réellement attendre.

## Un langage HCL réduit

Blocs terraform, provider, resource, variable, locals, output ; références entre ressources, count et for_each, quelques fonctions (format, join, length, lower, upper, lookup…). Pas de modules, de sources de données (data), d’import, d’espaces de travail (workspaces) ni de provisioners.

## Plan et apply approchés

Les messages ressemblent à ceux de Terraform (symboles +, -, ~, -/+, récapitulatif, encadrés d’erreur) mais ne sont pas identiques au mot près. L’apply s’arrête à la première erreur et traite les destructions avant les créations ; l’outil réel ordonne plus finement.

## Un état simplifié

terraform.tfstate est un JSON qui garde les grandes rubriques de l’original (version, serial, lineage, outputs, resources) sans les champs techniques. Pas de backend distant ni de verrou.

## Un sous-ensemble d’Ansible

Inventaire INI, playbook YAML (hosts, become, vars, tasks, handlers, notify, when, loop, register), onze modules (ping, apt, service, copy, template, file, user, lineinfile, command, shell, debug). Pas de rôles, d’include, de block/rescue, de vault. Jinja2 : variables et quelques filtres seulement (pas de blocs {% %}).

## Pas de vraie connexion

Aucun SSH : une machine est « joignable » si elle existe et si son service ssh tourne. Les modules agissent sur un contenu simulé (paquets, services, fichiers, utilisateurs).

## Un Git minimal

init, add, commit -m, status, log, avec un .gitignore simple. Pas de branches, de dépôt distant ni de diff.

## Aucune garantie de fidélité

Le simulateur sert à comprendre les notions. Une commande qui réussit ici peut se comporter autrement avec les vrais outils : c’est le but de la section « Maintenant en vrai ».
