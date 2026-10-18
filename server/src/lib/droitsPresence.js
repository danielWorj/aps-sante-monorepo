// src/lib/droitsPresence.js
// Droits publics d'une fiche (pharmacie, centre de santé, médecin) selon
// son abonnement de présence — même principe que lib/droitsAssurance.js :
// « le serveur décide, les clients affichent ».
//
// Règles (date_fin EXCLUSIVE) :
//   - abonnement valide (actif, date_debut <= aujourd'hui < date_fin) sur
//     une fiche EN LIGNE => droits du niveau (rang le plus haut, puis
//     date_fin la plus lointaine) ; médecin d'un pays sans obligation :
//     le meilleur de ces droits et des droits « sans obligation » (un
//     abonnement n'enlève jamais rien) ;
//   - médecin d'un pays où l'abonnement n'est PAS obligatoire => droits
//     « sans obligation » (comportement historique de la fiche médecin :
//     photo, biographie et prise de RDV, contact non exposé) ;
//   - gratuité d'amorçage active dans le pays (fiche EN LIGNE) => droits
//     du niveau offert, sans souscription (statut « gratuite ») ;
//   - dernier abonnement échu depuis moins de grace_jours => droits
//     MINIMAUX, en_grace = true (bandeau du propriétaire uniquement) ;
//   - sinon => droits MINIMAUX (palier Basique, gratuit à vie).
//
// Fiche EN LIGNE (estFicheEnLigne) : publiée, ou déjà publiée et repassée
// « en_cours » le temps de la modération d'une modification.
//
// L'abonnement n'apporte AUCUN avantage de classement : ces droits ne
// servent qu'à masquer ou exposer des champs, jamais à trier.
//
// Pharmacies (principe non négociable, EF-PHA-06) : nom, adresse,
// géolocalisation, horaires et gardes ne sont JAMAIS masqués ici.

import prisma from "./prisma.js";
import { acteur, champActeur, estFicheEnLigne } from "./acteursPresence.js";
import { debutDuJourUtc } from "./droitsAssurance.js";

export const DROITS_MINIMAUX = Object.freeze({
  niveau_presence: "basique",
  contact_direct: false,
  photos: false,
  description_enrichie: false,
  presentation_equipe: false,
  prise_rdv_en_ligne: false,
  multimedia: false,
  statistiques: false,
  statistiques_detaillees: false,
  multi_utilisateurs: false,
  support_prioritaire: false,
  max_photos: 0,
  max_gestionnaires: 1,
});

// Médecin d'un pays sans obligation : la fiche reste celle d'avant le
// module (le téléphone du compte n'a jamais été public).
export const DROITS_SANS_OBLIGATION = Object.freeze({
  ...DROITS_MINIMAUX,
  niveau_presence: "libre",
  photos: true,
  description_enrichie: true,
  prise_rdv_en_ligne: true,
  statistiques: true,
  max_photos: null,
});

export const CLES_DROITS = Object.keys(DROITS_MINIMAUX).filter((k) => k !== "niveau_presence");

const GRACE_PAR_DEFAUT = 7;

function droitsDuNiveau(niveau) {
  const droits = { niveau_presence: niveau.code };
  for (const k of CLES_DROITS) droits[k] = niveau[k];
  return droits;
}

// Quota : null = illimité.
const quotaMax = (a, b) => (a === null || b === null ? null : Math.max(a ?? 0, b ?? 0));

/** Le meilleur de deux jeux de droits (le niveau affiché reste celui de `base`). */
export function fusionnerDroits(base, autre) {
  const droits = { niveau_presence: base.niveau_presence };
  for (const k of CLES_DROITS) {
    droits[k] = k.startsWith("max_") ? quotaMax(base[k], autre[k]) : !!(base[k] || autre[k]);
  }
  return droits;
}

/**
 * @param {"pharmacie"|"structure"|"medecin"} type
 * @param {string[]} ids
 * @returns {Promise<Map<string, {droits, statut_abonnement, date_fin, en_grace, abonnement_id, abonnement_requis}>>}
 *   statut_abonnement : actif | gratuite | grace | aucun | non_requis
 */
export async function resoudreDroitsPresenceEnLot(type, ids) {
  const resultats = new Map();
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return resultats;
  const champ = champActeur(type);
  const aujourdhui = debutDuJourUtc();

  const [fiches, abonnements] = await Promise.all([
    acteur(type).chargerPlusieurs(prisma, uniques),
    prisma.abonnementPresence.findMany({
      where: { type_acteur: type, [champ]: { in: uniques }, statut: "actif" },
      include: { niveau: true },
    }),
  ]);
  const ficheParId = new Map(fiches.map((f) => [f.acteur_id, f]));
  const paysIds = [...new Set(fiches.map((f) => f.pays_id))];
  const configs = paysIds.length
    ? await prisma.configAbonnementPresence.findMany({ where: { type_acteur: type, pays_id: { in: paysIds } } })
    : [];
  const configParPays = new Map(configs.map((c) => [c.pays_id, c]));
  const idsOfferts = [...new Set(configs.filter((c) => c.gratuite_active && c.gratuite_niveau_id).map((c) => c.gratuite_niveau_id))];
  const niveauxOfferts = idsOfferts.length
    ? new Map((await prisma.niveauAbonnementPresence.findMany({ where: { niveau_id: { in: idsOfferts } } })).map((n) => [n.niveau_id, n]))
    : new Map();

  const parActeur = new Map();
  for (const a of abonnements) {
    const id = a[champ];
    if (!parActeur.has(id)) parActeur.set(id, []);
    parActeur.get(id).push(a);
  }

  for (const id of uniques) {
    const fiche = ficheParId.get(id);
    const config = fiche ? configParPays.get(fiche.pays_id) : null;
    // Pharmacies et centres de santé : toujours soumis à l'abonnement.
    // Médecins : selon le pays (bouton du back-office).
    const requis = type !== "medecin" || config?.abonnement_obligatoire === true;
    const liste = parActeur.get(id) ?? [];

    const enLigne = estFicheEnLigne(fiche);
    const valides = enLigne
      ? liste
          .filter((a) => a.date_debut <= aujourdhui && a.date_fin > aujourdhui)
          .sort((x, y) => y.niveau.rang - x.niveau.rang || y.date_fin - x.date_fin)
      : [];
    if (valides.length) {
      const a = valides[0];
      const duNiveau = droitsDuNiveau(a.niveau);
      resultats.set(id, {
        droits: requis ? duNiveau : fusionnerDroits(duNiveau, DROITS_SANS_OBLIGATION),
        statut_abonnement: "actif",
        date_fin: a.date_fin,
        en_grace: false,
        abonnement_id: a.abonnement_id,
        abonnement_requis: requis,
      });
      continue;
    }

    if (!requis) {
      resultats.set(id, {
        droits: DROITS_SANS_OBLIGATION,
        statut_abonnement: "non_requis",
        date_fin: null,
        en_grace: false,
        abonnement_id: null,
        abonnement_requis: false,
      });
      continue;
    }

    // Gratuité d'amorçage : toutes les fiches publiées du pays, sans souscrire.
    const offert = enLigne && config?.gratuite_active
      && (!config.gratuite_jusqu_au || config.gratuite_jusqu_au >= aujourdhui)
      ? niveauxOfferts.get(config.gratuite_niveau_id)
      : null;
    if (offert) {
      const finExclusive = config.gratuite_jusqu_au ? new Date(config.gratuite_jusqu_au) : null;
      if (finExclusive) finExclusive.setUTCDate(finExclusive.getUTCDate() + 1);
      resultats.set(id, {
        droits: droitsDuNiveau(offert),
        statut_abonnement: "gratuite",
        date_fin: finExclusive,
        en_grace: false,
        abonnement_id: null,
        abonnement_requis: true,
      });
      continue;
    }

    const dernier = liste.filter((a) => a.date_fin <= aujourdhui).sort((x, y) => y.date_fin - x.date_fin)[0];
    if (dernier) {
      const finGrace = new Date(dernier.date_fin);
      finGrace.setUTCDate(finGrace.getUTCDate() + (config?.grace_jours ?? GRACE_PAR_DEFAUT));
      if (aujourdhui < finGrace) {
        resultats.set(id, {
          droits: DROITS_MINIMAUX,
          statut_abonnement: "grace",
          date_fin: dernier.date_fin,
          en_grace: true,
          abonnement_id: dernier.abonnement_id,
          abonnement_requis: true,
        });
        continue;
      }
    }
    resultats.set(id, {
      droits: DROITS_MINIMAUX,
      statut_abonnement: "aucun",
      date_fin: null,
      en_grace: false,
      abonnement_id: null,
      abonnement_requis: true,
    });
  }
  return resultats;
}

export async function resoudreDroitsPresence(type, id) {
  return (await resoudreDroitsPresenceEnLot(type, [id])).get(id);
}

/** Droits exposés au public : sans quotas. */
export function droitsPresencePublics(droits) {
  const { max_photos, max_gestionnaires, ...reste } = droits;
  return reste;
}

/* ===================================================================
 * Restitution publique des fiches (les données restent en base)
 *
 * Ces filtres ne servent QUE aux réponses publiques : ils retirent aussi,
 * quel que soit l'abonnement, les pièces justificatives (pièce
 * d'identité, agrément, CNI, attestation de l'Ordre), réservées à la
 * fiche complète (gestionnaire, administration).
 * =================================================================== */

const PIECES_STRUCTURE = ["piece_identite_nom", "piece_identite_url", "document_agrement_nom", "document_agrement_url"];
const PIECES_MEDECIN = ["cni_url", "attestation_url"];

function sansPieces(fiche, cles) {
  const copie = { ...fiche };
  for (const c of cles) delete copie[c];
  return copie;
}

/** Pharmacie (EF-PHA-06 / EF-PHA-07) : seuls le contact direct et l'enrichi sont modulés. */
export function filtrerPharmacie(p, droits) {
  return {
    ...sansPieces(p, PIECES_STRUCTURE),
    telephone: droits.contact_direct ? p.telephone : null,
    image_nom: droits.photos ? p.image_nom : null,
    image_url: droits.photos ? p.image_url : null,
    description_enrichie: droits.description_enrichie ? p.description_enrichie ?? null : null,
    services_particuliers: droits.description_enrichie ? p.services_particuliers ?? null : null,
  };
}

/** Centre de santé : identité, adresse, type restent publics (palier Basique). */
export function filtrerStructure(s, droits) {
  return {
    ...sansPieces(s, PIECES_STRUCTURE),
    telephone: droits.contact_direct ? s.telephone : null,
    image_nom: droits.photos ? s.image_nom : null,
    image_url: droits.photos ? s.image_url : null,
    description_enrichie: droits.description_enrichie ? s.description_enrichie ?? null : null,
    presentation_equipe: droits.presentation_equipe ? s.presentation_equipe ?? null : null,
  };
}

/**
 * Médecin : identité, spécialité, ville et tarif restent publics. Le
 * téléphone du compte n'est exposé qu'avec le droit contact_direct (champ
 * `contact_telephone`, l'objet utilisateur public n'en porte jamais).
 */
export function filtrerMedecin(m, droits, telephone = null) {
  const resultat = {
    ...sansPieces(m, PIECES_MEDECIN),
    photo_url: droits.photos ? m.photo_url : null,
    biographie: droits.description_enrichie ? m.biographie : "",
    linkedInUrl: droits.description_enrichie ? m.linkedInUrl : null,
    cv_url: droits.description_enrichie ? m.cv_url : null,
    contact_telephone: droits.contact_direct ? telephone : null,
  };
  if (resultat.utilisateur) {
    const { telephone: _t, email: _e, ...identite } = resultat.utilisateur;
    resultat.utilisateur = identite;
  }
  return resultat;
}

/**
 * Applique les droits à une liste de fiches (UNE résolution pour toute la
 * liste ; l'ordre n'est jamais modifié). Chaque fiche gagne `droits` et
 * `statut_abonnement`.
 * @param {"pharmacie"|"structure"} type
 */
export async function appliquerDroitsPresenceALaListe(type, fiches) {
  const cle = champActeur(type);
  const filtrer = type === "pharmacie" ? filtrerPharmacie : filtrerStructure;
  const droitsParId = await resoudreDroitsPresenceEnLot(type, fiches.map((f) => f[cle]));
  return fiches.map((f) => {
    const { droits, statut_abonnement } = droitsParId.get(f[cle]);
    return { ...filtrer(f, droits), droits: droitsPresencePublics(droits), statut_abonnement };
  });
}
