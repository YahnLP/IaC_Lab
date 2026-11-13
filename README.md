# IaC Lab

Laboratoire pédagogique « **décrire l'infrastructure dans du code** » : un simulateur 100 % navigateur, sans installation, où l'on apprend à **provisionner** (Terraform simulé) puis à **configurer** (Ansible simulé), avec un fournisseur cloud fictif et un fil rouge, la **Brasserie du Port**.

Créé par Yahn LE PRETTRE - Formaxion Landes. Parcours « pour aller plus loin » de la séance S08 (BTS SIO SISR 2e année, bloc 2). Indépendant du cours : on peut le suivre seul.

> **Ce n'est pas Terraform ni Ansible.** C'est une simulation qui leur ressemble, pour comprendre les notions (déclaratif, plan, état, dérive, idempotence). Voir [ce que le simulateur simplifie](docs/SIMPLIFICATIONS.md) et la section facultative [Maintenant en vrai](docs/EN-VRAI.md).

## Utiliser

Ouvrir `dist/index.html` (un seul fichier, fonctionne hors ligne) ou la page GitHub Pages du dépôt. Le travail est enregistré automatiquement dans le navigateur ; la sauvegarde peut aussi s'exporter en fichier.

Parcours : 0 Pourquoi décrire l'infrastructure en code · 1 Provisionner · 2 L'état et la dérive · 3 Configurer (Ansible) · 4 Les deux ensemble · 5 Bilan. Durée estimée : voir [la couverture](docs/couverture-competences.md).

## Pour l'enseignant

[GUIDE-FORMATEUR](docs/GUIDE-FORMATEUR.md) · [couverture des compétences](docs/couverture-competences.md) (rattachement à valider) · [corrigés](docs/corriges.md) · [architecture](docs/ARCHITECTURE.md) · [plan initial](docs/PHASE-0.md).

## Développement

```
npm install
npm run typecheck   # TypeScript strict
npm test            # Vitest (moteurs, TP, documents générés)
npm run build       # dist/index.html autonome
npm run docs        # régénère les documents dérivés du catalogue
npm run a11y        # audit axe-core (après build ; variable CHROMIUM si besoin)
```

## Licence

© 2026 Yahn LE PRETTRE - Formaxion Landes. Licence **EUPL 1.2** (fichier `LICENSE`).
