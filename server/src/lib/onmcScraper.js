// src/lib/onmcScraper.js
//
// Lecture du Tableau de l'Ordre National des Médecins du Cameroun (ONMC),
// registre public publié sur https://onmc.app/tableau_de_lordre.
//
// Le site n'a pas d'API documentée, mais il repose sur deux points d'accès
// HTTP simples (relevés dans sa page et dans onmc_connect/js/main.js) :
//
//   1. La liste paginée, rendue côté serveur :
//        GET https://onmc.app/tableau_de_lordre.php?page=N   (200 fiches/page)
//      Le nombre de pages se lit dans le <select name="page"> ; le total
//      annoncé dans <span class="nombre_medecin">.
//
//   2. La recherche du formulaire (appel AJAX du bouton « Rechercher ») :
//        POST https://onmc.app/onmc_connect/post/onmc_shearch.php
//        corps : myData=<formulaire sérialisé>
//                (nom_search, nordre_search, alphabet_search)
//      Recherche par sous-chaîne (« 4984 » trouve aussi « 14984/2026 ») :
//      le rapprochement exact est fait ici, sur numéro normalisé.
//
// Chaque fiche est un bloc :
//   <div class="bloc-medecin ...">
//     <img src="onmc_connect/data_avatar/..." class="bloc-photo">
//     <h2 class="bloc-nom fs-17"> NOM PRÉNOMS</h2>
//     <span class="bloc-numero m-t-10">13574/2024</span>
//     <span class="bloc-specialite m-t-10">Médecin</span>
//   </div>
//
// Ce module ne touche pas la base : il lit et analyse le registre. La
// synchronisation et la vérification sont dans services/onmc.service.js.

export const ONMC_BASE_URL = process.env.ONMC_BASE_URL || "https://onmc.app";
const URL_LISTE = `${ONMC_BASE_URL}/tableau_de_lordre.php`;
const URL_RECHERCHE = `${ONMC_BASE_URL}/onmc_connect/post/onmc_shearch.php`;

const DELAI_REQUETE_MS = Number(process.env.ONMC_DELAI_REQUETE_MS || 15000);
// Pause entre deux pages lors d'une synchronisation complète (courtoisie
// envers le site de l'ONMC : ~66 pages, environ 1 minute au total).
const PAUSE_ENTRE_PAGES_MS = Number(process.env.ONMC_PAUSE_ENTRE_PAGES_MS || 800);
const ESSAIS_PAR_PAGE = 3;

const EN_TETES = {
  "User-Agent": "Mozilla/5.0 (compatible; APS-Sante-VerificationOrdre/1.0)",
  // Sans cet en-tête, le site affiche un avertissement PHP en tête de page.
  "Accept-Language": "fr-FR,fr;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

export class ErreurOnmc extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "ErreurOnmc";
    if (cause) this.cause = cause;
  }
}

/* -------------------------------------------------------------------
 * Normalisation
 * ------------------------------------------------------------------- */

/**
 * Clé de rapprochement d'un numéro d'ordre. Le registre contient des
 * formes hétérogènes : "P4984/2005", "08242/2016", "5148 /2006",
 * "001-04/2025". On retire espaces, préfixe "P" et zéros de tête de
 * chaque segment, en majuscules : "p 04984 / 2005" -> "4984/2005".
 * @returns {string} chaîne vide si la saisie est vide.
 */
export function normaliserNumeroOrdre(valeur) {
  let s = String(valeur ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[‐-―−]/g, "-"); // tirets typographiques
  s = s.replace(/^P(?=\d)/, "");
  return s
    .split("/")
    .map((segment) => segment.replace(/^0+(?=\d)/, ""))
    .join("/");
}

/** Nom sans accents ni ponctuation, en majuscules, espaces simples. */
export function normaliserNom(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Proportion des mots du nom recherché (2 lettres ou plus) présents dans
 * le nom inscrit au tableau, entre 0 et 1. L'ordre nom/prénoms n'importe
 * pas ("Edwin Ayuk" contre "AYUK TAMBE EDWIN" -> 1).
 */
export function scoreCorrespondanceNom(nomRecherche, nomTableau) {
  const mots = normaliserNom(nomRecherche).split(" ").filter((m) => m.length >= 2);
  if (!mots.length) return 0;
  const motsTableau = new Set(normaliserNom(nomTableau).split(" "));
  const communs = mots.filter((m) => motsTableau.has(m)).length;
  return communs / mots.length;
}

/* -------------------------------------------------------------------
 * Analyse HTML
 * ------------------------------------------------------------------- */

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decoderEntites(texte) {
  return texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (brut, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : brut;
    }
    return ENTITES[code.toLowerCase()] ?? brut;
  });
}

function texteDe(html) {
  return decoderEntites(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Extrait les fiches d'un fragment HTML du registre (page de liste ou
 * réponse de recherche).
 * @returns {{ numero_ordre: string, numero_normalise: string, nom_complet: string, qualite: string, photo_chemin: string|null }[]}
 */
export function extraireMedecins(html) {
  const blocs = String(html).split(/<div[^>]*class="[^"]*\bbloc-medecin\b[^"]*"[^>]*>/i).slice(1);
  const medecins = [];
  for (const bloc of blocs) {
    const nom = bloc.match(/<h2[^>]*class="[^"]*\bbloc-nom\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    const numero = bloc.match(/<span[^>]*class="[^"]*\bbloc-numero\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (!nom || !numero) continue;
    const qualite = bloc.match(/<span[^>]*class="[^"]*\bbloc-specialite\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const photo = bloc.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*\bbloc-photo\b/i);

    const numeroOrdre = texteDe(numero[1]);
    const nomComplet = texteDe(nom[1]);
    if (!numeroOrdre || !nomComplet) continue;
    const photoChemin = photo && !/onmc_logo_PHOTO/i.test(photo[1]) ? photo[1] : null;

    medecins.push({
      numero_ordre: numeroOrdre.slice(0, 50),
      numero_normalise: normaliserNumeroOrdre(numeroOrdre).slice(0, 50),
      nom_complet: nomComplet.slice(0, 255),
      qualite: (qualite ? texteDe(qualite[1]) : "").slice(0, 100) || "Médecin",
      photo_chemin: photoChemin ? photoChemin.slice(0, 255) : null,
    });
  }
  return medecins;
}

/** Nombre de pages (plus grande valeur du <select name="page">), 0 si absent. */
export function extraireNombrePages(html) {
  const select = String(html).match(/<select[^>]*name="page"[^>]*>([\s\S]*?)<\/select>/i);
  if (!select) return 0;
  const valeurs = [...select[1].matchAll(/<option[^>]*value="(\d+)"/gi)].map((m) => Number(m[1]));
  return valeurs.length ? Math.max(...valeurs) : 0;
}

/** Total annoncé par le site (« 13016 médecins inscrits »), ou null. */
export function extraireTotalAnnonce(html) {
  const m = String(html).match(/class="[^"]*\bnombre_medecin\b[^"]*"[^>]*>\s*([\d\s.]+)</i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* -------------------------------------------------------------------
 * Accès HTTP
 * ------------------------------------------------------------------- */

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requeteTexte(url, options = {}) {
  let reponse;
  try {
    reponse = await fetch(url, {
      ...options,
      headers: { ...EN_TETES, ...(options.headers || {}) },
      signal: AbortSignal.timeout(DELAI_REQUETE_MS),
    });
  } catch (err) {
    throw new ErreurOnmc(`ONMC injoignable (${url}) : ${err.message}`, { cause: err });
  }
  if (!reponse.ok) {
    throw new ErreurOnmc(`ONMC a répondu ${reponse.status} (${url}).`);
  }
  return reponse.text();
}

/** Lit une page de la liste (1 = première). */
export async function lirePageTableau(numeroPage) {
  const html = await requeteTexte(`${URL_LISTE}?page=${encodeURIComponent(numeroPage)}`);
  return {
    medecins: extraireMedecins(html),
    nombrePages: extraireNombrePages(html),
    totalAnnonce: extraireTotalAnnonce(html),
  };
}

async function lirePageAvecEssais(numeroPage) {
  let derniereErreur;
  for (let essai = 1; essai <= ESSAIS_PAR_PAGE; essai += 1) {
    try {
      return await lirePageTableau(numeroPage);
    } catch (err) {
      derniereErreur = err;
      await pause(1000 * essai);
    }
  }
  throw derniereErreur;
}

/**
 * Parcourt tout le tableau, page par page.
 * @param {{ surPage?: (info: { page: number, nombrePages: number, recuperes: number }) => void|Promise<void> }} [options]
 * @returns {Promise<{ medecins: object[], totalAnnonce: number|null, nombrePages: number }>}
 */
export async function lireTableauComplet({ surPage } = {}) {
  const premiere = await lirePageAvecEssais(1);
  const nombrePages = premiere.nombrePages || 1;
  if (!premiere.medecins.length) {
    throw new ErreurOnmc("Aucune fiche lue sur la première page du tableau : structure du site modifiée ?");
  }

  const medecins = [...premiere.medecins];
  await surPage?.({ page: 1, nombrePages, recuperes: medecins.length });

  for (let page = 2; page <= nombrePages; page += 1) {
    await pause(PAUSE_ENTRE_PAGES_MS);
    const { medecins: fiches } = await lirePageAvecEssais(page);
    medecins.push(...fiches);
    await surPage?.({ page, nombrePages, recuperes: medecins.length });
  }

  return { medecins, totalAnnonce: premiere.totalAnnonce, nombrePages };
}

/**
 * Recherche en direct sur le site de l'ONMC (formulaire « Rechercher »).
 * @param {{ numeroOrdre?: string, nom?: string }} criteres
 * @returns {Promise<object[]>} fiches renvoyées par le site (correspondance
 *   partielle : filtrer ensuite sur numero_normalise).
 */
export async function rechercherSurOnmc({ numeroOrdre = "", nom = "" } = {}) {
  const formulaire = new URLSearchParams({
    nom_search: nom,
    nordre_search: numeroOrdre,
    alphabet_search: "Tous",
  }).toString();

  const html = await requeteTexte(URL_RECHERCHE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ myData: formulaire }).toString(),
  });

  const medecins = extraireMedecins(html);
  if (!medecins.length && !/Aucun r[ée]sultat/i.test(texteDe(html))) {
    // Ni fiche, ni message « aucun résultat » : réponse inattendue.
    throw new ErreurOnmc("Réponse de recherche ONMC non reconnue : structure du site modifiée ?");
  }
  return medecins;
}

/** URL absolue d'une photo du registre. */
export function urlPhotoOnmc(photoChemin) {
  if (!photoChemin) return null;
  if (/^https?:\/\//i.test(photoChemin)) return photoChemin;
  return `${ONMC_BASE_URL}/${photoChemin.replace(/^\.?\//, "")}`;
}
