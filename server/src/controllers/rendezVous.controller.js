// src/controllers/rendezVous.controller.js
// Module transverse "Gestion des médecins" — pivot rendez_vous +
// ordonnance (voir medecin.routes.js pour les règles d'accès résumées
// et schema.prisma pour le détail des champs).
//
// Donnée privée patient/médecin, jamais publique : toutes les routes
// exigent déjà "authentifier" (middleware). L'autorisation fine
// (patient concerné, médecin concerné, ou admin/superadmin) est
// appliquée ICI, au cas par cas.
//
// code_unique / qr_token_secret servent au contrôle de présence à
// l'accueil (scan/QR) : générés côté serveur à la création, jamais
// saisis par le client.

import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { libererEscrow } from "../services/liberationEscrow.service.js";
import { traiterAnnulation } from "../services/annulation.service.js";
import { enregistrerPresence } from "../services/presence.service.js";
import {
  ROLES_VISIBILITE,
  filtrerResultatAnnulation,
  projeterRdvNonPayePourMedecin,
} from "../services/visibiliteRole.service.js";
import { estViolationCreneauActif, MESSAGE_CRENEAU_PRIS } from "../utils/erreursPrisma.js";

const TYPES_RDV = ["physique", "teleconsultation"];
const STATUTS_RDV = [
  "cree",
  "confirme",
  "en_attente_presence",
  "honore",
  "non_honore",
  "annule",
  "conteste",
  "a_reprogrammer",
];

// Phase 3 — motifs d'annulation (liste fermée, politique de gestion des
// fonds §3). Doit rester alignée sur l'enum Prisma MotifAnnulation
// (même duplication assumée que STATUTS_RDV ci-dessus).
const MOTIFS_ANNULATION = [
  "changement_horaire_patient",
  "urgence_personnelle",
  "erreur_reservation",
  "professionnel_indisponible",
  "autre",
];
const INITIATEURS_ANNULATION = ["patient", "medecin"];
const LONGUEUR_MAX_COMMENTAIRE_ANNULATION = 1000;

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

// Sans cet `include`, l'API ne renvoyait que medecin_id / patient_id
// bruts (clés étrangères) : le front (RendezVous.jsx / medecinService.js)
// attend medecin.utilisateur.{nom,prenom} et patient.utilisateur.
// {nom,prenom} pour afficher des noms plutôt que des UUID dans le
// tableau et les filtres — même patron que SELECTION_UTILISATEUR_*
// dans medecin.controller.js.
// ⚠️ Hypothèse : le modèle `patient` porte une relation `utilisateur`
// du même type que `medecin.utilisateur` (schema.prisma non fourni) —
// à confirmer/ajuster si le nom de la relation diffère.
const INCLUSION_NOMS_RDV = {
  medecin: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
  patient: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
};

async function profilPatientCourant(utilisateurCourant) {
  if (!utilisateurCourant) return null;
  return prisma.patient.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
  });
}

async function profilMedecinCourant(utilisateurCourant) {
  if (!utilisateurCourant) return null;
  return prisma.medecin.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
  });
}

/* -------------------------------------------------------------------
 * D8 — RDV non payé : lecture seule pour le médecin, verrouillé côté serveur.
 * Un RDV « cree » (avant finaliserPaiement) n'a ni fonds, ni CP, ni CM : le
 * médecin ne peut ni le confirmer, ni l'annuler, ni déclarer d'absence, ni
 * le reprogrammer, ni le scanner, ni émettre d'ordonnance. Le statut est
 * toujours relu en base (jamais d'après le client). Seuls le patient
 * propriétaire, un admin ou l'expiration automatique peuvent l'annuler.
 * ------------------------------------------------------------------- */
const STATUT_RDV_NON_PAYE = "cree";
const MESSAGE_RDV_NON_PAYE =
  "Ce rendez-vous n'est pas encore payé : vous ne pouvez pas agir dessus. " +
  "Il vous sera communiqué une fois le paiement confirmé.";

function repondreRdvNonPaye(res) {
  return res.status(409).json({ code: "RDV_NON_PAYE", message: MESSAGE_RDV_NON_PAYE });
}

/**
 * Vrai si l'utilisateur courant agit EN TANT QUE médecin du RDV (ni admin, ni
 * le patient propriétaire du RDV).
 */
async function agitEnTantQueMedecinDuRdv(rdv, utilisateurCourant) {
  if (estAdmin(utilisateurCourant)) return false;
  const patient = await profilPatientCourant(utilisateurCourant);
  if (patient && patient.patient_id === rdv.patient_id) return false;
  const medecin = await profilMedecinCourant(utilisateurCourant);
  return Boolean(medecin && medecin.medecin_id === rdv.medecin_id);
}

/**
 * Verrou D8 : répond 409 `RDV_NON_PAYE` et renvoie true si le médecin du RDV
 * tente d'agir sur un RDV non payé. À appeler APRÈS l'autorisation d'accès et
 * AVANT toute action.
 */
async function refuserActionMedecinSiNonPaye(req, res, rdv) {
  if (rdv.statut !== STATUT_RDV_NON_PAYE) return false;
  if (!(await agitEnTantQueMedecinDuRdv(rdv, req.utilisateur))) return false;
  repondreRdvNonPaye(res);
  return true;
}

/**
 * Politique de fonds v2 §5 (étape 6) — présence du MÉDECIN à un RDV PHYSIQUE.
 * Le passage « confirme » -> « en_attente_presence » par le médecin du RDV
 * est le fait qui la constate (`medecin_present_le`). Retourne les champs à
 * écrire dans la MÊME mise à jour que le statut (jamais l'un sans l'autre).
 *
 * Ne pose rien si : ce n'est pas cette transition, le RDV est une
 * téléconsultation (sa présence vient de l'entrée dans la room Jitsi), ou
 * l'acteur n'est pas le médecin du RDV (un admin qui force le statut ne
 * constate la présence de personne).
 */
async function donneesPresenceTransition(rdv, utilisateurCourant, nouveauStatut, maintenant = new Date()) {
  if (nouveauStatut !== "en_attente_presence" || rdv.statut !== "confirme") return {};
  if (rdv.type_rdv !== "physique") return {};
  const medecin = await profilMedecinCourant(utilisateurCourant);
  if (!medecin || medecin.medecin_id !== rdv.medecin_id) return {};
  return { medecin_present_le: rdv.medecin_present_le ?? maintenant };
}

/**
 * Génère un code_unique (8 caractères alphanumériques, majuscules) et
 * retire sur collision — extrêmement improbable vu l'espace de
 * recherche, mais code_unique porte une contrainte @unique en base.
 */
async function genererCodeUnique() {
  const genere = () =>
    crypto
      .randomBytes(6)
      .toString("base64")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 8)
      .toUpperCase();

  let code = genere();
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.rendezVous.findUnique({ where: { code_unique: code } })) {
    code = genere();
  }
  return code;
}

/**
 * Détermine si l'utilisateur courant a le droit de voir/agir sur ce
 * rendez-vous : le patient concerné, le médecin concerné, ou
 * admin/superadmin.
 */
async function estAutoriseSurRdv(rdv, utilisateurCourant) {
  if (estAdmin(utilisateurCourant)) return true;

  const patient = await profilPatientCourant(utilisateurCourant);
  if (patient && patient.patient_id === rdv.patient_id) return true;

  const medecin = await profilMedecinCourant(utilisateurCourant);
  if (medecin && medecin.medecin_id === rdv.medecin_id) return true;

  return false;
}

/**
 * Phase 3 — Annulation motivée d'un rendez-vous, commune à
 * PUT /rendez-vous/:id et PATCH /rendez-vous/:id/statut.
 *
 * Appelée UNIQUEMENT une fois verifierTransitionAutorisee passée : ici
 * on ne juge plus si l'appelant a le droit d'annuler, seulement si la
 * demande est complète, puis on délègue TOUT le traitement financier à
 * traiterAnnulation. C'est ce qui garantit qu'un passage à "annule"
 * déclenche toujours remboursement et écritures du grand-livre, au lieu
 * d'un simple update de statut.
 *
 * Body attendu :
 *   - motif_annulation (obligatoire, liste fermée MOTIFS_ANNULATION) ;
 *   - commentaire_annulation (facultatif, texte libre) ;
 *   - initiateur ("patient" | "medecin") : OBLIGATOIRE pour un
 *     admin/superadmin, qui annule au nom de l'une des parties et dont
 *     la politique ne dit rien — on ne devine pas qui est fautif. Pour
 *     un patient ou un médecin il est déduit du compte, et une valeur
 *     envoyée par le client est ignorée : sinon un patient pourrait se
 *     déclarer "medecin" pour obtenir un remboursement intégral.
 *     Un RDV NON PAYÉ ne peut pas être annulé « au nom du médecin »
 *     (409 RDV_NON_PAYE, voir traiterAnnulation) : le back-office doit
 *     masquer ce choix pour les RDV « cree ».
 *
 * La réponse est FILTRÉE selon le rôle de celui qui la reçoit (D7), voir
 * visibiliteRole.service.js : le patient ne reçoit jamais CM ni le versement
 * du médecin, le médecin ne reçoit jamais CP, l'admin voit tout.
 */
async function annulerRendezVous(req, res, rdv) {
  const { motif_annulation, commentaire_annulation, initiateur: initiateurDemande } = req.body;

  if (!motif_annulation) {
    return res.status(400).json({
      message: `Champ requis manquant : motif_annulation. Valeurs acceptées : ${MOTIFS_ANNULATION.join(", ")}.`,
    });
  }
  if (!MOTIFS_ANNULATION.includes(motif_annulation)) {
    return res.status(400).json({
      message: `motif_annulation invalide. Valeurs acceptées : ${MOTIFS_ANNULATION.join(", ")}.`,
    });
  }

  let commentaire = null;
  if (commentaire_annulation !== undefined && commentaire_annulation !== null) {
    if (typeof commentaire_annulation !== "string") {
      return res.status(400).json({ message: "commentaire_annulation doit être une chaîne de caractères." });
    }
    const commentaireNettoye = commentaire_annulation.trim();
    if (commentaireNettoye.length > LONGUEUR_MAX_COMMENTAIRE_ANNULATION) {
      return res.status(400).json({
        message: `commentaire_annulation trop long (${LONGUEUR_MAX_COMMENTAIRE_ANNULATION} caractères maximum).`,
      });
    }
    commentaire = commentaireNettoye || null;
  }

  let initiateur;
  // Rôle de CELUI QUI REÇOIT la réponse (filtrage D7), indépendant de
  // l'initiateur : un admin qui annule « au nom du patient » voit tout.
  let roleReponse;
  if (estAdmin(req.utilisateur)) {
    roleReponse = ROLES_VISIBILITE.ADMIN;
    if (!INITIATEURS_ANNULATION.includes(initiateurDemande)) {
      return res.status(400).json({
        message: `Un administrateur doit préciser au nom de qui il annule : initiateur = ${INITIATEURS_ANNULATION.join(" ou ")}.`,
      });
    }
    initiateur = initiateurDemande;
  } else {
    const patient = await profilPatientCourant(req.utilisateur);
    initiateur = patient && patient.patient_id === rdv.patient_id ? "patient" : "medecin";
    roleReponse = initiateur === "patient" ? ROLES_VISIBILITE.PATIENT : ROLES_VISIBILITE.MEDECIN;
  }

  const resultat = await traiterAnnulation(rdv, {
    motif: motif_annulation,
    commentaire,
    initiateur,
  });
  if (resultat.erreur) {
    return res.status(resultat.erreur.status).json({
      message: resultat.erreur.message,
      ...(resultat.erreur.code ? { code: resultat.erreur.code } : {}),
    });
  }

  const rdvMisAJour = await prisma.rendezVous.findUnique({
    where: { rdv_id: rdv.rdv_id },
    include: INCLUSION_NOMS_RDV,
  });

  // Politique de fonds v2 — renvoyés pour l'affichage, jamais stockés, et
  // FILTRÉS par rôle (D7) :
  //   evenement / tardif : l'événement de fonds appliqué et le délai (< 24 h) ;
  //   remboursement      : null si rien à rembourser (jamais payé, ou annulation
  //                        patient < 24 h) ; CamPay : statut "a_traiter", montant =
  //                        brut et montant_estime_net (le net définitif dépend des
  //                        frais réels du retrait). Médecin : sans montants ;
  //   commission_patient / commission_patient_rendue (patient, admin) : CP
  //                        conservée par APS / rendue au patient (médecin fautif) ;
  //   versement_medecin, commission_medecin (médecin, admin) : H − CM libérés
  //                        au médecin (annulation patient < 24 h, avant amendes) et
  //                        CM conservée par APS ; commission_aps = alias déprécié ;
  //   amende (médecin, admin) : true si une amende a été enregistrée.
  // (`frais_annulation` de l'ancienne politique n'existe plus.)
  return res.status(200).json({
    message: "Rendez-vous annulé.",
    rendez_vous: rdvMisAJour,
    ...filtrerResultatAnnulation(resultat, roleReponse),
  });
}

/* ===================================================================
 * Rendez-vous
 * =================================================================== */

/**
 * GET /api/rendez-vous
 * Filtres optionnels : ?statut=...&medecin_id=...&patient_id=...
 * Toujours scopé à l'utilisateur courant (patient ou médecin) sauf
 * pour admin/superadmin, qui peut consulter l'ensemble et utiliser
 * librement les filtres.
 */
export async function listerRendezVous(req, res, next) {
  try {
    const { statut, medecin_id, patient_id } = req.query;

    if (statut && !STATUTS_RDV.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_RDV.join(", ")}.`,
      });
    }

    const where = {};
    let vueMedecin = false;

    if (estAdmin(req.utilisateur)) {
      if (statut) where.statut = statut;
      if (medecin_id) where.medecin_id = medecin_id;
      if (patient_id) where.patient_id = patient_id;
    } else {
      const patient = await profilPatientCourant(req.utilisateur);
      const medecin = await profilMedecinCourant(req.utilisateur);

      if (!patient && !medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }

      // Un compte n'a normalement qu'un seul des deux profils ; on
      // scope sur celui qui existe (patient prioritaire si les deux
      // existaient, cas non prévu par le schéma).
      if (patient) where.patient_id = patient.patient_id;
      else if (medecin) {
        where.medecin_id = medecin.medecin_id;
        vueMedecin = true;
      }

      if (statut) where.statut = statut;
    }

    const rendezVous = await prisma.rendezVous.findMany({
      where,
      include: INCLUSION_NOMS_RDV,
      orderBy: { date_creneau: "desc" },
    });

    // D8 : pour le médecin, un RDV non payé se réduit au strict nécessaire
    // (identifiant, créneau, statut, `non_paye: true`) — ni patient, ni motif,
    // ni code, ni QR : ces données ne doivent pas figurer dans le JSON.
    const visibles = vueMedecin
      ? rendezVous.map((r) => (r.statut === STATUT_RDV_NON_PAYE ? projeterRdvNonPayePourMedecin(r) : r))
      : rendezVous;

    return res.status(200).json({ rendez_vous: visibles });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rendez-vous/:id
 */
export async function obtenirRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id: req.params.id },
      include: INCLUSION_NOMS_RDV,
    });
    if (!rdv || !(await estAutoriseSurRdv(rdv, req.utilisateur))) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    // D8 : données minimales pour le médecin tant que le RDV n'est pas payé.
    if (rdv.statut === STATUT_RDV_NON_PAYE && (await agitEnTantQueMedecinDuRdv(rdv, req.utilisateur))) {
      return res.status(200).json({ rendez_vous: projeterRdvNonPayePourMedecin(rdv) });
    }

    return res.status(200).json({ rendez_vous: rdv });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rendez-vous
 * Réservé au patient qui réserve le créneau (patient_id déduit du
 * token, jamais saisi par le client). type_rdv "teleconsultation"
 * exige que le médecin ait activé teleconsultation_activee ;
 * structure_id n'a de sens que pour un rdv "physique" (sinon cabinet
 * libéral, structure_id reste null).
 */
export async function creerRendezVous(req, res, next) {
  try {
    const patient = await profilPatientCourant(req.utilisateur);
    if (!patient) {
      return res.status(403).json({ message: "Seul un compte patient peut réserver un rendez-vous." });
    }

    const { medecin_id, structure_id, type_rdv, date_creneau, motif } = req.body;

    if (!medecin_id || !type_rdv || !date_creneau) {
      return res.status(400).json({
        message: "Champs requis manquants : medecin_id, type_rdv, date_creneau.",
      });
    }

    let motifNettoye;
    if (motif !== undefined && motif !== null) {
      if (typeof motif !== "string") {
        return res.status(400).json({ message: "motif doit être une chaîne de caractères." });
      }
      motifNettoye = motif.trim();
      if (motifNettoye.length > 1000) {
        return res.status(400).json({ message: "motif trop long (1000 caractères maximum)." });
      }
    }

    if (!TYPES_RDV.includes(type_rdv)) {
      return res.status(400).json({
        message: `type_rdv invalide. Valeurs acceptées : ${TYPES_RDV.join(", ")}.`,
      });
    }

    const dateCreneau = new Date(date_creneau);
    if (Number.isNaN(dateCreneau.getTime())) {
      return res.status(400).json({ message: "date_creneau invalide." });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(400).json({ message: "medecin_id introuvable." });
    }
    if (type_rdv === "teleconsultation" && !medecin.teleconsultation_activee) {
      return res.status(400).json({
        message: "Ce médecin n'a pas activé la téléconsultation.",
      });
    }

    if (structure_id) {
      const structure = await prisma.structureSante.findUnique({ where: { structure_id } });
      if (!structure) {
        return res.status(400).json({ message: "structure_id introuvable." });
      }
    }

    const code_unique = await genererCodeUnique();
    const qr_token_secret = crypto.randomBytes(32).toString("hex");

    const rdv = await prisma.rendezVous.create({
      data: {
        patient_id: patient.patient_id,
        medecin_id,
        structure_id: structure_id || null,
        type_rdv,
        date_creneau: dateCreneau,
        statut: "cree",
        motif: motifNettoye ? motifNettoye : null,
        code_unique,
        qr_token_secret,
      },
    });

    return res.status(201).json({ message: "Rendez-vous créé.", rendez_vous: rdv });
  } catch (err) {
    // Politique de fonds v2 §6 : index unique partiel — un seul RDV actif
    // par (médecin, créneau). Course entre deux réservations simultanées.
    if (estViolationCreneauActif(err)) return res.status(409).json({ message: MESSAGE_CRENEAU_PRIS });
    next(err);
  }
}

/**
 * PUT /api/rendez-vous/:id
 * Ouvert au patient concerné, au médecin concerné, ou à
 * admin/superadmin — ex. confirmation, annulation, contestation.
 *   - date_creneau : reprogrammation, ouverte à toutes les parties
 *     autorisées.
 *   - motif : précision/correction du motif de consultation, ouverte à
 *     toutes les parties autorisées (envoyer une chaîne vide ou null
 *     efface le motif).
 *   - statut : doit rester une transition cohérente avec le rôle (un
 *     patient ne peut pas se déclarer "honore" lui-même, etc.) et,
 *     pour une confirmation par le médecin, exige qu'un paiement
 *     Stripe ait déjà été validé pour ce rendez-vous — voir
 *     verifierTransitionAutorisee (partagée avec PATCH .../statut).
 *   - statut "annule" (Phase 3) : exige motif_annulation (liste
 *     fermée) et déclenche le remboursement — voir annulerRendezVous.
 *     Doit être demandé seul (sans date_creneau/structure_id/motif).
 * DELETE reste interdit ici : un rendez-vous s'annule via statut, il
 * ne se supprime pas physiquement une fois créé (voir supprimerRendezVous).
 */
export async function modifierRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    if (!(await estAutoriseSurRdv(rdv, req.utilisateur))) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    // D8 : aucune action du médecin (confirmer, annuler, reprogrammer, motif…)
    // sur un RDV non payé, quelle que soit la route d'entrée.
    if (await refuserActionMedecinSiNonPaye(req, res, rdv)) return;

    const { statut, date_creneau, structure_id, motif } = req.body;
    const donnees = {};

    // CORRECTIF SÉCURITÉ : ce PUT généraliste acceptait auparavant
    // n'importe quel statut, de la part de n'importe quelle partie
    // autorisée (patient OU médecin), sans vérifier ni la cohérence du
    // rôle avec la transition demandée, ni — surtout — qu'un paiement
    // avait été validé. Un médecin (ou même un patient) pouvait donc
    // faire passer un rendez-vous "cree" à "confirme" via cette seule
    // route, en contournant totalement le paiement Stripe.
    // On applique désormais la même vérification que le PATCH
    // .../statut ci-dessous (voir verifierTransitionAutorisee) :
    // matrice de rôle + verrou paiement pour la transition
    // cree -> confirme initiée par un médecin.
    if (statut !== undefined) {
      if (!STATUTS_RDV.includes(statut)) {
        return res.status(400).json({
          message: `statut invalide. Valeurs acceptées : ${STATUTS_RDV.join(", ")}.`,
        });
      }
      if (statut !== rdv.statut) {
        const erreurTransition = await verifierTransitionAutorisee(rdv, req.utilisateur, statut);
        if (erreurTransition) {
          return res.status(erreurTransition.status).json({ message: erreurTransition.message });
        }

        // Phase 3 : "annule" n'est plus un simple champ à écrire, c'est
        // une opération financière (remboursement, grand-livre) traitée
        // par traiterAnnulation. Elle doit être demandée SEULE : la
        // mélanger à une reprogrammation ou à une modification de
        // structure/motif rendrait ambigu ce qui a été appliqué si
        // l'un des deux échoue.
        if (statut === "annule") {
          if (date_creneau !== undefined || structure_id !== undefined || motif !== undefined) {
            return res.status(400).json({
              message:
                "L'annulation doit être demandée seule : n'envoyez ni date_creneau, ni structure_id, ni motif avec statut=\"annule\".",
            });
          }
          return await annulerRendezVous(req, res, rdv);
        }
      }
      donnees.statut = statut;
      Object.assign(donnees, await donneesPresenceTransition(rdv, req.utilisateur, statut));
    }

    if (date_creneau !== undefined) {
      // Politique de fonds v2 §5 : un RDV « a_reprogrammer » ne change de date
      // QUE par proposition + acceptation de l'autre partie (POST
      // .../reprogrammation/proposer puis .../accepter). Un PUT unilatéral
      // contournerait ce protocole.
      if (rdv.statut === "a_reprogrammer") {
        return res.status(409).json({
          message:
            "Ce rendez-vous est à reprogrammer : la nouvelle date se propose via POST .../reprogrammation/proposer " +
            "et doit être acceptée par l'autre partie.",
        });
      }
      const dateCreneau = new Date(date_creneau);
      if (Number.isNaN(dateCreneau.getTime())) {
        return res.status(400).json({ message: "date_creneau invalide." });
      }
      donnees.date_creneau = dateCreneau;
    }

    if (structure_id !== undefined) {
      if (structure_id) {
        const structure = await prisma.structureSante.findUnique({ where: { structure_id } });
        if (!structure) {
          return res.status(400).json({ message: "structure_id introuvable." });
        }
        donnees.structure_id = structure_id;
      } else {
        donnees.structure_id = null;
      }
    }

    if (motif !== undefined) {
      if (motif === null || motif === "") {
        donnees.motif = null;
      } else {
        if (typeof motif !== "string") {
          return res.status(400).json({ message: "motif doit être une chaîne de caractères." });
        }
        const motifNettoye = motif.trim();
        if (motifNettoye.length > 1000) {
          return res.status(400).json({ message: "motif trop long (1000 caractères maximum)." });
        }
        donnees.motif = motifNettoye;
      }
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const rdvMisAJour = await prisma.rendezVous.update({
      where: { rdv_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Rendez-vous mis à jour.", rendez_vous: rdvMisAJour });
  } catch (err) {
    // Déplacement vers un créneau déjà occupé par un autre RDV actif du médecin (§6).
    if (estViolationCreneauActif(err)) return res.status(409).json({ message: MESSAGE_CRENEAU_PRIS });
    next(err);
  }
}

/**
 * Matrice des transitions de statut autorisées par rôle, à partir du
 * statut courant du rendez-vous. admin/superadmin ne sont pas dans
 * cette table : ils peuvent forcer n'importe quelle transition (cas
 * de correction manuelle) — voir changerStatutRendezVous ci-dessous.
 *
 * ⚠️ Hypothèse métier (non fournie par le schéma) — à ajuster selon
 * les règles produit réelles :
 *   - patient : peut annuler tant que le rdv n'a pas eu lieu, et
 *     contester une issue ("honore"/"non_honore") qu'il conteste.
 *   - médecin : fait progresser le rdv (confirmation, passage en
 *     salle d'attente, issue de consultation) et peut annuler avant
 *     l'issue ; ne revient jamais en arrière une fois honore/non_honore.
 *
 * ⚠️ Phase 2 (politique de gestion des fonds, libération
 * conditionnelle) : la transition medecin "en_attente_presence" ->
 * "honore" a été VOLONTAIREMENT retirée de cette table. Elle n'est
 * plus atteignable que via les trois déclencheurs dédiés qui
 * appellent libererEscrow (services/liberationEscrow.service.js) :
 *   - scannerQrRendezVous ci-dessous (RDV physique) ;
 *   - la clôture de session de téléconsultation (visio.controller.js) ;
 *   - forcerLiberationEscrow ci-dessous (admin/superadmin uniquement).
 * Pour admin/superadmin, qui bypassent normalement cette table
 * entière (voir verifierTransitionAutorisee), la cible "honore" est
 * bloquée séparément, en tête de verifierTransitionAutorisee — sinon
 * cette table ne le concernerait pas.
 * Objectif : garantir qu'un rendez-vous ne peut JAMAIS passer à
 * "honoré" sans que les fonds ne soient effectivement libérés vers le
 * portefeuille du médecin — un simple PATCH .../statut ne suffit plus,
 * même pour un admin.
 * "non_honore" reste atteignable ici : ce n'est pas une libération de
 * fonds (voir Phase 4, défaillance du professionnel).
 *
 * Phase 3 : les transitions vers "annule" restent listées ici (la
 * matrice dit QUI peut annuler depuis quel statut), mais leur
 * exécution ne passe plus par un simple update : les deux points
 * d'entrée (PUT et PATCH) les routent vers annulerRendezVous, qui exige
 * un motif et délègue le traitement financier à traiterAnnulation.
 */
const TRANSITIONS_AUTORISEES = {
  patient: {
    cree: ["annule"],
    confirme: ["annule"],
    en_attente_presence: [],
    honore: ["conteste"],
    non_honore: ["conteste"],
    annule: [],
    conteste: [],
    a_reprogrammer: ["annule"], // point G : annulable, remboursement moins frais et commission APS
  },
  medecin: {
    // D8 : un RDV non payé est hors de portée du médecin (verrou 409
    // RDV_NON_PAYE en amont). La confirmation « cree -> confirme » n'est plus
    // un acte du médecin : elle résulte du paiement (finaliserPaiement).
    cree: [],
    confirme: ["en_attente_presence", "annule"],
    en_attente_presence: ["non_honore"],
    honore: [],
    non_honore: [],
    annule: [],
    conteste: [],
    a_reprogrammer: ["annule"], // point G
  },
};

/**
 * Vérifie qu'une transition de statut demandée par l'utilisateur
 * courant (hors admin/superadmin) est légitime, sur deux plans :
 *
 *   1. Cohérence avec TRANSITIONS_AUTORISEES pour son rôle (patient ou
 *      médecin) et le statut courant du rdv.
 *   2. Verrou paiement (D8) : un médecin n'a AUCUNE transition possible
 *      depuis "cree" (TRANSITIONS_AUTORISEES.medecin.cree = []) : le RDV
 *      passe à "confirme" par le seul paiement (finaliserPaiement), jamais
 *      par le médecin. Le verrou 409 RDV_NON_PAYE est posé en amont dans
 *      les contrôleurs ; la matrice en est la seconde ligne de défense.
 *
 * admin/superadmin ne sont PAS soumis à la matrice TRANSITIONS_AUTORISEES
 * ni au verrou paiement ci-dessus : ils gardent la possibilité de forcer
 * une transition à la main pour une correction manuelle exceptionnelle.
 * SEULE EXCEPTION (Phase 2) : la cible "honore" reste bloquée pour tout
 * le monde y compris admin, voir le verrou en tête de fonction — une
 * correction admin vers "honore" passe par POST .../forcer-liberation.
 *
 * @returns {Promise<null|{status:number, message:string}>} null si la
 *   transition est autorisée, sinon l'erreur HTTP à renvoyer telle quelle.
 */
async function verifierTransitionAutorisee(rdv, utilisateurCourant, nouveauStatut) {
  // Phase 2 — verrou financier : "honore" ne peut JAMAIS être posé via
  // ce chemin générique (PATCH .../statut ou PUT .../:id), y compris
  // par un admin/superadmin. Seuls scannerQrRendezVous (RDV
  // physique), traiterFinSessionVisio (webhook visio) et
  // forcerLiberationEscrow (admin, ci-dessous) y mènent, car eux
  // seuls appellent libererEscrow et libèrent réellement les fonds
  // vers le portefeuille du médecin. Sans ce verrou, un admin pouvait
  // marquer un rdv "honoré" sans jamais libérer l'escrow — statut du
  // rdv et statut de l'escrow désynchronisés.
  if (nouveauStatut === "honore") {
    return {
      status: 400,
      message:
        'Le statut "honore" ne peut pas être posé directement : utilisez POST .../scan-qr (RDV physique), la clôture de la visio, ou POST .../forcer-liberation (admin/superadmin) — ces chemins libèrent aussi les fonds vers le médecin.',
    };
  }

  // Politique de fonds v2 §5 : « a_reprogrammer » n'est posé que par le
  // traitement d'absence (absence.service.js), qui renseigne aussi
  // a_reprogrammer_le (point de départ des 48h). Forcé à la main, le RDV
  // n'aurait pas de délai calculable : refusé pour tout le monde.
  if (nouveauStatut === "a_reprogrammer") {
    return {
      status: 400,
      message: 'Le statut "a_reprogrammer" ne peut pas être posé directement : il résulte du traitement d\'absence (deux absents).',
    };
  }

  if (estAdmin(utilisateurCourant)) return null;

  const patient = await profilPatientCourant(utilisateurCourant);
  const medecin = await profilMedecinCourant(utilisateurCourant);

  // estAutoriseSurRdv (déjà vérifié en amont par l'appelant) garantit
  // que l'un des deux correspond au rdv ; on détermine lequel pour
  // choisir la bonne matrice de transitions.
  const role = patient && patient.patient_id === rdv.patient_id ? "patient" : "medecin";

  const transitionsPermises = TRANSITIONS_AUTORISEES[role][rdv.statut] || [];
  if (!transitionsPermises.includes(nouveauStatut)) {
    return {
      status: 403,
      message: `Transition non autorisée : un ${role === "patient" ? "patient" : "médecin"} ne peut pas faire passer un rendez-vous de "${rdv.statut}" à "${nouveauStatut}".`,
    };
  }

  return null;
}

/**
 * PATCH /api/rendez-vous/:id/statut
 * Body: { statut: <valeur de StatutRendezVous> }
 *
 * Action dédiée au changement de statut (même patron que
 * publier/suspendre/reactiver sur medecin). Vérifie, via
 * verifierTransitionAutorisee, que le passage demandé est cohérent
 * avec le rôle de l'appelant et le statut actuel du rdv — voir
 * TRANSITIONS_AUTORISEES — et, pour cree -> confirme par un médecin,
 * qu'un paiement Stripe a bien été validé (CompteEscrow existant).
 *   - patient concerné / médecin concerné : transition doit figurer
 *     dans TRANSITIONS_AUTORISEES[role][statut_actuel] ET, si c'est
 *     une confirmation par le médecin, être adossée à un paiement
 *     réussi.
 *   - admin/superadmin : toute transition vers un statut différent
 *     est acceptée (correction manuelle), sans verrou paiement.
 * PUT /rendez-vous/:id applique désormais exactement le même contrôle
 * pour le champ "statut" (voir modifierRendezVous ci-dessus).
 * Phase 3 : statut="annule" exige aussi motif_annulation (et, pour un
 * admin, initiateur) et déclenche le remboursement — voir
 * annulerRendezVous.
 */
export async function changerStatutRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    if (!(await estAutoriseSurRdv(rdv, req.utilisateur))) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    // D8 : aucune action du médecin sur un RDV non payé.
    if (await refuserActionMedecinSiNonPaye(req, res, rdv)) return;

    const { statut } = req.body;
    if (!statut) {
      return res.status(400).json({ message: "Champ requis manquant : statut." });
    }
    if (!STATUTS_RDV.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_RDV.join(", ")}.`,
      });
    }

    if (statut === rdv.statut) {
      return res.status(400).json({ message: "Le rendez-vous a déjà ce statut." });
    }

    const erreurTransition = await verifierTransitionAutorisee(rdv, req.utilisateur, statut);
    if (erreurTransition) {
      return res.status(erreurTransition.status).json({ message: erreurTransition.message });
    }

    // Phase 3 : passer à "annule" exige un motif et déclenche le
    // traitement financier — voir annulerRendezVous.
    if (statut === "annule") {
      return await annulerRendezVous(req, res, rdv);
    }

    const rdvMisAJour = await prisma.rendezVous.update({
      where: { rdv_id: req.params.id },
      data: { statut, ...(await donneesPresenceTransition(rdv, req.utilisateur, statut)) },
      include: INCLUSION_NOMS_RDV,
    });

    return res.status(200).json({ message: "Statut du rendez-vous mis à jour.", rendez_vous: rdvMisAJour });
  } catch (err) {
    // Un admin qui réactive un RDV sur un créneau repris entre-temps (§6).
    if (estViolationCreneauActif(err)) return res.status(409).json({ message: MESSAGE_CRENEAU_PRIS });
    next(err);
  }
}

/**
 * Comparaison en temps constant (même motif que
 * authentification.controller.js, comparerConstant) — évite qu'une
 * mesure de timing sur la réponse HTTP ne renseigne un attaquant sur
 * le nombre de caractères corrects d'un qr_token_secret deviné.
 */
function comparerQrTokenSecret(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/rendez-vous/:id/scan-qr
 * Body: { code_unique: string, qr_token_secret: string }
 *
 * Déclencheur dédié de la libération d'escrow pour un RDV physique
 * (politique de gestion des fonds §2 : "le médecin scanne le QR code
 * du patient ; le statut passe à Honoré"). Réservé au médecin du
 * rendez-vous — ni le patient, ni admin/superadmin (une correction
 * manuelle exceptionnelle passe par PATCH .../statut vers "honore",
 * qui reste ouvert à admin/superadmin et ne passe donc PAS par
 * libererEscrow ; à signaler si ce n'est pas le comportement voulu
 * pour une correction administrative).
 *
 * Double vérification demandée : code_unique ET qr_token_secret
 * doivent tous les deux correspondre au rendez-vous ciblé par :id —
 * empêche qu'un qr_token_secret correct mais un code_unique erroné
 * (ou inversement, copié-collé depuis un autre rendez-vous) ne
 * déclenche la libération.
 */
export async function scannerQrRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    const medecin = await profilMedecinCourant(req.utilisateur);
    if (!medecin || medecin.medecin_id !== rdv.medecin_id) {
      return res.status(403).json({ message: "Accès refusé : vous n'êtes pas le médecin de ce rendez-vous." });
    }

    // D8 : un RDV non payé n'a ni fonds ni QR exploitable côté médecin.
    if (rdv.statut === STATUT_RDV_NON_PAYE) return repondreRdvNonPaye(res);

    if (rdv.type_rdv !== "physique") {
      return res.status(400).json({ message: "Ce rendez-vous n'est pas un rendez-vous physique." });
    }

    const { code_unique, qr_token_secret } = req.body;
    if (!code_unique || !qr_token_secret) {
      return res.status(400).json({ message: "Champs requis manquants : code_unique, qr_token_secret." });
    }

    if (
      !comparerQrTokenSecret(code_unique, rdv.code_unique) ||
      !comparerQrTokenSecret(qr_token_secret, rdv.qr_token_secret)
    ) {
      return res.status(403).json({ message: "QR code invalide pour ce rendez-vous." });
    }

    if (rdv.statut !== "en_attente_presence") {
      return res.status(409).json({
        message: `Ce rendez-vous ne peut pas être marqué "honoré" depuis son statut actuel (${rdv.statut}).`,
      });
    }

    // Politique de fonds v2 §5 (étape 6) : un scan valide constate les DEUX
    // présences — le patient (son QR est scanné) et le médecin (il scanne).
    // Faits enregistrés AVANT la libération : si celle-ci échoue, ils restent
    // vrais et un nouveau scan ne réécrit rien (UPDATE conditionnel).
    await enregistrerPresence(rdv.rdv_id, "patient");
    await enregistrerPresence(rdv.rdv_id, "medecin");

    await libererEscrow(rdv.rdv_id);

    const rdvMisAJour = await prisma.rendezVous.findUnique({
      where: { rdv_id: rdv.rdv_id },
      include: INCLUSION_NOMS_RDV,
    });

    return res.status(200).json({
      message: "Présence confirmée : rendez-vous honoré, fonds libérés vers le portefeuille du médecin.",
      rendez_vous: rdvMisAJour,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rendez-vous/:id/forcer-liberation
 * Réservé admin/superadmin.
 *
 * Correction manuelle exceptionnelle : seul chemin restant pour poser
 * "honore" quand ni scannerQrRendezVous (QR abîmé/perdu) ni la
 * clôture normale de la visio (webhook en panne, par exemple) n'ont
 * pu déclencher la libération. Ajouté suite au constat que le PATCH
 * générique laissait un admin marquer un rdv "honoré" SANS jamais
 * libérer l'escrow — désormais bloqué pour tout le monde (voir
 * verifierTransitionAutorisee) : ceci est le remplacement explicite.
 *
 * Contrairement à scannerQrRendezVous, ne vérifie ni QR ni
 * type_rdv : c'est une action administrative de dernier recours, pas
 * un contrôle de présence. Mais, contrairement à un simple appel à
 * libererEscrow (qui ignore silencieusement un rdv sans escrow ou déjà
 * traité, pour rester idempotent face à des webhooks rejoués), on
 * vérifie ici explicitement l'état AVANT d'appeler libererEscrow et on
 * renvoie une erreur claire si "libérer" n'aurait aucun effet — pour
 * qu'un admin ne croie pas avoir libéré des fonds qui ne l'ont pas été.
 */
export async function forcerLiberationEscrow(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    const escrow = await prisma.compteEscrow.findUnique({ where: { rdv_id: rdv.rdv_id } });
    if (!escrow) {
      return res.status(409).json({
        message: "Aucun paiement (escrow) n'existe pour ce rendez-vous : rien à libérer.",
      });
    }
    if (escrow.statut !== "sequestre") {
      return res.status(409).json({
        message: `L'escrow de ce rendez-vous n'est pas en séquestre (statut actuel : "${escrow.statut}") : rien à libérer.`,
      });
    }

    await libererEscrow(rdv.rdv_id);

    const rdvMisAJour = await prisma.rendezVous.findUnique({
      where: { rdv_id: rdv.rdv_id },
      include: INCLUSION_NOMS_RDV,
    });

    return res.status(200).json({
      message: "Libération forcée par un administrateur : rendez-vous honoré, fonds libérés vers le portefeuille du médecin.",
      rendez_vous: rdvMisAJour,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/rendez-vous/:id
 * Réservé à admin/superadmin (route déjà verrouillée par
 * autoriser("admin", "superadmin")) — un rendez-vous s'annule via PUT
 * (statut="annule"), il ne se supprime physiquement qu'en dernier
 * recours administratif (ordonnances et séquestre peuvent en dépendre).
 */
export async function supprimerRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    await prisma.rendezVous.delete({ where: { rdv_id: req.params.id } });
    return res.status(200).json({ message: "Rendez-vous supprimé." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message: "Impossible de supprimer ce rendez-vous : une ordonnance y est encore rattachée.",
      });
    }
    next(err);
  }
}

/* ===================================================================
 * Ordonnances
 * =================================================================== */

/**
 * GET /api/ordonnances
 * Filtres optionnels : ?rdv_id=...&medecin_id=...&patient_id=...
 * Toujours scopée à l'utilisateur courant sauf admin/superadmin.
 */
export async function listerOrdonnances(req, res, next) {
  try {
    const { rdv_id, medecin_id, patient_id } = req.query;
    const where = {};

    if (estAdmin(req.utilisateur)) {
      if (rdv_id) where.rdv_id = rdv_id;
      if (medecin_id) where.medecin_id = medecin_id;
      if (patient_id) where.patient_id = patient_id;
    } else {
      const patient = await profilPatientCourant(req.utilisateur);
      const medecin = await profilMedecinCourant(req.utilisateur);

      if (!patient && !medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }

      if (patient) where.patient_id = patient.patient_id;
      else if (medecin) where.medecin_id = medecin.medecin_id;

      if (rdv_id) where.rdv_id = rdv_id;
    }

    const ordonnances = await prisma.ordonnance.findMany({
      where,
      orderBy: { date_emission: "desc" },
    });

    return res.status(200).json({ ordonnances });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ordonnances/:id
 * Le médecin auteur, le patient concerné, ou admin/superadmin.
 */
export async function obtenirOrdonnance(req, res, next) {
  try {
    const ordonnance = await prisma.ordonnance.findUnique({
      where: { ordonnance_id: req.params.id },
    });
    if (!ordonnance) {
      return res.status(404).json({ message: "Ordonnance introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const patient = await profilPatientCourant(req.utilisateur);
      const medecin = await profilMedecinCourant(req.utilisateur);
      const estPatientConcerne = patient && patient.patient_id === ordonnance.patient_id;
      const estMedecinAuteur = medecin && medecin.medecin_id === ordonnance.medecin_id;
      if (!estPatientConcerne && !estMedecinAuteur) {
        return res.status(404).json({ message: "Ordonnance introuvable." });
      }
    }

    return res.status(200).json({ ordonnance });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ordonnances
 * Réservé au médecin du rendez-vous concerné, déduit de rdv_id
 * (jamais un autre médecin, même admin ne peut créer une ordonnance à
 * la place du médecin — pièce médicale nominative). identifiant_unique
 * est généré côté serveur (référence de vérification externe).
 */
export async function creerOrdonnance(req, res, next) {
  try {
    const medecin = await profilMedecinCourant(req.utilisateur);
    if (!medecin) {
      return res.status(403).json({ message: "Seul un compte médecin peut émettre une ordonnance." });
    }

    const { rdv_id, pays_emission_id, contenu } = req.body;
    if (!rdv_id || !pays_emission_id || !contenu) {
      return res.status(400).json({
        message: "Champs requis manquants : rdv_id, pays_emission_id, contenu.",
      });
    }

    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id } });
    if (!rdv) {
      return res.status(400).json({ message: "rdv_id introuvable." });
    }
    if (rdv.medecin_id !== medecin.medecin_id) {
      return res.status(403).json({
        message: "Vous n'êtes pas le médecin de ce rendez-vous.",
      });
    }
    // D8 : pas d'ordonnance sur un RDV non payé.
    if (rdv.statut === STATUT_RDV_NON_PAYE) return repondreRdvNonPaye(res);

    const pays = await prisma.pays.findUnique({ where: { pays_id: pays_emission_id } });
    if (!pays) {
      return res.status(400).json({ message: "pays_emission_id introuvable." });
    }

    const identifiant_unique = crypto.randomBytes(12).toString("hex").toUpperCase();

    const ordonnance = await prisma.ordonnance.create({
      data: {
        rdv_id,
        medecin_id: medecin.medecin_id,
        patient_id: rdv.patient_id,
        identifiant_unique,
        pays_emission_id,
        contenu: contenu.trim(),
      },
    });

    return res.status(201).json({ message: "Ordonnance émise.", ordonnance });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/ordonnances/:id
 * Le médecin auteur ou admin/superadmin — seul le contenu (et
 * pays_emission_id, en cas de correction) est modifiable ; rdv_id,
 * medecin_id, patient_id et identifiant_unique sont immuables après
 * émission.
 */
export async function modifierOrdonnance(req, res, next) {
  try {
    const ordonnance = await prisma.ordonnance.findUnique({
      where: { ordonnance_id: req.params.id },
    });
    if (!ordonnance) {
      return res.status(404).json({ message: "Ordonnance introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== ordonnance.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    const { contenu, pays_emission_id } = req.body;
    const donnees = {};

    if (contenu !== undefined) donnees.contenu = contenu.trim();

    if (pays_emission_id !== undefined) {
      const pays = await prisma.pays.findUnique({ where: { pays_id: pays_emission_id } });
      if (!pays) {
        return res.status(400).json({ message: "pays_emission_id introuvable." });
      }
      donnees.pays_emission_id = pays_emission_id;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const ordonnanceMiseAJour = await prisma.ordonnance.update({
      where: { ordonnance_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Ordonnance mise à jour.", ordonnance: ordonnanceMiseAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/ordonnances/:id
 * Réservé à admin/superadmin (route déjà verrouillée par
 * autoriser("admin", "superadmin")) — pièce médicale, jamais supprimée
 * par un médecin après émission.
 */
export async function supprimerOrdonnance(req, res, next) {
  try {
    const ordonnance = await prisma.ordonnance.findUnique({
      where: { ordonnance_id: req.params.id },
    });
    if (!ordonnance) {
      return res.status(404).json({ message: "Ordonnance introuvable." });
    }

    await prisma.ordonnance.delete({ where: { ordonnance_id: req.params.id } });
    return res.status(200).json({ message: "Ordonnance supprimée." });
  } catch (err) {
    next(err);
  }
}