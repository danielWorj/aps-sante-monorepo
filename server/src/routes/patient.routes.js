// src/routes/patient.routes.js
// Module transverse "Gestion des médecins" — fiche `patient`.
//
// Toutes les routes ci-dessous exigent une authentification
// ("authentifier" — auth.middleware.js) : la fiche patient est une
// donnée privée, jamais publique (contrairement à l'annuaire médecin).
// L'autorisation fine (patient concerné / médecin ayant un rendez-vous
// avec lui / admin-superadmin) est appliquée dans patient.controller.js.
//
// ⚠️ Ordre des routes : "/patients/mon-profil" DOIT être déclarée AVANT
// "/patients/:id" — sinon Express interprète "mon-profil" comme une
// valeur de :id (même piège que medecin.routes.js pour /medecins/mon-profil).

import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import {
  obtenirMonProfil,
  obtenirPatient,
  listerRendezVousPatient,
} from "../controllers/patient.controller.js";

const router = Router();

// ─── Profil du patient connecté ────────────────────────────────
router.get("/patients/mon-profil", authentifier, obtenirMonProfil);

// ─── Fiche patient par ID (patient concerné / médecin lié / admin) ──
router.get("/patients/:id", authentifier, obtenirPatient);

// ─── Rendez-vous d'un patient donné ────────────────────────────
router.get("/patients/:id/rendez-vous", authentifier, listerRendezVousPatient);

export default router;