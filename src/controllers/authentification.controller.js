// src/controllers/authentification.controller.js
import bcrypt from "bcrypt"; // algorithme de hachage sécurisé pour les mots de passe
import crypto from "crypto"; // pour hasher les refresh tokens (opaque) avant de les stocker en base
import prisma from "../lib/prisma.js";
// Ici ce sont les mthodes du controller qu'on va exposer a l'utilisayeur du controller en l'occurence authentification routes
import {
  genererAccessToken,
  genererRefreshToken,
  genererTokenChangementMotDePasse,
  hasherToken,
  NOM_COOKIE_REFRESH_TOKEN,
  optionsCookieRefreshToken,
  optionsClearCookieRefreshToken,
} from "../utils/token.utils.js";

// Délai laissé au titulaire d'un mot de passe temporaire pour le
// changer, à compter de sa toute première connexion réussie.
const DELAI_CHANGEMENT_MOT_DE_PASSE_MS = 24 * 60 * 60 * 1000; // 24h

const SALT_ROUNDS = 10;
const MOT_DE_PASSE_LONGUEUR_MIN = 8;

// ---------------------------------------------------------------------
// SÉCURITÉ — Qui peut créer quel rôle ?
//
// ⚠️ Ne JAMAIS laisser un client non authentifié choisir librement le
// rôle transmis à /register. Avant ce correctif, `role` était accepté
// tel quel dans le body et résolu contre la table `role` : n'importe
// qui pouvait donc s'inscrire directement en tant que "superadmin" ou
// "admin". C'était une faille d'élévation de privilèges critique.
//
// Nouveau modèle :
//  - POST /api/auth/register (public, sans authentification) ne peut
//    créer QUE des comptes "patient".
//  - POST /api/auth/comptes (authentifié, admin/superadmin) permet de
//    créer des comptes médecin / agent_xxx / admin, avec une matrice
//    de permissions par rôle créateur (cf ROLES_CREABLES_PAR).
//  - POST /api/auth/bootstrap-superadmin permet de créer le tout
//    premier superadmin, mais uniquement si aucun superadmin n'existe
//    encore ET si un jeton secret (SETUP_TOKEN, connu uniquement de
//    l'opérateur qui déploie l'environnement) est fourni. La route se
//    désactive d'elle-même dès qu'un superadmin existe.
// ---------------------------------------------------------------------

const ROLES_INSCRIPTION_PUBLIQUE = ["patient"];

// Qui (rôle de l'appelant authentifié) peut créer quel rôle via
// POST /api/auth/comptes. "superadmin" peut tout créer, y compris un
// autre superadmin ; "admin" ne peut pas créer d'admin ni de
// superadmin (pas d'auto-élévation en chaîne).
const ROLES_CREABLES_PAR = {
  superadmin: [
    "patient",
    "medecin",
    "admin",
    "superadmin",
    "agent_structure_sante",
    "agent_pharmacie",
    "agent_ambulance",
    "agent_pompes_funebres",
    "agent_assurance",
  ],
  admin: [
    "patient",
    "medecin",
    "agent_structure_sante",
    "agent_pharmacie",
    "agent_ambulance",
    "agent_pompes_funebres",
    "agent_assurance",
  ],
};

// Mapping libellé de rôle "agent_xxx" -> (modèle Prisma, nom de la FK
// spécifique). Le type d'agent est porté directement par le libellé du
// rôle : pas de rôle générique "agent" ni de champ type_agent séparé.
// NB : le rôle lui-même est désormais une donnée (table `role`), donc
// ce mapping ne sert qu'à savoir, une fois le libellé résolu, quelle
// table agent_xxx et quelle FK utiliser.
const TYPES_AGENT = {
  agent_structure_sante: { model: "agentStructureSante", fk: "structure_id" },
  agent_pharmacie: { model: "agentPharmacie", fk: "pharmacie_id" },
  agent_ambulance: { model: "agentAmbulance", fk: "service_ambulance_id" },
  agent_pompes_funebres: {
    model: "agentPompesFunebres",
    fk: "pompes_funebres_id",
  },
  agent_assurance: { model: "agentAssurance", fk: "service_assurance_id" },
};

/**
 * POST /api/auth/register
 * Inscription publique (aucune authentification requise). Crée
 * TOUJOURS un compte de rôle "patient" — aucun autre rôle n'est
 * acceptable via cette route, quel que soit ce que le client envoie
 * dans le body. La création de comptes médecin / agent / admin passe
 * par des routes protégées distinctes (voir creerCompteAdministre).
 */
export async function inscrire(req, res, next) {
  try {
    const {
      nom,
      prenom,
      email: emailBrut,
      telephone,
      mot_de_passe,
      pays_id,
      date_naissance,
    } = req.body;

    if (!nom || !prenom || !emailBrut || !mot_de_passe || !pays_id || !date_naissance) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, prenom, email, mot_de_passe, pays_id, date_naissance.",
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

    const dateNaissance = new Date(date_naissance);
    if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
      return res.status(400).json({ message: "date_naissance invalide." });
    }

    const roleRecord = await prisma.role.findUnique({
      where: { libelle: "patient" },
    });
    if (!roleRecord) {
      // Table de référence mal amorcée : erreur serveur, pas une
      // erreur de saisie utilisateur.
      return res
        .status(500)
        .json({ message: "Rôle 'patient' introuvable en base. Contactez un administrateur." });
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

    const utilisateur = await prisma.$transaction(async (tx) => {
      const nouvelUtilisateur = await tx.utilisateur.create({
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

      await tx.patient.create({
        data: {
          utilisateur_id: nouvelUtilisateur.utilisateur_id,
          date_naissance: dateNaissance,
        },
      });

      return nouvelUtilisateur;
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
 * POST /api/auth/comptes
 * Route protégée (authentifier + autoriser("admin", "superadmin"))
 * permettant de créer des comptes médecin, agent_xxx, admin ou
 * superadmin. Le rôle demandé est vérifié contre ROLES_CREABLES_PAR
 * en fonction du rôle de l'appelant : un "admin" ne peut pas créer un
 * autre "admin" ni un "superadmin" (pas d'auto-élévation en chaîne),
 * seul un "superadmin" le peut.
 */
export async function creerCompteAdministre(req, res, next) {
  try {
    const {
      nom,
      prenom,
      email: emailBrut,
      telephone,
      mot_de_passe,
      role,
      pays_id,
      reference_id,
      fonction,
    } = req.body;

    if (!nom || !prenom || !emailBrut || !mot_de_passe || !pays_id || !role) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, prenom, email, mot_de_passe, pays_id, role.",
      });
    }

    const rolesAutorises = ROLES_CREABLES_PAR[req.utilisateur.role] || [];
    if (!rolesAutorises.includes(role)) {
      return res.status(403).json({
        message: `Vous n'êtes pas autorisé à créer un compte de rôle "${role}".`,
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
      return res.status(400).json({ message: "Rôle invalide." });
    }

    const configAgent = TYPES_AGENT[role] || null;
    if (configAgent) {
      if (!reference_id) {
        return res.status(400).json({
          message:
            "reference_id requis : identifiant de la structure/pharmacie/service auquel l'agent est rattaché.",
        });
      }
      if (!fonction) {
        return res.status(400).json({ message: "fonction requise pour un compte agent." });
      }
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(400).json({ message: "Pays introuvable." });
    }

    const existant = await prisma.utilisateur.findUnique({ where: { email } });
    if (existant) {
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }

    if (configAgent) {
      const referenceExiste = await verifierReferenceAgent(role, reference_id);
      if (!referenceExiste) {
        return res.status(400).json({ message: "reference_id introuvable pour le rôle indiqué." });
      }
    }

    const mot_de_passe_hash = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);

    const utilisateur = await prisma.$transaction(async (tx) => {
      const nouvelUtilisateur = await tx.utilisateur.create({
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

      if (configAgent) {
        await tx[configAgent.model].create({
          data: {
            utilisateur_id: nouvelUtilisateur.utilisateur_id,
            [configAgent.fk]: reference_id,
            fonction,
          },
        });
      }

      return nouvelUtilisateur;
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
 * POST /api/auth/bootstrap-superadmin
 * Route PUBLIQUE mais verrouillée par un jeton secret (SETUP_TOKEN,
 * défini uniquement dans l'environnement serveur, jamais commité) et
 * par une garde "un seul superadmin bootstrap possible" : dès qu'un
 * superadmin existe déjà en base, cette route renvoie 403
 * systématiquement, quel que soit le jeton fourni.
 *
 * Objectif : permettre d'amorcer le tout premier compte superadmin
 * sans jamais exposer publiquement la possibilité de s'auto-attribuer
 * ce rôle.
 */
export async function amorcerSuperAdmin(req, res, next) {
  try {
    if (!process.env.SETUP_TOKEN) {
      return res.status(503).json({
        message:
          "Amorçage désactivé : SETUP_TOKEN n'est pas configuré côté serveur.",
      });
    }

    const jetonFourni = req.headers["x-setup-token"];
    if (!jetonFourni || !comparerConstant(jetonFourni, process.env.SETUP_TOKEN)) {
      return res.status(401).json({ message: "Jeton d'amorçage invalide." });
    }

    const roleRecord = await prisma.role.findUnique({ where: { libelle: "superadmin" } });
    if (!roleRecord) {
      return res.status(500).json({ message: "Rôle 'superadmin' introuvable en base." });
    }

    const superadminExistant = await prisma.utilisateur.findFirst({
      where: { role_id: roleRecord.role_id },
    });
    if (superadminExistant) {
      return res.status(403).json({
        message: "Un superadmin existe déjà : l'amorçage est définitivement désactivé.",
      });
    }

    const { nom, prenom, email: emailBrut, telephone, mot_de_passe, pays_id } = req.body;

    if (!nom || !prenom || !emailBrut || !mot_de_passe || !pays_id) {
      return res.status(400).json({
        message: "Champs requis manquants : nom, prenom, email, mot_de_passe, pays_id.",
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
      message: "Superadmin créé avec succès. Retirez ou invalidez SETUP_TOKEN maintenant.",
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Vérifie que reference_id correspond bien à une entrée existante dans
 * la table «ref» associée au libellé de rôle agent_xxx fourni.
 */
async function verifierReferenceAgent(roleLibelle, reference_id) {
  switch (roleLibelle) {
    case "agent_structure_sante":
      return Boolean(
        await prisma.structureSante.findUnique({ where: { structure_id: reference_id } })
      );
    case "agent_pharmacie":
      return Boolean(
        await prisma.pharmacie.findUnique({ where: { pharmacie_id: reference_id } })
      );
    case "agent_ambulance":
      return Boolean(
        await prisma.serviceAmbulance.findUnique({
          where: { service_ambulance_id: reference_id },
        })
      );
    case "agent_pompes_funebres":
      return Boolean(
        await prisma.pompesFunebres.findUnique({
          where: { pompes_funebres_id: reference_id },
        })
      );
    case "agent_assurance":
      return Boolean(
        await prisma.serviceAssurance.findUnique({
          where: { service_assurance_id: reference_id },
        })
      );
    default:
      return false;
  }
}

/**
 * POST /api/auth/login
 * Vérifie les identifiants et émet un access token (JWT) + un refresh
 * token (opaque, hashé en base).
 *
 * ⚠️ Le mot de passe est vérifié AVANT de renvoyer un statut lié au
 * compte (ex : "suspendu"). Vérifier le statut avant le mot de passe
 * permettrait à un attaquant de savoir qu'un email existe et est
 * suspendu sans jamais avoir eu le bon mot de passe (énumération de
 * compte).
 */
export async function connecter(req, res, next) {
  try {
    const { email: emailBrut, mot_de_passe } = req.body;

    if (!emailBrut || !mot_de_passe) {
      return res.status(400).json({ message: "Email et mot de passe requis." });
    }

    const email = normaliserEmail(emailBrut);

    const utilisateur = await prisma.utilisateur.findUnique({
      where: { email },
      include: { role: true },
    });

    // Message volontairement générique pour ne pas révéler si l'email existe.
    if (!utilisateur) {
      return res.status(401).json({ message: "Identifiants invalides." });
    }

    const motDePasseValide = await bcrypt.compare(
      mot_de_passe,
      utilisateur.mot_de_passe_hash
    );
    if (!motDePasseValide) {
      return res.status(401).json({ message: "Identifiants invalides." });
    }

    // Le statut du compte n'est révélé qu'une fois le mot de passe
    // confirmé valide : à ce stade, l'appelant a déjà prouvé qu'il
    // connaît le mot de passe, donc il n'y a plus d'énumération.
    if (utilisateur.statut_compte === "suspendu") {
      return res.status(403).json({ message: "Compte suspendu." });
    }

    // ─── Mot de passe temporaire : pas de session normale ─────────
    // Un compte créé par un admin (creerCompteAdministre) avec un mot
    // de passe généré porte mot_de_passe_temporaire=true tant que le
    // titulaire ne l'a pas remplacé. Dans ce cas, connecter() ne doit
    // JAMAIS émettre de session complète (access + refresh token) :
    // seul un token restreint, utilisable uniquement pour changer le
    // mot de passe, est renvoyé. Le frontend redirige alors
    // automatiquement vers l'écran de changement de mot de passe.
    if (utilisateur.mot_de_passe_temporaire) {
      const maintenant = new Date();

      if (!utilisateur.mot_de_passe_expire_le) {
        // Toute première connexion réussie avec ce mot de passe
        // temporaire : on amorce la deadline de 24h à partir de
        // maintenant, pas depuis la création du compte.
        utilisateur = await prisma.utilisateur.update({
          where: { utilisateur_id: utilisateur.utilisateur_id },
          data: {
            mot_de_passe_expire_le: new Date(
              maintenant.getTime() + DELAI_CHANGEMENT_MOT_DE_PASSE_MS
            ),
          },
          include: { role: true },
        });
      } else if (utilisateur.mot_de_passe_expire_le < maintenant) {
        // Le titulaire s'est connecté au moins une fois mais n'a
        // jamais changé son mot de passe dans le délai imparti : on
        // bloque l'accès plutôt que de reconduire indéfiniment un
        // mot de passe temporaire. Seul un admin peut réinitialiser
        // le compte (nouveau mot de passe temporaire + nouvelle
        // fenêtre de 24h).
        return res.status(403).json({
          message:
            "Le délai pour changer votre mot de passe temporaire est dépassé. Contactez un administrateur pour réinitialiser votre compte.",
        });
      }
      // Si mot_de_passe_expire_le est déjà posé et pas encore dépassé
      // (reconnexions successives dans la fenêtre de 24h avant que le
      // changement soit effectif), on ne touche pas à la deadline :
      // elle reste calée sur la toute première connexion.

      const {
        token: tokenChangementMotDePasse,
        date_expiration: expirationTokenChangementMotDePasse,
      } = genererTokenChangementMotDePasse(utilisateur);

      return res.status(200).json({
        message:
          "Mot de passe temporaire détecté : vous devez le changer avant de continuer.",
        mot_de_passe_a_changer: true,
        token_changement_mot_de_passe: tokenChangementMotDePasse,
        token_changement_mot_de_passe_expire_le:
          expirationTokenChangementMotDePasse,
        mot_de_passe_expire_le: utilisateur.mot_de_passe_expire_le,
      });
    }

    // Le token porte le libellé du rôle (ex: "patient", "agent_pharmacie"),
    // pas l'UUID role_id, pour rester exploitable par les middlewares
    // d'autorisation existants.
    const { token: accessToken } = genererAccessToken({
      ...utilisateur,
      role: utilisateur.role.libelle,
    });
    const {
      token: refreshToken,
      token_hash,
      date_expiration,
    } = genererRefreshToken();

    await prisma.refreshToken.create({
      data: {
        utilisateur_id: utilisateur.utilisateur_id,
        token_hash,
        date_expiration,
        user_agent: req.headers["user-agent"]?.slice(0, 255),
        ip_creation: req.ip,
        statut: "actif",
      },
    });

    res.cookie(
      NOM_COOKIE_REFRESH_TOKEN,
      refreshToken,
      optionsCookieRefreshToken(date_expiration)
    );

    return res.status(200).json({
      message: "Connexion réussie.",
      access_token: accessToken,
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/changer-mot-de-passe-initial
 * Protégée par exigerTokenChangementMotDePasse (PAS authentifier) :
 * n'accepte que le token restreint renvoyé par connecter() quand
 * mot_de_passe_temporaire=true. Le fait de posséder ce token prouve
 * déjà que l'appelant connaît le mot de passe temporaire (vérifié par
 * bcrypt.compare lors du login qui l'a émis) : aucune re-saisie de
 * l'ancien mot de passe n'est donc redemandée ici.
 *
 * Effets :
 *  - remplace mot_de_passe_hash par le nouveau mot de passe choisi ;
 *  - repasse mot_de_passe_temporaire à false et mot_de_passe_expire_le
 *    à null (le compte sort définitivement du régime "temporaire") ;
 *  - révoque le jti du token restreint (à usage unique) ;
 *  - ouvre directement une session complète (access + refresh token),
 *    comme un login normal, pour éviter à l'utilisateur de ressaisir
 *    son nouveau mot de passe immédiatement après l'avoir choisi.
 */
export async function changerMotDePasseInitial(req, res, next) {
  try {
    const { nouveau_mot_de_passe } = req.body;

    const erreurMotDePasse = validerMotDePasse(nouveau_mot_de_passe);
    if (erreurMotDePasse) {
      return res.status(400).json({ message: erreurMotDePasse });
    }

    const utilisateur = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: req.utilisateurTemp.utilisateur_id },
      include: { role: true },
    });

    if (!utilisateur) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    // Garde-fou : si le mot de passe a déjà été changé entre-temps
    // (ex. deux onglets, token réutilisé avant sa révocation), on
    // refuse plutôt que d'écraser silencieusement un mot de passe déjà
    // définitif.
    if (!utilisateur.mot_de_passe_temporaire) {
      return res.status(409).json({
        message: "Le mot de passe de ce compte a déjà été défini.",
      });
    }

    if (
      utilisateur.statut_compte === "suspendu"
    ) {
      return res.status(403).json({ message: "Compte suspendu." });
    }

    const nouveauMotDePasseIdentiqueAuTemporaire = await bcrypt.compare(
      nouveau_mot_de_passe,
      utilisateur.mot_de_passe_hash
    );
    if (nouveauMotDePasseIdentiqueAuTemporaire) {
      return res.status(400).json({
        message:
          "Le nouveau mot de passe doit être différent du mot de passe temporaire.",
      });
    }

    const mot_de_passe_hash = await bcrypt.hash(nouveau_mot_de_passe, SALT_ROUNDS);

    const utilisateurMisAJour = await prisma.$transaction(async (tx) => {
      const maj = await tx.utilisateur.update({
        where: { utilisateur_id: utilisateur.utilisateur_id },
        data: {
          mot_de_passe_hash,
          mot_de_passe_temporaire: false,
          mot_de_passe_expire_le: null,
        },
        include: { role: true },
      });

      // Le token restreint est à usage unique : on l'ajoute à la
      // denylist pour qu'une éventuelle copie interceptée ne puisse
      // pas être rejouée sur cet endpoint.
      await tx.jetonRevoque.upsert({
        where: { jti: req.utilisateurTemp.jti },
        update: {},
        create: {
          jti: req.utilisateurTemp.jti,
          utilisateur_id: utilisateur.utilisateur_id,
          date_expiration_initiale: req.utilisateurTemp.exp
            ? new Date(req.utilisateurTemp.exp * 1000)
            : new Date(Date.now() + 15 * 60 * 1000),
          motif: "changement_mdp",
        },
      });

      return maj;
    });

    // Ouverture immédiate d'une session complète, comme un login
    // classique réussi.
    const { token: accessToken } = genererAccessToken({
      ...utilisateurMisAJour,
      role: utilisateurMisAJour.role.libelle,
    });
    const {
      token: refreshToken,
      token_hash,
      date_expiration,
    } = genererRefreshToken();

    await prisma.refreshToken.create({
      data: {
        utilisateur_id: utilisateurMisAJour.utilisateur_id,
        token_hash,
        date_expiration,
        user_agent: req.headers["user-agent"]?.slice(0, 255),
        ip_creation: req.ip,
        statut: "actif",
      },
    });

    res.cookie(
      NOM_COOKIE_REFRESH_TOKEN,
      refreshToken,
      optionsCookieRefreshToken(date_expiration)
    );

    return res.status(200).json({
      message: "Mot de passe mis à jour. Connexion réussie.",
      access_token: accessToken,
      utilisateur: serialiserUtilisateur(utilisateurMisAJour),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Vérifie le refresh token porté par le cookie httpOnly, le révoque
 * (rotation) et émet une nouvelle paire access/refresh token. Le
 * nouveau refresh token est reposé dans le même cookie ; seul
 * l'access token revient dans le corps JSON.
 */
export async function rafraichirToken(req, res, next) {
  try {
    const refresh_token = req.cookies?.[NOM_COOKIE_REFRESH_TOKEN];

    if (!refresh_token) {
      return res.status(400).json({ message: "refresh_token requis." });
    }

    const token_hash = hasherToken(refresh_token);

    const enregistrement = await prisma.refreshToken.findUnique({
      where: { token_hash },
      include: { utilisateur: { include: { role: true } } },
    });

    if (!enregistrement || enregistrement.statut !== "actif") {
      return res.status(401).json({ message: "Refresh token invalide." });
    }

    if (enregistrement.date_expiration < new Date()) {
      await prisma.refreshToken.update({
        where: { refresh_token_id: enregistrement.refresh_token_id },
        data: { statut: "expire" },
      });
      return res.status(401).json({ message: "Refresh token expiré." });
    }

    if (enregistrement.utilisateur.statut_compte === "suspendu") {
      return res.status(403).json({ message: "Compte suspendu." });
    }

    // Rotation : on révoque l'ancien refresh token et on en émet un nouveau.
    const {
      token: nouveauRefreshToken,
      token_hash: nouveauHash,
      date_expiration: nouvelleExpiration,
    } = genererRefreshToken();

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { refresh_token_id: enregistrement.refresh_token_id },
        data: { statut: "revoque", date_revocation: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          utilisateur_id: enregistrement.utilisateur_id,
          token_hash: nouveauHash,
          date_expiration: nouvelleExpiration,
          user_agent: req.headers["user-agent"]?.slice(0, 255),
          ip_creation: req.ip,
          statut: "actif",
        },
      }),
    ]);

    const { token: accessToken } = genererAccessToken({
      ...enregistrement.utilisateur,
      role: enregistrement.utilisateur.role.libelle,
    });

    res.cookie(
      NOM_COOKIE_REFRESH_TOKEN,
      nouveauRefreshToken,
      optionsCookieRefreshToken(nouvelleExpiration)
    );

    return res.status(200).json({
      access_token: accessToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Révoque le refresh token porté par le cookie httpOnly, ajoute
 * l'access token courant (jti) à la denylist, puis efface le cookie
 * côté navigateur.
 */
export async function deconnecter(req, res, next) {
  try {
    const refresh_token = req.cookies?.[NOM_COOKIE_REFRESH_TOKEN];

    if (refresh_token) {
      const token_hash = hasherToken(refresh_token);
      await prisma.refreshToken.updateMany({
        where: { token_hash, statut: "actif" },
        data: { statut: "revoque", date_revocation: new Date() },
      });
    }

    // req.utilisateur est renseigné par le middleware "authentifier",
    // qui transmet aussi l'expiration réelle (exp) du token décodé.
    if (req.utilisateur?.jti) {
      const decoded = req.utilisateur;
      await prisma.jetonRevoque.upsert({
        where: { jti: decoded.jti },
        update: {},
        create: {
          jti: decoded.jti,
          utilisateur_id: decoded.utilisateur_id,
          date_expiration_initiale: decoded.exp
            ? new Date(decoded.exp * 1000)
            : new Date(Date.now() + 24 * 60 * 60 * 1000), // filet de sécurité si exp absent
          motif: "deconnexion",
        },
      });
    }

    res.clearCookie(NOM_COOKIE_REFRESH_TOKEN, optionsClearCookieRefreshToken());

    return res.status(200).json({ message: "Déconnexion réussie." });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Retourne le profil de l'utilisateur authentifié.
 */
export async function profil(req, res, next) {
  try {
    const utilisateur = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: req.utilisateur.utilisateur_id },
      include: { role: true },
    });

    if (!utilisateur) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    return res.status(200).json({ utilisateur: serialiserUtilisateur(utilisateur) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliserEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Validation serveur du mot de passe. Le champ minlength="8" côté
 * HTML n'est qu'une aide UX : sans ce contrôle serveur, n'importe quel
 * appel direct à l'API pouvait créer un compte avec un mot de passe
 * d'un seul caractère.
 */
function validerMotDePasse(mot_de_passe) {
  if (typeof mot_de_passe !== "string" || mot_de_passe.length < MOT_DE_PASSE_LONGUEUR_MIN) {
    return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`;
  }
  return null;
}

/**
 * Comparaison en temps constant pour éviter une attaque par mesure de
 * timing sur le jeton d'amorçage.
 */
function comparerConstant(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Retire les champs sensibles avant de renvoyer l'utilisateur au client,
 * et expose le rôle sous forme de libellé lisible plutôt que role_id.
 */
function serialiserUtilisateur(utilisateur) {
  const { mot_de_passe_hash, role_id, role, ...reste } = utilisateur;
  return {
    ...reste,
    role: role?.libelle ?? null,
  };
}