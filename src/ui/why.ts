/** Panneau « Pourquoi ? » : explique en une ou deux phrases ce que vient de faire la dernière commande. Pur. */
export interface Why { title: string; text: string }

export function explain(line: string, ok: boolean, output: string): Why | null {
  const w = line.trim().split(/\s+/);
  const cmd = w[0] ?? ''; const sub = w[1] ?? '';
  if (!cmd) return null;
  if (cmd === 'tofu') return explain(line.replace(/^tofu/, 'terraform'), ok, output);
  if (cmd === 'terraform') {
    if (/Terraform initialized|Missing|Backend initialization required|plugin/i.test(output) && !ok && /init/i.test(output)) return { title: 'Il faut d’abord initialiser', text: 'terraform init prépare le dossier : il choisit le fournisseur et écrit le fichier de verrouillage. Sans lui, les autres commandes refusent de travailler.' };
    if (/Cycle/i.test(output)) return { title: 'Dépendance circulaire', text: 'Deux ressources se réclament l’une de l’autre : aucun ordre de création n’est possible. Il faut casser la boucle dans le code.' };
    if (/already exists/i.test(output)) return { title: 'Un objet du même nom existe déjà', text: 'Le fournisseur refuse les doublons. Soit l’objet existe hors de Terraform (il n’est pas dans l’état), soit une valeur a été recopiée par erreur.' };
    if (!ok && /Error:/.test(output)) return { title: 'Une erreur', text: 'Lisez le bloc d’erreur : il donne la ligne, le fichier et la cause. Corrigez le code, puis relancez terraform validate.' };
    switch (sub) {
      case 'init': return { title: 'terraform init', text: 'Prépare le dossier de travail : sélectionne le fournisseur déclaré et crée .terraform.lock.hcl. À refaire après un changement de fournisseur.' };
      case 'validate': return { title: 'terraform validate', text: 'Vérifie la syntaxe et la cohérence du code, sans interroger le monde réel ni modifier quoi que ce soit.' };
      case 'fmt': return { title: 'terraform fmt', text: 'Remet en forme les fichiers (indentation, alignement des =) sans changer leur sens.' };
      case 'plan': return { title: 'terraform plan', text: /refresh-only/.test(line) ? 'Compare l’état avec le monde réel et montre la dérive, sans rien modifier.' : 'Calcule la différence entre le code, l’état et le monde réel. Ne modifie rien : + créer, ~ modifier sur place, - détruire, -/+ remplacer.' };
      case 'apply': return { title: 'terraform apply', text: 'Exécute le plan : crée, modifie ou détruit ce qu’il faut pour que le monde corresponde au code, puis met à jour l’état. Il demande confirmation (réponse « yes »).' };
      case 'destroy': return { title: 'terraform destroy', text: 'Détruit tout ce que gère l’état, en commençant par ce qui dépend des autres.' };
      case 'output': return { title: 'terraform output', text: 'Lit les sorties dans l’état : c’est ainsi qu’une valeur calculée (une adresse IP) sort de Terraform. Avec -raw, sans guillemets, prête à être redirigée.' };
      case 'state': return { title: 'terraform state', text: 'Lit l’état : list donne les adresses suivies, show détaille une ressource (identifiant, adresse IP…).' };
      case 'show': return { title: 'terraform show', text: 'Affiche l’état (ou un plan enregistré) sous une forme lisible.' };
      default: return null;
    }
  }
  if (cmd === 'ansible-playbook') {
    if (/UNREACHABLE/.test(output)) return { title: 'Machine injoignable', text: 'Ansible ne trouve pas la machine : nom ou adresse de l’inventaire inexacts, machine absente, ou service ssh arrêté.' };
    if (/FAILED!/.test(output)) return { title: 'Une tâche a échoué', text: 'Lisez le message « msg » : droits manquants (become), paquet introuvable, fichier source absent… La machine concernée sort du play.' };
    if (/--check|-C\b/.test(line)) return { title: 'Mode --check', text: 'Simulation : Ansible dit ce qui changerait sans rien modifier. Les tâches « command » sont sautées : --check ne garantit donc pas l’idempotence.' };
    return { title: 'ansible-playbook', text: 'Applique le playbook sur les machines de l’inventaire. « changed » : quelque chose a été modifié ; « ok » : déjà conforme. Au second passage, on attend changed=0.' };
  }
  if (cmd === 'ansible') return { title: 'ansible (commande ponctuelle)', text: 'Lance un seul module sur un groupe de machines : -m choisit le module, -a ses arguments. Pratique pour tester la connexion (-m ping).' };
  if (cmd === 'ansible-inventory') return { title: 'ansible-inventory', text: 'Montre l’inventaire tel qu’Ansible le comprend : groupes, machines, variables.' };
  if (cmd === 'git') return { title: 'git', text: 'Versionne les fichiers du projet. Le .gitignore garde l’état Terraform et les secrets hors du dépôt.' };
  if (cmd === 'cloud') return { title: 'Console du fournisseur', text: 'Agit directement sur le monde réel, hors du code : c’est ce qui crée de la dérive.' };
  if (cmd === 'guest') return { title: 'Action manuelle dans une machine', text: 'Modifie la machine à la main, sans Ansible : de quoi provoquer un écart à détecter ensuite.' };
  if (cmd === 'bash' || cmd === 'sh') return { title: 'Script impératif', text: 'Exécute une suite d’actions, une par une, sans se demander ce qui existe déjà.' };
  return null;
}
