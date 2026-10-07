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
import { ErreurParametreDelai } from "../services/parametreDelaiLiberation.service.js";
import { verifierSignatureWebhookVisio } from "../lib/jitsiWebhookService.js";
import { enregistrerPresence } from "../services/presence.service.js";
import { partieDepuisParticipant } from "../services/reglesPresenceReprogrammation.service.js";

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

    res.json({
      token,
      roomName,
      domain: process.env.JITSI_PUBLIC_DOMAIN || "localhost:8000",
    });
  } catch (err) {
    next(err);
  }
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

    return res.status(200).json({ traite: true, deja_constate: fin.deja_constate });
  } catch (err) {
    next(err);
  }
}