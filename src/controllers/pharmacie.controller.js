// src/controllers/pharmacie.controller.js
// Composant "annuaire — pharmacie" : gère la table pharmacie, ET le
// sous-module "Gardes officielles" (planning_garde / garde_pharmacie),
// regroupé ici car il expose et référence directement la fiche
// pharmacie (voir bloc "Gardes officielles" plus bas dans ce fichier).
//
// ─── Pharmacies ─────────────────────────────────────────────────
// Lecture : PUBLIQUE, sans authentification. L'Annuaire Pharmacie doit
// être consultable avant la création d'un compte ou une recherche de
// garde — même raisonnement que Centre de santé
// (voir centreSante.controller.js).
// Création : tout utilisateur authentifié (patient inclus) peut ajouter
// une pharmacie à l'annuaire, en fournissant 3 pièces justificatives
// (voir creerPharmacie). Le même formulaire crée AUSSI, dans la même
// transaction :
//   - un nouveau COMPTE UTILISATEUR pour l'agent qui aura la charge de
//     la pharmacie (nom, prénom, email, téléphone) — PAS forcément la
//     personne connectée qui soumet le formulaire (ex. un admin peut
//     créer la fiche pour un professionnel qui n'a pas encore de
//     compte) ;
//   - un mot de passe temporaire généré côté serveur pour ce compte,
//     renvoyé UNE SEULE FOIS dans la réponse (à communiquer à l'agent —
//     aucun service d'email n'étant fourni dans ce dépôt, voir le
//     commentaire au-dessus de la réponse 201 plus bas) ; l'agent devra
//     le changer sous 24h à sa toute première connexion (le blocage
//     effectif de l'accès après ce délai est à implémenter dans le
//     contrôleur de login, non fourni ici — voir schema.prisma,
//     champs mot_de_passe_temporaire / mot_de_passe_expire_le) ;
//   - la fiche "agent_pharmacie" qui rattache ce nouveau compte à la
//     pharmacie — voir le bloc "Agent" plus bas.
// Modification : tout utilisateur authentifié (même logique que la
// création — voir modifierPharmacie pour la règle de statut). La
// modification ne touche jamais au compte agent (déjà créé une fois
// pour toutes à la création de la pharmacie).
// Suppression : réservée à superadmin (impact transverse : agents
// rattachés, module Gardes qui expose la fiche — voir plus bas).
//
// ─── Gardes officielles ─────────────────────────────────────────
// Voir l'en-tête du bloc "Gardes officielles" plus loin dans ce
// fichier pour le détail des règles d'autorisation (lecture publique,
// écriture admin/superadmin).

import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier, construireUrl } from "../lib/cloudinaryService.js";
import crypto from "crypto";
import bcrypt from "bcrypt"; // même bibliothèque que authentification.controller.js

const SALT_ROUNDS = 10; // valeur identique à authentification.controller.js

const STATUTS_VERIFICATION_PHARMACIE = ["non_publie", "en_cours", "publie"];

// Rôle générique appliqué au compte créé pour l'agent d'une pharmacie
// (voir schema.prisma, commentaire "v6" sur le modèle Utilisateur : le
// type précis d'agent — ici "pharmacie" — se déduit de la présence
// d'une ligne dans agent_pharmacie, pas du libellé du rôle lui-même).
const LIBELLE_ROLE_AGENT = "agent_pharmacie";

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ===================================================================
 * Agent rattaché à la pharmacie (nouveau compte)
 *
 * Le formulaire front est unique : créer une pharmacie crée dans la
 * foulée le COMPTE de l'agent qui en a la charge (pas nécessairement
 * la personne connectée qui soumet le formulaire) — puis le rattache
 * via agent_pharmacie. Règles :
 *   - l'email de l'agent doit être unique en base (contrainte
 *     Utilisateur.email) — un agent = un compte dédié, jamais partagé ;
 *   - un mot de passe temporaire est généré, haché, stocké, et
 *     retourné UNE SEULE FOIS en clair dans la réponse HTTP (voir
 *     creerPharmacie) — libre au frontend de l'afficher à l'auteur de
 *     la soumission pour qu'il le transmette à l'agent ;
 *   - mot_de_passe_temporaire = true tant que l'agent n'a pas changé
 *     ce mot de passe (à faire basculer à false par le contrôleur de
 *     changement de mot de passe, non fourni ici).
 * =================================================================== */

/**
 * Génère un mot de passe temporaire lisible (12 caractères, sans
 * caractères ambigus 0/O/1/l/I) à communiquer à l'agent.
 */
function genererMotDePasseTemporaire() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const octets = crypto.randomBytes(12);
  let motDePasse = "";
  for (let i = 0; i < 12; i++) {
    motDePasse += alphabet[octets[i] % alphabet.length];
  }
  return motDePasse;
}

async function verifierEmailAgentDisponible(email) {
  const existant = await prisma.utilisateur.findUnique({ where: { email } });
  return !existant;
}

/**
 * Crée le compte utilisateur de l'agent PUIS la fiche agent_pharmacie
 * qui le rattache à la pharmacie donnée.
 * Doit être appelée à l'intérieur d'une transaction Prisma (`tx`).
 */
async function creerCompteAgentPourPharmacie(tx, { pharmacieId, fonction, nom, prenom, email, telephone, paysId }) {
  const roleAgent = await tx.role.findUnique({ where: { libelle: LIBELLE_ROLE_AGENT } });
  if (!roleAgent) {
    throw new Error(
      `Rôle "${LIBELLE_ROLE_AGENT}" introuvable en base (table role) — vérifier le seed.`
    );
  }

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, SALT_ROUNDS);

  const utilisateur = await tx.utilisateur.create({
    data: {
      nom,
      prenom,
      email,
      telephone: telephone || null,
      mot_de_passe_hash: motDePasseHash,
      role_id: roleAgent.role_id,
      pays_id: paysId,
      statut_compte: "actif",
      mot_de_passe_temporaire: true,
    },
  });

  const agent = await tx.agentPharmacie.create({
    data: {
      utilisateur_id: utilisateur.utilisateur_id,
      pharmacie_id: pharmacieId,
      fonction,
    },
  });

  return { utilisateur, agent, motDePasseTemporaire };
}

/* ===================================================================
 * Géolocalisation (GEOGRAPHY(POINT,4326))
 *
 * Non supporté nativement par Prisma Client (type "Unsupported" côté
 * schéma) : lecture/écriture passent par des requêtes SQL brutes,
 * isolées ici pour ne pas polluer le reste des contrôleurs.
 * =================================================================== */

async function recupererGeolocalisation(pharmacieId) {
  const resultat = await prisma.$queryRaw`
    SELECT ST_Y(geolocalisation::geometry) AS latitude,
           ST_X(geolocalisation::geometry) AS longitude
    FROM pharmacie
    WHERE pharmacie_id = ${pharmacieId}::uuid
      AND geolocalisation IS NOT NULL
  `;

  if (!resultat.length) return null;

  const { latitude, longitude } = resultat[0];
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

async function definirGeolocalisation(pharmacieId, latitude, longitude) {
  await prisma.$executeRaw`
    UPDATE pharmacie
    SET geolocalisation = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
    WHERE pharmacie_id = ${pharmacieId}::uuid
  `;
}

async function effacerGeolocalisation(pharmacieId) {
  await prisma.$executeRaw`
    UPDATE pharmacie
    SET geolocalisation = NULL
    WHERE pharmacie_id = ${pharmacieId}::uuid
  `;
}

/**
 * Valide un couple latitude/longitude et applique le changement demandé :
 *   - les deux valeurs présentes  -> définit le point
 *   - les deux valeurs à null     -> efface le point
 *   - absentes du corps de requête -> ne touche pas au champ
 * Retourne un message d'erreur (string) en cas de valeurs invalides, sinon null.
 */
async function appliquerGeolocalisation(pharmacieId, latitude, longitude) {
  const latFournie = latitude !== undefined;
  const lngFournie = longitude !== undefined;

  if (!latFournie && !lngFournie) return null;

  if (latFournie !== lngFournie) {
    return "latitude et longitude doivent être fournies ensemble.";
  }

  if (latitude === null && longitude === null) {
    await effacerGeolocalisation(pharmacieId);
    return null;
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return "latitude et longitude doivent être des nombres.";
  }
  if (latitude < -90 || latitude > 90) {
    return "latitude invalide (doit être comprise entre -90 et 90).";
  }
  if (longitude < -180 || longitude > 180) {
    return "longitude invalide (doit être comprise entre -180 et 180).";
  }

  await definirGeolocalisation(pharmacieId, latitude, longitude);
  return null;
}

async function avecGeolocalisation(pharmacie) {
  const geolocalisation = await recupererGeolocalisation(pharmacie.pharmacie_id);
  return { ...pharmacie, geolocalisation };
}

/**
 * Ajoute les URLs publiques (reconstruites via Cloudinary) des 3
 * pièces justificatives, en plus des "nom" (public_id) déjà présents
 * sur la ligne. Le frontend n'a ainsi jamais besoin de connaître la
 * logique Cloudinary : il consomme directement image_url / etc.
 */
function avecUrlsFichiers(pharmacie) {
  return {
    ...pharmacie,
    image_url: construireUrl(pharmacie.image_nom),
    piece_identite_url: construireUrl(pharmacie.piece_identite_nom),
    document_agrement_url: construireUrl(pharmacie.document_agrement_nom),
  };
}

async function enrichirPharmacie(pharmacie) {
  const avecGeo = await avecGeolocalisation(pharmacie);
  return avecUrlsFichiers(avecGeo);
}

/* ===================================================================
 * Pharmacies
 * =================================================================== */

/**
 * GET /api/pharmacies
 * Filtres optionnels : ?pays_id=...&ville_id=...
 *                      &statut_verification=...&recherche=...(nom, insensible à la casse)
 */
export async function listerPharmacies(req, res, next) {
  try {
    const { pays_id, ville_id, statut_verification, recherche } = req.query;

    if (statut_verification && !STATUTS_VERIFICATION_PHARMACIE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_PHARMACIE.join(", ")}.`,
      });
    }

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (statut_verification) where.statut_verification = statut_verification;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };

    const pharmacies = await prisma.pharmacie.findMany({
      where,
      include: { pays: true, ville: true },
      orderBy: { nom: "asc" },
    });

    const resultat = await Promise.all(pharmacies.map(enrichirPharmacie));

    return res.status(200).json({ pharmacies: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pharmacies/:id
 */
export async function obtenirPharmacie(req, res, next) {
  try {
    const pharmacie = await prisma.pharmacie.findUnique({
      where: { pharmacie_id: req.params.id },
      include: { pays: true, ville: true },
    });
    if (!pharmacie) {
      return res.status(404).json({ message: "Pharmacie introuvable." });
    }

    const resultat = await enrichirPharmacie(pharmacie);
    return res.status(200).json({ pharmacie: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pharmacies
 * multipart/form-data — champs texte, plus 3 fichiers obligatoires
 * (voir upload.middleware.js) :
 *   - image_pharmacie   : photo de la pharmacie
 *   - piece_identite     : pièce d'identité du titulaire/responsable
 *   - document_agrement  : agrément officiel autorisant l'exercice
 * Champs latitude / longitude optionnels (voir appliquerGeolocalisation).
 *
 * Champs supplémentaires requis — création du COMPTE AGENT en même
 * temps que la pharmacie (voir creerCompteAgentPourPharmacie) :
 *   - fonction     : intitulé du poste de l'agent au sein de la
 *                    pharmacie (ex. "Titulaire", "Pharmacien assistant")
 *   - agent_nom, agent_prenom, agent_email : identité du titulaire du
 *     nouveau compte (PAS forcément la personne connectée qui soumet
 *     ce formulaire)
 *   - agent_telephone : optionnel
 * Le pays du compte agent (Utilisateur.pays_id, obligatoire) est repris
 * directement de celui de la pharmacie créée (pays_id) — décision
 * produit : pas de champ dédié dans le formulaire.
 */
export async function creerPharmacie(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      statut_verification,
      numero_ordre_titulaire,
      latitude,
      longitude,
      fonction,
      agent_nom,
      agent_prenom,
      agent_email,
      agent_telephone,
    } = req.body;

    if (
      !nom ||
      !pays_id ||
      !ville_id ||
      !telephone ||
      !statut_verification ||
      !numero_ordre_titulaire ||
      !numero_ordre_titulaire.trim()
    ) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, pays_id, ville_id, telephone, statut_verification, numero_ordre_titulaire.",
      });
    }
    if (!fonction || !fonction.trim() || !agent_nom || !agent_nom.trim() ||
        !agent_prenom || !agent_prenom.trim() || !agent_email || !agent_email.trim()) {
      return res.status(400).json({
        message:
          "Champs requis manquants pour l'agent de la pharmacie : fonction, agent_nom, agent_prenom, agent_email.",
      });
    }
    if (!REGEX_EMAIL.test(agent_email.trim())) {
      return res.status(400).json({ message: "agent_email invalide." });
    }

    // 3 pièces justificatives obligatoires à la création.
    const fichierImage = req.files?.image_pharmacie?.[0];
    const fichierPieceIdentite = req.files?.piece_identite?.[0];
    const fichierAgrement = req.files?.document_agrement?.[0];
    if (!fichierImage || !fichierPieceIdentite || !fichierAgrement) {
      return res.status(400).json({
        message:
          "3 fichiers sont requis : image_pharmacie (photo de la pharmacie), piece_identite (pièce d'identité du titulaire/responsable) et document_agrement (agrément officiel).",
      });
    }

    // Un agent = un compte dédié, jamais partagé (contrainte unique
    // Utilisateur.email) — on le vérifie avant tout upload Cloudinary
    // pour échouer vite, sans envoyer inutilement les 3 fichiers.
    const emailAgentDisponible = await verifierEmailAgentDisponible(agent_email.trim().toLowerCase());
    if (!emailAgentDisponible) {
      return res.status(409).json({
        message: "Un compte existe déjà avec cet email : impossible de créer le compte agent.",
      });
    }

    const [pays, ville] = await Promise.all([
      prisma.pays.findUnique({ where: { pays_id } }),
      prisma.ville.findUnique({ where: { ville_id } }),
    ]);

    if (!pays) {
      return res.status(400).json({ message: "pays_id introuvable." });
    }
    if (!ville) {
      return res.status(400).json({ message: "ville_id introuvable." });
    }
    if (ville.pays_id !== pays_id) {
      return res.status(400).json({ message: "ville_id n'appartient pas à pays_id." });
    }

    // La création est ouverte à tout utilisateur authentifié (voir
    // pharmacie.routes.js), pas seulement admin/superadmin. Pour
    // préserver le circuit de modération (badge "en_cours" -> bouton
    // "Examiner" côté admin dans le front), un utilisateur non
    // admin/superadmin ne peut pas publier directement : son statut
    // est forcé à "en_cours" quoi qu'il envoie. On ne valide donc
    // statut_verification que lorsqu'il sera réellement utilisé (cas
    // admin/superadmin) — inutile de rejeter une valeur qui sera de
    // toute façon écrasée pour les autres profils.
    const estAdmin = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";

    if (estAdmin && !STATUTS_VERIFICATION_PHARMACIE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_PHARMACIE.join(", ")}.`,
      });
    }
    const statutApplique = estAdmin ? statut_verification : "en_cours";

    // Téléversement Cloudinary — après les validations métier, pour ne
    // pas envoyer inutilement des fichiers si la requête est invalide.
    const [uploadImage, uploadPieceIdentite, uploadAgrement] = await Promise.all([
      televerserFichier(fichierImage.buffer, "images"),
      televerserFichier(fichierPieceIdentite.buffer, "pieces-identite"),
      televerserFichier(fichierAgrement.buffer, "agrements"),
    ]);

    // Pharmacie, compte agent et rattachement sont créés dans une seule
    // transaction : on ne veut jamais d'une pharmacie sans agent
    // responsable (ni d'un compte agent sans pharmacie). La
    // géolocalisation (requêtes SQL brutes hors Prisma Client) est
    // appliquée juste après, une fois la pharmacie garantie persistée.
    let pharmacieCreee;
    let agent;
    let utilisateurAgent;
    let motDePasseTemporaire;
    try {
      ({ pharmacieCreee, agent, utilisateurAgent, motDePasseTemporaire } = await prisma.$transaction(async (tx) => {
        const pharmacie = await tx.pharmacie.create({
          data: {
            nom,
            pays_id,
            ville_id,
            telephone,
            statut_verification: statutApplique,
            numero_ordre_titulaire: numero_ordre_titulaire.trim(),
            image_nom: uploadImage.nom,
            piece_identite_nom: uploadPieceIdentite.nom,
            document_agrement_nom: uploadAgrement.nom,
          },
          include: { pays: true, ville: true },
        });

        const { utilisateur, agent: agentCree, motDePasseTemporaire: mdp } =
          await creerCompteAgentPourPharmacie(tx, {
            pharmacieId: pharmacie.pharmacie_id,
            fonction: fonction.trim(),
            nom: agent_nom.trim(),
            prenom: agent_prenom.trim(),
            email: agent_email.trim().toLowerCase(),
            telephone: agent_telephone?.trim(),
            paysId: pays_id,
          });

        return {
          pharmacieCreee: pharmacie,
          agent: agentCree,
          utilisateurAgent: utilisateur,
          motDePasseTemporaire: mdp,
        };
      }));
    } catch (errTransaction) {
      // Concurrence : deux requêtes simultanées pourraient toutes deux
      // passer le contrôle verifierEmailAgentDisponible ci-dessus avant
      // que l'une des deux ne pose sa ligne — la contrainte unique
      // Utilisateur.email tranche alors ici (code Prisma P2002).
      if (errTransaction.code === "P2002") {
        return res.status(409).json({
          message: "Un compte existe déjà avec cet email : impossible de créer le compte agent.",
        });
      }
      throw errTransaction;
    }

    const erreurGeo = await appliquerGeolocalisation(pharmacieCreee.pharmacie_id, latitude, longitude);

    const pharmacie = await enrichirPharmacie(pharmacieCreee);

    // ⚠️ Le mot de passe temporaire n'est renvoyé QU'ICI, en clair, et
    // une seule fois — aucun service d'email n'étant fourni dans ce
    // dépôt pour le transmettre automatiquement à l'agent. Le frontend
    // doit l'afficher à l'auteur de la soumission (à charge pour lui de
    // le communiquer à l'agent par un canal sûr) puis ne plus jamais le
    // redemander : il n'est pas stocké en clair côté serveur. À terme,
    // remplacer/compléter par un envoi automatique par email.
    const reponseAgent = {
      agent_id: agent.agent_id,
      fonction: agent.fonction,
      utilisateur: {
        utilisateur_id: utilisateurAgent.utilisateur_id,
        nom: utilisateurAgent.nom,
        prenom: utilisateurAgent.prenom,
        email: utilisateurAgent.email,
      },
      mot_de_passe_temporaire: motDePasseTemporaire,
    };

    if (erreurGeo) {
      // La pharmacie (et le compte agent) sont créés mais la
      // géolocalisation fournie est invalide : on informe le client
      // sans annuler la création.
      return res.status(201).json({
        message: `Pharmacie créée avec succès. Avertissement : ${erreurGeo}`,
        pharmacie,
        agent: reponseAgent,
      });
    }

    return res.status(201).json({
      message: "Pharmacie créée avec succès. Compte agent créé — communiquez-lui le mot de passe temporaire.",
      pharmacie,
      agent: reponseAgent,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/pharmacies/:id
 * Ouvert à tout utilisateur authentifié (voir pharmacie.routes.js).
 * Les 3 fichiers sont optionnels ici : seuls ceux effectivement
 * envoyés sont remplacés (l'ancien fichier Cloudinary correspondant
 * est alors supprimé après succès du nouvel upload).
 */
export async function modifierPharmacie(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      statut_verification,
      numero_ordre_titulaire,
      latitude,
      longitude,
    } = req.body;

    const existante = await prisma.pharmacie.findUnique({
      where: { pharmacie_id: req.params.id },
    });
    if (!existante) {
      return res.status(404).json({ message: "Pharmacie introuvable." });
    }

    const paysCibleId = pays_id || existante.pays_id;
    const villeCibleId = ville_id || existante.ville_id;

    if (pays_id) {
      const pays = await prisma.pays.findUnique({ where: { pays_id } });
      if (!pays) {
        return res.status(400).json({ message: "pays_id introuvable." });
      }
    }
    if (ville_id) {
      const ville = await prisma.ville.findUnique({ where: { ville_id } });
      if (!ville) {
        return res.status(400).json({ message: "ville_id introuvable." });
      }
    }
    if (pays_id || ville_id) {
      const ville = await prisma.ville.findUnique({ where: { ville_id: villeCibleId } });
      if (ville.pays_id !== paysCibleId) {
        return res.status(400).json({ message: "ville_id n'appartient pas à pays_id." });
      }
    }

    // La modification est ouverte à tout utilisateur authentifié.
    // Seuls admin/superadmin peuvent choisir librement statut_verification ;
    // pour tout autre profil, la fiche repasse systématiquement en
    // "en_cours" dès qu'elle est modifiée (elle doit être re-vérifiée),
    // quelle que soit la valeur envoyée — même logique de modération
    // que sur la création.
    const estAdmin = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";

    if (estAdmin && statut_verification && !STATUTS_VERIFICATION_PHARMACIE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_PHARMACIE.join(", ")}.`,
      });
    }
    const statutApplique = estAdmin
      ? statut_verification || existante.statut_verification
      : "en_cours";

    // Remplacement optionnel des fichiers : upload du nouveau fichier
    // AVANT suppression de l'ancien, pour ne jamais laisser la fiche
    // sans fichier valide en cas d'échec d'upload.
    const fichierImage = req.files?.image_pharmacie?.[0];
    const fichierPieceIdentite = req.files?.piece_identite?.[0];
    const fichierAgrement = req.files?.document_agrement?.[0];

    const donneesFichiers = {};

    if (fichierImage) {
      const upload = await televerserFichier(fichierImage.buffer, "images");
      await supprimerFichier(existante.image_nom);
      donneesFichiers.image_nom = upload.nom;
    }
    if (fichierPieceIdentite) {
      const upload = await televerserFichier(fichierPieceIdentite.buffer, "pieces-identite");
      await supprimerFichier(existante.piece_identite_nom);
      donneesFichiers.piece_identite_nom = upload.nom;
    }
    if (fichierAgrement) {
      const upload = await televerserFichier(fichierAgrement.buffer, "agrements");
      await supprimerFichier(existante.document_agrement_nom);
      donneesFichiers.document_agrement_nom = upload.nom;
    }

    const pharmacie = await prisma.pharmacie.update({
      where: { pharmacie_id: req.params.id },
      data: {
        ...(nom && { nom }),
        ...(pays_id && { pays_id }),
        ...(ville_id && { ville_id }),
        ...(telephone && { telephone }),
        statut_verification: statutApplique,
        ...(numero_ordre_titulaire && numero_ordre_titulaire.trim() && {
          numero_ordre_titulaire: numero_ordre_titulaire.trim(),
        }),
        ...donneesFichiers,
      },
      include: { pays: true, ville: true },
    });

    const erreurGeo = await appliquerGeolocalisation(pharmacie.pharmacie_id, latitude, longitude);
    if (erreurGeo) {
      return res.status(400).json({ message: erreurGeo });
    }

    const resultat = await enrichirPharmacie(pharmacie);
    return res.status(200).json({ message: "Pharmacie mise à jour.", pharmacie: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/pharmacies/:id
 */
export async function supprimerPharmacie(req, res, next) {
  try {
    const pharmacie = await prisma.pharmacie.findUnique({
      where: { pharmacie_id: req.params.id },
    });
    if (!pharmacie) {
      return res.status(404).json({ message: "Pharmacie introuvable." });
    }

    const nbAgents = await prisma.agentPharmacie.count({
      where: { pharmacie_id: req.params.id },
    });
    if (nbAgents > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbAgents} agent(s) sont encore rattaché(s) à cette pharmacie.`,
      });
    }

    await prisma.pharmacie.delete({ where: { pharmacie_id: req.params.id } });

    // Nettoyage Cloudinary après suppression réussie en base (best
    // effort — voir supprimerFichier). On ne bloque jamais la
    // suppression DB pour un souci Cloudinary.
    await Promise.all([
      supprimerFichier(pharmacie.image_nom),
      supprimerFichier(pharmacie.piece_identite_nom),
      supprimerFichier(pharmacie.document_agrement_nom),
    ]);

    return res.status(200).json({ message: "Pharmacie supprimée." });
  } catch (err) {
    next(err);
  }
}
/* ===================================================================
 * Gardes officielles — planning_garde (calendrier pays) et
 * garde_pharmacie (affectation d'une pharmacie précise à une plage
 * horaire de ce calendrier, dans une ville donnée — v6 :
 * "zone_division_id" devient ville_id).
 *
 * Lecture : PUBLIQUE, sans authentification — cas d'usage principal
 * ("quelle pharmacie est de garde ce soir près de chez moi ?"), au
 * même titre que l'Annuaire ci-dessus.
 * Écriture (POST/PUT) : admin ou superadmin uniquement — contrairement
 * à l'Annuaire, les gardes officielles sont une donnée réglementaire
 * planifiée centralement, jamais soumise par les pharmacies
 * elles-mêmes.
 * Suppression : admin ou superadmin.
 *
 * Rappel diagramme (contrainte forte) : appel_urgence (module
 * 05_urgences) consomme garde_pharmacie pour rediriger vers la garde
 * la plus proche, mais UNIQUEMENT par relation fonctionnelle — aucune
 * FK, ni ici ni côté schema.prisma.
 * =================================================================== */

const STATUTS_PLANNING_GARDE = ["brouillon", "publie", "expire", "annule"];

/* ───────────────────────────────────────────────────────────────
 * Planning de garde
 * ─────────────────────────────────────────────────────────────── */

/**
 * GET /api/plannings-garde
 * Filtres optionnels : ?pays_id=...&statut=...
 */
export async function listerPlanningsGarde(req, res, next) {
  try {
    const { pays_id, statut } = req.query;

    if (statut && !STATUTS_PLANNING_GARDE.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_PLANNING_GARDE.join(", ")}.`,
      });
    }

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (statut) where.statut = statut;

    const plannings = await prisma.planningGarde.findMany({
      where,
      orderBy: { periode_debut: "desc" },
    });

    return res.status(200).json({ plannings });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/plannings-garde/:id
 */
export async function obtenirPlanningGarde(req, res, next) {
  try {
    const planning = await prisma.planningGarde.findUnique({
      where: { planning_garde_id: req.params.id },
      include: { gardes: true },
    });
    if (!planning) {
      return res.status(404).json({ message: "Planning de garde introuvable." });
    }

    return res.status(200).json({ planning });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/plannings-garde
 */
export async function creerPlanningGarde(req, res, next) {
  try {
    const estAdminCourant = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    if (!estAdminCourant) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { pays_id, statut, periode_debut, periode_fin } = req.body;

    if (!pays_id || !statut || !periode_debut || !periode_fin) {
      return res.status(400).json({
        message: "Champs requis manquants : pays_id, statut, periode_debut, periode_fin.",
      });
    }
    if (!STATUTS_PLANNING_GARDE.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_PLANNING_GARDE.join(", ")}.`,
      });
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(400).json({ message: "pays_id introuvable." });
    }

    const planning = await prisma.planningGarde.create({
      data: {
        pays_id,
        statut,
        periode_debut: new Date(periode_debut),
        periode_fin: new Date(periode_fin),
      },
    });

    return res.status(201).json({ message: "Planning de garde créé avec succès.", planning });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/plannings-garde/:id
 */
export async function modifierPlanningGarde(req, res, next) {
  try {
    const estAdminCourant = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    if (!estAdminCourant) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { statut, periode_debut, periode_fin } = req.body;

    const existant = await prisma.planningGarde.findUnique({
      where: { planning_garde_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Planning de garde introuvable." });
    }

    if (statut && !STATUTS_PLANNING_GARDE.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_PLANNING_GARDE.join(", ")}.`,
      });
    }

    const planning = await prisma.planningGarde.update({
      where: { planning_garde_id: req.params.id },
      data: {
        ...(statut && { statut }),
        ...(periode_debut && { periode_debut: new Date(periode_debut) }),
        ...(periode_fin && { periode_fin: new Date(periode_fin) }),
      },
    });

    return res.status(200).json({ message: "Planning de garde mis à jour.", planning });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/plannings-garde/:id
 */
export async function supprimerPlanningGarde(req, res, next) {
  try {
    const estAdminCourant = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    if (!estAdminCourant) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const planning = await prisma.planningGarde.findUnique({
      where: { planning_garde_id: req.params.id },
    });
    if (!planning) {
      return res.status(404).json({ message: "Planning de garde introuvable." });
    }

    const nbGardes = await prisma.gardePharmacie.count({
      where: { planning_garde_id: req.params.id },
    });
    if (nbGardes > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbGardes} garde(s) sont encore rattachée(s) à ce planning.`,
      });
    }

    await prisma.planningGarde.delete({ where: { planning_garde_id: req.params.id } });
    return res.status(200).json({ message: "Planning de garde supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ───────────────────────────────────────────────────────────────
 * Gardes (affectation pharmacie <-> créneau)
 * ─────────────────────────────────────────────────────────────── */

/**
 * GET /api/gardes-pharmacie
 * Filtres optionnels : ?ville_id=...&planning_garde_id=...
 *                      &pharmacie_id=...&date=... (ISO — retourne les
 *                      gardes actives à cet instant : date_debut <=
 *                      date <= date_fin, cas d'usage "pharmacie de
 *                      garde maintenant").
 */
export async function listerGardesPharmacie(req, res, next) {
  try {
    const { ville_id, planning_garde_id, pharmacie_id, date } = req.query;

    const where = {};
    if (ville_id) where.ville_id = ville_id;
    if (planning_garde_id) where.planning_garde_id = planning_garde_id;
    if (pharmacie_id) where.pharmacie_id = pharmacie_id;
    if (date) {
      const instant = new Date(date);
      if (Number.isNaN(instant.getTime())) {
        return res.status(400).json({ message: "date invalide (format ISO attendu)." });
      }
      where.date_debut = { lte: instant };
      where.date_fin = { gte: instant };
    }

    const gardes = await prisma.gardePharmacie.findMany({
      where,
      include: { pharmacie: true },
      orderBy: { date_debut: "asc" },
    });

    return res.status(200).json({ gardes });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/gardes-pharmacie/:id
 */
export async function obtenirGardePharmacie(req, res, next) {
  try {
    const garde = await prisma.gardePharmacie.findUnique({
      where: { garde_id: req.params.id },
      include: { pharmacie: true },
    });
    if (!garde) {
      return res.status(404).json({ message: "Garde introuvable." });
    }

    return res.status(200).json({ garde });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/gardes-pharmacie
 */
export async function creerGardePharmacie(req, res, next) {
  try {
    const estAdminCourant = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    if (!estAdminCourant) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { planning_garde_id, pharmacie_id, ville_id, date_debut, date_fin } = req.body;

    if (!planning_garde_id || !pharmacie_id || !ville_id || !date_debut || !date_fin) {
      return res.status(400).json({
        message:
          "Champs requis manquants : planning_garde_id, pharmacie_id, ville_id, date_debut, date_fin.",
      });
    }

    const debut = new Date(date_debut);
    const fin = new Date(date_fin);
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || debut >= fin) {
      return res.status(400).json({ message: "date_debut doit être antérieure à date_fin." });
    }

    const [planning, pharmacie, ville] = await Promise.all([
      prisma.planningGarde.findUnique({ where: { planning_garde_id } }),
      prisma.pharmacie.findUnique({ where: { pharmacie_id } }),
      prisma.ville.findUnique({ where: { ville_id } }),
    ]);
    if (!planning) return res.status(400).json({ message: "planning_garde_id introuvable." });
    if (!pharmacie) return res.status(400).json({ message: "pharmacie_id introuvable." });
    if (!ville) return res.status(400).json({ message: "ville_id introuvable." });

    const garde = await prisma.gardePharmacie.create({
      data: {
        planning_garde_id,
        pharmacie_id,
        ville_id,
        date_debut: debut,
        date_fin: fin,
      },
      include: { pharmacie: true },
    });

    return res.status(201).json({ message: "Garde créée avec succès.", garde });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/gardes-pharmacie/:id
 */
export async function modifierGardePharmacie(req, res, next) {
  try {
    const estAdminCourant = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    if (!estAdminCourant) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const existante = await prisma.gardePharmacie.findUnique({
      where: { garde_id: req.params.id },
    });
    if (!existante) {
      return res.status(404).json({ message: "Garde introuvable." });
    }

    const { pharmacie_id, ville_id, date_debut, date_fin } = req.body;

    if (pharmacie_id) {
      const pharmacie = await prisma.pharmacie.findUnique({ where: { pharmacie_id } });
      if (!pharmacie) return res.status(400).json({ message: "pharmacie_id introuvable." });
    }
    if (ville_id) {
      const ville = await prisma.ville.findUnique({ where: { ville_id } });
      if (!ville) return res.status(400).json({ message: "ville_id introuvable." });
    }

    const debut = date_debut ? new Date(date_debut) : existante.date_debut;
    const fin = date_fin ? new Date(date_fin) : existante.date_fin;
    if (debut >= fin) {
      return res.status(400).json({ message: "date_debut doit être antérieure à date_fin." });
    }

    const garde = await prisma.gardePharmacie.update({
      where: { garde_id: req.params.id },
      data: {
        ...(pharmacie_id && { pharmacie_id }),
        ...(ville_id && { ville_id }),
        ...(date_debut && { date_debut: debut }),
        ...(date_fin && { date_fin: fin }),
      },
      include: { pharmacie: true },
    });

    return res.status(200).json({ message: "Garde mise à jour.", garde });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/gardes-pharmacie/:id
 */
export async function supprimerGardePharmacie(req, res, next) {
  try {
    const estAdminCourant = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    if (!estAdminCourant) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const garde = await prisma.gardePharmacie.findUnique({ where: { garde_id: req.params.id } });
    if (!garde) {
      return res.status(404).json({ message: "Garde introuvable." });
    }

    await prisma.gardePharmacie.delete({ where: { garde_id: req.params.id } });
    return res.status(200).json({ message: "Garde supprimée." });
  } catch (err) {
    next(err);
  }
}