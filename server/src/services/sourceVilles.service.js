// src/services/sourceVilles.service.js
//
// Source des villes du référentiel : deux modes.
//
//  - « manuel » (comportement historique) : seules les villes saisies au
//    back-office sont proposées.
//  - « google » : les formulaires proposent EN PLUS les villes Google Maps
//    (Places API). Une ville Google choisie est importée dans la table
//    `ville` (google_place_id, coordonnées) puis utilisée comme n'importe
//    quelle autre : le reste de l'application ne lit que la table `ville`.
//
// Repli automatique : même en mode « google », si la clé est absente,
// invalide, sans facturation ou en quota dépassé, le serveur répond comme
// en mode manuel. Après une panne, Google n'est plus sollicité pendant
// PAUSE_APRES_PANNE_MS (évite de payer la latence d'un échec à chaque
// frappe), puis il est retenté.
//
// Les pays ne viennent pas de Google (aucune API ne les liste) : ils
// restent ceux du référentiel. Une ville Google n'est importée que si son
// pays existe déjà dans le référentiel APS.

import prismaParDefaut from "../lib/prisma.js";
import { horsPerimetre } from "../lib/perimetrePays.js";
import {
  autocompleterVilles as autocompleterGoogle,
  detaillerVille as detaillerGoogle,
  GoogleMapsError,
} from "../lib/googleMaps.js";

export const SOURCES_VILLES = ["manuel", "google"];

const DUREE_CACHE_CONFIG_MS = 60 * 1000;
export const PAUSE_APRES_PANNE_MS = 10 * 60 * 1000;
const LONGUEUR_MIN_RECHERCHE = 2;
const LIMITE_RESULTATS = 20;

export class ErreurSourceVilles extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ErreurSourceVilles";
    this.status = status;
  }
}

/** Dépendances injectables (tests). */
const deps = {
  db: prismaParDefaut,
  autocompleter: autocompleterGoogle,
  detailler: detaillerGoogle,
  maintenant: () => Date.now(),
  cleConfiguree: () => Boolean(process.env.GOOGLE_MAPS_API_KEY),
};

let cacheConfig = null; // { valeur, expireA }
let panneJusquA = 0;

/** Tests uniquement : remplace des dépendances et vide les caches. */
export function _configurerPourTests(surcharges = {}) {
  Object.assign(deps, surcharges);
  cacheConfig = null;
  panneJusquA = 0;
}

export function normaliserNomVille(nom) {
  return String(nom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

export async function lireConfig() {
  const maintenant = deps.maintenant();
  if (cacheConfig && cacheConfig.expireA > maintenant) return cacheConfig.valeur;

  const ligne = await deps.db.configSourceVilles.findUnique({ where: { id: 1 } });
  const valeur = ligne ?? { id: 1, source: "manuel", dernier_test_le: null, dernier_test_ok: null, dernier_message: null };
  cacheConfig = { valeur, expireA: maintenant + DUREE_CACHE_CONFIG_MS };
  return valeur;
}

async function enregistrerConfig(data) {
  const valeur = await deps.db.configSourceVilles.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  cacheConfig = { valeur, expireA: deps.maintenant() + DUREE_CACHE_CONFIG_MS };
  return valeur;
}

/** Note une panne Google : pause des appels + trace pour le back-office. */
async function signalerPanne(err) {
  panneJusquA = deps.maintenant() + PAUSE_APRES_PANNE_MS;
  const detail = err instanceof GoogleMapsError ? `${err.message} — ${err.detail}` : err.message;
  console.error(`[source-villes] Google Maps indisponible, repli sur le mode manuel : ${detail}`);
  try {
    await enregistrerConfig({
      dernier_test_le: new Date(deps.maintenant()),
      dernier_test_ok: false,
      dernier_message: String(detail).slice(0, 500),
    });
  } catch {
    // La trace est accessoire : ne jamais faire échouer la recherche pour elle.
  }
}

/**
 * Mode réellement appliqué : « google » seulement si le back-office l'a
 * choisi, qu'une clé est configurée et qu'aucune panne récente n'est notée.
 */
export async function etatSource() {
  const config = await lireConfig();
  const cle = deps.cleConfiguree();
  const enPanne = panneJusquA > deps.maintenant();

  let raison = null;
  if (config.source !== "google") raison = "mode_manuel_choisi";
  else if (!cle) raison = "cle_absente";
  else if (enPanne) raison = "google_indisponible";

  return {
    source_choisie: config.source,
    source_effective: raison ? "manuel" : "google",
    raison_repli: config.source === "google" ? raison : null,
    cle_configuree: cle,
    dernier_test_le: config.dernier_test_le,
    dernier_test_ok: config.dernier_test_ok,
    dernier_message: config.dernier_message,
  };
}

/** Back-office (superadmin) : choix du mode. */
export async function changerSource(source) {
  if (!SOURCES_VILLES.includes(source)) {
    throw new ErreurSourceVilles(`source invalide. Valeurs acceptées : ${SOURCES_VILLES.join(", ")}.`);
  }
  await enregistrerConfig({ source });
  // Nouveau choix explicite : on retente Google tout de suite.
  panneJusquA = 0;
  return etatSource();
}

/**
 * Back-office : teste la clé avec une vraie requête Places. Le résultat
 * est enregistré ; un succès lève la pause consécutive à une panne.
 */
export async function testerGoogle() {
  if (!deps.cleConfiguree()) {
    await enregistrerConfig({
      dernier_test_le: new Date(deps.maintenant()),
      dernier_test_ok: false,
      dernier_message: "GOOGLE_MAPS_API_KEY absente de l'environnement serveur.",
    });
    return etatSource();
  }
  try {
    const suggestions = await deps.autocompleter("Douala", { codePays: "CM" });
    panneJusquA = 0;
    await enregistrerConfig({
      dernier_test_le: new Date(deps.maintenant()),
      dernier_test_ok: true,
      dernier_message: `Places API répond (${suggestions.length} suggestion(s) pour « Douala »).`,
    });
  } catch (err) {
    await signalerPanne(err);
  }
  return etatSource();
}

/* ------------------------------------------------------------------
 * Recherche et import
 * ------------------------------------------------------------------ */

async function trouverPays(pays_id) {
  if (!pays_id) return null;
  const pays = await deps.db.pays.findUnique({ where: { pays_id } });
  if (!pays) throw new ErreurSourceVilles("pays_id introuvable.");
  return pays;
}

/**
 * Recherche de villes pour un champ de saisie.
 * @returns {Promise<{ source: "manuel"|"google", villes: object[], suggestions: object[] }>}
 *   `villes` : villes déjà en base ; `suggestions` : villes Google pas
 *   encore en base (vide en mode manuel), à importer via importerVilleGoogle.
 */
export async function rechercherVilles({ q = "", pays_id = null, jeton_session = null } = {}) {
  const pays = await trouverPays(pays_id);
  const texte = String(q || "").trim().slice(0, 100);

  const villes = await deps.db.ville.findMany({
    where: {
      ...(pays ? { pays_id: pays.pays_id } : {}),
      ...(texte ? { nom: { contains: texte, mode: "insensitive" } } : {}),
    },
    orderBy: { nom: "asc" },
    take: LIMITE_RESULTATS,
  });

  const etat = await etatSource();
  if (etat.source_effective !== "google" || texte.length < LONGUEUR_MIN_RECHERCHE) {
    return { source: etat.source_effective, villes, suggestions: [] };
  }

  let resultatsGoogle;
  try {
    resultatsGoogle = await deps.autocompleter(texte, {
      codePays: pays?.code_iso2,
      jetonSession: jeton_session || undefined,
    });
  } catch (err) {
    await signalerPanne(err);
    return { source: "manuel", villes, suggestions: [] };
  }

  // Écarte les suggestions déjà présentes en base (même place_id, ou même
  // nom dans le même pays pour une ville saisie à la main).
  const placeIds = new Set(villes.map((v) => v.google_place_id).filter(Boolean));
  const noms = new Set(villes.map((v) => normaliserNomVille(v.nom)));
  const suggestions = resultatsGoogle
    .filter((s) => !placeIds.has(s.placeId) && !(pays && noms.has(normaliserNomVille(s.nom))))
    .slice(0, LIMITE_RESULTATS)
    .map((s) => ({ place_id: s.placeId, nom: s.nom, description: s.description }));

  return { source: "google", villes, suggestions };
}

/**
 * Importe (ou retrouve) en base la ville Google `place_id`.
 * - déjà importée → renvoyée telle quelle ;
 * - une ville du même nom existe dans le même pays sans identifiant
 *   Google → elle est complétée (pas de doublon) ;
 * - sinon → créée.
 * Refusée si son pays n'est pas dans le référentiel, ou ne correspond pas
 * au `pays_id` attendu par le formulaire.
 */
export async function importerVilleGoogle({ place_id, pays_id = null, jeton_session = null }) {
  if (!place_id || typeof place_id !== "string") {
    throw new ErreurSourceVilles("Champ requis manquant : place_id.");
  }

  const dejaImportee = await horsPerimetre(() =>
    deps.db.ville.findUnique({ where: { google_place_id: place_id }, include: { pays: true } })
  );
  if (dejaImportee) {
    if (pays_id && dejaImportee.pays_id !== pays_id) {
      throw new ErreurSourceVilles("Cette ville n'appartient pas au pays sélectionné.");
    }
    return { ville: dejaImportee, creee: false };
  }

  const etat = await etatSource();
  if (etat.source_effective !== "google") {
    throw new ErreurSourceVilles("La recherche de villes Google Maps est indisponible pour le moment.", 503);
  }

  let details;
  try {
    details = await deps.detailler(place_id, { jetonSession: jeton_session || undefined });
  } catch (err) {
    if (!(err instanceof GoogleMapsError)) throw new ErreurSourceVilles("place_id invalide.");
    await signalerPanne(err);
    throw new ErreurSourceVilles("La recherche de villes Google Maps est indisponible pour le moment.", 503);
  }
  if (!details || !details.nom) throw new ErreurSourceVilles("Ville Google introuvable.", 404);
  if (!details.codePays) throw new ErreurSourceVilles("Impossible de déterminer le pays de cette ville.", 422);

  const pays = await deps.db.pays.findUnique({ where: { code_iso2: details.codePays } });
  if (!pays) {
    throw new ErreurSourceVilles("Le pays de cette ville n'est pas encore ouvert sur APS Santé.", 422);
  }
  if (pays_id && pays.pays_id !== pays_id) {
    throw new ErreurSourceVilles("Cette ville n'appartient pas au pays sélectionné.");
  }

  const donneesGoogle = {
    google_place_id: details.placeId === place_id ? place_id : details.placeId,
    latitude: details.latitude,
    longitude: details.longitude,
  };

  const homonymes = await deps.db.ville.findMany({
    where: { pays_id: pays.pays_id, google_place_id: null, nom: { equals: details.nom, mode: "insensitive" } },
    take: 1,
  });
  const homonyme =
    homonymes[0] ??
    (
      await deps.db.ville.findMany({ where: { pays_id: pays.pays_id, google_place_id: null } })
    ).find((v) => normaliserNomVille(v.nom) === normaliserNomVille(details.nom));

  try {
    if (homonyme) {
      const ville = await deps.db.ville.update({
        where: { ville_id: homonyme.ville_id },
        data: { ...donneesGoogle, ...(homonyme.code_postal ? {} : { code_postal: details.codePostal }) },
        include: { pays: true },
      });
      return { ville, creee: false };
    }

    const ville = await deps.db.ville.create({
      data: {
        pays_id: pays.pays_id,
        nom: details.nom.slice(0, 150),
        code_postal: details.codePostal,
        ...donneesGoogle,
      },
      include: { pays: true },
    });
    return { ville, creee: true };
  } catch (err) {
    // Deux imports simultanés de la même ville : l'autre a gagné.
    if (err?.code === "P2002") {
      const ville = await deps.db.ville.findUnique({
        where: { google_place_id: donneesGoogle.google_place_id },
        include: { pays: true },
      });
      if (ville) return { ville, creee: false };
    }
    throw err;
  }
}
