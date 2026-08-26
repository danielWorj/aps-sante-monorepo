// src/utils/rdv.js
//
// Logique de catégorisation d'un rendez-vous en onglet, partagée entre
// le portail patient (components/portails/components/patient-rdv.jsx)
// et le portail médecin (components/portails/components/medecin-rdv.jsx).
//
// Auparavant dupliquée à l'identique dans les deux fichiers — extraite
// ici pour éviter qu'un correctif appliqué d'un côté soit oublié de
// l'autre (cf. bug du bouton "Rejoindre la visio" qui disparaissait à
// l'heure du RDV, corrigé le même jour que cette extraction).

/**
 * Répartit un rendez-vous dans une catégorie d'onglet selon son statut
 * (et non son heure — voir note ci-dessous).
 *   - 'cree'                 → attente (le médecin doit accepter/refuser)
 *   - 'confirme'             → avenir
 *   - 'en_attente_presence'  → avenir (le RDV est confirmé, en cours)
 *   - 'honore' / 'non_honore'→ passes
 *   - 'annule'               → annules
 *   - 'conteste'             → annules (avec mention spéciale)
 *
 * ⚠️ Un RDV 'confirme'/'en_attente_presence' reste "avenir" même une
 * fois l'heure du créneau dépassée : c'est justement à ce moment (et
 * parfois quelques minutes après, le temps que les deux parties se
 * connectent) que patient et médecin doivent voir le bouton
 * "Rejoindre la visio" / "Démarrer la visio". Seul un statut de
 * clôture explicite (honore/non_honore/annule/conteste, posé côté
 * serveur) fait sortir le RDV de "avenir" — on ne se base jamais sur
 * `date_creneau < now` pour ça.
 *
 * @param {{ statut: string }} rdv
 * @returns {"attente"|"avenir"|"passes"|"annules"}
 */
export function categoriserRdv(rdv) {
  switch (rdv.statut) {
    case "cree":
      return "attente";
    case "confirme":
    case "en_attente_presence":
      return "avenir";
    case "honore":
    case "non_honore":
      return "passes";
    case "annule":
    case "conteste":
      return "annules";
    default:
      return "avenir";
  }
}