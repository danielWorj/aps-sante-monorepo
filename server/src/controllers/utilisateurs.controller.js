// src/controllers/utilisateurs.controller.js
// Composant "utilisateurs" : gestion des comptes privilégiés
// (admin / superadmin) UNIQUEMENT. La création de patients, médecins
// et agent_xxx reste du ressort de authentification.controller.js
// (POST /api/auth/comptes).
//
// ---------------------------------------------------------------------
// SÉCURITÉ — Modèle de permissions
//
//  - Lecture (lister / obtenir) : accessible à "admin" ET "superadmin".
//    ABAC : un admin ne voit que les comptes admin de SON pays (filtre
//    posé par l'extension Prisma, voir lib/perimetrePays.js) et jamais
//    les superadmins ; un superadmin voit tout et peut filtrer par pays.
//  - Écriture (créer / modifier / suspendre / réactiver / supprimer /
//    réinitialiser le mot de passe) : réservée au
//    SEUL "superadmin". Un "admin" ne peut jamais créer ni modifier un
//    compte admin ou superadmin (pas d'auto-élévation, pas de
//    modification latérale entre admins).
//
//  Le filtrage par rôle est normalement déjà assuré par le middleware
//  `autoriser(...)` posé sur chaque route (voir utilisateurs.routes.js).
//  Les contrôles ci-dessous sont volontairement dupliqués ici
//  (défense en profondeur) : si une route est un jour mal configurée,
//  le contrôleur refuse quand même l'écriture à un simple admin.
// ---------------------------------------------------------------------
import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";

const SALT_ROUNDS = 10;
const MOT_DE_PASSE_LONGUEUR_MIN = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ce contrôleur ne gère QUE ces deux rôles. Toute tentative de créer,
// lire ou modifier un utilisateur d'un autre rôle via ces routes est
// rejetée : ce n'est pas leur responsabilité.
const ROLES_GERES = ["admin", "superadmin"];

/**
 * GET /api/utilisateurs
 * Liste paginée des comptes admin / superadmin. Accessible en lecture
 * à "admin" et "superadmin" (voir autoriser("admin", "superadmin") sur
 * la route).
 *
 * Query params optionnels :
 *  - role       : "admin" | "superadmin" (filtre)
 *  - statut     : "actif" | "suspendu" (filtre)
 *  - recherche  : recherche texte sur nom / prenom / email
 *  - page, limite : pagination (défauts 1 / 20, max 100)
 */
export async function listerUtilisateurs(req, res, next) {
  try {
    const { statut, recherche, pays_id } = req.query;
    // Un admin ne voit jamais les superadmins (ni leur nombre).
    const role = req.utilisateur.role === "superadmin" ? req.query.role : "admin";

    if (role && !ROLES_GERES.includes(role)) {
      return res.status(400).json({
        message: `Filtre "role" invalide. Valeurs acceptées : ${ROLES_GERES.join(", ")}.`,
      });
    }

    if (statut && !["actif", "suspendu"].includes(statut)) {
      return res.status(400).json({
        message: 'Filtre "statut" invalide. Valeurs acceptées : actif, suspendu.',
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 20));

    const where = {
      role: { libelle: role ? role : { in: ROLES_GERES } },
      ...(statut && { statut_compte: statut }),
      ...(pays_id && { pays_id }),
      ...(recherche && {
        OR: [
          { nom: { contains: recherche, mode: "insensitive" } },
          { prenom: { contains: recherche, mode: "insensitive" } },
          { email: { contains: recherche, mode: "insensitive" } },
        ],
      }),
    };

    const [total, utilisateurs] = await prisma.$transaction([
      prisma.utilisateur.count({ where }),
      prisma.utilisateur.findMany({
        where,
        include: INCLUDE_UTILISATEUR,
        orderBy: { nom: "asc" },
        skip: (page - 1) * limite,
        take: limite,
      }),
    ]);

    return res.status(200).json({
      utilisateurs: utilisateurs.map(serialiserUtilisateur),
      pagination: {
        page,
        limite,
        total,
        total_pages: Math.ceil(total / limite) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/utilisateurs/:id
 * Détail d'un compte admin / superadmin. Accessible en lecture à
 * "admin" et "superadmin".
 *
 * Renvoie 404 (pas 403) si l'id existe mais correspond à un rôle hors
 * périmètre (patient, medecin, agent_xxx) : ce n'est pas la
 * responsabilité de cette route de renseigner sur ces comptes-là, et
 * on évite de confirmer/infirmer leur existence via ce endpoint.
 */
export async function obtenirUtilisateur(req, res, next) {
  try {
    const { id } = req.params;

    const utilisateur = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: id },
      include: INCLUDE_UTILISATEUR,
    });

    if (!utilisateur || !rolesVisibles(req).includes(utilisateur.role.libelle)) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    return res.status(200).json({ utilisateur: serialiserUtilisateur(utilisateur) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/utilisateurs
 * Création d'un compte admin OU superadmin. Réservé au superadmin.
 *
 * Corps attendu : nom, prenom, email, telephone (optionnel),
 * mot_de_passe, pays_id, role ("admin" | "superadmin").
 */
export async function creerUtilisateur(req, res, next) {
  try {
    // Défense en profondeur : la route doit déjà appliquer
    // autoriser("superadmin"), mais on ne fait jamais confiance
    // uniquement au routing pour une opération d'écriture sensible.
    if (req.utilisateur.role !== "superadmin") {
      return res.status(403).json({
        message: "Seul un superadmin peut créer un compte admin ou superadmin.",
      });
    }

    const {
      nom,
      prenom,
      email: emailBrut,
      telephone,
      mot_de_passe,
      pays_id,
      role,
    } = req.body;

    if (!nom || !prenom || !emailBrut || !mot_de_passe || !pays_id || !role) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, prenom, email, mot_de_passe, pays_id, role.",
      });
    }

    if (!ROLES_GERES.includes(role)) {
      return res.status(400).json({
        message: `role invalide. Valeurs acceptées : ${ROLES_GERES.join(", ")}.`,
      });
    }

    const erreurMotDePasse = validerMotDePasse(mot_de_passe);
    if (erreurMotDePasse) {
      return res.status(400).json({ message: erreurMotDePasse });
    }

    const email = normaliserEmail(emailBrut);
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Email invalide." });
    }

    const roleRecord = await prisma.role.findUnique({ where: { libelle: role } });
    if (!roleRecord) {
      return res
        .status(500)
        .json({ message: `Rôle "${role}" introuvable en base. Contactez un administrateur.` });
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(400).json({ message: "Pays introuvable." });
    }

    const existant = await prisma.utilisateur.findUnique({ where: { email } });
    if (existant) {
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }

    const mot_de_passe_hash = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);

    const utilisateur = await prisma.utilisateur.create({
      data: {
        nom,
        prenom,
        email,
        telephone,
        mot_de_passe_hash,
        role_id: roleRecord.role_id,
        pays_id,
        statut_compte: "actif",
        // Mot de passe choisi par le superadmin : à changer à la 1re connexion.
        mot_de_passe_temporaire: true,
      },
      include: INCLUDE_UTILISATEUR,
    });

    return res.status(201).json({
      message: "Compte créé avec succès.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/utilisateurs/:id
 * Mise à jour d'un compte admin / superadmin (identité, pays, rôle).
 * Réservé au superadmin. Ne touche jamais au mot de passe (voir
 * changement de mot de passe côté authentification.controller.js) ni
 * au statut_compte (voir suspendreUtilisateur / reactiverUtilisateur).
 *
 * Corps accepté (tous optionnels) : nom, prenom, telephone, pays_id,
 * role ("admin" | "superadmin").
 */
export async function modifierUtilisateur(req, res, next) {
  try {
    if (req.utilisateur.role !== "superadmin") {
      return res.status(403).json({
        message: "Seul un superadmin peut modifier un compte admin ou superadmin.",
      });
    }

    const { id } = req.params;
    const { nom, prenom, telephone, pays_id, role } = req.body;

    const cible = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: id },
      include: { role: true },
    });

    if (!cible || !ROLES_GERES.includes(cible.role.libelle)) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    // Un superadmin ne peut pas se rétrograder lui-même : ça pourrait
    // laisser la plateforme sans aucun superadmin actif s'il n'y a pas
    // de garde-fou ailleurs.
    if (id === req.utilisateur.utilisateur_id && role && role !== "superadmin") {
      return res.status(400).json({
        message: "Vous ne pouvez pas retirer votre propre rôle superadmin.",
      });
    }

    const donnees = {};

    if (nom !== undefined) donnees.nom = nom;
    if (prenom !== undefined) donnees.prenom = prenom;
    if (telephone !== undefined) donnees.telephone = telephone;

    if (pays_id !== undefined) {
      const pays = await prisma.pays.findUnique({ where: { pays_id } });
      if (!pays) {
        return res.status(400).json({ message: "Pays introuvable." });
      }
      donnees.pays_id = pays_id;
    }

    if (role !== undefined) {
      if (!ROLES_GERES.includes(role)) {
        return res.status(400).json({
          message: `role invalide. Valeurs acceptées : ${ROLES_GERES.join(", ")}.`,
        });
      }
      if (role !== cible.role.libelle) {
        // On empêche de vider la plateforme du dernier superadmin actif
        // en le rétrogradant vers admin.
        if (cible.role.libelle === "superadmin") {
          const superadminsActifs = await compterSuperadminsActifs();
          if (superadminsActifs <= 1) {
            return res.status(409).json({
              message: "Impossible de rétrograder le dernier superadmin actif.",
            });
          }
        }
        const roleRecord = await prisma.role.findUnique({ where: { libelle: role } });
        if (!roleRecord) {
          return res.status(500).json({ message: `Rôle "${role}" introuvable en base.` });
        }
        donnees.role_id = roleRecord.role_id;
      }
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucun champ à mettre à jour." });
    }

    const utilisateur = await prisma.utilisateur.update({
      where: { utilisateur_id: id },
      data: donnees,
      include: INCLUDE_UTILISATEUR,
    });

    return res.status(200).json({
      message: "Utilisateur mis à jour.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/utilisateurs/:id/suspendre
 * Suspend un compte admin / superadmin (statut_compte = "suspendu").
 * Réservé au superadmin. Un superadmin ne peut pas se suspendre
 * lui-même, et le dernier superadmin actif ne peut pas être suspendu.
 */
export async function suspendreUtilisateur(req, res, next) {
  try {
    if (req.utilisateur.role !== "superadmin") {
      return res.status(403).json({
        message: "Seul un superadmin peut suspendre un compte admin ou superadmin.",
      });
    }

    const { id } = req.params;

    if (id === req.utilisateur.utilisateur_id) {
      return res.status(400).json({ message: "Vous ne pouvez pas suspendre votre propre compte." });
    }

    const cible = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: id },
      include: { role: true },
    });

    if (!cible || !ROLES_GERES.includes(cible.role.libelle)) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    if (cible.statut_compte === "suspendu") {
      return res.status(409).json({ message: "Ce compte est déjà suspendu." });
    }

    if (cible.role.libelle === "superadmin") {
      const superadminsActifs = await compterSuperadminsActifs();
      if (superadminsActifs <= 1) {
        return res.status(409).json({
          message: "Impossible de suspendre le dernier superadmin actif.",
        });
      }
    }

    const [utilisateur] = await prisma.$transaction([
      prisma.utilisateur.update({
        where: { utilisateur_id: id },
        data: { statut_compte: "suspendu" },
        include: INCLUDE_UTILISATEUR,
      }),
      // Un compte suspendu perd ses sessions ouvertes (refresh tokens).
      revoquerSessions(id),
    ]);

    return res.status(200).json({
      message: "Compte suspendu.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/utilisateurs/:id/reactiver
 * Réactive un compte admin / superadmin (statut_compte = "actif").
 * Réservé au superadmin.
 */
export async function reactiverUtilisateur(req, res, next) {
  try {
    if (req.utilisateur.role !== "superadmin") {
      return res.status(403).json({
        message: "Seul un superadmin peut réactiver un compte admin ou superadmin.",
      });
    }

    const { id } = req.params;

    const cible = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: id },
      include: { role: true },
    });

    if (!cible || !ROLES_GERES.includes(cible.role.libelle)) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    if (cible.statut_compte === "actif") {
      return res.status(409).json({ message: "Ce compte est déjà actif." });
    }

    const utilisateur = await prisma.utilisateur.update({
      where: { utilisateur_id: id },
      data: { statut_compte: "actif" },
      include: INCLUDE_UTILISATEUR,
    });

    return res.status(200).json({
      message: "Compte réactivé.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/utilisateurs/:id/mot-de-passe
 * Réinitialise le mot de passe d'un compte admin / superadmin.
 * Réservé au superadmin. Le nouveau mot de passe est TEMPORAIRE : le
 * titulaire devra le changer à sa prochaine connexion, et ses sessions
 * ouvertes sont fermées.
 *
 * Corps attendu : mot_de_passe.
 */
export async function reinitialiserMotDePasseUtilisateur(req, res, next) {
  try {
    if (req.utilisateur.role !== "superadmin") {
      return res.status(403).json({
        message: "Seul un superadmin peut réinitialiser le mot de passe d'un compte admin.",
      });
    }

    const { id } = req.params;
    const { mot_de_passe } = req.body ?? {};

    if (id === req.utilisateur.utilisateur_id) {
      return res.status(400).json({
        message: "Pour votre propre compte, changez votre mot de passe depuis votre profil.",
      });
    }

    const erreurMotDePasse = validerMotDePasse(mot_de_passe);
    if (erreurMotDePasse) {
      return res.status(400).json({ message: erreurMotDePasse });
    }

    const cible = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: id },
      include: { role: true },
    });
    if (!cible || !ROLES_GERES.includes(cible.role.libelle)) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    const mot_de_passe_hash = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);
    const [utilisateur] = await prisma.$transaction([
      prisma.utilisateur.update({
        where: { utilisateur_id: id },
        data: { mot_de_passe_hash, mot_de_passe_temporaire: true, mot_de_passe_expire_le: null },
        include: INCLUDE_UTILISATEUR,
      }),
      revoquerSessions(id),
    ]);

    return res.status(200).json({
      message: "Mot de passe réinitialisé. Il devra être changé à la prochaine connexion.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/utilisateurs/:id
 * Supprime définitivement un compte admin / superadmin. Réservé au
 * superadmin. Interdit sur soi-même et sur le dernier superadmin actif.
 * Si le compte a déjà un historique (publications, journal…), la base
 * refuse la suppression : on renvoie 409 en invitant à le suspendre.
 */
export async function supprimerUtilisateur(req, res, next) {
  try {
    if (req.utilisateur.role !== "superadmin") {
      return res.status(403).json({
        message: "Seul un superadmin peut supprimer un compte admin ou superadmin.",
      });
    }

    const { id } = req.params;

    if (id === req.utilisateur.utilisateur_id) {
      return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte." });
    }

    const cible = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: id },
      include: { role: true },
    });
    if (!cible || !ROLES_GERES.includes(cible.role.libelle)) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    if (cible.role.libelle === "superadmin" && cible.statut_compte === "actif") {
      const superadminsActifs = await compterSuperadminsActifs();
      if (superadminsActifs <= 1) {
        return res.status(409).json({
          message: "Impossible de supprimer le dernier superadmin actif.",
        });
      }
    }

    try {
      await prisma.$transaction([
        // Traces purement techniques du compte : supprimées avec lui.
        prisma.refreshToken.deleteMany({ where: { utilisateur_id: id } }),
        prisma.jetonRevoque.deleteMany({ where: { utilisateur_id: id } }),
        prisma.notification.deleteMany({ where: { utilisateur_id: id } }),
        prisma.appareilPush.deleteMany({ where: { utilisateur_id: id } }),
        prisma.demandeConnexionWeb.deleteMany({ where: { utilisateur_id: id } }),
        prisma.utilisateur.delete({ where: { utilisateur_id: id } }),
      ]);
    } catch (err) {
      if (err?.code === "P2003") {
        return res.status(409).json({
          message:
            "Ce compte a déjà un historique sur la plateforme et ne peut pas être supprimé. Suspendez-le plutôt.",
        });
      }
      throw err;
    }

    return res.status(200).json({ message: "Compte supprimé." });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------

// Pays renvoyé avec chaque compte (affichage du périmètre dans le BO).
const INCLUDE_UTILISATEUR = {
  role: true,
  pays: { select: { pays_id: true, nom: true, code_iso2: true } },
};

// Un admin ne voit que les comptes admin ; un superadmin voit les deux.
function rolesVisibles(req) {
  return req.utilisateur.role === "superadmin" ? ROLES_GERES : ["admin"];
}

function revoquerSessions(utilisateur_id) {
  return prisma.refreshToken.updateMany({
    where: { utilisateur_id, statut: "actif" },
    data: { statut: "revoque", date_revocation: new Date() },
  });
}

function normaliserEmail(email) {
  return String(email).trim().toLowerCase();
}

function validerMotDePasse(mot_de_passe) {
  if (typeof mot_de_passe !== "string" || mot_de_passe.length < MOT_DE_PASSE_LONGUEUR_MIN) {
    return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`;
  }
  return null;
}

async function compterSuperadminsActifs() {
  return prisma.utilisateur.count({
    where: {
      statut_compte: "actif",
      role: { libelle: "superadmin" },
    },
  });
}

/**
 * Retire les champs sensibles avant de renvoyer l'utilisateur au
 * client, et expose le rôle sous forme de libellé lisible plutôt que
 * role_id.
 */
function serialiserUtilisateur(utilisateur) {
  const { mot_de_passe_hash, role_id, role, ...reste } = utilisateur;
  return {
    ...reste,
    role: role?.libelle ?? null,
  };
}