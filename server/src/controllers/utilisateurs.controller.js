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
//  - Écriture (créer / modifier / suspendre / réactiver) : réservée au
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
    const { role, statut, recherche } = req.query;

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
        include: { role: true },
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
      include: { role: true },
    });

    if (!utilisateur || !ROLES_GERES.includes(utilisateur.role.libelle)) {
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
      },
      include: { role: true },
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
      include: { role: true },
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

    const utilisateur = await prisma.utilisateur.update({
      where: { utilisateur_id: id },
      data: { statut_compte: "suspendu" },
      include: { role: true },
    });

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
      include: { role: true },
    });

    return res.status(200).json({
      message: "Compte réactivé.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------

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