// src/controllers/assurance.controller.js
// Composant "annuaire — assurance" (diagramme 08_annuaire_assurances) :
// gère service_assurance, mise_en_relation, ainsi que le catalogue
// activite / option_activite et les agence physiques d'un service.
//
// v8 : les anciens sous-modules "publicité/abonnement/avis assurance"
// n'existent plus (voir schema.prisma — Publicite est désormais un
// module autonome qui ne référence plus aucune fiche annuaire, et il
// n'y a pas d'équivalent AbonnementAssurance/AvisAssurance pour ce
// composant). "contact_prospect_assurance" (patient -> assurance) est
// remplacé par "mise_en_relation" (utilisateur quelconque <-> assurance,
// N-N) — voir plus bas. v8 ajoute également le catalogue activite /
// option_activite (une assurance possède N activités, chaque activité
// porte ses propres options) et agence (une assurance possède N
// agences physiques) — voir plus bas, sections dédiées.
//
// Autorisation pour activite / option_activite / agence : lecture
// publique (même logique que service_assurance), écriture réservée à
// l'agent du service_assurance concerné ou à admin/superadmin — ce
// sont des données de catalogue gérées par l'assurance elle-même, pas
// des fiches librement modifiables par tout utilisateur (contrairement
// à service_assurance) ni des sollicitations ouvertes (contrairement à
// mise_en_relation).
//
// Module secondaire (Phase 4) : n'entre pas dans le parcours critique
// de soin/urgence, mais suit la même logique d'annuaire public que
// Centre de santé / Pharmacie pour service_assurance : lecture
// publique, création ouverte à tout utilisateur authentifié, modification
// réservée à l'agent de la fiche ou à l'administration (sans re-modération
// depuis le 2026-10-18), suppression réservée à superadmin.
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
import { creerAccesseurGeospatial, validerCoordonnees } from "../lib/geo.js";
import {
  resoudreDroitsEnLot,
  resoudreDroits,
  droitsPublics,
  droitPublicAccorde,
  idsServicesAvecDroit,
  debutDuJourUtc,
} from "../lib/droitsAssurance.js";
import {
  estAdminOuSuperadmin,
  estAgentDuServiceAssurance,
  peutGererServiceAssurance,
  serviceAssuranceDeLAgent,
} from "../lib/accesAssurance.js";
import { enregistrerVueFiche } from "../services/vuesFiche.service.js";
import { STATUTS_DEMANDE, notifierDemandeRecue } from "../services/portailAssurance.service.js";
import crypto from "crypto";
import bcrypt from "bcrypt"; // même bibliothèque que authentification.controller.js
import { estResponsableMoi, rattacherCompteConnecte } from "../services/rattachementAgent.service.js";
import { MESSAGE_CGU_REFUSEES, cguRefusees, enregistrerAcceptationsAuteur } from "../services/documentLegal.service.js";

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

// estAdminOuSuperadmin / estAgentDuServiceAssurance : voir lib/accesAssurance.js
// (partagés avec les contrôleurs d'abonnement — guide v3 §1.1.2).

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
 * schéma) : lecture/écriture/proximité passent par lib/geo.js, qui
 * factorise en un seul endroit le pattern SQL brut ($queryRaw /
 * $executeRaw) auparavant dupliqué ici une fois pour
 * ServiceAssurance.geolocalisation et une fois pour Agence.gps — voir
 * lib/geo.js pour le détail (validerCoordonnees, ST_X/ST_Y,
 * ST_SetSRID(ST_MakePoint(...)), ST_DWithin/ST_Distance).
 * =================================================================== */

const geoServiceAssurance = creerAccesseurGeospatial({
  table: "service_assurance",
  colonne: "geolocalisation",
  clePrimaire: "service_assurance_id",
});

const geoAgence = creerAccesseurGeospatial({
  table: "agence",
  colonne: "gps",
  clePrimaire: "agence_id",
});

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
  const geolocalisation = await geoServiceAssurance.recuperer(serviceAssurance.service_assurance_id);
  return avecUrlFichier({ ...serviceAssurance, geolocalisation });
}

/* ===================================================================
 * Filtrage de la fiche publique selon les droits d'abonnement
 * (guide abonnements assurances v3, §1.3.2)
 *
 * Le serveur décide : une fiche sans droit `siege_complet` n'expose que
 * la présence minimale. enrichirServiceAssurance est conservée telle
 * quelle ; le filtre s'applique APRÈS, et le format de réponse
 * (enveloppes service_assurance / services_assurance) reste inchangé.
 * =================================================================== */

// pays_id / ville_id : le modèle mobile les exige non nuls (voir guide §4.1.1)
const CHAMPS_MINIMAUX = [
  "service_assurance_id", "nom", "type_acteur", "statut_verification",
  "pays_id", "ville_id", "pays", "ville", "geolocalisation", "distance_km",
];

/**
 * Lecture d'un contenu annexe (activités, options, agences) d'une fiche :
 * l'admin et l'agent de la fiche lisent toujours (jeton facultatif,
 * authentifierOptionnel sur les GET) ; le public seulement si la fiche est
 * publiée et que son abonnement accorde le droit `cle` (guide v3, §1.4.1).
 */
async function lectureAutorisee(req, serviceAssuranceId, cle) {
  if (req.utilisateur && (await peutGererServiceAssurance(req.utilisateur, serviceAssuranceId))) return true;
  return droitPublicAccorde(serviceAssuranceId, cle);
}

/**
 * Ids des fiches dont le contenu `cle` est lisible par l'appelant.
 * null = aucun filtre (admin sans filtre de fiche).
 */
async function idsLisibles(req, serviceAssuranceId, cle) {
  if (serviceAssuranceId) {
    return (await lectureAutorisee(req, serviceAssuranceId, cle)) ? [serviceAssuranceId] : [];
  }
  if (estAdminOuSuperadmin(req.utilisateur)) return null;
  return idsServicesAvecDroit(cle);
}

export function filtrerFiche(fiche, droits) {
  if (droits.siege_complet) return fiche;
  const reduite = {};
  for (const c of CHAMPS_MINIMAUX) if (c in fiche) reduite[c] = fiche[c];
  return reduite;
  // Absents volontairement : telephone, email, agrement, description, file_url, image_url
}

/* ===================================================================
 * Recherche par proximité (query params ?lat=...&lng=...&rayon_km=...)
 *
 * Utilisée par listerServicesAssurance ET listerAgences : factorisée
 * ici plutôt que dupliquée, même logique que le reste du refactor
 * géospatial de ce fichier (voir lib/geo.js).
 * =================================================================== */

const RAYON_KM_PAR_DEFAUT = 10;

/**
 * Interprète les query params ?lat=...&lng=...&rayon_km=... communs à
 * listerServicesAssurance et listerAgences.
 * Retourne :
 *   { actif: false }                       -> ni lat ni lng fournis, liste "classique"
 *   { actif: false, erreur: "..." }        -> paramètres invalides, à renvoyer en 400
 *   { actif: true, latitude, longitude, rayonKm } -> recherche par proximité à effectuer
 */
function analyserParametresProximite({ lat, lng, rayon_km }) {
  const resultatCoord = validerCoordonnees(lat, lng);

  if (resultatCoord.statut === "inchange") {
    return { actif: false };
  }
  if (resultatCoord.statut === "erreur") {
    return { actif: false, erreur: resultatCoord.message };
  }
  // statut "effacement" (lat/lng explicitement à null) ne peut pas
  // survenir via des query params HTTP (toujours des chaînes ou
  // absents) — gardé par cohérence défensive avec validerCoordonnees.
  if (resultatCoord.statut === "effacement") {
    return { actif: false, erreur: "latitude et longitude doivent être des nombres." };
  }

  let rayonKm = RAYON_KM_PAR_DEFAUT;
  if (rayon_km !== undefined) {
    const rayonNum = typeof rayon_km === "string" ? Number(rayon_km) : rayon_km;
    if (typeof rayonNum !== "number" || Number.isNaN(rayonNum) || rayonNum <= 0) {
      return { actif: false, erreur: "rayon_km invalide (doit être un nombre strictement positif)." };
    }
    rayonKm = rayonNum;
  }

  return {
    actif: true,
    latitude: resultatCoord.latitude,
    longitude: resultatCoord.longitude,
    rayonKm,
  };
}

/* ===================================================================
 * Services d'assurance
 * =================================================================== */

/**
 * Applique les droits d'abonnement à une liste de fiches enrichies :
 * UNE seule requête (resoudreDroitsEnLot) pour toute la liste. Le tri
 * (pertinence > distance > nom) n'est pas modifié.
 */
async function appliquerDroitsALaListe(fiches) {
  const droitsParId = await resoudreDroitsEnLot(fiches.map((f) => f.service_assurance_id));
  return fiches.map((f) => {
    const { droits, statut_abonnement } = droitsParId.get(f.service_assurance_id);
    return { ...filtrerFiche(f, droits), droits: droitsPublics(droits), statut_abonnement };
  });
}

/**
 * GET /api/services-assurance
 * PUBLIQUE, sans authentification — même logique que Centre de santé /
 * Pharmacie : l'Annuaire Assurance doit être consultable avant
 * inscription.
 * Filtres optionnels : ?pays_id=...&ville_id=...&type_acteur=...
 *                      &recherche=...(nom, insensible à la casse)
 * Seules les fiches `publie` sont renvoyées (le paramètre statut_verification
 * est validé mais ne peut plus élargir le résultat ; voir le guide §1.1.4).
 * Chaque fiche porte `droits` et `statut_abonnement` ; sans droit
 * siege_complet, seuls les champs de CHAMPS_MINIMAUX sont renvoyés.
 * Recherche par proximité optionnelle : ?lat=...&lng=...&rayon_km=...
 * (voir analyserParametresProximite / lib/geo.js) — combinable avec les
 * filtres ci-dessus. lat/lng doivent être fournis ensemble ; rayon_km
 * est optionnel (défaut : 10 km). Quand elle est active, chaque fiche
 * renvoyée gagne un champ distance_km (arrondi à 1 décimale) et la
 * liste est triée par distance croissante plutôt que par nom.
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

    const proximite = analyserParametresProximite(req.query);
    if (proximite.erreur) {
      return res.status(400).json({ message: proximite.erreur });
    }

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (type_acteur) where.type_acteur = type_acteur;
    // Route PUBLIQUE : seules les fiches publiées sont visibles, quel que soit
    // le filtre demandé (guide §1.1.4). La liste complète, tous statuts,
    // relève de la route admin GET /api/admin/services-assurance (§1.4.3).
    where.statut_verification = "publie";
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };

    if (proximite.actif) {
      const proches = await geoServiceAssurance.rechercherParProximite({
        latitude: proximite.latitude,
        longitude: proximite.longitude,
        rayonKm: proximite.rayonKm,
        where,
      });

      if (!proches.length) {
        return res.status(200).json({ services_assurance: [] });
      }

      const ids = proches.map((p) => p.id);
      const distanceParId = new Map(proches.map((p) => [p.id, p.distance_km]));

      const servicesAssurance = await prisma.serviceAssurance.findMany({
        where: { service_assurance_id: { in: ids } },
        include: { pays: true, ville: true },
      });
      const serviceParId = new Map(servicesAssurance.map((s) => [s.service_assurance_id, s]));

      // rechercherParProximite fait déjà foi pour l'ordre (tri par
      // distance croissante) — findMany({ in: [...] }) ne garantit pas
      // l'ordre, donc on ré-ordonne explicitement selon `ids`.
      const resultat = [];
      for (const id of ids) {
        const service = serviceParId.get(id);
        if (!service) continue; // ligne supprimée entre les deux requêtes (rare, best effort)
        const enrichi = await enrichirServiceAssurance(service);
        resultat.push({ ...enrichi, distance_km: Math.round(distanceParId.get(id) * 10) / 10 });
      }

      return res.status(200).json({ services_assurance: await appliquerDroitsALaListe(resultat) });
    }

    const servicesAssurance = await prisma.serviceAssurance.findMany({
      where,
      include: { pays: true, ville: true },
      orderBy: { nom: "asc" },
    });

    const resultat = await Promise.all(servicesAssurance.map(enrichirServiceAssurance));

    return res.status(200).json({ services_assurance: await appliquerDroitsALaListe(resultat) });
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
    // 404 aussi pour une fiche non publiée : le public n'a pas à savoir qu'elle existe.
    if (!serviceAssurance || serviceAssurance.statut_verification !== "publie") {
      return res.status(404).json({ message: "Service d'assurance introuvable." });
    }

    const enrichi = await enrichirServiceAssurance(serviceAssurance);
    const { droits, statut_abonnement } = await resoudreDroits(serviceAssurance.service_assurance_id);

    // Compteur de vues (tableau de bord du portail) : l'agent de la fiche
    // et l'administration ne comptent pas. Sans attente, ne lève jamais.
    const gestionnaire = req.utilisateur
      ? await peutGererServiceAssurance(req.utilisateur, serviceAssurance.service_assurance_id)
      : false;
    enregistrerVueFiche({ req, type: "assurance", acteur_id: serviceAssurance.service_assurance_id, gestionnaire });

    return res.status(200).json({
      service_assurance: { ...filtrerFiche(enrichi, droits), droits: droitsPublics(droits), statut_abonnement },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/services-assurance/mon-service
 * Fiche gérée par l'utilisateur connecté (un agent = une fiche,
 * AgentAssurance.utilisateur_id unique). 404 si l'utilisateur n'est
 * l'agent d'aucune fiche. Sert au web/mobile à trouver l'espace de gestion.
 */
export async function obtenirMonServiceAssurance(req, res, next) {
  try {
    const serviceAssuranceId = await serviceAssuranceDeLAgent(req.utilisateur.utilisateur_id, req.utilisateur.espace);
    if (!serviceAssuranceId) {
      return res.status(404).json({ message: "Aucune fiche d'assurance rattachée à ce compte." });
    }
    const service = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: serviceAssuranceId },
      select: { service_assurance_id: true, nom: true, statut_verification: true, type_acteur: true, file_url: true },
    });
    // type_acteur + image_url : en-tête du portail assurance.
    const { file_url, ...reste } = service;
    return res.status(200).json({ service_assurance: { ...reste, image_url: construireUrl(file_url) } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/services-assurance/:id/gestion
 * Vue PROPRIÉTAIRE (guide v3, §1.4.2) : agent de la fiche ou admin.
 * Les GET publics renvoient [] hors droits ; cette route renvoie toujours
 * la fiche complète, ses activités et agences (données conservées même
 * sans abonnement : à la réactivation tout réapparaît sans ressaisie),
 * l'état de l'abonnement et les quotas.
 */
export async function obtenirGestionServiceAssurance(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererServiceAssurance(req.utilisateur, id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const serviceAssurance = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: id },
      include: { pays: true, ville: true },
    });
    if (!serviceAssurance) {
      return res.status(404).json({ message: "Service d'assurance introuvable." });
    }

    const [enrichi, resolution, activites, agences, historique, brouillon] = await Promise.all([
      enrichirServiceAssurance(serviceAssurance),
      resoudreDroits(id),
      prisma.activite.findMany({
        where: { service_assurance_id: id },
        include: { options: true },
        orderBy: { titre: "asc" },
      }),
      prisma.agence.findMany({ where: { service_assurance_id: id }, orderBy: { libelle: "asc" } }),
      prisma.abonnementAssurance.findMany({
        where: { service_assurance_id: id, statut: { not: "en_attente_paiement" } },
        include: {
          niveau: { select: { code: true, libelle: true, rang: true } },
          facture: { select: { facture_id: true, numero: true, date_emission: true } },
        },
        orderBy: { date_creation: "desc" },
      }),
      prisma.abonnementAssurance.findFirst({
        where: { service_assurance_id: id, statut: "en_attente_paiement" },
        include: { niveau: { select: { code: true, libelle: true } } },
      }),
    ]);
    const agencesEnrichies = await Promise.all(agences.map(enrichirAgence));

    const { droits, statut_abonnement, date_fin, en_grace, abonnement_id } = resolution;
    let niveau = null;
    let joursRestants = null;
    if (abonnement_id) {
      const courant = historique.find((a) => a.abonnement_id === abonnement_id);
      niveau = courant?.niveau ?? null;
    }
    if (statut_abonnement === "actif" && date_fin) {
      joursRestants = Math.round((date_fin - debutDuJourUtc()) / 86_400_000);
    }

    return res.status(200).json({
      service_assurance: enrichi,
      activites,
      agences: agencesEnrichies,
      droits,
      abonnement: {
        statut_abonnement,
        abonnement_id,
        niveau,
        date_fin,
        en_grace,
        jours_restants: joursRestants,
      },
      brouillon: brouillon
        ? {
            abonnement_id: brouillon.abonnement_id,
            niveau: brouillon.niveau,
            duree_mois: brouillon.duree_mois,
            montant_total: brouillon.montant_total,
            devise: brouillon.devise,
            date_creation: brouillon.date_creation,
          }
        : null,
      historique: historique.map((a) => ({
        abonnement_id: a.abonnement_id,
        niveau: a.niveau,
        duree_mois: a.duree_mois,
        date_debut: a.date_debut,
        date_fin: a.date_fin,
        statut: a.statut,
        origine: a.origine,
        montant_total: a.montant_total,
        devise: a.devise,
        facture: a.facture,
      })),
      quotas: {
        agences: { utilise: agences.length, max: droits.max_agences },
      },
    });
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
 * Champs latitude / longitude optionnels (voir lib/geo.js — geoServiceAssurance.appliquer).
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
    if (cguRefusees(req.body)) {
      return res.status(400).json({ message: MESSAGE_CGU_REFUSEES });
    }

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

    // fix : statut_verification est OPTIONNEL à la création — s'il est
    // absent, on applique le défaut "en_cours" plus bas (voir estAdmin).
    // Il ne doit donc pas figurer dans les champs strictement obligatoires.
    if (
      !nom || !pays_id || !ville_id || !telephone || !email || !email.trim() ||
      !agrement || !agrement.trim() || !type_acteur
    ) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, pays_id, ville_id, telephone, email, agrement, type_acteur.",
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
    // Responsable = auteur connecté : la fiche est rattachée à son compte
    // (rattachementAgent.service.js), aucun compte agent à créer.
    const responsableMoi = estResponsableMoi(req);
    if (!responsableMoi && (!fonction || !fonction.trim() ||
      !agent_nom || !agent_nom.trim() ||
      !agent_prenom || !agent_prenom.trim() ||
      !agent_email || !agent_email.trim()
    )) {
      return res.status(400).json({
        message:
          "Champs requis manquants pour l'agent du service d'assurance : fonction, agent_nom, agent_prenom, agent_email.",
      });
    }
    if (!responsableMoi && !REGEX_EMAIL.test(agent_email.trim())) {
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
    const emailAgentDisponible = responsableMoi || await verifierEmailAgentDisponible(agent_email.trim().toLowerCase());
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

    if (estAdmin && statut_verification && !STATUTS_VERIFICATION_ASSURANCE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_ASSURANCE.join(", ")}.`,
      });
    }
    // fix : si statut_verification n'est pas fourni (ou si l'appelant
    // n'est pas admin/superadmin), on applique le défaut "en_cours".
    const statutApplique = estAdmin && statut_verification ? statut_verification : "en_cours";

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
          responsableMoi
            ? await rattacherCompteConnecte(tx, {
              modele: "agentAssurance", fk: "service_assurance_id", id: service.service_assurance_id,
              utilisateur_id: req.utilisateur.utilisateur_id, fonction,
            })
            : await creerCompteAgentPourServiceAssurance(tx, {
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

    await enregistrerAcceptationsAuteur(req, "creation_assurance");

    const erreurGeo = await geoServiceAssurance.appliquer(serviceCree.service_assurance_id, latitude, longitude);

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
      // Fiche rattachée au compte connecté : nouvel espace, aucun secret.
      rattache_au_compte: responsableMoi,
    };

    if (erreurGeo) {
      return res.status(201).json({
        message: `Service d'assurance créé avec succès. Avertissement : ${erreurGeo}`,
        service_assurance: serviceAssurance,
        agent: reponseAgent,
      });
    }

    return res.status(201).json({
      message: responsableMoi
        ? "Service d'assurance créé avec succès. Elle est rattachée à votre compte : retrouvez-la dans « Changer d’espace »."
        : "Service d'assurance créé avec succès. Compte agent créé — communiquez-lui le mot de passe temporaire.",
      service_assurance: serviceAssurance,
      agent: reponseAgent,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/services-assurance/:id
 * multipart/form-data — réservé à l'agent de la fiche et à admin/superadmin.
 * Le statut de vérification est conservé (voir plus bas). Ne touche jamais au compte agent (déjà créé une
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
    // Réservé à l'agent de la fiche et à l'administration (avant : tout
    // utilisateur connecté pouvait modifier n'importe quelle fiche).
    if (!(await peutGererServiceAssurance(req.utilisateur, existant.service_assurance_id))) {
      return res.status(403).json({
        message: "Seul l'agent de ce service d'assurance ou un administrateur peut modifier la fiche.",
      });
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

    // Seuls admin/superadmin choisissent statut_verification. Une
    // modification de l'agent ne repasse PLUS la fiche en vérification
    // (décision du 2026-10-18 : inutilement bloquant, la fiche disparaissait
    // du public) : son statut est conservé. Seule exception : une fiche
    // « non_publie » modifiée par son agent est re-soumise (« en_cours »).
    const estAdmin = estAdminOuSuperadmin(req.utilisateur);

    if (estAdmin && statut_verification && !STATUTS_VERIFICATION_ASSURANCE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_ASSURANCE.join(", ")}.`,
      });
    }
    let statutApplique = existant.statut_verification;
    if (estAdmin && statut_verification) statutApplique = statut_verification;
    else if (!estAdmin && existant.statut_verification === "non_publie") statutApplique = "en_cours";

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

    const erreurGeo = await geoServiceAssurance.appliquer(serviceAssurance.service_assurance_id, latitude, longitude);
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
 * Activités (catalogue produits d'un service d'assurance)
 *
 * v8 : nouveau sous-module — chaque service d'assurance propose un
 * catalogue d'activités (ex. "Activa Santé Individuelle" / public_cible
 * "Particuliers et familles"), chacune pouvant porter ses propres
 * options (voir OptionActivite plus bas). Lecture publique (même
 * logique que service_assurance) ; écriture réservée à l'agent du
 * service concerné ou à admin/superadmin.
 * =================================================================== */

/**
 * GET /api/activites?service_assurance_id=...
 * PUBLIQUE. Filtre optionnel par service_assurance_id ; sans filtre,
 * retourne le catalogue des seules fiches ayant le droit
 * `afficher_activites` (guide abonnements v3, §1.4.1). Une fiche sans ce
 * droit renvoie [] : son propriétaire lit ses activités via
 * GET /services-assurance/:id/gestion.
 */
export async function listerActivites(req, res, next) {
  try {
    const { service_assurance_id } = req.query;

    const ids = await idsLisibles(req, service_assurance_id, "afficher_activites");
    if (ids && !ids.length) {
      return res.status(200).json({ activites: [] });
    }

    const activites = await prisma.activite.findMany({
      where: ids ? { service_assurance_id: { in: ids } } : {},
      include: { options: true },
      orderBy: { titre: "asc" },
    });

    return res.status(200).json({ activites });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/activites/:id
 * PUBLIQUE. 404 si la fiche propriétaire n'a pas le droit `afficher_activites`.
 */
export async function obtenirActivite(req, res, next) {
  try {
    const activite = await prisma.activite.findUnique({
      where: { activite_id: req.params.id },
      include: { options: true },
    });
    if (!activite || !(await lectureAutorisee(req, activite.service_assurance_id, "afficher_activites"))) {
      return res.status(404).json({ message: "Activité introuvable." });
    }
    return res.status(200).json({ activite });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/activites
 * Réservée à l'agent du service_assurance concerné (service_assurance_id
 * fourni dans le corps) ou à admin/superadmin.
 * Champs requis : service_assurance_id, titre, public_cible.
 * Champ optionnel : description.
 */
export async function creerActivite(req, res, next) {
  try {
    const { service_assurance_id, titre, public_cible, description } = req.body;

    if (!service_assurance_id || !titre || !titre.trim() || !public_cible || !public_cible.trim()) {
      return res.status(400).json({
        message: "Champs requis manquants : service_assurance_id, titre, public_cible.",
      });
    }

    const service = await prisma.serviceAssurance.findUnique({ where: { service_assurance_id } });
    if (!service) {
      return res.status(400).json({ message: "service_assurance_id introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const activite = await prisma.activite.create({
      data: {
        service_assurance_id,
        titre: titre.trim(),
        public_cible: public_cible.trim(),
        description: description?.trim() || null,
      },
    });

    return res.status(201).json({ message: "Activité créée.", activite });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/activites/:id
 * Réservée à l'agent du service d'assurance propriétaire de l'activité,
 * ou à admin/superadmin. Ne permet pas de déplacer l'activité vers un
 * autre service_assurance_id (le champ n'est pas modifiable ici).
 */
export async function modifierActivite(req, res, next) {
  try {
    const { titre, public_cible, description } = req.body;

    const existante = await prisma.activite.findUnique({ where: { activite_id: req.params.id } });
    if (!existante) {
      return res.status(404).json({ message: "Activité introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, existante.service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const activite = await prisma.activite.update({
      where: { activite_id: req.params.id },
      data: {
        ...(titre && { titre: titre.trim() }),
        ...(public_cible && { public_cible: public_cible.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    });

    return res.status(200).json({ message: "Activité mise à jour.", activite });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/activites/:id
 * Réservée à l'agent du service d'assurance propriétaire, ou à
 * admin/superadmin. Bloquée si des options y sont encore rattachées
 * (même principe que supprimerServiceAssurance : supprimer les options
 * d'abord).
 */
export async function supprimerActivite(req, res, next) {
  try {
    const existante = await prisma.activite.findUnique({ where: { activite_id: req.params.id } });
    if (!existante) {
      return res.status(404).json({ message: "Activité introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, existante.service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const nbOptions = await prisma.optionActivite.count({ where: { activite_id: req.params.id } });
    if (nbOptions > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbOptions} option(s) encore rattachée(s) à cette activité.`,
      });
    }

    await prisma.activite.delete({ where: { activite_id: req.params.id } });

    return res.status(200).json({ message: "Activité supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Options d'activité
 *
 * Rattachées à une activité (et non directement à l'assurance) — ex.
 * "Hospitalisation", "Consultations & pharmacie", "Maternité". Même
 * logique d'autorisation que Activité, déduite indirectement du
 * service_assurance propriétaire de l'activité parente.
 * =================================================================== */

async function obtenirServiceAssuranceIdDeLActivite(activiteId) {
  const activite = await prisma.activite.findUnique({
    where: { activite_id: activiteId },
    select: { service_assurance_id: true },
  });
  return activite?.service_assurance_id ?? null;
}

/**
 * GET /api/options-activite?activite_id=...
 * PUBLIQUE. activite_id requis : pas de liste globale non filtrée,
 * même principe que listerMisesEnRelationAssurance.
 */
export async function listerOptionsActivite(req, res, next) {
  try {
    const { activite_id } = req.query;
    if (!activite_id) {
      return res.status(400).json({ message: "Paramètre requis : activite_id." });
    }

    // Le droit se lit sur la fiche de l'activité parente (guide v3, §1.4.1).
    const serviceAssuranceId = await obtenirServiceAssuranceIdDeLActivite(activite_id);
    if (!serviceAssuranceId || !(await lectureAutorisee(req, serviceAssuranceId, "afficher_activites"))) {
      return res.status(200).json({ options_activite: [] });
    }

    const options = await prisma.optionActivite.findMany({
      where: { activite_id },
      orderBy: { libelle: "asc" },
    });

    return res.status(200).json({ options_activite: options });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/options-activite/:id
 * PUBLIQUE.
 */
export async function obtenirOptionActivite(req, res, next) {
  try {
    const option = await prisma.optionActivite.findUnique({
      where: { option_activite_id: req.params.id },
    });
    const serviceAssuranceId = option ? await obtenirServiceAssuranceIdDeLActivite(option.activite_id) : null;
    if (!option || !serviceAssuranceId || !(await lectureAutorisee(req, serviceAssuranceId, "afficher_activites"))) {
      return res.status(404).json({ message: "Option d'activité introuvable." });
    }
    return res.status(200).json({ option_activite: option });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/options-activite
 * Réservée à l'agent du service d'assurance propriétaire de l'activité
 * parente (activite_id fourni dans le corps), ou à admin/superadmin.
 * Champs requis : activite_id, libelle. Champ optionnel : description.
 */
export async function creerOptionActivite(req, res, next) {
  try {
    const { activite_id, libelle, description } = req.body;

    if (!activite_id || !libelle || !libelle.trim()) {
      return res.status(400).json({ message: "Champs requis manquants : activite_id, libelle." });
    }

    const serviceAssuranceId = await obtenirServiceAssuranceIdDeLActivite(activite_id);
    if (!serviceAssuranceId) {
      return res.status(400).json({ message: "activite_id introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, serviceAssuranceId))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const option = await prisma.optionActivite.create({
      data: {
        activite_id,
        libelle: libelle.trim(),
        description: description?.trim() || null,
      },
    });

    return res.status(201).json({ message: "Option d'activité créée.", option_activite: option });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/options-activite/:id
 * Réservée à l'agent du service d'assurance propriétaire (via
 * l'activité parente), ou à admin/superadmin. Ne permet pas de
 * déplacer l'option vers une autre activité.
 */
export async function modifierOptionActivite(req, res, next) {
  try {
    const { libelle, description } = req.body;

    const existante = await prisma.optionActivite.findUnique({
      where: { option_activite_id: req.params.id },
    });
    if (!existante) {
      return res.status(404).json({ message: "Option d'activité introuvable." });
    }

    const serviceAssuranceId = await obtenirServiceAssuranceIdDeLActivite(existante.activite_id);

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, serviceAssuranceId))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const option = await prisma.optionActivite.update({
      where: { option_activite_id: req.params.id },
      data: {
        ...(libelle && { libelle: libelle.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    });

    return res.status(200).json({ message: "Option d'activité mise à jour.", option_activite: option });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/options-activite/:id
 * Réservée à l'agent du service d'assurance propriétaire (via
 * l'activité parente), ou à admin/superadmin.
 */
export async function supprimerOptionActivite(req, res, next) {
  try {
    const existante = await prisma.optionActivite.findUnique({
      where: { option_activite_id: req.params.id },
    });
    if (!existante) {
      return res.status(404).json({ message: "Option d'activité introuvable." });
    }

    const serviceAssuranceId = await obtenirServiceAssuranceIdDeLActivite(existante.activite_id);

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, serviceAssuranceId))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    await prisma.optionActivite.delete({ where: { option_activite_id: req.params.id } });

    return res.status(200).json({ message: "Option d'activité supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Agences (implantations physiques d'un service d'assurance)
 *
 * Ex. "Agence Douala — Akwa (Siège)". Une assurance possède N agences ;
 * une agence appartient à une seule assurance. gps suit le même patron
 * que ServiceAssurance.geolocalisation (GEOGRAPHY(POINT,4326)),
 * factorisé dans lib/geo.js (voir geoAgence, déclaré plus haut aux
 * côtés de geoServiceAssurance).
 * =================================================================== */

async function enrichirAgence(agence) {
  const gps = await geoAgence.recuperer(agence.agence_id);
  return { ...agence, gps };
}

/**
 * GET /api/agences?service_assurance_id=...
 * PUBLIQUE. Filtre optionnel par service_assurance_id.
 * Recherche par proximité optionnelle : ?lat=...&lng=...&rayon_km=...
 * (même contrat que listerServicesAssurance — voir
 * analyserParametresProximite / lib/geo.js), utile par exemple pour
 * retrouver l'agence la plus proche d'un point donné. Combinable avec
 * service_assurance_id. Quand elle est active, chaque agence renvoyée
 * gagne un champ distance_km (arrondi à 1 décimale) et la liste est
 * triée par distance croissante plutôt que par libellé.
 * Droits d'abonnement (guide v3, §1.4.1) : seules les agences des fiches
 * ayant le droit `afficher_agences` sont renvoyées, filtre appliqué dans
 * le `where` AVANT la recherche par proximité.
 */
export async function listerAgences(req, res, next) {
  try {
    const { service_assurance_id } = req.query;

    const proximite = analyserParametresProximite(req.query);
    if (proximite.erreur) {
      return res.status(400).json({ message: proximite.erreur });
    }

    const ids = await idsLisibles(req, service_assurance_id, "afficher_agences");
    if (ids && !ids.length) {
      return res.status(200).json({ agences: [] });
    }

    const where = ids ? { service_assurance_id: { in: ids } } : {};

    if (proximite.actif) {
      const proches = await geoAgence.rechercherParProximite({
        latitude: proximite.latitude,
        longitude: proximite.longitude,
        rayonKm: proximite.rayonKm,
        where,
      });

      if (!proches.length) {
        return res.status(200).json({ agences: [] });
      }

      const ids = proches.map((p) => p.id);
      const distanceParId = new Map(proches.map((p) => [p.id, p.distance_km]));

      const agences = await prisma.agence.findMany({
        where: { agence_id: { in: ids } },
      });
      const agenceParId = new Map(agences.map((a) => [a.agence_id, a]));

      const resultat = [];
      for (const id of ids) {
        const agence = agenceParId.get(id);
        if (!agence) continue; // ligne supprimée entre les deux requêtes (rare, best effort)
        const enrichi = await enrichirAgence(agence);
        resultat.push({ ...enrichi, distance_km: Math.round(distanceParId.get(id) * 10) / 10 });
      }

      return res.status(200).json({ agences: resultat });
    }

    const agences = await prisma.agence.findMany({
      where,
      orderBy: { libelle: "asc" },
    });

    const resultat = await Promise.all(agences.map(enrichirAgence));

    return res.status(200).json({ agences: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agences/:id
 * PUBLIQUE. 404 si la fiche propriétaire n'a pas le droit `afficher_agences`.
 */
export async function obtenirAgence(req, res, next) {
  try {
    const agence = await prisma.agence.findUnique({ where: { agence_id: req.params.id } });
    if (!agence || !(await lectureAutorisee(req, agence.service_assurance_id, "afficher_agences"))) {
      return res.status(404).json({ message: "Agence introuvable." });
    }

    const resultat = await enrichirAgence(agence);
    return res.status(200).json({ agence: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agences
 * Réservée à l'agent du service_assurance concerné (service_assurance_id
 * fourni dans le corps), ou à admin/superadmin.
 * Champs requis : service_assurance_id, libelle, localisation, contact.
 * Champs optionnels : latitude, longitude (voir lib/geo.js — geoAgence.appliquer).
 */
export async function creerAgence(req, res, next) {
  try {
    const { service_assurance_id, libelle, localisation, contact, latitude, longitude } = req.body;

    if (
      !service_assurance_id || !libelle || !libelle.trim() ||
      !localisation || !localisation.trim() || !contact || !contact.trim()
    ) {
      return res.status(400).json({
        message: "Champs requis manquants : service_assurance_id, libelle, localisation, contact.",
      });
    }

    const service = await prisma.serviceAssurance.findUnique({ where: { service_assurance_id } });
    if (!service) {
      return res.status(400).json({ message: "service_assurance_id introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    // Quota d'agences du niveau d'abonnement (guide v3, §1.4.1). Sans
    // abonnement, max_agences vaut 0 : il faut souscrire avant de saisir.
    // L'admin n'est pas limité.
    if (!estAdmin) {
      const { droits } = await resoudreDroits(service_assurance_id);
      if (droits.max_agences !== null) {
        const n = await prisma.agence.count({ where: { service_assurance_id } });
        if (n >= droits.max_agences) {
          return res.status(409).json({
            code: "QUOTA_ATTEINT",
            message: "Quota d'agences atteint pour votre niveau d'abonnement.",
          });
        }
      }
    }

    const agence = await prisma.agence.create({
      data: {
        service_assurance_id,
        libelle: libelle.trim(),
        localisation: localisation.trim(),
        contact: contact.trim(),
      },
    });

    const erreurGps = await geoAgence.appliquer(agence.agence_id, latitude, longitude);

    const resultat = await enrichirAgence(agence);

    if (erreurGps) {
      return res.status(201).json({
        message: `Agence créée avec succès. Avertissement : ${erreurGps}`,
        agence: resultat,
      });
    }

    return res.status(201).json({ message: "Agence créée avec succès.", agence: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/agences/:id
 * Réservée à l'agent du service d'assurance propriétaire, ou à
 * admin/superadmin. Ne permet pas de déplacer l'agence vers un autre
 * service_assurance_id.
 */
export async function modifierAgence(req, res, next) {
  try {
    const { libelle, localisation, contact, latitude, longitude } = req.body;

    const existante = await prisma.agence.findUnique({ where: { agence_id: req.params.id } });
    if (!existante) {
      return res.status(404).json({ message: "Agence introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, existante.service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    const agence = await prisma.agence.update({
      where: { agence_id: req.params.id },
      data: {
        ...(libelle && { libelle: libelle.trim() }),
        ...(localisation && { localisation: localisation.trim() }),
        ...(contact && { contact: contact.trim() }),
      },
    });

    const erreurGps = await geoAgence.appliquer(agence.agence_id, latitude, longitude);
    if (erreurGps) {
      return res.status(400).json({ message: erreurGps });
    }

    const resultat = await enrichirAgence(agence);
    return res.status(200).json({ message: "Agence mise à jour.", agence: resultat });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/agences/:id
 * Réservée à l'agent du service d'assurance propriétaire, ou à
 * admin/superadmin.
 */
export async function supprimerAgence(req, res, next) {
  try {
    const existante = await prisma.agence.findUnique({ where: { agence_id: req.params.id } });
    if (!existante) {
      return res.status(404).json({ message: "Agence introuvable." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (!estAdmin && !(await estAgentDuServiceAssurance(req.utilisateur, existante.service_assurance_id))) {
      return res.status(403).json({
        message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
      });
    }

    await prisma.agence.delete({ where: { agence_id: req.params.id } });

    return res.status(200).json({ message: "Agence supprimée." });
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

    // Portail assurance : filtres facultatifs ?statut=...&recherche=... et
    // pagination facultative ?page=&limite= (sans `limite`, tout est
    // renvoyé — comportement historique du back-office et du mobile).
    const { statut, recherche } = req.query;
    if (statut && !STATUTS_DEMANDE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_DEMANDE.join(", ")}.` });
    }
    const where = { service_assurance_id };
    if (statut) where.statut = statut;
    const terme = typeof recherche === "string" ? recherche.trim() : "";
    if (terme) {
      where.OR = [
        { message: { contains: terme, mode: "insensitive" } },
        { utilisateur: { nom: { contains: terme, mode: "insensitive" } } },
        { utilisateur: { prenom: { contains: terme, mode: "insensitive" } } },
        { utilisateur: { email: { contains: terme, mode: "insensitive" } } },
      ];
    }
    const limite = req.query.limite ? Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 20, 1), 100) : null;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const [misesEnRelation, total, parStatut] = await Promise.all([
      prisma.miseEnRelation.findMany({
        where,
        include: {
          utilisateur: { select: { nom: true, prenom: true, email: true, telephone: true } },
        },
        orderBy: { date_creation: "desc" },
        ...(limite && { take: limite, skip: (page - 1) * limite }),
      }),
      prisma.miseEnRelation.count({ where }),
      prisma.miseEnRelation.groupBy({
        by: ["statut"],
        where: { service_assurance_id },
        _count: { _all: true },
      }),
    ]);
    const compteurs = Object.fromEntries(STATUTS_DEMANDE.map((s) => [s, 0]));
    for (const l of parStatut) compteurs[l.statut] = l._count._all;

    return res.status(200).json({
      mises_en_relation: misesEnRelation,
      total,
      page: limite ? page : 1,
      limite,
      compteurs,
    });
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

    // Formulaire de contact réservé aux fiches publiées dont l'abonnement
    // l'inclut (guide v3, §1.4.1) : le front masque le formulaire, le
    // serveur refuse quand même (abonnement expiré pendant la consultation,
    // appel direct à l'API).
    if (!(await droitPublicAccorde(service_assurance_id, "formulaire_contact"))) {
      return res.status(403).json({
        code: "PRESENCE_MINIMALE",
        message: "La mise en relation n'est pas disponible pour cette fiche.",
      });
    }

    const miseEnRelation = await prisma.miseEnRelation.create({
      data: {
        utilisateur_id: req.utilisateur.utilisateur_id,
        service_assurance_id,
        message: message.trim(),
      },
    });
    // Cloche du portail assurance (ne lève jamais).
    await notifierDemandeRecue(miseEnRelation);

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