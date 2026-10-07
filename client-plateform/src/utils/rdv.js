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
 *   - 'cree'                 → attente (RDV NON PAYÉ : en attente du paiement du patient ;
 *                              le médecin ne peut rien faire dessus, voir D8)
 *   - 'confirme'             → avenir (ou passes si la fin de consultation est constatée)
 *   - 'en_attente_presence'  → avenir (idem : passes si `termine_le` est renseigné)
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
      // Libération différée : une fois la fin de consultation constatée (code
      // validé par le médecin, ou visio clôturée), `termine_le` est renseigné
      // mais le statut reste « confirme » pendant T heures — c'est le cron de
      // libération qui le passe ensuite à « honore ». La consultation est
      // terminée : elle ne doit plus apparaître dans « À venir ».
      return estConsultationTerminee(rdv) ? "passes" : "avenir";
    case "a_reprogrammer": // deux absents : reste dans « À venir », avec le panneau de reprogrammation
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

/**
 * D8 — Un RDV est « non payé » tant qu'il est au statut `cree` (avant la finalisation du
 * paiement). Pour le médecin, le serveur ne renvoie alors que { rdv_id, date_creneau,
 * statut, non_paye: true } : ni patient, ni motif, ni lien de visio. Ce helper sert à
 * griser le RDV et à désactiver ses actions ; le verrou réel est côté serveur (409).
 *
 * @param {{ statut?: string, non_paye?: boolean }} rdv
 * @returns {boolean}
 */
export function estRdvNonPaye(rdv) {
  return rdv?.non_paye === true || rdv?.statut === "cree";
}

/**
 * D8 — Reconnaît le refus serveur « RDV non payé » (HTTP 409, code RDV_NON_PAYE) : le
 * médecin a tenté une action sur un RDV non payé malgré l'interface désactivée.
 *
 * @param {{ status?: number, data?: { code?: string } }} err
 * @returns {boolean}
 */
export function estErreurRdvNonPaye(err) {
  return err?.status === 409 && err?.data?.code === "RDV_NON_PAYE";
}

// ─── Libération différée des fonds (code de fin de consultation) ─────────

/**
 * Longueur du code de consultation émis par le serveur pour les nouveaux RDV.
 * Les anciens RDV encore actifs peuvent avoir un code de 6 à 8 caractères
 * (la colonne reste en VarChar(8)) : la saisie accepte donc 6 à 8 caractères.
 */
export const CODE_CONSULTATION_LONGUEUR_MIN = 6;
export const CODE_CONSULTATION_LONGUEUR_MAX = 8;

/**
 * La fin de consultation a-t-elle été constatée ? (`termine_le` renseigné :
 * code validé par le médecin, ou clôture de la visio).
 * @param {{ termine_le?: string|null }} rdv
 * @returns {boolean}
 */
export function estConsultationTerminee(rdv) {
  return Boolean(rdv?.termine_le);
}

/**
 * Le médecin peut-il saisir le code pour terminer ce RDV ? Réservé aux RDV
 * PHYSIQUES payés (confirme / en_attente_presence) dont la fin n'est pas déjà
 * constatée. Une téléconsultation se termine à la clôture de la visio (pas de
 * code). Le verrou réel reste côté serveur.
 * @param {object} rdv
 * @returns {boolean}
 */
export function peutTerminerRdv(rdv) {
  return (
    rdv?.type_rdv === "physique" &&
    !estRdvNonPaye(rdv) &&
    (rdv.statut === "confirme" || rdv.statut === "en_attente_presence") &&
    !estConsultationTerminee(rdv)
  );
}

/**
 * Les fonds de ce RDV sont-ils encore en attente de libération ? Vrai tant
 * que la fin est constatée et que le RDV n'est pas encore passé « honore »
 * par le cron (statut confirme / en_attente_presence), ou qu'il est
 * « honore » avec une libération prévue dans le futur.
 * @param {{ statut?: string, termine_le?: string|null, liberation_prevue_le?: string|null }} rdv
 * @returns {boolean}
 */
export function fondsEnAttenteDeLiberation(rdv) {
  if (!estConsultationTerminee(rdv) || !rdv.liberation_prevue_le) return false;
  if (rdv.statut === "confirme" || rdv.statut === "en_attente_presence") return true;
  return rdv.statut === "honore" && new Date(rdv.liberation_prevue_le) > new Date();
}

/**
 * « 12/10 à 14:30 » — date de libération prévue, en heure locale.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function formaterDateLiberation(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const jour = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

/**
 * Fonds du médecin encore en séquestre après une fin de consultation constatée
 * (libération différée à `termine_le + T`). Le client ne calcule AUCUN montant :
 * il compte les RDV concernés et repère la prochaine échéance renvoyée par le
 * serveur (`liberation_prevue_le`).
 * @param {Array<object>} rdvs liste des RDV du médecin (GET /rendez-vous)
 * @returns {{ rdvs: object[], nombre: number, prochaineLiberation: string|null }}
 */
export function resumerFondsEnAttente(rdvs) {
  const enAttente = (Array.isArray(rdvs) ? rdvs : []).filter(fondsEnAttenteDeLiberation);
  enAttente.sort((a, b) => new Date(a.liberation_prevue_le) - new Date(b.liberation_prevue_le));
  return {
    rdvs: enAttente,
    nombre: enAttente.length,
    prochaineLiberation: enAttente[0]?.liberation_prevue_le ?? null,
  };
}