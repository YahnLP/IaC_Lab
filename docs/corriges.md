# Corrigés des TP

> Document généré par `npm run docs` à partir du catalogue de TP. Ne pas modifier à la main.

> Attention : ce fichier donne les solutions. S’il se trouve dans un dépôt public, les élèves peuvent le lire.

## 0.0 — Prise en main du simulateur

*Idée reçue visée :* —

1. Question « Où tape-t-on les commandes ? » : **Dans le terminal, au centre en bas**

*Phrase de bilan :* Tu sais lire la consigne, ouvrir un fichier, taper une commande et lire le schéma : tu peux commencer.

## 0.1 — Monter, puis refaire à la main

*Idée reçue visée :* Une infrastructure bien documentée se refait à l’identique.

1. Terminal : `cloud list`
2. Terminal : `cloud create network name=reseau-recette cidr=198.51.100.0/24`
3. Terminal : `cloud create vm name=caisse-recette network_id=net-0002`
4. Terminal : `cloud create firewall_rule vm_id=vm-0002 port=22`
5. Question « Que montre la comparaison entre la production et la recette ? » : **Il manque la règle du port 443 en recette, et la fiche ne la mentionnait pas**
6. Terminal : `cloud create firewall_rule vm_id=vm-0002 port=443`

*Phrase de bilan :* Sans description écrite et relisible, la copie diffère de l’original et personne ne sait en quoi : c’est le problème que le code résout.

## 0.2 — Déclaratif ou impératif

*Idée reçue visée :* Le code d’infrastructure est une liste d’étapes à suivre.

1. Terminal : `bash creer.sh`
2. Terminal : `bash creer.sh`
3. Question « Que se passe-t-il quand on rejoue le script ? » : **Les commandes échouent : les objets existent déjà**
4. Terminal : `terraform init`
5. Terminal : `terraform apply`
6. Terminal : `yes`
7. Terminal : `terraform apply`
8. Question « Et au second « terraform apply » ? » : **Il constate que le monde correspond déjà à la description (« No changes »)**

*Phrase de bilan :* Un script décrit des actions et échoue ou duplique quand on le rejoue ; une description décrit un résultat et ne fait que ce qui manque.

## 1.1 — Première ressource

*Idée reçue visée :* terraform apply recrée tout à chaque fois.

1. Écrire `brasserie/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}
```

2. Terminal : `terraform init`
3. Terminal : `terraform validate`
4. Terminal : `terraform plan`
5. Terminal : `terraform apply -auto-approve`

*Phrase de bilan :* Le cycle est toujours le même : init (préparer), validate (vérifier la syntaxe), plan (voir), apply (faire).

## 1.2 — Lire un plan, le modifier

*Idée reçue visée :* —

1. Écrire `brasserie/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
  size       = "moyenne"
}
```

2. Terminal : `terraform plan`
3. Terminal : `terraform apply -auto-approve`
4. Question « Changer la taille : quel symbole le plan affiche-t-il devant la machine ? » : **~**
5. Écrire `brasserie/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
  size       = "moyenne"
  image      = "ubuntu-24.04"
}
```

6. Terminal : `terraform plan`
7. Terminal : `terraform apply -auto-approve`
8. Question « Changer l’image : quel symbole, et pourquoi ? » : **-/+ : l’image ne peut pas changer sur une machine existante, il faut la remplacer**

*Phrase de bilan :* Toujours lire le plan avant de confirmer : un « -/+ » détruit et recrée, donc change l’identifiant et l’adresse IP.

## 1.3 — Variables, locals, sorties

*Idée reçue visée :* —

1. Écrire `brasserie/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

variable "environnement" {
  default = "test"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse-${var.environnement}"
  network_id = cloudpeda_network.principal.id
}

output "ip_caisse" {
  value = cloudpeda_vm.caisse.ip
}
```

2. Terminal : `terraform apply -auto-approve`
3. Terminal : `terraform output`
4. Question « Quelle commande relit les sorties sans rien modifier ? » : **terraform output**

*Phrase de bilan :* Les variables rendent le même code réutilisable ; les sorties exposent ce que le fournisseur a calculé (adresse IP…).

## 1.4 — Dépendances et destroy

*Idée reçue visée :* —

1. Écrire `brasserie/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
}

resource "cloudpeda_firewall_rule" "https" {
  vm_id = cloudpeda_vm.caisse.id
  port  = 443
}
```

2. Terminal : `terraform init`
3. Terminal : `terraform apply -auto-approve`
4. Terminal : `terraform destroy -auto-approve`
5. Question « Dans quel ordre le destroy supprime-t-il les trois ressources ? » : **Règle, machine, réseau**
6. Terminal : `cd essai`
7. Terminal : `terraform init`
8. Terminal : `terraform validate`
9. Question « Que répond terraform validate dans « essai » ? » : **Une dépendance circulaire (Cycle) est détectée**

*Phrase de bilan :* Une référence crée une dépendance : on crée dans l’ordre des dépendances, on détruit dans l’ordre inverse.

## TD1 — Que fait ce plan ?

*Idée reçue visée :* —

1. Question « Plan A : que se passera-t-il ? » : **Une machine est créée**
2. Question « Plan B : que devient la machine ? » : **Elle est modifiée sur place et garde son identifiant**
3. Question « Plan C : que devient la machine ? » : **Elle est détruite puis recréée : nouvel identifiant, nouvelle adresse IP**
4. Question « Plan D : d’où vient cette destruction ? » : **Le bloc de la règle SSH a été retiré du code**
5. Question « Plan E : que fera apply ? » : **Rien : le monde correspond déjà au code**

*Phrase de bilan :* Le plan est un contrat : si vous savez le lire, rien de ce qui suit n’est une surprise.

## 2.1 — Le fichier d’état

*Idée reçue visée :* Terraform retrouve ce qui existe en interrogeant le fournisseur à chaque fois.

1. Terminal : `terraform state list`
2. Terminal : `terraform state show cloudpeda_vm.caisse`
3. Question « Quelle commande liste les ressources que Terraform suit ? » : **terraform state list**
4. Question « Qu’y a-t-il dans l’état que le code ne contient pas ? » : **Les identifiants et adresses réellement attribués par le fournisseur**
5. Question « On supprime terraform.tfstate sans toucher au monde. Que prévoira ensuite le plan ? » : **Tout recréer (« 2 to add ») alors que tout existe déjà**

*Phrase de bilan :* L’état est la mémoire de Terraform : il relie chaque bloc du code à un objet réel précis. Sans lui, Terraform ne sait plus ce qui lui appartient.

## 2.2 — Provoquer la dérive

*Idée reçue visée :* Si quelqu’un change la machine à la main, Terraform le sait tout de suite.

1. Terminal : `cloud set vm-0001 size grande`
2. Terminal : `terraform plan -refresh-only`
3. Question « Quelle commande détecte la dérive sans modifier l’infrastructure ? » : **terraform plan -refresh-only**
4. Terminal : `terraform apply -auto-approve`

*Phrase de bilan :* Un changement à la main crée une dérive que seul un plan fait apparaître. La bonne correction est dans le code ; sinon l’écart revient.

## 2.3 — Test puis production

*Idée reçue visée :* —

1. Terminal : `terraform init`
2. Terminal : `terraform apply -auto-approve`
3. Terminal : `cd ../prod`
4. Terminal : `terraform init`
5. Terminal : `terraform apply -auto-approve`
6. Question « Pourquoi l’apply de prod échoue-t-il d’abord ? » : **Le fichier de valeurs de prod porte encore le nom « test » : le réseau existe déjà**
7. Écrire `prod/terraform.tfvars` :

```
environnement = "prod"
cidr          = "198.51.100.0/24"
```

8. Terminal : `terraform apply -auto-approve`

*Phrase de bilan :* Le code est le même ; ce qui change, ce sont les valeurs. Un nom en doublon ou une valeur recopiée par erreur se voit dès le plan ou l’apply.

## 3.1 — Inventaire et ping

*Idée reçue visée :* —

1. Écrire `config/inventory.ini` :

```
[web]
caisse

[bdd]
stock

[all:vars]
ansible_become=true
```

2. Terminal : `ansible web -m ping -i inventory.ini`
3. Terminal : `ansible all -m ping -i inventory.ini`
4. Question « Le ping affiche « changed: false ». Pourquoi ? » : **Il ne modifie rien sur la machine : il vérifie seulement qu’on peut la joindre**

*Phrase de bilan :* L’inventaire dit sur qui agir ; sans lui, Ansible ne sait pas où aller. Un ping réussi prouve la jonction, pas la configuration.

## 3.2 — Première tâche, idempotence

*Idée reçue visée :* Relancer un playbook refait tout à chaque fois.

1. Écrire `config/site.yml` :

```
- name: Configurer les caisses
  hosts: web
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present
```

2. Terminal : `ansible-playbook -i inventory.ini site.yml`
3. Terminal : `ansible-playbook -i inventory.ini site.yml`
4. Question « Que montre le PLAY RECAP du second passage ? » : **changed=0 : nginx est déjà là, rien à faire**

*Phrase de bilan :* Un bon module est idempotent : il constate l’état voulu et n’agit que s’il manque quelque chose.

## 3.3 — Playbook complet

*Idée reçue visée :* Terraform installe les logiciels dans la machine.

1. Écrire `config/site.yml` :

```
- name: Configurer les caisses
  hosts: web
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present
    - name: Démarrer nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
    - name: Déposer la page d'accueil
      ansible.builtin.template:
        src: index.html.j2
        dest: /var/www/html/index.html
      notify: Recharger nginx
  handlers:
    - name: Recharger nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

2. Terminal : `ansible-playbook -i inventory.ini site.yml`
3. Terminal : `ansible-playbook -i inventory.ini site.yml`
4. Question « Quand un handler s’exécute-t-il ? » : **Seulement si la tâche qui le notifie a produit un changement**

*Phrase de bilan :* Terraform crée la machine ; Ansible y installe et configure. Un handler ne s’exécute que si une tâche a réellement changé quelque chose.

## 3.4 — --check, --diff et dérive

*Idée reçue visée :* —

1. Terminal : `guest caisse write /var/www/html/index.html Page bidouillee`
2. Terminal : `guest caisse stop nginx`
3. Terminal : `ansible-playbook -i inventory.ini site.yml --check --diff`
4. Question « Que fait --check ? » : **Simule : montre ce qui changerait sans rien modifier**
5. Terminal : `ansible-playbook -i inventory.ini site.yml`

*Phrase de bilan :* Avec --check --diff, on voit ce qui changerait avant de le faire. Une modification manuelle se détecte et se corrige en relançant le playbook.

## 3.5 — Le piège de « command »

*Idée reçue visée :* --check garantit que tout est idempotent.

1. Terminal : `ansible-playbook -i inventory.ini site.yml`
2. Terminal : `ansible-playbook -i inventory.ini site.yml`
3. Terminal : `ansible-playbook -i inventory.ini site.yml --check`
4. Question « Avec --check, la tâche « command » apparaît comme… » : **skipping : --check ne l’exécute pas et ne peut donc pas voir qu’elle n’est pas idempotente**
5. Écrire `config/site.yml` :

```
- name: Marqueur
  hosts: web
  tasks:
    - name: Créer le marqueur
      ansible.builtin.command: touch /tmp/marqueur
      args:
        creates: /tmp/marqueur
```


*Phrase de bilan :* « command » et « shell » ne savent pas ce qui existe : ils sont toujours « changed ». Préférez un module dédié, ou ajoutez creates.

## TD3 — Que va faire ce playbook ?

*Idée reçue visée :* —

1. Question « Cas A : résultat de la tâche ? » : **changed**
2. Question « Cas B : résultat ? » : **ok**
3. Question « Cas C : résultat ? » : **changed**
4. Question « Cas D : résultat de la seconde tâche ? » : **changed : le contenu diffère**

*Phrase de bilan :* Prédire le résultat avant de lancer, c’est comprendre ce que le module vérifie.

## 4.1 — Mini-projet : Terraform crée, Ansible configure

*Idée reçue visée :* —

1. Écrire `projet/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
}

resource "cloudpeda_vm" "stock" {
  name       = "stock"
  network_id = cloudpeda_network.principal.id
}

output "inventaire" {
  value = join("\n", [
    "[web]",
    format("%s ansible_host=%s", cloudpeda_vm.caisse.name, cloudpeda_vm.caisse.ip),
    "[bdd]",
    format("%s ansible_host=%s", cloudpeda_vm.stock.name, cloudpeda_vm.stock.ip),
    "[all:vars]",
    "ansible_become=true",
  ])
}
```

2. Terminal : `terraform init`
3. Terminal : `terraform apply -auto-approve`
4. Terminal : `terraform output -raw inventaire > inventory.ini`
5. Terminal : `ansible-playbook -i inventory.ini site.yml`
6. Question « Qui installe nginx dans la machine ? » : **Ansible, une fois la machine créée**

*Phrase de bilan :* Terraform décrit ce qui existe (machines, réseau) et le dit à Ansible ; Ansible décrit ce qu’il y a dedans. Aucun des deux ne fait le travail de l’autre.

## 4.2 — Changement et bonnes pratiques

*Idée reçue visée :* Supprimer un mot de passe du dépôt suffit.

1. Écrire `projet/main.tf` :

```
terraform {
  required_providers {
    cloudpeda = {
      source = "registry.example/ecole/cloudpeda"
    }
  }
}

resource "cloudpeda_network" "principal" {
  name = "reseau-brasserie"
  cidr = "203.0.113.0/24"
}

resource "cloudpeda_vm" "caisse" {
  name       = "caisse"
  network_id = cloudpeda_network.principal.id
}

resource "cloudpeda_vm" "stock" {
  name       = "stock"
  network_id = cloudpeda_network.principal.id
}

output "inventaire" {
  value = join("\n", [
    "[web]",
    format("%s ansible_host=%s", cloudpeda_vm.caisse.name, cloudpeda_vm.caisse.ip),
    "[bdd]",
    format("%s ansible_host=%s", cloudpeda_vm.stock.name, cloudpeda_vm.stock.ip),
    "[all:vars]",
    "ansible_become=true",
  ])
}

resource "cloudpeda_firewall_rule" "https" {
  vm_id = cloudpeda_vm.caisse.id
  port  = 443
}
```

2. Écrire `projet/site.yml` :

```
- name: Configurer la caisse
  hosts: web
  tasks:
    - name: Installer nginx
      ansible.builtin.apt:
        name: nginx
        state: present
    - name: Installer fail2ban
      ansible.builtin.apt:
        name: fail2ban
        state: present

- name: Configurer la base de données
  hosts: bdd
  tasks:
    - name: Installer postgresql
      ansible.builtin.apt:
        name: postgresql
        state: present
```

3. Terminal : `terraform plan`
4. Terminal : `terraform apply -auto-approve`
5. Terminal : `ansible-playbook -i inventory.ini site.yml`
6. Terminal : `git init`
7. Écrire `projet/.gitignore` :

```
terraform.tfstate
terraform.tfstate.backup
secrets.auto.tfvars
.terraform/
```

8. Terminal : `git add .`
9. Terminal : `git commit -m "Ouvre le port 443 et installe fail2ban"`
10. Terminal : `git status`
11. Question « Un mot de passe a été commité par erreur, puis supprimé dans le commit suivant. Est-il en sécurité ? » : **Non : il reste dans l’historique, il faut le changer**

*Phrase de bilan :* Chaque changement passe par le code, est relu dans le plan, puis versionné. L’état et les secrets restent hors du dépôt : un secret commité reste dans l’historique.

## 5.1 — Quiz de fin de parcours

*Idée reçue visée :* —

1. Question « Un fichier Terraform décrit… » : **l’état souhaité de l’infrastructure**
2. Question « Que fait « terraform plan » ? » : **Il montre ce qui serait fait, sans rien modifier**
3. Question « À quoi sert le fichier d’état ? » : **À relier chaque bloc du code à l’objet réel correspondant**
4. Question « Pourquoi ne publie-t-on pas terraform.tfstate dans un dépôt Git ? » : **Il peut contenir des valeurs sensibles et appartient à un environnement précis**
5. Question « Dans un plan, « -/+ » signifie… » : **détruire puis recréer (remplacement)**
6. Question « Quelqu’un change une machine à la main. Comment le voit-on ? » : **Un plan (avec actualisation) montre l’écart**
7. Question « Une tâche Ansible est idempotente si… » : **la relancer donne le même résultat et ne change que ce qui manque**
8. Question « Quand un handler s’exécute-t-il ? » : **Quand une tâche qui le notifie a produit un changement**
9. Question « Ansible agit sur les machines de l’inventaire… » : **par une connexion distante (SSH), sans agent dédié**
10. Question « Pourquoi préférer le module apt à « command: apt install » ? » : **Le module connaît l’état et reste idempotent ; command est toujours « changed »**
11. Question « Pour avoir un environnement de test et un de production identiques… » : **On garde les mêmes fichiers et on change les valeurs**
12. Question « Un mot de passe a été commité puis supprimé. Que faire ? » : **Le changer : il reste dans l’historique**

*Phrase de bilan :* Les erreurs repérées ici disent quels TP reprendre.

## 5.2 — Quel outil pour quoi ?

*Idée reçue visée :* Terraform et Ansible font la même chose.

1. Question « Créer un réseau et des machines chez le fournisseur » : **Terraform**
2. Question « Installer nginx et déposer sa configuration dans une machine » : **Ansible**
3. Question « Ouvrir le port 443 sur le pare-feu du fournisseur » : **Terraform**
4. Question « Redémarrer un service après un changement de configuration » : **Ansible**
5. Question « Déployer un serveur web prêt à l’emploi à partir de rien » : **Terraform puis Ansible**
6. Question « Créer un utilisateur système dans une machine existante » : **Ansible**
7. Question « Détecter qu’une machine a été agrandie à la main chez le fournisseur » : **Terraform**
8. Question « Donner les adresses des machines créées à l’outil qui les configure » : **Terraform puis Ansible**

*Phrase de bilan :* Terraform crée et décrit ce qui existe chez le fournisseur ; Ansible décrit ce qu’il y a dans les machines ; les deux s’enchaînent.

## 5.3 — Auto-évaluation

*Idée reçue visée :* —

_Pas de manipulation : auto-évaluation personnelle._

*Phrase de bilan :* Votre auto-évaluation figure dans le compte rendu : elle sert de point de départ à la discussion avec l’enseignant.
