// src/services/politiqueFonds.service.js
// Politique de fonds v2 — Service PUR (aucun accès base, aucun effet de
// bord, aucune horloge implicite) : pour un événement donné, il décide
// où vont les fonds. Les services d'exécution (annulation, absence,
// libération, cron) appellent `decider(...)` puis appliquent la
// décision (Stripe d'abord, base ensuite) — la règle métier vit ICI,
// une seule fois, et se teste sans base.
//
// Principe « aucune valeur dérivée stockée » : cette fonction ne
// stocke rien ; elle recalcule à partir de faits (honoraires, lignes
// figées sur la transaction, dates).

import { arrondir } from "../utils/montants.js";
import { calculerFrais } from "./fraisAgregateur.service.js";

export const EVENEMENTS = Object.freeze({
  ANNULATION_PATIENT: "annulation_patient",
  ANNULATION_MEDECIN: "annulation_medecin",
  MEDECIN_ABSENT: "medecin_absent",
  PATIENT_ABSENT: "patient_absent",
  DEUX_ABSENTS: "deux_absents",
  DEUX_ABSENTS_SANS_REPROGRAMMATION: "deux_absents_sans_reprogrammation",
  PAIEMENT_TARDIF: "paiement_tardif",
});

// Motifs stockés dans RemboursementPaiement.motif (VarChar(50), unique
// avec transaction_id). Les 4 premiers existent déjà en base.
export const MOTIFS = Object.freeze({
  ANNULATION_PRECOCE: "annulation_precoce",
  DEFAILLANCE_PRO: "defaillance_pro",
  PAIEMENT_APRES_ANNULATION: "paiement_apres_annulation",
  DEUX_ABSENTS: "deux_absents_sans_reprogrammation", // nouveau
});

// §3-§4 : pile 24h reste du côté « plus de 24h » (remboursement).
export const DELAI_TARDIF_MS = 24 * 60 * 60 * 1000;
// §5 : délai de reprogrammation (deux absents), en heures.
export const DELAI_REPROGRAMMATION_H = 48;

/**
 * Vrai si on est à MOINS de 24h du créneau (strictement). Pile 24h
 * -> faux. Un créneau déjà passé est tardif (à l'appelant de refuser
 * l'annulation patient après l'heure, comme aujourd'hui).
 */
export function estAnnulationTardive(dateCreneau, maintenant) {
  return new Date(dateCreneau).getTime() - new Date(maintenant).getTime() < DELAI_TARDIF_MS;
}

/** Vrai si le délai de reprogrammation (48h) est écoulé (inclus). */
export function delaiReprogrammationEcoule(aReprogrammerLe, maintenant) {
  return (
    new Date(maintenant).getTime() - new Date(aReprogrammerLe).getTime() >=
    DELAI_REPROGRAMMATION_H * 60 * 60 * 1000
  );
}

/**
 * Remboursement selon §2 : honoraires − frais de remboursement, plancher 0.
 * `brut` = ce qui est dû avant frais (CamPay : montant porté par la ligne
 * a_traiter) ; `net` = brut − frais estimés, jamais négatif.
 */
function remboursementSelonRegleGenerale(brut, frais, decimales) {
  const net = Math.max(0, arrondir(brut - frais, decimales));
  return { brut: arrondir(brut, decimales), frais, net, creerLigne: net > 0 };
}

/**
 * Net réellement versé au patient pour un remboursement CamPay clôturé :
 * brut − frais RÉELS du retrait Mobile Money, plancher 0 (§2). Fonction
 * de l'action admin de clôture (étape 5) ; recalculé, jamais stocké.
 */
export function netRembourseCampay(brut, fraisReels, decimales = 0) {
  const f = Number(fraisReels);
  if (!Number.isFinite(f) || f < 0) {
    throw new Error(`Frais réels invalides (${fraisReels}) : un montant positif ou nul est attendu.`);
  }
  return Math.max(0, arrondir(Number(brut) - f, decimales));
}

/**
 * Décision de fonds pour un événement.
 *
 * @param {object} p
 * @param {string} p.evenement            une valeur de EVENEMENTS
 * @param {number|string} p.honoraires    TransactionPaiement.montant_honoraires
 * @param {{ taux: number|string }} p.commission            ligne_commission figée
 * @param {{ taux?: number|string, montant_fixe?: number|string }} p.fraisRemboursement
 *        ligne de frais de remboursement (figée, ou active — voir
 *        resoudreFraisRemboursement)
 * @param {Date|string} [p.dateCreneau]   requis pour annulation_patient / annulation_medecin
 * @param {Date|string} [p.maintenant]    requis pour annulation_patient / annulation_medecin
 * @param {0|2} [p.decimales=2]           0 pour CamPay / devises zéro-décimale
 * @returns {{
 *   evenement: string,
 *   tardif: boolean|null,
 *   remboursement: null | { brut:number, frais:number, net:number, creerLigne:boolean, motif:string },
 *   versementMedecin: number,   // honoraires − commission (AVANT amendes), 0 si non payé
 *   commissionAps: number,      // à enregistrer dans CommissionApsVersee si > 0
 *   amende: boolean,            // créer une AmendeMedecin (§7)
 *   sortEscrow: "rembourse"|"libere"|"sequestre"|"aucun",
 *   statutRdv: "annule"|"non_honore"|"a_reprogrammer"|null,
 *   notifierReprogrammation: boolean,
 * }}
 */
export function decider({
  evenement,
  honoraires,
  commission,
  fraisRemboursement,
  dateCreneau,
  maintenant,
  decimales = 2,
}) {
  const h = Number(honoraires);
  if (!Number.isFinite(h) || h < 0) {
    throw new Error(`Honoraires invalides (${honoraires}) : décision de fonds impossible.`);
  }
  if (!Object.values(EVENEMENTS).includes(evenement)) {
    throw new Error(`Événement de fonds inconnu : "${evenement}".`);
  }
  if (!commission || commission.taux == null) {
    throw new Error("Ligne de commission manquante : décision de fonds impossible.");
  }

  const honorairesArr = arrondir(h, decimales);
  const commissionAps = Math.min(honorairesArr, arrondir(h * Number(commission.taux), decimales));
  const netMedecinAvantAmende = arrondir(honorairesArr - commissionAps, decimales);

  // Décision de base : rien ne bouge.
  const base = {
    evenement,
    tardif: null,
    remboursement: null,
    versementMedecin: 0,
    commissionAps: 0,
    amende: false,
    sortEscrow: "sequestre",
    statutRdv: null,
    notifierReprogrammation: false,
  };

  // Deux absents : aucun calcul de frais, les fonds restent en séquestre.
  if (evenement === EVENEMENTS.DEUX_ABSENTS) {
    return { ...base, statutRdv: "a_reprogrammer", notifierReprogrammation: true };
  }

  // Tous les autres cas de remboursement ont besoin des frais.
  const frais = calculerFrais(h, fraisRemboursement, decimales);
  const rembourse = (brut, motif) => ({
    ...remboursementSelonRegleGenerale(brut, frais, decimales),
    motif,
  });

  // Patient fautif (annulation < 24h, absence) : médecin payé moins commission.
  const patientFautif = () => ({
    ...base,
    remboursement: null,
    versementMedecin: netMedecinAvantAmende,
    commissionAps,
    sortEscrow: "libere",
  });

  switch (evenement) {
    case EVENEMENTS.ANNULATION_PATIENT: {
      exigerDates(dateCreneau, maintenant, evenement);
      const tardif = estAnnulationTardive(dateCreneau, maintenant);
      if (tardif) return { ...patientFautif(), tardif, statutRdv: "annule" };
      return {
        ...base,
        tardif,
        remboursement: rembourse(honorairesArr, MOTIFS.ANNULATION_PRECOCE),
        sortEscrow: "rembourse",
        statutRdv: "annule",
      };
    }

    case EVENEMENTS.ANNULATION_MEDECIN: {
      exigerDates(dateCreneau, maintenant, evenement);
      const tardif = estAnnulationTardive(dateCreneau, maintenant);
      return {
        ...base,
        tardif,
        remboursement: rembourse(
          honorairesArr,
          tardif ? MOTIFS.DEFAILLANCE_PRO : MOTIFS.ANNULATION_PRECOCE
        ),
        amende: tardif,
        sortEscrow: "rembourse",
        statutRdv: "annule",
      };
    }

    case EVENEMENTS.MEDECIN_ABSENT:
      return {
        ...base,
        remboursement: rembourse(honorairesArr, MOTIFS.DEFAILLANCE_PRO),
        amende: true,
        sortEscrow: "rembourse",
        statutRdv: "non_honore",
      };

    case EVENEMENTS.PATIENT_ABSENT:
      return { ...patientFautif(), statutRdv: "non_honore" };

    case EVENEMENTS.DEUX_ABSENTS_SANS_REPROGRAMMATION:
      // §5 : patient remboursé de honoraires − frais − commission APS ;
      // la commission est versée à APS ; le médecin ne touche rien.
      return {
        ...base,
        remboursement: rembourse(netMedecinAvantAmende, MOTIFS.DEUX_ABSENTS),
        commissionAps,
        sortEscrow: "rembourse",
        statutRdv: "non_honore",
      };

    case EVENEMENTS.PAIEMENT_TARDIF:
      // §6 : payé après annulation -> honoraires − frais de remboursement.
      // Pas d'escrow (le RDV est déjà annulé), ni commission, ni amende.
      return {
        ...base,
        remboursement: rembourse(honorairesArr, MOTIFS.PAIEMENT_APRES_ANNULATION),
        sortEscrow: "aucun",
      };

    default:
      throw new Error(`Événement de fonds non géré : "${evenement}".`);
  }
}

function exigerDates(dateCreneau, maintenant, evenement) {
  if (!dateCreneau || !maintenant) {
    throw new Error(`"dateCreneau" et "maintenant" sont requis pour l'événement "${evenement}".`);
  }
}

/**
 * Répartition d'une libération de fonds (§1) : honoraires = commission
 * APS + crédit net du médecin (AVANT amendes). Fonction pure, utilisée
 * par liberationEscrow.service.js pour tout versement au médecin
 * (RDV honoré, annulation patient < 24h, patient absent). Même formule
 * que `decider` (commission plafonnée aux honoraires).
 * @param {{ honoraires: number|string, commission: { taux: number|string }, decimales?: 0|2 }} p
 * @returns {{ honoraires:number, commissionAps:number, netMedecin:number }}
 */
export function repartirLiberation({ honoraires, commission, decimales = 2 }) {
  if (!commission || commission.taux == null) {
    throw new Error("Ligne de commission manquante : répartition de la libération impossible.");
  }
  const h = arrondir(honoraires, decimales);
  const commissionAps = Math.min(h, arrondir(Number(honoraires) * Number(commission.taux), decimales));
  return { honoraires: h, commissionAps, netMedecin: arrondir(h - commissionAps, decimales) };
}

// -----------------------------------------------------------------
// §7 — Amendes du médecin (calcul pur ; l'écriture en base est faite
// par amende.service.js à l'étape 4).
// -----------------------------------------------------------------

/**
 * Point ouvert C : base de calcul de l'amende = crédit NET de la
 * libération (honoraires − commission APS), avant imputation des
 * amendes. Fonction unique : pour changer la base (ex. honoraires
 * bruts), on ne modifie que celle-ci.
 * @returns {number}
 */
export function baseCalculAmende({ honoraires, commission, decimales = 2 }) {
  const h = arrondir(honoraires, decimales);
  const c = Math.min(h, arrondir(Number(honoraires) * Number(commission.taux), decimales));
  return arrondir(h - c, decimales);
}

/**
 * Imputation des amendes en attente sur UN crédit (§7). Règle simple :
 *  - une amende = taux (fixé par l'admin, ex. 20 %) × crédit net de la
 *    libération (voir baseCalculAmende) ; toutes sur la MÊME base ;
 *  - imputées de la PLUS ANCIENNE à la plus récente ;
 *  - la somme imputée ne dépasse jamais le crédit : une amende est
 *    imputée en entier ou pas du tout. Une amende qui ne tient pas dans
 *    le crédit restant est SAUTÉE (elle reste « en_attente » pour la
 *    libération suivante) et on essaie les suivantes, qui peuvent encore
 *    tenir (aucun reliquat à mémoriser, donc aucune colonne en base).
 *
 * @param {object} p
 * @param {number} p.creditNet   crédit net de la libération (avant amendes)
 * @param {Array<{ amende_id:string, taux:number|string, date_creation:Date|string }>} p.amendes
 * @param {0|2} [p.decimales=2]
 * @returns {{ totalImpute:number, creditApres:number,
 *             imputations:Array<{ amende_id:string, montant:number }> }}
 *   imputations = amendes à passer « imputee » (montant_impute = montant)
 */
export function imputerAmendes({ creditNet, amendes, decimales = 2 }) {
  const credit = arrondir(creditNet, decimales);
  if (!(credit > 0) || !amendes?.length) {
    return { totalImpute: 0, creditApres: Math.max(0, credit), imputations: [] };
  }

  const ordonnees = [...amendes].sort(
    (a, b) =>
      new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime() ||
      String(a.amende_id).localeCompare(String(b.amende_id))
  );

  let capacite = credit;
  const imputations = [];
  for (const a of ordonnees) {
    const montant = arrondir(credit * Number(a.taux), decimales);
    if (montant > capacite) continue; // ne tient pas : reste en attente, on essaie la suivante
    capacite = arrondir(capacite - montant, decimales);
    imputations.push({ amende_id: a.amende_id, montant });
  }

  return { totalImpute: arrondir(credit - capacite, decimales), creditApres: capacite, imputations };
}

// -----------------------------------------------------------------
// Étape 5 — compléments purs utilisés par traitementFonds.service.js
// et absence.service.js.
// -----------------------------------------------------------------

/** Statuts d'un RDV « actif » (miroir de l'index unique partiel, étape 1). */
export const STATUTS_RDV_ACTIFS = Object.freeze([
  "cree",
  "confirme",
  "en_attente_presence",
  "a_reprogrammer",
]);

/**
 * §5 — Événement d'absence déduit des FAITS de présence enregistrés
 * (`medecin_present_le`, `patient_present_le`). Aucun horodatage du tout
 * => « deux absents » (pas de fautif désigné par défaut). Les deux
 * présents mais RDV jamais clôturé => `null` : jamais décidé
 * automatiquement, signalé pour arbitrage admin (forcer-liberation).
 * @returns {string|null} une valeur de EVENEMENTS, ou null
 */
export function determinerEvenementAbsence({ medecin_present_le, patient_present_le }) {
  const medecin = Boolean(medecin_present_le);
  const patient = Boolean(patient_present_le);
  if (medecin && patient) return null;
  if (medecin) return EVENEMENTS.PATIENT_ABSENT; // seul le médecin est venu
  if (patient) return EVENEMENTS.MEDECIN_ABSENT; // seul le patient est venu
  return EVENEMENTS.DEUX_ABSENTS;
}

/**
 * Décision pour un RDV SANS escrow (jamais payé) : aucun fonds ne
 * bouge, mais le statut du RDV et l'amende (point ouvert D : due même
 * sans escrow) restent décidés ici, une seule fois.
 * @returns {{ evenement:string, tardif:boolean|null, amende:boolean, statutRdv:string }}
 */
export function decisionSansFonds({ evenement, dateCreneau, maintenant }) {
  switch (evenement) {
    case EVENEMENTS.ANNULATION_PATIENT: {
      exigerDates(dateCreneau, maintenant, evenement);
      return { evenement, tardif: estAnnulationTardive(dateCreneau, maintenant), amende: false, statutRdv: "annule" };
    }
    case EVENEMENTS.ANNULATION_MEDECIN: {
      exigerDates(dateCreneau, maintenant, evenement);
      const tardif = estAnnulationTardive(dateCreneau, maintenant);
      return { evenement, tardif, amende: tardif, statutRdv: "annule" };
    }
    case EVENEMENTS.MEDECIN_ABSENT:
      return { evenement, tardif: null, amende: true, statutRdv: "non_honore" };
    case EVENEMENTS.PATIENT_ABSENT:
    case EVENEMENTS.DEUX_ABSENTS:
    case EVENEMENTS.DEUX_ABSENTS_SANS_REPROGRAMMATION:
      // Sans escrow, rien à séquestrer ni à reprogrammer : défensif (un
      // RDV n'atteint « confirme » qu'avec un escrow, sauf forçage admin).
      return { evenement, tardif: null, amende: false, statutRdv: "non_honore" };
    default:
      throw new Error(`Événement \"${evenement}\" sans objet pour un rendez-vous non payé.`);
  }
}