// src/lib/onmcVerificationService.js
//
// Vérification de l'appartenance d'un médecin au Tableau de l'Ordre
// National des Médecins du Cameroun (ONMC), à partir de son
// numero_ordre (format observé : "3261/1990", parfois préfixé d'un
// "P", ex. "P9892/2019").
//
// Source officielle publique : https://onmc.app/tableau_de_lordre
// ("12 713 médecins inscrits" au moment de l'écriture de ce fichier).
//
// ⚠️ IMPORTANT — CE SITE N'EXPOSE AUCUNE API DOCUMENTÉE.
// La recherche par numéro d'ordre sur cette page est entièrement
// pilotée par du JavaScript côté client : remplir le formulaire ou
// changer de page ne modifie PAS l'URL (testé : ?numero_ordre=... et
// ?page=2 renvoient tous deux exactement le même HTML initial). Le
// bouton "Rechercher" doit donc appeler en coulisses un endpoint
// interne non documenté, que je n'ai pas pu identifier sans accéder
// à l'onglet Réseau des DevTools d'un vrai navigateur (hors de portée
// de mes outils actuels).
//
// STRATÉGIE RETENUE : piloter un vrai navigateur headless (Puppeteer)
// qui reproduit ce que ferait une personne — ouvrir la page, remplir
// le champ "Numéro d'Ordre", cliquer sur "Rechercher", lire le
// résultat affiché. C'est plus lourd qu'un simple fetch(), mais ça
// reste correct quel que soit l'endpoint interne utilisé, et ça
// continuera de fonctionner même si l'ONMC change son implémentation
// tant que le formulaire visible reste le même.
//
// SI VOUS AVEZ ACCÈS À L'ENDPOINT RÉEL (ex. en inspectant l'onglet
// Réseau pendant une recherche sur le site) : remplacez ce module par
// un simple appel axios/fetch vers cet endpoint — ce sera beaucoup
// plus rapide et plus robuste que le pilotage navigateur ci-dessous.
//
// ⚠️ Sélecteurs DOM à re-vérifier / ajuster si l'ONMC modifie sa page
// (aucun id/class stable n'est visible depuis ma lecture de la page,
// j'ai dû cibler des éléments par leur texte/placeholder). À tester
// en conditions réelles avant mise en production.

import puppeteer from "puppeteer";

const ONMC_URL = "https://onmc.app/tableau_de_lordre";

// Cache mémoire simple (process-local). Le Tableau de l'Ordre change
// peu d'un jour à l'autre : on évite de re-solliciter le site à
// chaque appel (courtoisie envers l'ONMC + latence). En production
// multi-instances, préférer un cache partagé (Redis) à cette Map.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map(); // numero_ordre normalisé -> { valeur, expire }

function normaliserNumeroOrdre(numeroOrdre) {
  return String(numeroOrdre).trim().toUpperCase();
}

/**
 * Interroge le Tableau de l'Ordre (onmc.app) pour un numero_ordre
 * donné et renvoie si un médecin correspondant y est inscrit.
 *
 * @param {string} numeroOrdreBrut - ex. "3261/1990", "P9892/2019"
 * @returns {Promise<{ appartientOrdre: boolean, nomComplet?: string, numeroOrdre?: string }>}
 */
export async function verifierAppartenanceOrdreONMC(numeroOrdreBrut) {
  if (!numeroOrdreBrut || !String(numeroOrdreBrut).trim()) {
    throw new Error("numero_ordre requis.");
  }

  const cle = normaliserNumeroOrdre(numeroOrdreBrut);
  const entreeCache = cache.get(cle);
  if (entreeCache && entreeCache.expire > Date.now()) {
    return entreeCache.valeur;
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; VerifOrdreBot/1.0; +https://votre-app.example/verification-medecins)"
    );
    await page.goto(ONMC_URL, { waitUntil: "networkidle2", timeout: 30000 });

    // Le champ "Numéro d'Ordre" est repéré via son placeholder visible
    // sur la page ("0000/0000"). Ajuster ce sélecteur si l'ONMC change
    // son formulaire.
    const champNumero = await page.waitForSelector('input[placeholder*="0000"]', { timeout: 10000 });
    await champNumero.click({ clickCount: 3 }); // sélectionne tout contenu existant
    await champNumero.type(String(numeroOrdreBrut).trim(), { delay: 15 });

    // Clic sur le bouton "Rechercher" — recherché par son texte plutôt
    // qu'un sélecteur CSS fragile (id/class inconnus).
    const clique = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("button, input[type='submit'], a"));
      const bouton = elements.find((el) => (el.textContent || el.value || "").trim().toLowerCase() === "rechercher");
      if (bouton) {
        bouton.click();
        return true;
      }
      return false;
    });
    if (!clique) {
      // Repli : valider le formulaire au clavier si le bouton n'a pas
      // été trouvé (site modifié).
      await page.keyboard.press("Enter");
    }

    // Laisse le temps à l'appel AJAX interne de l'ONMC de répondre et
    // au DOM de se mettre à jour.
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 500)); // filet de sécurité si pas de requête réseau détectée

    const resultats = await page.evaluate(() => {
      // Chaque fiche de la liste affiche un titre (nom du médecin)
      // suivi d'une ligne "NUMERO/ANNEE Médecin" — voir markup de
      // https://onmc.app/tableau_de_lordre au moment de l'écriture.
      const titres = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
      return titres
        .map((titre) => {
          const suivant = titre.nextElementSibling;
          const ligne = suivant ? suivant.textContent.trim() : "";
          return { nom: titre.textContent.trim(), ligne };
        })
        .filter((item) => /\//.test(item.ligne));
    });

    const numeroRecherche = cle.replace(/^0+/, ""); // tolère les zéros de tête (ex. "08242" vs "8242")
    const trouve = resultats.find((item) => {
      const ligneNormalisee = item.ligne.toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
      return ligneNormalisee.startsWith(numeroRecherche);
    });

    const valeur = trouve
      ? {
          appartientOrdre: true,
          nomComplet: trouve.nom,
          numeroOrdre: trouve.ligne.replace(/Médecin$/i, "").trim(),
        }
      : { appartientOrdre: false };

    cache.set(cle, { valeur, expire: Date.now() + CACHE_TTL_MS });
    return valeur;
  } finally {
    await browser.close();
  }
}

export default { verifierAppartenanceOrdreONMC };