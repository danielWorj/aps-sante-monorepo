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
import { libererEscrow } from "../services/liberationEscrow.service.js";
import { verifierSignatureWebhookVisio } from "../lib/jitsiWebhookService.js";

const STATUTS_AUTORISES_VISIO = ["confirme", "en_attente_presence"];
// Doit rester identique au roomName généré dans obtenirTokenVisio
// ci-dessous (`rdv-${rdv.rdv_id}`) : c'est cette convention de nommage
// qui permet à traiterFinSessionVisio de retrouver le rendez-vous à
// partir du nom de room envoyé par le webhook Jitsi/Prosody.
const PREFIXE_ROOM_RDV = "rdv-";

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

    if (!STATUTS_AUTORISES_VISIO.includes(rdv.statut)) {
      return res
        .status(400)
        .json({ message: "Ce rendez-vous n'est pas dans un état permettant la visio." });
    }

    const utilisateurCourantId = req.utilisateur.utilisateur_id;
    const estLeMedecin = rdv.medecin.utilisateur_id === utilisateurCourantId;
    const estLePatient = rdv.patient.utilisateur_id === utilisateurCourantId;

    if (!estLeMedecin && !estLePatient) {
      return res.status(403).json({ message: "Accès non autorisé à cette consultation." });
    }

    const participantInfo = estLeMedecin ? rdv.medecin.utilisateur : rdv.patient.utilisateur;
    const roomName = `${PREFIXE_ROOM_RDV}${rdv.rdv_id}`;

    const token = genererJitsiToken(
      {
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
 * mod_muc_events_webhook.lua (jitsi-host/prosody/rootfs/
 * prosody-plugins/), sur l'événement `muc-room-destroyed` — c'est-à-
 * dire quand la room Jitsi de la téléconsultation est détruite
 * (dernier participant parti). Déclencheur téléconsultation de la
 * Phase 2 (politique de gestion des fonds §2 : "la libération
 * intervient à la clôture de la session").
 *
 * ⚠️ Limite connue à signaler : `muc-room-destroyed` ne se déclenche
 * que quand TOUS les participants sont partis. Si seul le patient
 * quitte (perte de connexion) alors que le médecin reste dans la
 * room, la libération n'a donc pas encore lieu — comportement voulu
 * ou à ajuster selon le produit réel (ex. détecter plutôt le départ
 * du médecin spécifiquement) ?
 *
 * Signature vérifiée sur le corps brut (voir visioWebhook.routes.js,
 * monté avant express.json() comme le webhook Stripe) — même motif
 * que traiterWebhookStripe (paiement.controller.js) : jamais de 500
 * pour un événement qu'on choisit d'ignorer, pour ne pas provoquer de
 * ré-essais en boucle côté émetteur.
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

    if (payload.event !== "muc-room-destroyed") {
      // Le plugin n'émet aujourd'hui que cet événement ; on reste
      // tolérant à une extension future plutôt que de répondre en
      // erreur pour un type d'événement qu'on choisit d'ignorer.
      return res.status(200).json({ ignore: true });
    }

    const room = String(payload.room || "");
    if (!room.startsWith(PREFIXE_ROOM_RDV)) {
      console.warn(`[visio] room "${room}" hors convention "${PREFIXE_ROOM_RDV}<rdv_id>" — ignorée.`);
      return res.status(200).json({ ignore: true });
    }
    const rdv_id = room.slice(PREFIXE_ROOM_RDV.length);

    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id } });
    if (!rdv) {
      console.warn(`[visio] webhook fin de session pour un rdv_id introuvable : ${rdv_id}.`);
      return res.status(200).json({ ignore: true });
    }
    if (rdv.type_rdv !== "teleconsultation") {
      console.warn(`[visio] webhook fin de session pour un rdv non-téléconsultation : ${rdv_id}.`);
      return res.status(200).json({ ignore: true });
    }
    if (!STATUTS_AUTORISES_VISIO.includes(rdv.statut)) {
      // Déjà honoré (double événement), annulé, contesté... :
      // libererEscrow est de toute façon idempotent via
      // CompteEscrow.statut, mais on évite l'appel inutile.
      return res.status(200).json({ ignore: true });
    }

    await libererEscrow(rdv_id);

    return res.status(200).json({ traite: true });
  } catch (err) {
    next(err);
  }
}