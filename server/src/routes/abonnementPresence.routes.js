// src/routes/abonnementPresence.routes.js
// Abonnements de présence : pharmacies (type « pharmacie »), centres de
// santé (« structure ») et médecins (« medecin »).
//
//   /abonnements-presence/...         souscription par le gestionnaire de
//     la fiche — authentifier ; l'appartenance à la fiche (agent, médecin
//     ou admin) est vérifiée dans le contrôleur, sur CHAQUE route.
//
//   /admin/abonnements-presence/...   administration — authentifier +
//     autoriser("admin", "superadmin") sur TOUTES les routes.
//
// :type est validé par router.param (jamais transmis brut aux requêtes).
// Les webhooks Stripe / CamPay restent ceux du RDV : ils aiguillent selon
// l'objet payé (voir paiement.controller.js, paiementCampay.service.js).

import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { limiteurCampay } from "../middlewares/limiteurCampay.js";
import { estTypeActeurPresence, TYPES_ACTEUR_PRESENCE } from "../lib/acteursPresence.js";
import {
  obtenirMonActeur,
  obtenirGestion,
  obtenirOffres,
  creerAbonnement,
  obtenirDevis,
  creerPaiementStripe,
  creerPaiementCampay,
  obtenirStatutPaiement,
  annulerPaiementEnCours,
  choisirVirement,
  obtenirFacture,
  obtenirStatistiques,
} from "../controllers/paiementAbonnementPresence.controller.js";
import {
  listerNiveaux,
  creerNiveau,
  modifierNiveau,
  listerTarifs,
  enregistrerTarif,
  listerRemises,
  enregistrerRemises,
  supprimerRemise,
  listerConfigs,
  enregistrerConfig,
  creerAbonnementAdmin,
  constaterEncaissement,
  suspendreAbonnement,
  retablirAbonnement,
  prolongerAbonnement,
  listerAbonnements,
  tableauDeBord,
  listerPaiements,
  listerPaiementsTardifs,
  traiterPaiementTardif,
  listerFiches,
} from "../controllers/abonnementPresence.controller.js";
import { catalogueAbonnementPresence } from "../controllers/catalogueAbonnement.controller.js";

const router = Router();
const admin = [authentifier, autoriser("admin", "superadmin")];

router.param("type", (req, res, next, type) => {
  if (!estTypeActeurPresence(type)) {
    return res.status(404).json({ message: `Type d'acteur inconnu. Valeurs acceptées : ${TYPES_ACTEUR_PRESENCE.join(", ")}.` });
  }
  next();
});

// ─── Public : catalogue de la page « Abonnements » ────────────
router.get("/abonnements-presence/:type/catalogue", catalogueAbonnementPresence);

// ─── Gestionnaire de la fiche ─────────────────────────────────
// Routes par type (2e segment = type) puis routes par abonnement (2e
// segment = abonnement_id) : les 3e segments diffèrent, aucun conflit.
router.get("/abonnements-presence/:type/mon-acteur", authentifier, obtenirMonActeur);
router.get("/abonnements-presence/:type/gestion", authentifier, obtenirGestion);
router.get("/abonnements-presence/:type/offres", authentifier, obtenirOffres);
router.get("/abonnements-presence/:type/statistiques", authentifier, obtenirStatistiques);
router.post("/abonnements-presence/:type", authentifier, creerAbonnement);

router.get("/abonnements-presence/:id/devis", authentifier, obtenirDevis);
router.post("/abonnements-presence/:id/paiement", authentifier, creerPaiementStripe);
router.post("/abonnements-presence/:id/paiement-campay", authentifier, limiteurCampay, creerPaiementCampay);
router.get("/abonnements-presence/:id/paiement", authentifier, obtenirStatutPaiement);
router.post("/abonnements-presence/:id/paiement/annuler", authentifier, annulerPaiementEnCours);
router.post("/abonnements-presence/:id/virement", authentifier, choisirVirement);
router.get("/abonnements-presence/:id/facture", authentifier, obtenirFacture);

// ─── Administration ───────────────────────────────────────────
const base = "/admin/abonnements-presence/:type";

router.get(`${base}/niveaux`, ...admin, listerNiveaux);
router.post(`${base}/niveaux`, ...admin, creerNiveau);
router.put(`${base}/niveaux/:id`, ...admin, modifierNiveau);

router.get(`${base}/tarifs`, ...admin, listerTarifs);
router.put(`${base}/tarifs`, ...admin, enregistrerTarif);

router.get(`${base}/remises`, ...admin, listerRemises);
router.put(`${base}/remises`, ...admin, enregistrerRemises);
router.delete(`${base}/remises/:duree`, ...admin, supprimerRemise);

// Gratuité, grâce et (médecins) obligation de souscrire, par pays.
router.get(`${base}/configs`, ...admin, listerConfigs);
router.put(`${base}/configs/:pays_id`, ...admin, enregistrerConfig);

router.get(`${base}/tableau-de-bord`, ...admin, tableauDeBord);
router.get(`${base}/abonnements`, ...admin, listerAbonnements);
router.post(`${base}/abonnements`, ...admin, creerAbonnementAdmin);
router.post(`${base}/abonnements/:id/encaissement-constate`, ...admin, constaterEncaissement);
router.patch(`${base}/abonnements/:id/suspendre`, ...admin, suspendreAbonnement);
router.patch(`${base}/abonnements/:id/retablir`, ...admin, retablirAbonnement);
router.patch(`${base}/abonnements/:id/prolonger`, ...admin, prolongerAbonnement);

router.get(`${base}/paiements`, ...admin, listerPaiements);
router.get(`${base}/paiements-tardifs`, ...admin, listerPaiementsTardifs);
router.post(`${base}/paiements-tardifs/:id/traiter`, ...admin, traiterPaiementTardif);

router.get(`${base}/fiches`, ...admin, listerFiches);

export default router;
