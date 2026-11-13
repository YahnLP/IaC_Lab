# Guide formateur

## En deux phrases

IaC Lab simule Terraform et Ansible dans le navigateur autour d'un fil rouge (la Brasserie du Port). Chaque TP a une consigne, des objectifs vérifiés automatiquement, des questions avec explication, des indices et une phrase de bilan.

## Place dans la formation

Parcours **indépendant** du cours : il devient un « pour aller plus loin » de la séance S08 (Ansible). Il complète S08 sur ce que la séance ne couvre pas (provisionner, état, dérive, enchaînement des deux outils). L'étape 3 refait Ansible en simulation : à ne proposer qu'aux élèves qui ont besoin de répéter avant le TP réel.

## Parcours

| Étape | Contenu | À retenir |
|---|---|---|
| 0 | Refaire à la main, déclaratif ou impératif | Une description se rejoue ; un script, non |
| 1 | Réseau et machine, lire un plan, variables et sorties, dépendances, destroy | Toujours lire le plan |
| 2 | Fichier d'état, dérive, test puis production | L'état est la mémoire de Terraform ; la dérive se voit dans un plan |
| 3 | Inventaire, idempotence, playbook, --check/--diff, piège de command | Idempotence et handlers |
| 4 | Terraform crée et Ansible configure ; changement par le code, Git, secrets | Chacun son rôle ; secrets hors du dépôt |
| 5 | Quiz, « quel outil pour quoi », auto-évaluation | Le bilan |

Les durées figurent dans [couverture-competences.md](couverture-competences.md) ; ce sont des estimations d'auteur à ajuster après un essai.

## Idées reçues confrontées

« Le code décrit les étapes à suivre » (0.2) · « apply recrée tout à chaque fois » (1.1) · « Terraform retrouve le monde en l'interrogeant » (2.1) · « Terraform sait tout de suite qu'on a changé la machine à la main » (2.2) · « Terraform installe les logiciels » (3.3) · « --check garantit l'idempotence » (3.5) · « Supprimer un mot de passe du dépôt suffit » (4.2).

## Mode examen et compte rendu

- **Mode examen** (case dans l'en-tête) : pas d'indices, pas de coches, pas d'explication ni de retour sur les réponses ; seule la dernière réponse compte.
- **Compte rendu** : objectifs atteints par TP, indices demandés, essais aux questions, auto-évaluation. Export HTML (imprimable) ou JSON. Le pourcentage est un taux d'objectifs, pas une note : aucune grille n'est fournie.
- **Sauvegarde** : automatique dans le navigateur ; export/import d'un fichier JSON depuis le panneau Mission pour changer de poste.
- Le bouton **Réinitialiser** efface tout (dont la progression).

## Limites à connaître

- Une simulation ne prouve pas une compétence : le référentiel attend une trace réelle (machine virtuelle ou situation en entreprise). La section [Maintenant en vrai](EN-VRAI.md) propose de refaire les exercices avec les vrais outils ; elle n'a pas été essayée par l'auteur.
- Le rattachement aux compétences (B2.2, B2.3, B3.4) est une **proposition à valider**.
- [Corrigés](corriges.md) : s'ils sont publics, les élèves peuvent les lire.
- Accessibilité : audit automatisé (axe-core) sans violation sur les vues testées ; un test avec lecteur d'écran et au clavier seul reste à faire par un humain. La coloration syntaxique de l'éditeur n'est pas implémentée.

## Dépannage

- « Plus rien ne marche » après un essai : Réinitialiser, ou Recommencer le TP (panneau Mission).
- Les commandes du simulateur sont listées par `help` dans le terminal. Le panneau « Pourquoi ? » explique la dernière commande.
