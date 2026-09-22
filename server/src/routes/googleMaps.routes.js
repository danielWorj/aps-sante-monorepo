// src/routes/googleMaps.routes.js
//
// Routes publiques pour lib/googleMaps.js. Le rate-limiting dédié est
// appliqué dans index.js (limiteurGoogleMaps), pas ici, pour rester
// cohérent avec le pattern déjà en place sur /api/auth/*.

import { Router } from "express";
import { geocoder, geocoderInverse, itineraire } from "../controllers/googleMaps.controller.js";

const router = Router();

router.get("/google-maps/geocodage", geocoder);
router.get("/google-maps/geocodage-inverse", geocoderInverse);
router.get("/google-maps/itineraire", itineraire);

export default router;