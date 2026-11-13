# IaC Lab

Laboratoire pédagogique « **décrire l'infrastructure dans du code** » : un simulateur 100 % navigateur, sans installation, où l'on apprend à **provisionner** (Terraform) puis à **configurer** (Ansible), avec un fournisseur cloud fictif.

Créé par Yahn LE PRETTRE - Formaxion Landes. Parcours « pour aller plus loin » de la séance S08 (BTS SIO SISR 2e année, bloc 2).

> **État : M1, moteur Terraform.** Le moteur (HCL, plan, apply, destroy, état, dérive) et ses tests sont écrits. Pas encore d'interface (M3), ni d'Ansible (M2), ni de TP (M4 et suivants). Voir `docs/PHASE-0.md` pour le plan complet et `docs/ARCHITECTURE.md` pour l'état réel.

## Développement
```
npm install
npm run typecheck   # TypeScript strict
npm test            # Vitest
```

## Licence
© 2026 Yahn LE PRETTRE - Formaxion Landes. Licence **EUPL 1.2** (fichier `LICENSE`).
