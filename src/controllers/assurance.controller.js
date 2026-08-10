// src/controllers/assurance.controller.js
// Composant "annuaire — assurance" (diagramme 08_annuaire_assurances) :
// gère UNIQUEMENT service_assurance et mise_en_relation.
//
// v8 : les anciens sous-modules "publicité/abonnement/avis assurance"
// n'existent plus (voir schema.prisma — Publicite est désormais un
// module autonome qui ne référence plus aucune fiche annuaire, et il
// n'y a pas d'équivalent AbonnementAssurance/AvisAssurance pour ce
// composant). "contact_prospect_assurance" (patient -> assurance) est
// remplacé par "mise_en_relation" (utilisateur quelconque <-> assurance,
// N-N) — voir plus bas.
//
// Module secondaire (Phase 4) : n'entre pas dans le parcours critique
// de soin/urgence, mais suit la même logique d'annuaire public que
// Centre de santé / Pharmacie pour service_assurance : lecture
// publique, écriture ouverte à tout utilisateur authentifié avec
// re-modération automatique, suppression réservée à superadmin.
//
// Même patron que Centre de santé / Pharmacie pour la pièce jointe :
// UNE image (compagnie ou courtier) est obligatoire à la création,
// téléversée sur Cloudinary (voir lib/cloudinaryService.js). Seul le
// "nom" (public_id Cloudinary) est stocké, dans l'attribut
// ServiceAssurance.file_url (le nom du champ est trompeur — conservé
// tel quel pour ne pas casser le schéma existant, comme Publicite.visuel_url,
// voir schema.prisma) ; l'URL publique est reconstruite à la volée via
// construireUrl(), jamais persistée.

import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier, construireUrl } from "../lib/cloudinaryService.js";
import crypto from "crypto";
import bcrypt from "bcrypt"; // même bibliothèque que authentification.controller.js

const SALT_ROUNDS = 10; // valeur identique à authentification.controller.js / pharmacie.controller.js

const STATUTS_VERIFICATION_ASSURANCE = ["non_publie", "en_cours", "publie"];
const TYPES_ACTEUR_ASSURANCE = ["compagnie", "courtier"];

// Rôle générique appliqué au compte créé pour l'agent d'un service
// d'assurance (voir schema.prisma, commentaire "v6" sur le modèle
// Utilisateur : le type précis d'agent — ici "assurance" — se déduit
// de la présence d'une ligne dans agent_assurance, pas du libellé du
// rôle lui-même).
const LIBELLE_ROLE_AGENT = "agent_assurance";

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function estAdminOuSuperadmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/* ===================================================================
 * Agent rattaché au service d'assurance (nouveau compte)
 *
 * Même patron que creerCompteAgentPourPharmacie (voir
 * pharmacie.controller.js) : le formulaire de création d'un service
 * d'assurance crée dans la foulée le COMPTE de l'agent qui en a la
 * charge (pas nécessairement la personne connectée qui soumet le
 * formulaire), puis le rattache via agent_assurance.
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
 * Crée le compte utilisateur de l'agent PUIS la fiche agent_assurance
 * qui le rattache au service d'assurance donné. Doit être appelée à
 * l'intérieur d'une transaction Prisma (`tx`).
 */
async function creerCompteAgentPourServiceAssurance(
  tx,
  { serviceAssuranceId, fonction, nom, prenom, email, telephone, paysId }
) {
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

  const agent = await tx.agentAssurance.create({
    data: {
      utilisateur_id: utilisateur.utilisateur_id,
      service_assurance_id: serviceAssuranceId,
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
 * même patron que centreSante.controller.js / pharmacie.controller.js.
 * =================================================================== */

async function recupererGeolocalisation(serviceAssuranceId) {
  const resultat = await prisma.$queryRaw`
    SELECT ST_Y(geolocalisation::geometry) AS latitude,
           ST_X(geolocalisation::geometry) AS longitude
    FROM service_assurance
    WHERE service_assurance_id = ${serviceAssuranceId}::uuid
      AND geolocalisation IS NOT NULL
  `;

  if (!resultat.length) return null;

  const { latitude, longitude } = resultat[0];
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

async function definirGeolocalisation(serviceAssuranceId, latitude, longitude) {
  await prisma.$executeRaw`
    UPDATE service_assurance
    SET geolocalisation = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
    WHERE service_assurance_id = ${serviceAssuranceId}::uuid
  `;
}

async function effacerGeolocalisation(serviceAssuranceId) {
  await prisma.$executeRaw`
    UPDATE service_assurance
    SET geolocalisation = NULL
    WHERE service_assurance_id = ${serviceAssuranceId}::uuid
  `;
}

/**
 * Valide un couple latitude/longitude et applique le changement demandé :
 *   - les deux valeurs présentes  -> définit le point
 *   - les deux valeurs à null     -> efface le point
 *   - absentes du corps de requête -> ne touche pas au champ
 * Retourne un message d'erreur (string) en cas de valeurs invalides, sinon null.
 */
async function appliquerGeolocalisation(serviceAssuranceId, latitude, longitude) {
  const latFournie = latitude !== undefined;
  const lngFournie = longitude !== undefined;

  if (!latFournie && !lngFournie) return null;

  if (latFournie !== lngFournie) {
    return "latitude et longitude doivent être fournies ensemble.";
  }

  if (latitude === null && longitude === null) {
    await effacerGeolocalisation(serviceAssuranceId);
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

  await definirGeolocalisation(serviceAssuranceId, latitude, longitude);
  return null;
}

/**
 * Ajoute l'URL publique (reconstruite via Cloudinary) de l'image, en
 * plus du "nom" (public_id, champ file_url) déjà présent sur la ligne.
 * Le frontend consomme directement image_url, comme pour Centre de
 * santé / Pharmacie (voir avecUrlsFichiers dans ces contrôleurs).
 */
function avecUrlFichier(serviceAssurance) {
  return {
    ...serviceAssurance,
    image_url: construireUrl(serviceAssurance.file_url),
  };
}

async function enrichirServiceAssurance(serviceAssurance) {
  const geolocalisation = await recupererGeolocalisation(serviceAssurance.service_assurance_id);
  return avecUrlFichier({ ...serviceAssurance, geolocalisation });
}

/* ===================================================================
 * Services d'assurance
 * =================================================================== */

/**
 * GET /api/services-assurance
 * PUBLIQUE, sans authentification — même logique que Centre de santé /
 * Pharmacie : l'Annuaire Assurance doit être consultable avant
 * inscription.
 * Filtres optionnels : ?pays_id=...&ville_id=...&type_acteur=...
 *                      &statut_verification=...&recherche=...(nom, insensible à la casse)
 */
export async function listerServicesAssurance(req, res, next) {
  try {
    const { pays_id, ville_id, type_acteur, statut_verification, recherche } = req.query;

    if (statut_verification && !STATUTS_VERIFICATION_ASSURANCE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_ASSURANCE.join(", ")}.`,
      });
    }
    if (type_acteur && !TYPES_ACTEUR_ASSURANCE.includes(type_acteur)) {
      return res.status(400).json({
        message: `type_acteur invalide. Valeurs acceptées : ${TYPES_ACTEUR_ASSURANCE.join(", ")}.`,
      });
    }

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (type_acteur) where.type_acteur = type_acteur;
    if (statut_verification) where.statut_verification = statut_verification;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };

    const servicesAssurance = await prisma.serviceAssurance.findMany({
      where,
      include: { pays: true, ville: true },
      orderBy: { nom: "asc" },
    });

    const resultat = await Promise.all(servicesAssurance.map(enrichirServiceAssurance));

    return res.status(200).json({ services_assurance: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/services-assurance/:id
 */
export async function obtenirServiceAssurance(req, res, next) {
  try {
    const serviceAssurance = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: req.params.id },
      include: { pays: true, ville: true },
    });
    if (!serviceAssurance) {
      return res.status(404).json({ message: "Service d'assurance introuvable." });
    }

    const resultat = await enrichirServiceAssurance(serviceAssurance);
    return res.status(200).json({ service_assurance: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/services-assurance
 * multipart/form-data — ouvert à tout utilisateur authentifié, quel
 * que soit son rôle — même logique que Centre de santé / Pharmacie.
 * UN fichier obligatoire (voir upload.middleware.js) :
 *   - image_assurance : photo/logo de la compagnie ou du courtier
 *
 * Champs requis pour la fiche : nom, pays_id, ville_id, telephone,
 * email, agrement, statut_verification, type_acteur ('compagnie' |
 * 'courtier'). Champ optionnel : description.
 * Champs latitude / longitude optionnels (voir appliquerGeolocalisation).
 *
 * Champs supplémentaires requis — création du COMPTE AGENT en même
 * temps que le service (même patron que Pharmacie) :
 *   - fonction : intitulé du poste de l'agent au sein du service
 *   - agent_nom, agent_prenom, agent_email : identité du titulaire du
 *     nouveau compte (PAS forcément la personne connectée qui soumet
 *     ce formulaire)
 *   - agent_telephone : optionnel
 * Le pays du compte agent (Utilisateur.pays_id) est repris directement
 * de celui du service créé (pays_id) — décision produit identique à
 * Pharmacie : pas de champ dédié dans le formulaire.
 */
export async function creerServiceAssurance(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      email,
      agrement,
      description,
      statut_verification,
      type_acteur,
      latitude,
      longitude,
      fonction,
      agent_nom,
      agent_prenom,
      agent_email,
      agent_telephone,
    } = req.body;

    if (
      !nom || !pays_id || !ville_id || !telephone || !email || !email.trim() ||
      !agrement || !agrement.trim() || !statut_verification || !type_acteur
    ) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, pays_id, ville_id, telephone, email, agrement, statut_verification, type_acteur.",
      });
    }
    if (!REGEX_EMAIL.test(email.trim())) {
      return res.status(400).json({ message: "email invalide." });
    }
    if (!TYPES_ACTEUR_ASSURANCE.includes(type_acteur)) {
      return res.status(400).json({
        message: `type_acteur invalide. Valeurs acceptées : ${TYPES_ACTEUR_ASSURANCE.join(", ")}.`,
      });
    }
    if (
      !fonction || !fonction.trim() ||
      !agent_nom || !agent_nom.trim() ||
      !agent_prenom || !agent_prenom.trim() ||
      !agent_email || !agent_email.trim()
    ) {
      return res.status(400).json({
        message:
          "Champs requis manquants pour l'agent du service d'assurance : fonction, agent_nom, agent_prenom, agent_email.",
      });
    }
    if (!REGEX_EMAIL.test(agent_email.trim())) {
      return res.status(400).json({ message: "agent_email invalide." });
    }

    // Image obligatoire à la création — voir gererTeleversementAssurance.
    const fichierImage = req.files?.image_assurance?.[0];
    if (!fichierImage) {
      return res.status(400).json({
        message: "Le fichier image_assurance (photo/logo de l'assurance) est requis.",
      });
    }

    // Un agent = un compte dédié, jamais partagé (contrainte unique
    // Utilisateur.email) — vérifié avant tout upload Cloudinary pour
    // échouer vite, sans envoyer inutilement le fichier.
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

    // Même logique de modération que Centre de santé / Pharmacie : un
    // utilisateur non admin/superadmin ne peut pas publier directement,
    // son statut est forcé à "en_cours" quoi qu'il envoie.
    const estAdmin = estAdminOuSuperadmin(req.utilisateur);

    if (estAdmin && !STATUTS_VERIFICATION_ASSURANCE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_ASSURANCE.join(", ")}.`,
      });
    }
    const statutApplique = estAdmin ? statut_verification : "en_cours";

    // Téléversement Cloudinary — après les validations métier, pour ne
    // pas envoyer inutilement le fichier si la requête est invalide.
    const uploadImage = await televerserFichier(fichierImage.buffer, "assurances");

    // Service, compte agent et rattachement créés dans une seule
    // transaction : jamais de service sans agent responsable, ni de
    // compte agent sans service. La géolocalisation (SQL brut) est
    // appliquée juste après, une fois le service garanti persisté.
    let serviceCree;
    let agent;
    let utilisateurAgent;
    let motDePasseTemporaire;
    try {
      ({ serviceCree, agent, utilisateurAgent, motDePasseTemporaire } = await prisma.$transaction(async (tx) => {
        const service = await tx.serviceAssurance.create({
          data: {
            nom,
            pays_id,
            ville_id,
            telephone,
            email: email.trim().toLowerCase(),
            agrement: agrement.trim(),
            description: description?.trim() || null,
            file_url: uploadImage.nom,
            statut_verification: statutApplique,
            type_acteur,
          },
          include: { pays: true, ville: true },
        });

        const { utilisateur, agent: agentCree, motDePasseTemporaire: mdp } =
          await creerCompteAgentPourServiceAssurance(tx, {
            serviceAssuranceId: service.service_assurance_id,
            fonction: fonction.trim(),
            nom: agent_nom.trim(),
            prenom: agent_prenom.trim(),
            email: agent_email.trim().toLowerCase(),
            telephone: agent_telephone?.trim(),
            paysId: pays_id,
          });

        return {
          serviceCree: service,
          agent: agentCree,
          utilisateurAgent: utilisateur,
          motDePasseTemporaire: mdp,
        };
      }));
    } catch (errTransaction) {
      // Concurrence : deux requêtes simultanées pourraient toutes deux
      // passer verifierEmailAgentDisponible avant que l'une des deux ne
      // pose sa ligne — la contrainte unique Utilisateur.email tranche
      // alors ici (code Prisma P2002).
      if (errTransaction.code === "P2002") {
        return res.status(409).json({
          message: "Un compte existe déjà avec cet email : impossible de créer le compte agent.",
        });
      }
      throw errTransaction;
    }

    const erreurGeo = await appliquerGeolocalisation(serviceCree.service_assurance_id, latitude, longitude);

    const serviceAssurance = await enrichirServiceAssurance(serviceCree);

    // ⚠️ Le mot de passe temporaire n'est renvoyé QU'ICI, en clair, et
    // une seule fois — même avertissement que pharmacie.controller.js :
    // aucun service d'email n'étant fourni dans ce dépôt, le frontend
    // doit l'afficher à l'auteur de la soumission puis ne plus jamais
    // le redemander.
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
      return res.status(201).json({
        message: `Service d'assurance créé avec succès. Avertissement : ${erreurGeo}`,
        service_assurance: serviceAssurance,
        agent: reponseAgent,
      });
    }

    return res.status(201).json({
      message: "Service d'assurance créé avec succès. Compte agent créé — communiquez-lui le mot de passe temporaire.",
      service_assurance: serviceAssurance,
      agent: reponseAgent,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/services-assurance/:id
 * multipart/form-data — ouvert à tout utilisateur authentifié, quel
 * que soit son rôle. Ne touche jamais au compte agent (déjà créé une
 * fois pour toutes à la création du service) — même logique que
 * Pharmacie. Le fichier image_assurance est optionnel ici : seul un
 * nouveau fichier effectivement envoyé remplace l'ancien (l'ancien
 * fichier Cloudinary est alors supprimé après succès du nouvel upload,
 * même patron que centreSante.controller.js / pharmacie.controller.js).
 */
export async function modifierServiceAssurance(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      email,
      agrement,
      description,
      statut_verification,
      type_acteur,
      latitude,
      longitude,
    } = req.body;

    const existant = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Service d'assurance introuvable." });
    }

    if (email && !REGEX_EMAIL.test(email.trim())) {
      return res.status(400).json({ message: "email invalide." });
    }

    const paysCibleId = pays_id || existant.pays_id;
    const villeCibleId = ville_id || existant.ville_id;

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
    if (type_acteur && !TYPES_ACTEUR_ASSURANCE.includes(type_acteur)) {
      return res.status(400).json({
        message: `type_acteur invalide. Valeurs acceptées : ${TYPES_ACTEUR_ASSURANCE.join(", ")}.`,
      });
    }

    // Seuls admin/superadmin peuvent choisir librement statut_verification ;
    // pour tout autre profil, la fiche repasse systématiquement en
    // "en_cours" (même logique que Centre de santé / Pharmacie).
    const estAdmin = estAdminOuSuperadmin(req.utilisateur);

    if (estAdmin && statut_verification && !STATUTS_VERIFICATION_ASSURANCE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_ASSURANCE.join(", ")}.`,
      });
    }
    const statutApplique = estAdmin
      ? statut_verification || existant.statut_verification
      : "en_cours";

    // Remplacement optionnel de l'image : upload du nouveau fichier
    // AVANT suppression de l'ancien, pour ne jamais laisser la fiche
    // sans fichier valide en cas d'échec d'upload (même patron que
    // centreSante.controller.js / pharmacie.controller.js).
    const fichierImage = req.files?.image_assurance?.[0];
    const donneesFichier = {};
    if (fichierImage) {
      const upload = await televerserFichier(fichierImage.buffer, "assurances");
      await supprimerFichier(existant.file_url);
      donneesFichier.file_url = upload.nom;
    }

    const serviceAssurance = await prisma.serviceAssurance.update({
      where: { service_assurance_id: req.params.id },
      data: {
        ...(nom && { nom }),
        ...(pays_id && { pays_id }),
        ...(ville_id && { ville_id }),
        ...(telephone && { telephone }),
        ...(email && { email: email.trim().toLowerCase() }),
        ...(agrement && { agrement: agrement.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(type_acteur && { type_acteur }),
        statut_verification: statutApplique,
        ...donneesFichier,
      },
      include: { pays: true, ville: true },
    });

    const erreurGeo = await appliquerGeolocalisation(serviceAssurance.service_assurance_id, latitude, longitude);
    if (erreurGeo) {
      return res.status(400).json({ message: erreurGeo });
    }

    const resultat = await enrichirServiceAssurance(serviceAssurance);
    return res.status(200).json({ message: "Service d'assurance mis à jour.", service_assurance: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/services-assurance/:id
 * Réservée à superadmin — impact transverse (agent rattaché, mises en
 * relation, activités/options, agences rattachées à la fiche — voir
 * schema.prisma, ServiceAssurance).
 */
export async function supprimerServiceAssurance(req, res, next) {
  try {
    const serviceAssurance = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: req.params.id },
    });
    if (!serviceAssurance) {
      return res.status(404).json({ message: "Service d'assurance introuvable." });
    }

    const [nbAgents, nbMisesEnRelation, nbActivites, nbAgences] = await Promise.all([
      prisma.agentAssurance.count({ where: { service_assurance_id: req.params.id } }),
      prisma.miseEnRelation.count({ where: { service_assurance_id: req.params.id } }),
      prisma.activite.count({ where: { service_assurance_id: req.params.id } }),
      prisma.agence.count({ where: { service_assurance_id: req.params.id } }),
    ]);
    const total = nbAgents + nbMisesEnRelation + nbActivites + nbAgences;
    if (total > 0) {
      return res.status(409).json({
        message:
          `Impossible de supprimer : des enregistrements sont encore rattachés à ce service ` +
          `(agents: ${nbAgents}, mises en relation: ${nbMisesEnRelation}, activités: ${nbActivites}, agences: ${nbAgences}).`,
      });
    }

    await prisma.serviceAssurance.delete({ where: { service_assurance_id: req.params.id } });

    // Nettoyage Cloudinary après suppression réussie en base (best
    // effort — voir supprimerFichier). On ne bloque jamais la
    // suppression DB pour un souci Cloudinary.
    await supprimerFichier(serviceAssurance.file_url);

    return res.status(200).json({ message: "Service d'assurance supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Mise en relation
 *
 * v8 : remplace l'ancien "contact_prospect_assurance" (patient ->
 * assurance, 1-N, restreint au rôle patient). N'IMPORTE QUEL
 * utilisateur authentifié peut désormais solliciter un service
 * d'assurance (relation N-N utilisateur <-> assurance, voir
 * schema.prisma — Utilisateur.mises_en_relation / ServiceAssurance.mises_en_relation).
 * utilisateur_id n'est JAMAIS lu depuis le corps de la requête : déduit
 * du compte authentifié, pour qu'un utilisateur ne puisse jamais
 * soumettre un message au nom d'un autre.
 * Lecture / suppression : réservées à l'agent du service_assurance
 * concerné ou à admin/superadmin — une mise en relation est une donnée
 * commerciale privée, pas une fiche annuaire publique.
 * =================================================================== */

async function estAgentDuServiceAssurance(utilisateur, serviceAssuranceId) {
  if (!utilisateur) return false;
  const agent = await prisma.agentAssurance.findUnique({
    where: { utilisateur_id: utilisateur.utilisateur_id },
  });
  return !!agent && agent.service_assurance_id === serviceAssuranceId;
}

/**
 * GET /api/mises-en-relation-assurance?service_assurance_id=...
 */
export async function listerMisesEnRelationAssurance(req, res, next) {
  try {
    const { service_assurance_id } = req.query;
    if (!service_assurance_id) {
      return res.status(400).json({ message: "Paramètre requis : service_assurance_id." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const misesEnRelation = await prisma.miseEnRelation.findMany({
      where: { service_assurance_id },
      include: {
        utilisateur: { select: { nom: true, prenom: true, email: true, telephone: true } },
      },
      orderBy: { date_creation: "desc" },
    });

    return res.status(200).json({ mises_en_relation: misesEnRelation });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/mises-en-relation-assurance
 * Ouvert à tout utilisateur authentifié, quel que soit son rôle.
 * Champs requis : service_assurance_id, message.
 */
export async function creerMiseEnRelationAssurance(req, res, next) {
  try {
    const { service_assurance_id, message } = req.body;

    if (!service_assurance_id || !message || !message.trim()) {
      return res.status(400).json({ message: "Champs requis manquants : service_assurance_id, message." });
    }

    const service = await prisma.serviceAssurance.findUnique({ where: { service_assurance_id } });
    if (!service) {
      return res.status(400).json({ message: "service_assurance_id introuvable." });
    }

    const miseEnRelation = await prisma.miseEnRelation.create({
      data: {
        utilisateur_id: req.utilisateur.utilisateur_id,
        service_assurance_id,
        message: message.trim(),
      },
    });

    return res.status(201).json({ message: "Message envoyé au service d'assurance.", mise_en_relation: miseEnRelation });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/mises-en-relation-assurance/:id
 */
export async function supprimerMiseEnRelationAssurance(req, res, next) {
  try {
    const miseEnRelation = await prisma.miseEnRelation.findUnique({
      where: { mise_en_relation_id: req.params.id },
    });
    if (!miseEnRelation) {
      return res.status(404).json({ message: "Mise en relation introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, miseEnRelation.service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    await prisma.miseEnRelation.delete({ where: { mise_en_relation_id: req.params.id } });

    return res.status(200).json({ message: "Mise en relation supprimée." });
  } catch (err) {
    next(err);
  }
}