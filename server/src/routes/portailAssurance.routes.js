// src/routes/portailAssurance.routes.js
// Portail assurance (espace de l'agent d'une compagnie / d'un courtier) —
// voir controllers/portailAssurance.controller.js.
//   Tableau de bord : métriques de la fiche (agent ou admin).
//   Médiathèque     : lecture PUBLIQUE filtrée par les droits ; gestion
//                     (ajout, titre, ordre, suppression) par l'agent ou l'admin.
//   Demandes        : suivi (statut + note interne) d'une mise en relation ;
//                     la liste reste GET /mises-en-relation-assurance.
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { gererTeleversementMediaAssurance } from "../middlewares/upload.middleware.js";
import {
  ajouterMedia,
  listerMediasGestion,
  listerMediasPublics,
  modifierMedia,
  obtenirTableauDeBord,
  ordonnerMedias,
  suivreMiseEnRelation,
  supprimerMedia,
} from "../controllers/portailAssurance.controller.js";

const router = Router();

router.get("/services-assurance/:id/tableau-de-bord", authentifier, obtenirTableauDeBord);

router.get("/services-assurance/:id/medias", listerMediasPublics);
router.get("/services-assurance/:id/medias/gestion", authentifier, listerMediasGestion);
router.post("/services-assurance/:id/medias", authentifier, gererTeleversementMediaAssurance, ajouterMedia);
router.put("/services-assurance/:id/medias/ordre", authentifier, ordonnerMedias);
router.put("/medias-assurance/:id", authentifier, modifierMedia);
router.delete("/medias-assurance/:id", authentifier, supprimerMedia);

router.patch("/mises-en-relation-assurance/:id", authentifier, suivreMiseEnRelation);

export default router;
