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

const STATUTS_AUTORISES_VISIO = ["confirme", "en_attente_presence"];

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
    const roomName = `rdv-${rdv.rdv_id}`;

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
