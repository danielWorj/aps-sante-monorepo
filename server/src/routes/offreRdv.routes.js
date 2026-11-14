// src/routes/offreRdv.routes.js
// RDV aléatoire (RDV sur offre) — voir services/offreRdv.service.js.
//   Patient : publier, lister/consulter ses offres et les médecins qui ont
//             répondu, annuler, « valider ce médecin » (crée le RDV).
//   Médecin : lister les offres qui le concernent, répondre, retirer.
//   Demande directe (médecin sans créneau libre) : le patient propose un
//             jour + une heure, le médecin accepte / refuse sous 24 h, puis le
//             patient change de médecin (annuler) ou diffuse sa demande.
//   Admin   : lister toutes les offres (filtres statut / pays), retirer une offre ouverte.
// Le rôle est vérifié dans le contrôleur par le profil (patient / médecin).
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  accepterDemande,
  annulerMonOffre,
  creerDemandeDirecte,
  creerOffre,
  diffuserMaDemande,
  listerMesOffres,
  listerOffresPourAdmin,
  listerOffresPourMedecin,
  obtenirMonOffre,
  refuserDemande,
  repondre,
  retirer,
  retirerOffreAdmin,
  validerReponse,
} from "../controllers/offreRdv.controller.js";

const router = Router();

// Chemins fixes avant « :id ».
router.get("/offres-rdv/mes-offres", authentifier, listerMesOffres);
router.get("/offres-rdv/mes-offres/:id", authentifier, obtenirMonOffre);
router.get("/offres-rdv/medecin", authentifier, listerOffresPourMedecin);
// Back-office : suivi et modération.
router.get("/offres-rdv/admin", authentifier, autoriser("admin", "superadmin"), listerOffresPourAdmin);
router.post("/offres-rdv/:id/retirer", authentifier, autoriser("admin", "superadmin"), retirerOffreAdmin);

router.post("/offres-rdv", authentifier, creerOffre);
// Demande directe à un médecin sans créneau libre (accepte / refuse sous 24 h).
router.post("/offres-rdv/directe", authentifier, creerDemandeDirecte);
router.post("/offres-rdv/:id/accepter", authentifier, accepterDemande);
router.post("/offres-rdv/:id/refuser", authentifier, refuserDemande);
// Après refus ou silence du médecin : proposer la demande aux autres médecins.
router.post("/offres-rdv/:id/diffuser", authentifier, diffuserMaDemande);
router.post("/offres-rdv/:id/annuler", authentifier, annulerMonOffre);
router.post("/offres-rdv/:id/reponses/:reponseId/valider", authentifier, validerReponse);

router.post("/offres-rdv/:id/reponse", authentifier, repondre);
router.delete("/offres-rdv/:id/reponse", authentifier, retirer);

export default router;
