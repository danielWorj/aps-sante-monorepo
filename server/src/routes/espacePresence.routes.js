// src/routes/espacePresence.routes.js
// Espaces pharmacie et centre de santé — voir
// controllers/espacePresence.controller.js.
//
// Monté AVANT pharmacie.routes.js et centreSante.routes.js (index.js) :
// « /pharmacies/mon-espace » ne doit pas être pris pour « /pharmacies/:id ».
//
//   mon-espace, tableau de bord, horaires,
//   gestion des photos / actualités / messages / prestations
//                                  : agent de la fiche ou administration
//   images, annonces, examens (GET): PUBLIQUES, selon l'abonnement de la fiche
//   messages (POST)                : visiteur (jeton facultatif), anti-spam,
//                                    si l'abonnement inclut le contact direct
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { gererTeleversementImageFiche } from "../middlewares/upload.middleware.js";
import {
  ajouterPhoto,
  changerStatutMessage,
  creerActualite,
  creerPrestation,
  envoyerMessage,
  listerActualitesGestion,
  listerActualitesPubliques,
  listerAvisGestion,
  listerGardesGestion,
  listerMessagesGestion,
  listerPhotosGestion,
  listerPhotosPubliques,
  listerPrestationsGestion,
  listerPrestationsPubliques,
  modifierActualite,
  modifierHoraires,
  modifierPhoto,
  modifierPrestation,
  obtenirMaFiche,
  obtenirTableauDeBord,
  ordonnerPhotos,
  supprimerActualite,
  supprimerPhoto,
  supprimerPrestation,
} from "../controllers/espacePresence.controller.js";

const router = Router();

// Anti-spam du formulaire de contact : 5 messages par IP et par heure
// (même règle que la page « Contactez-nous »).
const limiteurMessages = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Vous avez envoyé plusieurs messages récemment. Réessayez dans une heure." },
});

const poserType = (type) => (req, _res, next) => {
  req.typeEspace = type;
  next();
};

// Routes communes, sous /pharmacies et /centres-sante.
for (const [base, type] of [["/pharmacies", "pharmacie"], ["/centres-sante", "structure"]]) {
  const t = poserType(type);
  router.get(`${base}/mon-espace`, authentifier, t, obtenirMaFiche);
  router.get(`${base}/:id/tableau-de-bord`, authentifier, t, obtenirTableauDeBord);
  router.put(`${base}/:id/horaires`, authentifier, t, modifierHoraires);

  router.get(`${base}/:id/images`, t, listerPhotosPubliques);
  router.get(`${base}/:id/images/gestion`, authentifier, t, listerPhotosGestion);
  router.post(`${base}/:id/images`, authentifier, t, gererTeleversementImageFiche, ajouterPhoto);
  router.put(`${base}/:id/images/ordre`, authentifier, t, ordonnerPhotos);

  router.get(`${base}/:id/annonces`, t, listerActualitesPubliques);
  router.get(`${base}/:id/actualites/gestion`, authentifier, t, listerActualitesGestion);
  router.post(`${base}/:id/actualites`, authentifier, t, gererTeleversementImageFiche, creerActualite);

  router.post(`${base}/:id/messages`, limiteurMessages, authentifierOptionnel, t, envoyerMessage);
  router.get(`${base}/:id/messages/gestion`, authentifier, t, listerMessagesGestion);
}

// Pharmacie : gardes officielles et avis (lecture du gestionnaire).
router.get("/pharmacies/:id/gardes/gestion", authentifier, listerGardesGestion);
router.get("/pharmacies/:id/avis/gestion", authentifier, listerAvisGestion);

// Centre de santé : prestations (onglet « Examens » de la fiche publique).
router.get("/centres-sante/:id/examens", listerPrestationsPubliques);
router.get("/centres-sante/:id/prestations/gestion", authentifier, listerPrestationsGestion);
router.post("/centres-sante/:id/prestations", authentifier, creerPrestation);
router.put("/prestations-structure/:id", authentifier, modifierPrestation);
router.delete("/prestations-structure/:id", authentifier, supprimerPrestation);

// Lignes d'une fiche (le type se lit sur la ligne).
router.put("/photos-fiche/:id", authentifier, modifierPhoto);
router.delete("/photos-fiche/:id", authentifier, supprimerPhoto);
router.put("/actualites-fiche/:id", authentifier, gererTeleversementImageFiche, modifierActualite);
router.delete("/actualites-fiche/:id", authentifier, supprimerActualite);
router.patch("/messages-fiche/:id", authentifier, changerStatutMessage);

export default router;
