// src/routes/authentification.routes.js
// Composant "authentification" : inscription, connexion, refresh,
// déconnexion, profil courant, gestion des comptes privilégiés.
import { Router } from "express";
import {
  inscrire,
  connecter,
  changerMotDePasseInitial,
  rafraichirToken,
  deconnecter,
  profil,
  creerCompteAdministre,
  amorcerSuperAdmin,
} from "../controllers/authentification.controller.js";
import {
  authentifier,
  exigerTokenChangementMotDePasse,
} from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

// ─── Authentification publique ───────────────────────────────
// /register ne peut créer QUE des comptes "patient" (voir le
// contrôleur) : c'est la seule route de création de compte accessible
// sans authentification.
router.post("/register", inscrire);
router.post("/login", connecter);
// Route "publique" au sens où elle ne passe pas par `authentifier`,
// mais protégée par exigerTokenChangementMotDePasse : seul le token
// restreint renvoyé par /login (quand mot_de_passe_a_changer=true)
// permet de l'appeler. Voir authentification.controller.js.
router.post(
  "/changer-mot-de-passe-initial",
  exigerTokenChangementMotDePasse,
  changerMotDePasseInitial
);
router.post("/refresh", rafraichirToken);
router.post("/logout", authentifier, deconnecter);
router.get("/me", authentifier, profil);

// ─── Gestion des comptes privilégiés (protégée) ──────────────
// Création de comptes médecin / agent_xxx / admin / superadmin par un
// admin ou un superadmin déjà authentifié. La matrice de permissions
// fine (qui peut créer quel rôle) est appliquée dans le contrôleur.
router.post(
  "/comptes",
  authentifier,
  autoriser("admin", "superadmin"),
  creerCompteAdministre
);

// ─── Amorçage du tout premier superadmin ─────────────────────
// Route publique mais verrouillée par le header X-Setup-Token (doit
// correspondre à la variable d'environnement SETUP_TOKEN) et
// définitivement désactivée dès qu'un superadmin existe déjà. Ne pas
// exposer publiquement cet environnement une fois l'amorçage terminé :
// retirez SETUP_TOKEN du serveur après usage.
router.post("/bootstrap-superadmin", amorcerSuperAdmin);

export default router;