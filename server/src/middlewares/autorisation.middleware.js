// src/middlewares/autorisation.middleware.js
// Middleware de contrôle d'accès basé sur le rôle de l'utilisateur
// authentifié (req.utilisateur.role, renseigné par le middleware
// "authentifier" à partir du claim "role" de l'access token — voir
// token.utils.js / genererAccessToken).
//
// À utiliser après "authentifier" :
//   router.post("/pays", authentifier, autoriser("admin", "superadmin"), creerPays);

export function autoriser(...rolesAutorises) {
  return (req, res, next) => {
    if (!req.utilisateur) {
      return res.status(401).json({ message: "Authentification requise." });
    }

    if (!rolesAutorises.includes(req.utilisateur.role)) {
      return res.status(403).json({
        message: "Accès refusé : privilèges insuffisants.",
      });
    }

    return next();
  };
}