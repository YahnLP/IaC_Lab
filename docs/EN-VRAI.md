# Maintenant en vrai (facultatif)

> Document généré par `npm run docs` à partir du catalogue de TP. Ne pas modifier à la main.

Même texte que la fenêtre de l’interface. **Rien de ce qui suit n’a été exécuté avec les vrais outils par l’auteur du simulateur.**

## Principe

Refaire les mêmes exercices avec les vrais outils, sans fournisseur cloud réel. Le référentiel rappelle qu’une solution présentée à l’examen ne peut pas se réduire à une simulation : le simulateur prépare, la machine virtuelle confirme.

## Ansible : directement

Les inventaires et playbooks du simulateur s’écrivent comme avec Ansible (modules ansible.builtin.apt, service, copy, template…). Ils se rejouent tels quels sur la machine de gestion et les deux Debian cibles de la séance S08 : ansible-playbook -i inventory.ini site.yml, avec --check et --diff. À vérifier en essai : les messages exacts diffèrent un peu de ceux du simulateur.

## Terraform sans cloud : le fournisseur « local »

Le fournisseur officiel hashicorp/local (ressource local_file) crée des fichiers sur la machine où Terraform s’exécute : aucun compte externe. On y retrouve init, plan, apply, destroy, l’état et les sorties. Les notions de réseau, de machine et de dépendances entre ressources s’y travaillent avec plusieurs fichiers qui se référencent. Doute à lever en essai : le comportement exact de local_file quand on modifie le fichier à la main (dérive), et l’accès au registre depuis le réseau du lycée pour télécharger le fournisseur lors de terraform init.

## Licence : Terraform et OpenTofu

D’après les sources consultées (articles de presse spécialisée, pas les pages officielles) : Terraform est passé de la licence MPL 2.0 à la Business Source License 1.1 en août 2023 ; la dernière version sous MPL 2.0 est la 1.5.x. OpenTofu est un fork de la dernière version MPL, placé sous la gouvernance de la Linux Foundation et publié sous MPL 2.0 ; sa commande est « tofu ». À confirmer sur les pages officielles (hashicorp.com, opentofu.org) avant de l’affirmer en cours. Le simulateur accepte « tofu » comme synonyme de « terraform ».

## Ce qui n’a pas été vérifié

Aucune des commandes de cette section n’a été exécutée avec les vrais outils par l’auteur de ce simulateur. À essayer d’abord sur une machine de test avant de les proposer aux élèves.
