// src/controllers/visio.controller.js
//
// Point d'entrée unique pour démarrer une téléconsultation Jitsi :
// vérifie que le rendez-vous existe, est bien une téléconsultation,
// dans un statut compatible, et que l'utilisateur courant (posé par
// `authentifier`) en est le médecin ou le patient — puis délègue la
// signature du JWT à jitsi.service.js.
//
// Volontairement PAS ouvert à admin/superadmin (contrairement à
// rendezVous.controller.js) : rejoindre l'appel vidéo n'a de sens que
// pour les deux participants du rendez-vous.

import prisma from "../lib/prisma.js";
import { genererJitsiToken } from "../services/jitsi.service.js";
import { constaterFinConsultation } from "../services/finConsultation.service.js";
import { ErreurParametreDelai, exigerParametreDelai } from "../services/parametreDelaiLiberation.service.js";
import { verifierSignatureWebhookVisio } from "../lib/jitsiWebhookService.js";
import { enregistrerPresence } from "../services/presence.service.js";
import { partieDepuisParticipant } from "../services/reglesPresenceReprogrammation.service.js";
import { inviterAvisPatient } from "../services/avisMedecin.service.js";
import { creerNotifications } from "../services/notification.service.js";

const STATUTS_AUTORISES_VISIO = ["confirme", "en_attente_presence"];
// Doit rester identique au roomName généré dans obtenirTokenVisio
// ci-dessous (`rdv-${rdv.rdv_id}`) : c'est cette convention de nommage
// qui permet à traiterFinSessionVisio de retrouver le rendez-vous à
// partir du nom de room envoyé par le webhook Jitsi/Prosody.
const PREFIXE_ROOM_RDV = "rdv-";
// Événements émis par mod_muc_events_webhook.lua que ce contrôleur traite.
const EVENEMENTS_VISIO_TRAITES = ["muc-room-destroyed", "muc-occupant-joined"];

export async function obtenirTokenVisio(req, res, next) {
  try {
    const { rdv_id } = req.body;
    if (!rdv_id) {
      return res.status(400).json({ message: "rdv_id requis." });
    }

    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id },
      include: {
        medecin: { include: { utilisateur: true } },
        patient: { include: { utilisateur: true } },
      },
    });

    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    if (rdv.type_rdv !== "teleconsultation") {
      return res
        .status(400)
        .json({ message: "Ce rendez-vous n'est pas une téléconsultation." });
    }

    const utilisateurCourantId = req.utilisateur.utilisateur_id;
    const estLeMedecin = rdv.medecin.utilisateur_id === utilisateurCourantId;
    const estLePatient = rdv.patient.utilisateur_id === utilisateurCourantId;

    if (!estLeMedecin && !estLePatient) {
      return res.status(403).json({ message: "Accès non autorisé à cette consultation." });
    }

    // D8 : le médecin n'a aucun accès à la visio d'un RDV non payé (409 dédié,
    // distinct du 400 « statut incompatible »). Vérifié sur le statut en base.
    if (estLeMedecin && rdv.statut === "cree") {
      return res.status(409).json({
        code: "RDV_NON_PAYE",
        message:
          "Ce rendez-vous n'est pas encore payé : la visio n'est pas accessible. " +
          "Elle le sera une fois le paiement confirmé.",
      });
    }

    if (!STATUTS_AUTORISES_VISIO.includes(rdv.statut)) {
      return res
        .status(400)
        .json({ message: "Ce rendez-vous n'est pas dans un état permettant la visio." });
    }

    const participantInfo = estLeMedecin ? rdv.medecin.utilisateur : rdv.patient.utilisateur;
    const roomName = `${PREFIXE_ROOM_RDV}${rdv.rdv_id}`;

    const token = genererJitsiToken(
      {
        utilisateur_id: participantInfo.utilisateur_id,
        nom: participantInfo.nom,
        prenom: participantInfo.prenom,
        email: participantInfo.email,
        estModerateur: estLeMedecin,
      },
      roomName
    );

    // Le médecin (re)rejoint : l'appel n'est plus considéré comme clôturé,
    // sinon le patient serait aussitôt raccroché par sa vérification.
    if (estLeMedecin && rdv.visio_cloturee_le && !rdv.termine_le) {
      await prisma.rendezVous.update({ where: { rdv_id }, data: { visio_cloturee_le: null } });
    }

    // Titre affiché dans Jitsi (sinon il affiche le nom technique de la salle).
    const interlocuteur = estLeMedecin ? rdv.patient.utilisateur : rdv.medecin.utilisateur;
    const nomInterlocuteur = [interlocuteur.prenom, interlocuteur.nom].filter(Boolean).join(" ");
    const sujet = `Téléconsultation avec ${estLeMedecin ? "" : "Dr "}${nomInterlocuteur}`;

    if (estLeMedecin) alerterPatientVisio(rdv);

    res.json({
      token,
      roomName,
      sujet,
      domain: process.env.JITSI_PUBLIC_DOMAIN || "localhost:8000",
    });
  } catch (err) {
    next(err);
  }
}

// Une alerte au plus par tranche de 10 min : le médecin qui recharge ou
// relance l'appel ne doit pas inonder le patient.
const TRANCHE_ALERTE_VISIO_MS = 10 * 60 * 1000;

/**
 * Le médecin lance la visio : le patient est alerté (in-app + push mobile)
 * pour la rejoindre. Jamais bloquant pour le médecin.
 */
function alerterPatientVisio(rdv) {
  const tranche = Math.floor(Date.now() / TRANCHE_ALERTE_VISIO_MS);
  const patient_id = rdv.patient.utilisateur_id;
  const nomMedecin = [rdv.medecin.utilisateur.prenom, rdv.medecin.utilisateur.nom].filter(Boolean).join(" ");
  creerNotifications([
    {
      utilisateur_id: patient_id,
      type: "rdv_visio_demarree",
      rdv_id: rdv.rdv_id,
      titre: "Votre téléconsultation commence",
      message: `Dr ${nomMedecin} vous attend dans la salle de consultation. Rejoignez la visio depuis vos rendez-vous.`,
      donnees: { role: "patient", type_rdv: "teleconsultation" },
      cle: `rdv_visio_demarree:${rdv.rdv_id}:${tranche}:${patient_id}`,
    },
  ]).catch((err) => console.error("[visio] alerte patient non émise :", err.message));
}

/**
 * POST /api/visio/webhook — appelé UNIQUEMENT par le module Prosody
 * mod_muc_events_webhook.lua (jitsi-host/prosody/rootfs/prosody-plugins/).
 * Deux événements signés (politique de fonds v2, étape 6) :
 *
 *   - `muc-occupant-joined` : un participant identifié par son JWT entre
 *     dans la room. On enregistre sa PRÉSENCE (`medecin_present_le` /
 *     `patient_present_le`, premier passage gagnant, idempotent) — c'est le
 *     fait dont se déduit l'absence (§5), voir presence.service.js.
 *
 *   - `muc-room-destroyed` : dernier participant parti. Déclencheur de la
 *     FIN DE CONSULTATION (§2 : « à la clôture de la session »), MAIS
 *     uniquement si les DEUX présences sont enregistrées. Libération
 *     différée : la clôture ne libère PAS les fonds, elle constate la fin
 *     (termine_le) et fige T (delai_liberation_heures) ; le cron libère après
 *     T heures (liberationDifferee.service.js). Sans délai T actif pour le
 *     pays du médecin, la fin n'est pas constatée (événement ignoré, journalisé). Sinon on ne libère rien : le
 *     cron (detecterCreneauxDepasses.job.js) tranche après le délai de
 *     grâce selon la matrice §5 (médecin absent, patient absent, deux
 *     absents). Libérer ici sur une seule présence paierait le médecin
 *     d'une consultation à laquelle le patient n'a pas assisté (ou l'inverse).
 *
 * ⚠️ Déploiement : le module Lua ET l'émission de l'identifiant dans le JWT
 * (jitsi.service.js) doivent être en place avant ce contrôleur ; sans
 * événement d'entrée, aucune présence n'est enregistrée et toute session
 * serait traitée « deux absents ».
 *
 * ⚠️ Limite connue : `muc-room-destroyed` ne se déclenche que quand TOUS les
 * participants sont partis (voir mod_muc_events_webhook.lua).
 *
 * Signature vérifiée sur le corps brut (voir visioWebhook.routes.js, monté
 * avant express.json() comme le webhook Stripe). Jamais de 500 pour un
 * événement qu'on choisit d'ignorer, pour ne pas provoquer de ré-essais en
 * boucle côté émetteur.
 */
export async function traiterFinSessionVisio(req, res, next) {
  try {
    const signatureRecue = req.get("X-Aps-Signature");
    let signatureValide;
    try {
      signatureValide = verifierSignatureWebhookVisio(req.body, signatureRecue);
    } catch (err) {
      // JITSI_WEBHOOK_SECRET manquant côté serveur : erreur de
      // configuration, pas un problème avec cette requête précise.
      console.error(`[visio] ${err.message}`);
      return res.status(500).json({ message: "Configuration du webhook visio incomplète." });
    }
    if (!signatureValide) {
      return res.status(400).json({ message: "Signature invalide." });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Corps JSON invalide." });
    }

    if (!EVENEMENTS_VISIO_TRAITES.includes(payload.event)) {
      // On reste tolérant à une extension future plutôt que de répondre en
      // erreur pour un type d'événement qu'on choisit d'ignorer.
      return res.status(200).json({ ignore: true });
    }

    const room = String(payload.room || "");
    if (!room.startsWith(PREFIXE_ROOM_RDV)) {
      console.warn(`[visio] room "${room}" hors convention "${PREFIXE_ROOM_RDV}<rdv_id>" — ignorée.`);
      return res.status(200).json({ ignore: true });
    }
    const rdv_id = room.slice(PREFIXE_ROOM_RDV.length);

    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id },
      include: {
        medecin: { select: { utilisateur: { select: { utilisateur_id: true, email: true } } } },
        patient: { select: { utilisateur: { select: { utilisateur_id: true, email: true } } } },
      },
    });
    if (!rdv) {
      console.warn(`[visio] webhook ${payload.event} pour un rdv_id introuvable : ${rdv_id}.`);
      return res.status(200).json({ ignore: true });
    }
    if (rdv.type_rdv !== "teleconsultation") {
      console.warn(`[visio] webhook ${payload.event} pour un rdv non-téléconsultation : ${rdv_id}.`);
      return res.status(200).json({ ignore: true });
    }
    if (!STATUTS_AUTORISES_VISIO.includes(rdv.statut)) {
      // Déjà honoré (double événement), annulé, à reprogrammer, contesté... :
      // rien à enregistrer ni à constater (constaterFinConsultation est de
      // toute façon idempotent, mais on évite l'appel inutile).
      return res.status(200).json({ ignore: true });
    }

    if (payload.event === "muc-occupant-joined") {
      const partie = partieDepuisParticipant(rdv, { user_id: payload.user_id, email: payload.email });
      if (!partie) {
        console.warn(`[visio] entrée dans la room du rdv ${rdv_id} par un participant qui n'est ni son médecin ni son patient — ignorée.`);
        return res.status(200).json({ ignore: true });
      }
      const { enregistree } = await enregistrerPresence(rdv_id, partie);
      return res.status(200).json({ traite: true, partie, enregistree });
    }

    // muc-room-destroyed : libération seulement si les DEUX parties sont venues.
    if (!rdv.medecin_present_le || !rdv.patient_present_le) {
      console.warn(
        `[visio] fin de session du rdv ${rdv_id} avec présences incomplètes ` +
        `(médecin : ${rdv.medecin_present_le ? "oui" : "non"}, patient : ${rdv.patient_present_le ? "oui" : "non"}) — ` +
        `aucune libération : le cron d'absence tranchera après le délai de grâce.`
      );
      return res.status(200).json({ ignore: true, raison: "presences_incompletes" });
    }

    // Fin de consultation constatée (idempotent : un événement rejoué ne
    // réécrit ni termine_le ni T). Les fonds restent en séquestre T heures.
    let fin;
    try {
      fin = await constaterFinConsultation(rdv_id, { source: "visio" });
    } catch (err) {
      // Aucun T actif pour le pays du médecin : un webhook ne peut pas « refuser ».
      // Rien n'est modifié ; le RDV reste confirmé et le cron d'absence le
      // signalera en arbitrage admin tant que T n'est pas saisi.
      if (err instanceof ErreurParametreDelai) {
        console.error(
          `[visio] rdv ${rdv_id} : aucun délai de libération actif pour le pays du médecin — fin de consultation NON constatée.`
        );
        return res.status(200).json({ ignore: true, raison: "parametre_delai_absent" });
      }
      throw err;
    }
    if (fin.erreur) {
      console.warn(`[visio] rdv ${rdv_id} : fin de consultation non constatée (${fin.erreur.code}) — ${fin.erreur.message}`);
      return res.status(200).json({ ignore: true, raison: fin.erreur.code });
    }

    // Consultation terminée : le patient est invité à donner son avis (sans attendre, ne lève jamais).
    if (!fin.deja_constate) inviterAvisPatient(rdv_id);

    return res.status(200).json({ traite: true, deja_constate: fin.deja_constate });
  } catch (err) {
    next(err);
  }
}
/* -------------------------------------------------------------------
 * Clôture de la téléconsultation (fin d'appel côté application)
 * ------------------------------------------------------------------- */

/** Heures avant versement : T figé sur le RDV, sinon T actif du pays du médecin. */
async function delaiVersementHeures(rdv) {
  if (rdv.delai_liberation_heures != null) return rdv.delai_liberation_heures;
  try {
    return (await exigerParametreDelai(rdv.medecin_id)).heures;
  } catch {
    return null;
  }
}

/**
 * Bilan affiché dans la carte de fin de consultation :
 *   - médecin : remerciement + « paiement dans X heures » (X = T du pays) ;
 *   - patient : noter le médecin, laisser un avis, déclarer un litige.
 */
async function bilanCloture(rdv_id, role, raison = null) {
  const rdv = await prisma.rendezVous.findUnique({
    where: { rdv_id },
    include: {
      medecin: { include: { utilisateur: true, specialite: { select: { nom: true } } } },
      patient: { include: { utilisateur: true } },
      compte_escrow: { select: { statut: true } },
      avis_medecin: { select: { avis_id: true } },
    },
  });

  const termine = Boolean(rdv.termine_le) || rdv.statut === "honore";
  const delai = await delaiVersementHeures(rdv);
  const finEnCours = Boolean(rdv.termine_le) && STATUTS_AUTORISES_VISIO.includes(rdv.statut);

  let raison_non_terminee = null;
  if (!termine) {
    if (raison) raison_non_terminee = raison;
    else if (!STATUTS_AUTORISES_VISIO.includes(rdv.statut)) raison_non_terminee = "statut_incompatible";
    else if (!rdv.medecin_present_le || !rdv.patient_present_le) raison_non_terminee = "presences_incompletes";
    else raison_non_terminee = "en_attente_medecin";
  }

  const interlocuteur =
    role === "medecin"
      ? { prenom: rdv.patient.utilisateur.prenom, nom: rdv.patient.utilisateur.nom }
      : {
          prenom: rdv.medecin.utilisateur.prenom,
          nom: rdv.medecin.utilisateur.nom,
          specialite: rdv.medecin.specialite?.nom ?? null,
        };

  const bilan = {
    rdv_id,
    role,
    type_rdv: rdv.type_rdv,
    date_creneau: rdv.date_creneau,
    statut: rdv.statut,
    termine,
    termine_le: rdv.termine_le,
    // Le médecin a terminé l'appel : le patient raccroche, même si la fin de
    // consultation (paiement) n'a pas pu être constatée.
    visio_cloturee: termine || Boolean(rdv.visio_cloturee_le),
    raison_non_terminee,
    delai_liberation_heures: delai,
    date_liberation:
      rdv.termine_le && delai != null ? new Date(rdv.termine_le.getTime() + delai * 3_600_000) : null,
    interlocuteur,
  };

  if (role === "patient") {
    bilan.medecin = {
      medecin_id: rdv.medecin_id,
      utilisateur: interlocuteur,
      specialite: rdv.medecin.specialite ? { nom: rdv.medecin.specialite.nom } : null,
    };
    bilan.avis = { possible: termine && !rdv.avis_medecin, deja_depose: Boolean(rdv.avis_medecin) };
    bilan.contestation = { possible: finEnCours && rdv.compte_escrow?.statut === "sequestre" };
  }
  return bilan;
}

async function chargerRdvParticipant(req, res) {
  const rdv = await prisma.rendezVous.findUnique({
    where: { rdv_id: req.params.id },
    include: {
      medecin: { select: { utilisateur_id: true } },
      patient: { select: { utilisateur_id: true } },
    },
  });
  if (!rdv) {
    res.status(404).json({ message: "Rendez-vous introuvable." });
    return null;
  }
  const moi = req.utilisateur.utilisateur_id;
  const role = rdv.medecin.utilisateur_id === moi ? "medecin" : rdv.patient.utilisateur_id === moi ? "patient" : null;
  if (!role) {
    res.status(403).json({ message: "Accès non autorisé à cette consultation." });
    return null;
  }
  if (rdv.type_rdv !== "teleconsultation") {
    res.status(400).json({ message: "Ce rendez-vous n'est pas une téléconsultation." });
    return null;
  }
  return { rdv, role };
}

/**
 * POST /api/visio/:id/cloture — appelé par l'application quand l'appel se
 * termine pour l'utilisateur courant.
 *
 * MÉDECIN : sa sortie de la visio clôt la consultation (comme le webhook
 * `muc-room-destroyed`, qui reste le filet de sécurité) — fin constatée si
 * les deux parties ont été présentes, T figé, fonds en séquestre T heures,
 * patient invité à noter. Idempotent.
 * Dans tous les cas, la sortie du médecin pose `visio_cloturee_le` : le
 * patient raccroche alors, même si la fin n'a pas pu être constatée.
 * PATIENT : sa sortie ne clôt rien (il peut avoir perdu la connexion) ;
 * l'appel renvoie seulement le bilan.
 */
export async function cloturerVisio(req, res, next) {
  try {
    const charge = await chargerRdvParticipant(req, res);
    if (!charge) return undefined;
    const { rdv, role } = charge;

    let raison = null;
    // Signal de fin d'appel pour le patient, posé avant toute règle de paiement.
    if (role === "medecin" && !rdv.visio_cloturee_le) {
      await prisma.rendezVous.update({ where: { rdv_id: rdv.rdv_id }, data: { visio_cloturee_le: new Date() } });
    }
    if (role === "medecin" && !rdv.termine_le && STATUTS_AUTORISES_VISIO.includes(rdv.statut)) {
      if (rdv.medecin_present_le && rdv.patient_present_le) {
        try {
          const fin = await constaterFinConsultation(rdv.rdv_id, { source: "visio" });
          if (fin.erreur) raison = fin.erreur.code?.toLowerCase() ?? "fin_non_constatee";
          else if (!fin.deja_constate) inviterAvisPatient(rdv.rdv_id);
        } catch (err) {
          if (!(err instanceof ErreurParametreDelai)) throw err;
          console.error(`[visio] rdv ${rdv.rdv_id} : aucun délai de libération actif pour le pays du médecin — fin NON constatée.`);
          raison = "parametre_delai_absent";
        }
      }
    }

    return res.status(200).json(await bilanCloture(rdv.rdv_id, role, raison));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/visio/:id/presence — l'application signale que l'utilisateur
 * courant est entré dans la salle (événement Jitsi « conférence rejointe »).
 *
 * Même fait que le webhook `muc-occupant-joined` (premier passage gagnant,
 * idempotent) : sans lui, un webhook Prosody absent ou injoignable laissait
 * les présences vides, donc aucune fin de consultation constatée à la
 * clôture du médecin — et plus de note possible pour le patient.
 */
export async function signalerPresenceVisio(req, res, next) {
  try {
    const charge = await chargerRdvParticipant(req, res);
    if (!charge) return undefined;
    const { rdv, role } = charge;
    if (!STATUTS_AUTORISES_VISIO.includes(rdv.statut)) {
      return res.status(200).json({ enregistree: false });
    }
    const { enregistree } = await enregistrerPresence(rdv.rdv_id, role);
    return res.status(200).json({ enregistree });
  } catch (err) {
    next(err);
  }
}

/** GET /api/visio/:id/cloture — bilan seul (le patient attend la clôture du médecin). */
export async function obtenirBilanVisio(req, res, next) {
  try {
    const charge = await chargerRdvParticipant(req, res);
    if (!charge) return undefined;
    return res.status(200).json(await bilanCloture(charge.rdv.rdv_id, charge.role));
  } catch (err) {
    next(err);
  }
}
