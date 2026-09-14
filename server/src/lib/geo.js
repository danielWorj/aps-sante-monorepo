// src/lib/geo.js
//
// Point d'accès UNIQUE aux colonnes PostGIS `geography(Point, 4326)`
// déclarées `Unsupported(...)` dans schema.prisma (ServiceAssurance.geolocalisation,
// Agence.gps, et — chantiers séparés à venir — Pharmacie.geolocalisation,
// StructureSante/CentreSante.geolocalisation, Medecin.*).
//
// Contexte : Prisma Client ne sait ni lire ni écrire un type
// `Unsupported(...)`, donc toute manipulation de ces colonnes passe par
// `$queryRaw` / `$executeRaw`. Avant ce module, ce pattern (valider un
// couple latitude/longitude, poser le point via ST_SetSRID(ST_MakePoint),
// le relire via ST_X/ST_Y, l'effacer avec NULL) était recopié à
// l'identique pour chaque colonne géolocalisée — voir l'historique de
// assurance.controller.js, qui le duplique une fois pour
// ServiceAssurance.geolocalisation et une fois pour Agence.gps.
//
// Ce module factorise ce pattern une bonne fois pour toutes, en le
// paramétrant par (table, colonne, clé primaire), et ajoute la brique
// qui manquait complètement dans le dépôt : la recherche par proximité
// (ST_DWithin + ST_Distance), rendue possible en pratique par l'index
// GIST créé dans la migration 20260914120000_index_gist_geolocalisation_assurance
// (sans cet index, ST_DWithin/ST_Distance déclenchent un Seq Scan complet).
//
// Portée : module strictement générique, sans dépendance à un modèle
// métier particulier. Le module Assurance (ServiceAssurance, Agence)
// est le premier appelant ; Pharmacie / Centre de santé / Médecin sont
// prévus pour brancher dessus plus tard, sans dupliquer ce fichier.
//
// Hypothèse portée par tout ce module : la clé primaire de la table
// ciblée est de type `uuid` (`@db.Uuid`), comme c'est le cas pour
// TOUTES les tables géolocalisées actuelles du schéma (service_assurance_id,
// agence_id, pharmacie_id, structure_id, medecin_id) — d'où le
// `::uuid` explicite dans les requêtes ci-dessous, à l'identique de ce
// que fait déjà assurance.controller.js.

import prisma from "./prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

/* ===================================================================
 * Garde-fous internes
 *
 * `table`, `colonne`, `clePrimaire` et les clés d'un éventuel `where`
 * sont toujours des constantes fournies par le code appelant (jamais
 * de valeur utilisateur) : elles doivent être interpolées "en dur"
 * dans le SQL brut (identifiants, pas de placeholder possible côté
 * pg pour un nom de table/colonne). Cette validation est une défense
 * en profondeur — elle protège contre une régression future (un nom
 * de colonne qui finirait, par erreur, par venir d'une requête HTTP),
 * pas contre un usage normal du module.
 * =================================================================== */

const IDENTIFIANT_SQL_VALIDE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validerIdentifiantSql(valeur, libelle) {
  if (typeof valeur !== "string" || !IDENTIFIANT_SQL_VALIDE.test(valeur)) {
    throw new Error(
      `geo.js : ${libelle} invalide ("${valeur}") — doit être un identifiant SQL simple (lettres, chiffres, underscore).`
    );
  }
  return valeur;
}

function identifiantSql(valeur, libelle) {
  validerIdentifiantSql(valeur, libelle);
  return Prisma.raw(`"${valeur}"`);
}

/* ===================================================================
 * Validation d'un couple latitude/longitude
 *
 * Même contrat que appliquerGeolocalisation / appliquerGpsAgence dans
 * assurance.controller.js (à fusionner vers ce module lors du
 * refactor du contrôleur) :
 *   - aucun des deux champs présent dans le corps de requête -> ne
 *     touche à rien ("inchange")
 *   - les deux présents et valant `null` -> effacer le point
 *     ("effacement")
 *   - les deux présents avec des coordonnées -> valider puis renvoyer
 *     des nombres ("valide")
 *   - un seul des deux présent, ou valeurs hors bornes / non
 *     numériques -> erreur métier ("erreur"), jamais d'exception : au
 *     contrôleur de la transformer en réponse HTTP 400.
 *
 * Gère explicitement le cas des endpoints multipart/form-data (ex.
 * POST /services-assurance avec upload d'image) où latitude/longitude
 * arrivent en `string` ("4.05") même après un parseFloat() côté
 * client, FormData forçant la conversion en texte.
 * =================================================================== */

/**
 * @param {*} latitude  valeur brute reçue (number, string, null ou undefined)
 * @param {*} longitude valeur brute reçue (number, string, null ou undefined)
 * @returns
 *   { statut: "inchange" } |
 *   { statut: "effacement" } |
 *   { statut: "valide", latitude: number, longitude: number } |
 *   { statut: "erreur", message: string }
 */
export function validerCoordonnees(latitude, longitude) {
  const latFournie = latitude !== undefined;
  const lngFournie = longitude !== undefined;

  if (!latFournie && !lngFournie) {
    return { statut: "inchange" };
  }

  if (latFournie !== lngFournie) {
    return { statut: "erreur", message: "latitude et longitude doivent être fournies ensemble." };
  }

  if (latitude === null && longitude === null) {
    return { statut: "effacement" };
  }

  // Coercition des chaînes numériques ("4.05") avant validation du
  // type — voir le commentaire "fix" équivalent dans
  // appliquerGeolocalisation (assurance.controller.js).
  const latNum = typeof latitude === "string" && latitude.trim() !== "" ? Number(latitude) : latitude;
  const lngNum = typeof longitude === "string" && longitude.trim() !== "" ? Number(longitude) : longitude;

  if (
    typeof latNum !== "number" || Number.isNaN(latNum) ||
    typeof lngNum !== "number" || Number.isNaN(lngNum)
  ) {
    return { statut: "erreur", message: "latitude et longitude doivent être des nombres." };
  }
  if (latNum < -90 || latNum > 90) {
    return { statut: "erreur", message: "latitude invalide (doit être comprise entre -90 et 90)." };
  }
  if (lngNum < -180 || lngNum > 180) {
    return { statut: "erreur", message: "longitude invalide (doit être comprise entre -180 et 180)." };
  }

  return { statut: "valide", latitude: latNum, longitude: lngNum };
}

/* ===================================================================
 * Lecture / écriture / effacement d'un point — génériques
 *
 * Paramétrées par { table, colonne, clePrimaire } : ce triplet décrit
 * sans ambiguïté une colonne geography(Point,4326) donnée
 * (ex. { table: "service_assurance", colonne: "geolocalisation",
 * clePrimaire: "service_assurance_id" } ou { table: "agence", colonne:
 * "gps", clePrimaire: "agence_id" }).
 * =================================================================== */

/**
 * Relit un point et le renvoie sous forme { latitude, longitude }, ou
 * `null` si la ligne n'existe pas ou si le point n'est pas défini.
 */
export async function recupererPoint({ table, colonne, clePrimaire, id }) {
  const tableSql = identifiantSql(table, "table");
  const colonneSql = identifiantSql(colonne, "colonne");
  const clePrimaireSql = identifiantSql(clePrimaire, "clePrimaire");

  const resultat = await prisma.$queryRaw`
    SELECT ST_Y(${colonneSql}::geometry) AS latitude,
           ST_X(${colonneSql}::geometry) AS longitude
    FROM ${tableSql}
    WHERE ${clePrimaireSql} = ${id}::uuid
      AND ${colonneSql} IS NOT NULL
  `;

  if (!resultat.length) return null;

  const { latitude, longitude } = resultat[0];
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

/**
 * Pose (ou remplace) le point. `latitude`/`longitude` doivent déjà
 * être des nombres validés (voir validerCoordonnees) — cette fonction
 * ne revalide rien, elle écrit tel quel.
 */
export async function definirPoint({ table, colonne, clePrimaire, id, latitude, longitude }) {
  const tableSql = identifiantSql(table, "table");
  const colonneSql = identifiantSql(colonne, "colonne");
  const clePrimaireSql = identifiantSql(clePrimaire, "clePrimaire");

  await prisma.$executeRaw`
    UPDATE ${tableSql}
    SET ${colonneSql} = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
    WHERE ${clePrimaireSql} = ${id}::uuid
  `;
}

/**
 * Efface le point (SET ... = NULL).
 */
export async function effacerPoint({ table, colonne, clePrimaire, id }) {
  const tableSql = identifiantSql(table, "table");
  const colonneSql = identifiantSql(colonne, "colonne");
  const clePrimaireSql = identifiantSql(clePrimaire, "clePrimaire");

  await prisma.$executeRaw`
    UPDATE ${tableSql}
    SET ${colonneSql} = NULL
    WHERE ${clePrimaireSql} = ${id}::uuid
  `;
}

/**
 * Combine validerCoordonnees + définition/effacement, avec le même
 * contrat de retour que appliquerGeolocalisation / appliquerGpsAgence
 * dans assurance.controller.js : `null` si tout s'est bien passé (ou
 * si rien n'était à faire), sinon un message d'erreur (string) à
 * renvoyer tel quel en HTTP 400 par le contrôleur appelant.
 *
 * Exemple d'appel (équivalent à l'actuel appliquerGeolocalisation) :
 *   const erreur = await appliquerPoint({
 *     table: "service_assurance",
 *     colonne: "geolocalisation",
 *     clePrimaire: "service_assurance_id",
 *     id: serviceAssuranceId,
 *     latitude,
 *     longitude,
 *   });
 */
export async function appliquerPoint({ table, colonne, clePrimaire, id, latitude, longitude }) {
  const resultat = validerCoordonnees(latitude, longitude);

  switch (resultat.statut) {
    case "inchange":
      return null;
    case "erreur":
      return resultat.message;
    case "effacement":
      await effacerPoint({ table, colonne, clePrimaire, id });
      return null;
    case "valide":
      await definirPoint({
        table,
        colonne,
        clePrimaire,
        id,
        latitude: resultat.latitude,
        longitude: resultat.longitude,
      });
      return null;
    default:
      return null;
  }
}

/* ===================================================================
 * Traduction minimale d'un `where` Prisma "à plat" en SQL brut
 *
 * Volontairement NON générique à 100 % : on ne traduit que les formes
 * de filtre déjà utilisées par les contrôleurs annuaire de ce dépôt
 * (voir listerServicesAssurance) —
 *   - égalité simple :         { pays_id: "..." }
 *   - recherche texte :        { nom: { contains: "...", mode: "insensitive" } }
 *   - valeur absente :         ignorée (comme Prisma le fait pour `undefined`)
 *   - `null` explicite :       { champ: null } -> IS NULL
 *
 * Toute autre forme (AND/OR/NOT imbriqués, `in`, `gte`, tableaux...)
 * fait volontairement échouer bruyamment plutôt que d'être ignorée en
 * silence : un filtre silencieusement perdu produirait des résultats
 * de proximité incorrects (trop larges) sans qu'aucune erreur ne le
 * signale. Si un futur contrôleur (pharmacie, centre de santé,
 * médecin) a besoin d'un filtre plus riche, il faudra étendre cette
 * fonction en connaissance de cause, pas contourner cette garde.
 *
 * Chaque colonne est castée en ::text des deux côtés de la comparaison
 * pour rester agnostique du type réel de la colonne (uuid, enum
 * Postgres, varchar...) sans avoir à le connaître ici.
 * =================================================================== */

function traduireWherePrismaSimple(where) {
  const conditions = [];

  for (const [champ, valeurBrute] of Object.entries(where || {})) {
    if (valeurBrute === undefined) continue;

    const champSql = identifiantSql(champ, "colonne de filtre (where)");

    if (valeurBrute === null) {
      conditions.push(Prisma.sql`${champSql}::text IS NULL`);
      continue;
    }

    if (typeof valeurBrute === "object" && "contains" in valeurBrute) {
      const motif = `%${valeurBrute.contains}%`;
      conditions.push(
        valeurBrute.mode === "insensitive"
          ? Prisma.sql`${champSql}::text ILIKE ${motif}`
          : Prisma.sql`${champSql}::text LIKE ${motif}`
      );
      continue;
    }

    if (typeof valeurBrute === "object") {
      throw new Error(
        `geo.js : filtre "where.${champ}" non supporté par rechercherParProximite — ` +
          `seules l'égalité simple ({ ${champ}: valeur }) et la recherche texte ` +
          `({ ${champ}: { contains, mode: "insensitive" } }) sont prises en charge.`
      );
    }

    conditions.push(Prisma.sql`${champSql}::text = ${String(valeurBrute)}`);
  }

  return conditions;
}

/* ===================================================================
 * Recherche par proximité
 *
 * Nécessite l'index GIST posé par la migration
 * 20260914120000_index_gist_geolocalisation_assurance pour rester
 * performant (sinon Seq Scan + calcul de distance ligne par ligne).
 *
 * - ST_DWithin(...::geography, ..., rayon_en_mètres) fait le filtrage :
 *   c'est la forme que l'index GIST sait exploiter efficacement
 *   (contrairement à un simple ST_Distance(...) < rayon dans le WHERE).
 * - ST_Distance(...) calcule ensuite la distance exacte pour le tri.
 * - Le `where` optionnel vient s'ajouter en AND (voir
 *   traduireWherePrismaSimple) pour combiner proximité + filtres
 *   classiques (pays_id, ville_id, type_acteur, statut_verification,
 *   recherche sur le nom...), exactement comme listerServicesAssurance
 *   le fait aujourd'hui sans la dimension géographique.
 * =================================================================== */

/**
 * @param {object} params
 * @param {string} params.table        nom de la table SQL (ex. "service_assurance")
 * @param {string} params.colonne      colonne geography(Point,4326) (ex. "geolocalisation")
 * @param {string} params.clePrimaire  colonne de clé primaire, de type uuid (ex. "service_assurance_id")
 * @param {number|string} params.latitude   latitude du point de référence (-90..90)
 * @param {number|string} params.longitude  longitude du point de référence (-180..180)
 * @param {number|string} params.rayonKm    rayon de recherche, en kilomètres, > 0
 * @param {object} [params.where]      filtres additionnels "à plat" (voir traduireWherePrismaSimple)
 * @param {number} [params.limite]     nombre maximum de résultats (optionnel, pas de LIMIT si omis)
 * @returns {Promise<Array<{ id: string, distance_km: number }>>}
 *   Identifiants correspondants, triés par distance croissante, avec
 *   leur distance en kilomètres au point de référence. Ne renvoie que
 *   les identifiants + la distance : au contrôleur appelant d'aller
 *   rechercher les fiches complètes (ex. via
 *   prisma.serviceAssurance.findMany({ where: { service_assurance_id: { in: ids } } })
 *   puis de ré-ordonner selon l'ordre reçu ici, `findMany({ in: [...] })`
 *   ne garantissant pas l'ordre).
 */
export async function rechercherParProximite({
  table,
  colonne,
  clePrimaire,
  latitude,
  longitude,
  rayonKm,
  where = {},
  limite,
}) {
  const tableSql = identifiantSql(table, "table");
  const colonneSql = identifiantSql(colonne, "colonne");
  const clePrimaireSql = identifiantSql(clePrimaire, "clePrimaire");

  const latNum = typeof latitude === "string" ? Number(latitude) : latitude;
  const lngNum = typeof longitude === "string" ? Number(longitude) : longitude;
  const rayonNum = typeof rayonKm === "string" ? Number(rayonKm) : rayonKm;

  if (typeof latNum !== "number" || Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
    throw new Error("rechercherParProximite : latitude invalide (doit être un nombre entre -90 et 90).");
  }
  if (typeof lngNum !== "number" || Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new Error("rechercherParProximite : longitude invalide (doit être un nombre entre -180 et 180).");
  }
  if (typeof rayonNum !== "number" || Number.isNaN(rayonNum) || rayonNum <= 0) {
    throw new Error("rechercherParProximite : rayonKm invalide (doit être un nombre strictement positif).");
  }

  const rayonMetres = rayonNum * 1000;

  const conditionsWhere = traduireWherePrismaSimple(where);
  const clauseWhereSupplementaire = conditionsWhere.length
    ? Prisma.sql`AND ${Prisma.join(conditionsWhere, " AND ")}`
    : Prisma.empty;

  const clauseLimite =
    typeof limite === "number" && Number.isFinite(limite) && limite > 0
      ? Prisma.sql`LIMIT ${Math.floor(limite)}`
      : Prisma.empty;

  const lignes = await prisma.$queryRaw`
    SELECT ${clePrimaireSql} AS id,
           ST_Distance(
             ${colonneSql}::geography,
             ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography
           ) / 1000.0 AS distance_km
    FROM ${tableSql}
    WHERE ${colonneSql} IS NOT NULL
      AND ST_DWithin(
            ${colonneSql}::geography,
            ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography,
            ${rayonMetres}
          )
      ${clauseWhereSupplementaire}
    ORDER BY distance_km ASC
    ${clauseLimite}
  `;

  return lignes.map((ligne) => ({
    id: ligne.id,
    distance_km: Number(ligne.distance_km),
  }));
}

/* ===================================================================
 * Accesseur "lié" à une table/colonne/clé — pour éviter de répéter
 * { table, colonne, clePrimaire } à chaque appel dans un contrôleur.
 *
 * C'est la forme recommandée pour brancher un nouveau modèle sur ce
 * module (Pharmacie, Centre de santé, Médecin...) : un seul point de
 * déclaration en haut du contrôleur, puis des appels courts partout
 * ailleurs. Exemple pour le module Assurance (à utiliser lors du
 * refactor de assurance.controller.js pour éliminer la duplication
 * ServiceAssurance/Agence décrite en tête de ce fichier) :
 *
 *   const geoServiceAssurance = creerAccesseurGeospatial({
 *     table: "service_assurance",
 *     colonne: "geolocalisation",
 *     clePrimaire: "service_assurance_id",
 *   });
 *   const geoAgence = creerAccesseurGeospatial({
 *     table: "agence",
 *     colonne: "gps",
 *     clePrimaire: "agence_id",
 *   });
 *
 *   // lecture (dans enrichirServiceAssurance) :
 *   const geolocalisation = await geoServiceAssurance.recuperer(service_assurance_id);
 *
 *   // écriture (dans creerServiceAssurance / modifierServiceAssurance) :
 *   const erreurGeo = await geoServiceAssurance.appliquer(service_assurance_id, latitude, longitude);
 *
 *   // proximité (nouvel endpoint, ex. GET /services-assurance?lat=...&lng=...&rayon_km=...) :
 *   const proches = await geoServiceAssurance.rechercherParProximite({
 *     latitude, longitude, rayonKm,
 *     where, // les mêmes filtres classiques que listerServicesAssurance
 *   });
 * =================================================================== */

export function creerAccesseurGeospatial({ table, colonne, clePrimaire }) {
  // Valide une bonne fois pour toutes à la création de l'accesseur,
  // plutôt qu'à chaque appel individuel.
  validerIdentifiantSql(table, "table");
  validerIdentifiantSql(colonne, "colonne");
  validerIdentifiantSql(clePrimaire, "clePrimaire");

  return {
    recuperer: (id) => recupererPoint({ table, colonne, clePrimaire, id }),

    definir: (id, latitude, longitude) =>
      definirPoint({ table, colonne, clePrimaire, id, latitude, longitude }),

    effacer: (id) => effacerPoint({ table, colonne, clePrimaire, id }),

    appliquer: (id, latitude, longitude) =>
      appliquerPoint({ table, colonne, clePrimaire, id, latitude, longitude }),

    rechercherParProximite: ({ latitude, longitude, rayonKm, where, limite }) =>
      rechercherParProximite({ table, colonne, clePrimaire, latitude, longitude, rayonKm, where, limite }),
  };
}