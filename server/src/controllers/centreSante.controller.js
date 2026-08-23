// src/controllers/centreSante.controller.js
// Composant "annuaire — centre de santé" : gère la table structure_sante
// (cliniques, hôpitaux, centres médicaux, dispensaires, laboratoires).
//
// Lecture : PUBLIQUE, sans authentification. L'Annuaire doit être
// consultable avant la création d'un compte ou une prise de RDV — même
// raisonnement que le référentiel géographique (voir referentiels.controller.js).
// Création : tout utilisateur authentifié (patient inclus) peut ajouter
// un centre de santé à l'annuaire, en fournissant 3 pièces justificatives
// (voir creerCentreSante). Le même formulaire crée AUSSI, dans la même
// transaction :
//   - un nouveau COMPTE UTILISATEUR pour l'agent qui aura la charge du
//     centre (nom, prénom, email, téléphone) — PAS forcément la personne
//     connectée qui soumet le formulaire (ex. un admin peut créer la
//     fiche pour un professionnel qui n'a pas encore de compte) ;
//   - un mot de passe temporaire généré côté serveur pour ce compte,
//     renvoyé UNE SEULE FOIS dans la réponse (à communiquer à l'agent —
//     aucun service d'email n'étant fourni dans ce dépôt, voir le
//     commentaire au-dessus de la réponse 201 plus bas) ; l'agent devra
//     le changer sous 24h à sa toute première connexion (le blocage
//     effectif de l'accès après ce délai est à implémenter dans le
//     contrôleur de login, non fourni ici — voir schema.prisma,
//     champs mot_de_passe_temporaire / mot_de_passe_expire_le) ;
//   - la fiche "agent_structure_sante" qui rattache ce nouveau compte
//     au centre — voir le bloc "Agent" plus bas.
// Modification : tout utilisateur authentifié (même logique que la
// création — voir modifierCentreSante pour la règle de statut). La
// modification ne touche jamais au compte agent (déjà créé une fois
// pour toutes à la création du centre).
// Suppression : réservée à superadmin (impact transverse : agents rattachés,
// avis, futurs modules pharmacie/RDV/urgences qui exposent la fiche).

import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier, construireUrl } from "../lib/cloudinaryService.js";
import crypto from "crypto";
import bcrypt from "bcrypt"; // même bibliothèque que authentification.controller.js

const SALT_ROUNDS = 10; // valeur identique à authentification.controller.js

const STATUTS_VERIFICATION_STRUCTURE = ["non_publie", "en_cours", "publie"];
const TYPES_STRUCTURE = ["clinique", "hopital", "centre_medical", "dispensaire", "laboratoire"];

// Rôle générique appliqué au compte créé pour l'agent d'un centre de
// santé (voir schema.prisma, commentaire "v6" sur le modèle
// Utilisateur : le type précis d'agent — ici "structure de santé" — se
// déduit de la présence d'une ligne dans agent_structure_sante, pas du
// libellé du rôle lui-même).
const LIBELLE_ROLE_AGENT = "agent_structure_sante";

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ===================================================================
 * Agent rattaché au centre de santé (nouveau compte)
 *
 * Le formulaire front est unique : créer un centre de santé crée dans
 * la foulée le COMPTE de l'agent qui en a la charge (pas nécessairement
 * la personne connectée qui soumet le formulaire) — puis le rattache
 * via agent_structure_sante. Règles :
 *   - l'email de l'agent doit être unique en base (contrainte
 *     Utilisateur.email) — un agent = un compte dédié, jamais partagé ;
 *   - un mot de passe temporaire est généré, haché, stocké, et
 *     retourné UNE SEULE FOIS en clair dans la réponse HTTP (voir
 *     creerCentreSante) — libre au frontend de l'afficher à l'auteur
 *     de la soumission pour qu'il le transmette à l'agent ;
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
 * Crée le compte utilisateur de l'agent PUIS la fiche
 * agent_structure_sante qui le rattache à la structure donnée.
 * Doit être appelée à l'intérieur d'une transaction Prisma (`tx`).
 */
async function creerCompteAgentPourStructure(tx, { structureId, fonction, nom, prenom, email, telephone, paysId }) {
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

  const agent = await tx.agentStructureSante.create({
    data: {
      utilisateur_id: utilisateur.utilisateur_id,
      structure_id: structureId,
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

async function recupererGeolocalisation(structureId) {
  const resultat = await prisma.$queryRaw`
    SELECT ST_Y(geolocalisation::geometry) AS latitude,
           ST_X(geolocalisation::geometry) AS longitude
    FROM structure_sante
    WHERE structure_id = ${structureId}::uuid
      AND geolocalisation IS NOT NULL
  `;

  if (!resultat.length) return null;

  const { latitude, longitude } = resultat[0];
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

async function definirGeolocalisation(structureId, latitude, longitude) {
  await prisma.$executeRaw`
    UPDATE structure_sante
    SET geolocalisation = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
    WHERE structure_id = ${structureId}::uuid
  `;
}

async function effacerGeolocalisation(structureId) {
  await prisma.$executeRaw`
    UPDATE structure_sante
    SET geolocalisation = NULL
    WHERE structure_id = ${structureId}::uuid
  `;
}

/**
 * Valide un couple latitude/longitude et applique le changement demandé :
 *   - les deux valeurs présentes  -> définit le point
 *   - les deux valeurs à null     -> efface le point
 *   - absentes du corps de requête -> ne touche pas au champ
 * Retourne un message d'erreur (string) en cas de valeurs invalides, sinon null.
 */
async function appliquerGeolocalisation(structureId, latitude, longitude) {
  const latFournie = latitude !== undefined;
  const lngFournie = longitude !== undefined;

  if (!latFournie && !lngFournie) return null;

  if (latFournie !== lngFournie) {
    return "latitude et longitude doivent être fournies ensemble.";
  }

  if (latitude === null && longitude === null) {
    await effacerGeolocalisation(structureId);
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

  await definirGeolocalisation(structureId, latitude, longitude);
  return null;
}

async function avecGeolocalisation(structure) {
  const geolocalisation = await recupererGeolocalisation(structure.structure_id);
  return { ...structure, geolocalisation };
}

/**
 * Ajoute les URLs publiques (reconstruites via Cloudinary) des 3
 * pièces justificatives, en plus des "nom" (public_id) déjà présents
 * sur la ligne. Le frontend n'a ainsi jamais besoin de connaître la
 * logique Cloudinary : il consomme directement image_url / etc.
 */
function avecUrlsFichiers(structure) {
  return {
    ...structure,
    image_url: construireUrl(structure.image_nom),
    piece_identite_url: construireUrl(structure.piece_identite_nom),
    document_agrement_url: construireUrl(structure.document_agrement_nom),
  };
}

async function enrichirCentreSante(structure) {
  const avecGeo = await avecGeolocalisation(structure);
  return avecUrlsFichiers(avecGeo);
}

/* ===================================================================
 * Centres de santé
 * =================================================================== */

/**
 * GET /api/centres-sante
 * Filtres optionnels : ?pays_id=...&ville_id=...&type_structure=...
 *                      &statut_verification=...&recherche=...(nom, insensible à la casse)
 */
export async function listerCentresSante(req, res, next) {
  try {
    const { pays_id, ville_id, type_structure, statut_verification, recherche } = req.query;

    if (type_structure && !TYPES_STRUCTURE.includes(type_structure)) {
      return res.status(400).json({
        message: `type_structure invalide. Valeurs acceptées : ${TYPES_STRUCTURE.join(", ")}.`,
      });
    }
    if (statut_verification && !STATUTS_VERIFICATION_STRUCTURE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_STRUCTURE.join(", ")}.`,
      });
    }

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (type_structure) where.type_structure = type_structure;
    if (statut_verification) where.statut_verification = statut_verification;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };

    const structures = await prisma.structureSante.findMany({
      where,
      include: { pays: true, ville: true },
      orderBy: { nom: "asc" },
    });

    const centresSante = await Promise.all(structures.map(enrichirCentreSante));

    return res.status(200).json({ centresSante });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/centres-sante/:id
 */
export async function obtenirCentreSante(req, res, next) {
  try {
    const structure = await prisma.structureSante.findUnique({
      where: { structure_id: req.params.id },
      include: { pays: true, ville: true },
    });
    if (!structure) {
      return res.status(404).json({ message: "Centre de santé introuvable." });
    }

    const centreSante = await enrichirCentreSante(structure);
    return res.status(200).json({ centreSante });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/centres-sante
 * multipart/form-data — champs texte identiques à avant, plus 3 fichiers
 * obligatoires (voir upload.middleware.js) :
 *   - image_structure   : photo du centre de santé
 *   - piece_identite     : pièce d'identité du professionnel qui soumet la fiche
 *   - document_agrement  : agrément officiel autorisant l'exercice
 * Champs latitude / longitude optionnels (voir appliquerGeolocalisation).
 *
 * Champs supplémentaires requis — création du COMPTE AGENT en même
 * temps que le centre (voir creerCompteAgentPourStructure) :
 *   - fonction     : intitulé du poste de l'agent au sein du centre
 *                    (ex. "Gérant", "Directeur médical")
 *   - agent_nom, agent_prenom, agent_email : identité du titulaire du
 *     nouveau compte (PAS forcément la personne connectée qui soumet
 *     ce formulaire)
 *   - agent_telephone : optionnel
 * Le pays du compte agent (Utilisateur.pays_id, obligatoire) est
 * repris directement de celui du centre créé (pays_id) — décision
 * produit : pas de champ dédié dans le formulaire.
 */
export async function creerCentreSante(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      statut_verification,
      type_structure,
      latitude,
      longitude,
      fonction,
      agent_nom,
      agent_prenom,
      agent_email,
      agent_telephone,
    } = req.body;

    if (!nom || !pays_id || !ville_id || !telephone || !statut_verification || !type_structure) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, pays_id, ville_id, telephone, statut_verification, type_structure.",
      });
    }
    if (!fonction || !fonction.trim() || !agent_nom || !agent_nom.trim() ||
        !agent_prenom || !agent_prenom.trim() || !agent_email || !agent_email.trim()) {
      return res.status(400).json({
        message:
          "Champs requis manquants pour l'agent du centre : fonction, agent_nom, agent_prenom, agent_email.",
      });
    }
    if (!REGEX_EMAIL.test(agent_email.trim())) {
      return res.status(400).json({ message: "agent_email invalide." });
    }

    // 3 pièces justificatives obligatoires à la création.
    const fichierImage = req.files?.image_structure?.[0];
    const fichierPieceIdentite = req.files?.piece_identite?.[0];
    const fichierAgrement = req.files?.document_agrement?.[0];
    if (!fichierImage || !fichierPieceIdentite || !fichierAgrement) {
      return res.status(400).json({
        message:
          "3 fichiers sont requis : image_structure (photo du centre), piece_identite (pièce d'identité) et document_agrement (agrément officiel).",
      });
    }

    if (!TYPES_STRUCTURE.includes(type_structure)) {
      return res.status(400).json({
        message: `type_structure invalide. Valeurs acceptées : ${TYPES_STRUCTURE.join(", ")}.`,
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
    // centreSante.routes.js), pas seulement admin/superadmin. Pour
    // préserver le circuit de modération (badge "en_cours" -> bouton
    // "Examiner" côté admin dans le front), un utilisateur non
    // admin/superadmin ne peut pas publier directement : son statut
    // est forcé à "en_cours" quoi qu'il envoie. On ne valide donc
    // statut_verification que lorsqu'il sera réellement utilisé (cas
    // admin/superadmin) — inutile de rejeter une valeur qui sera de
    // toute façon écrasée pour les autres profils.
    const estAdmin = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";

    if (estAdmin && !STATUTS_VERIFICATION_STRUCTURE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_STRUCTURE.join(", ")}.`,
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

    // Structure, compte agent et rattachement sont créés dans une seule
    // transaction : on ne veut jamais d'un centre de santé sans agent
    // responsable (ni d'un compte agent sans centre). La géolocalisation
    // (requêtes SQL brutes hors Prisma Client) est appliquée juste
    // après, une fois la structure garantie persistée.
    let structure;
    let agent;
    let utilisateurAgent;
    let motDePasseTemporaire;
    try {
      ({ structure, agent, utilisateurAgent, motDePasseTemporaire } = await prisma.$transaction(async (tx) => {
        const structureCreee = await tx.structureSante.create({
          data: {
            nom,
            pays_id,
            ville_id,
            telephone,
            statut_verification: statutApplique,
            type_structure,
            image_nom: uploadImage.nom,
            piece_identite_nom: uploadPieceIdentite.nom,
            document_agrement_nom: uploadAgrement.nom,
          },
          include: { pays: true, ville: true },
        });

        const { utilisateur, agent: agentCree, motDePasseTemporaire: mdp } =
          await creerCompteAgentPourStructure(tx, {
            structureId: structureCreee.structure_id,
            fonction: fonction.trim(),
            nom: agent_nom.trim(),
            prenom: agent_prenom.trim(),
            email: agent_email.trim().toLowerCase(),
            telephone: agent_telephone?.trim(),
            paysId: pays_id,
          });

        return {
          structure: structureCreee,
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

    const erreurGeo = await appliquerGeolocalisation(structure.structure_id, latitude, longitude);

    const centreSante = await enrichirCentreSante(structure);
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
      // La structure (et le compte agent) sont créés mais la
      // géolocalisation fournie est invalide : on informe le client
      // sans annuler la création.
      return res.status(201).json({
        message: `Centre de santé créé avec succès. Avertissement : ${erreurGeo}`,
        centreSante,
        agent: reponseAgent,
      });
    }

    return res.status(201).json({
      message: "Centre de santé créé avec succès. Compte agent créé — communiquez-lui le mot de passe temporaire.",
      centreSante,
      agent: reponseAgent,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/centres-sante/:id
 * Ouvert à tout utilisateur authentifié (voir centreSante.routes.js).
 * Les 3 fichiers sont optionnels ici : seuls ceux effectivement
 * envoyés sont remplacés (l'ancien fichier Cloudinary correspondant
 * est alors supprimé après succès du nouvel upload).
 */
export async function modifierCentreSante(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      statut_verification,
      type_structure,
      latitude,
      longitude,
    } = req.body;

    const existante = await prisma.structureSante.findUnique({
      where: { structure_id: req.params.id },
    });
    if (!existante) {
      return res.status(404).json({ message: "Centre de santé introuvable." });
    }

    if (type_structure && !TYPES_STRUCTURE.includes(type_structure)) {
      return res.status(400).json({
        message: `type_structure invalide. Valeurs acceptées : ${TYPES_STRUCTURE.join(", ")}.`,
      });
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

    if (estAdmin && statut_verification && !STATUTS_VERIFICATION_STRUCTURE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_STRUCTURE.join(", ")}.`,
      });
    }
    const statutApplique = estAdmin
      ? statut_verification || existante.statut_verification
      : "en_cours";

    // Remplacement optionnel des fichiers : upload du nouveau fichier
    // AVANT suppression de l'ancien, pour ne jamais laisser la fiche
    // sans fichier valide en cas d'échec d'upload.
    const fichierImage = req.files?.image_structure?.[0];
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

    const structure = await prisma.structureSante.update({
      where: { structure_id: req.params.id },
      data: {
        ...(nom && { nom }),
        ...(pays_id && { pays_id }),
        ...(ville_id && { ville_id }),
        ...(telephone && { telephone }),
        statut_verification: statutApplique,
        ...(type_structure && { type_structure }),
        ...donneesFichiers,
      },
      include: { pays: true, ville: true },
    });

    const erreurGeo = await appliquerGeolocalisation(structure.structure_id, latitude, longitude);
    if (erreurGeo) {
      return res.status(400).json({ message: erreurGeo });
    }

    const centreSante = await enrichirCentreSante(structure);
    return res.status(200).json({ message: "Centre de santé mis à jour.", centreSante });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/centres-sante/:id
 */
export async function supprimerCentreSante(req, res, next) {
  try {
    const structure = await prisma.structureSante.findUnique({
      where: { structure_id: req.params.id },
    });
    if (!structure) {
      return res.status(404).json({ message: "Centre de santé introuvable." });
    }

    const nbAgents = await prisma.agentStructureSante.count({
      where: { structure_id: req.params.id },
    });
    if (nbAgents > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbAgents} agent(s) sont encore rattaché(s) à ce centre de santé.`,
      });
    }

    await prisma.structureSante.delete({ where: { structure_id: req.params.id } });

    // Nettoyage Cloudinary après suppression réussie en base (best
    // effort — voir supprimerFichier). On ne bloque jamais la
    // suppression DB pour un souci Cloudinary.
    await Promise.all([
      supprimerFichier(structure.image_nom),
      supprimerFichier(structure.piece_identite_nom),
      supprimerFichier(structure.document_agrement_nom),
    ]);

    return res.status(200).json({ message: "Centre de santé supprimé." });
  } catch (err) {
    next(err);
  }
}