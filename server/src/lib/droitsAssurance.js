// src/lib/droitsAssurance.js
// Résolution des droits d'une fiche d'assurance à partir de son abonnement
// (guide_implementation_abonnement_assurances v3, §1.3.1).
//
// Principe : « le serveur décide, les clients affichent ». Sans abonnement
// valide, une fiche n'a que la présence minimale (DROITS_MINIMAUX).
// Version EN LOT (une seule requête pour une liste) ; la version unitaire
// n'en est qu'une enveloppe.

import prisma from "./prisma.js";

export const DROITS_MINIMAUX = Object.freeze({
  niveau_presence: "minimale",
  siege_complet: false,
  afficher_activites: false,
  afficher_agences: false,
  formulaire_contact: false,
  suivi_demandes: false,
  video_presentation: false,
  vitrine_premium: false,
  stats_completes: false,
  export_stats: false,
  max_agences: 0,
  max_photos: 0,
  max_gestionnaires: 1,
});

const CLES_DROITS = Object.keys(DROITS_MINIMAUX).filter((k) => k !== "niveau_presence");

// Drapeaux booléens (hors quotas) : seuls autorisés dans idsServicesAvecDroit,
// pour ne jamais injecter une clé arbitraire dans le `where` Prisma.
const CLES_DROITS_BOOLEENS = CLES_DROITS.filter((k) => typeof DROITS_MINIMAUX[k] === "boolean");

const GRACE_PAR_DEFAUT = 7;

/** Début du jour en UTC. Tout est comparé en jours calendaires UTC (V1). */
export function debutDuJourUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function droitsDuNiveau(niveau) {
  const droits = { niveau_presence: niveau.code };
  for (const k of CLES_DROITS) droits[k] = niveau[k];
  return droits;
}

/**
 * Règles (date_fin EXCLUSIVE) :
 *  - valide : date_debut <= aujourd'hui < date_fin, statut "actif" => droits du niveau
 *             (plusieurs valides : rang de niveau le plus haut, puis date_fin la plus lointaine)
 *  - grâce  : aucun valide, dernier abonnement échu depuis < grace_jours => droits MINIMAUX
 *             côté public ; en_grace = true sert uniquement au bandeau du propriétaire
 *  - sinon  : droits MINIMAUX
 * Un brouillon, un abonnement suspendu, annulé, remplacé ou expiré ne donne jamais de droits.
 * `niveau.actif` n'est PAS testé : il ne gouverne que la vente.
 *
 * @param {string[]} serviceIds
 * @returns {Promise<Map<string, {droits, statut_abonnement, date_fin, en_grace, abonnement_id}>>}
 */
export async function resoudreDroitsEnLot(serviceIds) {
  const resultats = new Map();
  if (!serviceIds.length) return resultats;
  const aujourdhui = debutDuJourUtc();

  const abonnements = await prisma.abonnementAssurance.findMany({
    where: { service_assurance_id: { in: serviceIds }, statut: "actif" },
    include: { niveau: true, service: { select: { pays_id: true } } },
  });
  const paysIds = [...new Set(abonnements.map((a) => a.service.pays_id))];
  const configs = paysIds.length
    ? await prisma.configAbonnementAssurance.findMany({ where: { pays_id: { in: paysIds } } })
    : [];
  const graceParPays = new Map(configs.map((c) => [c.pays_id, c.grace_jours]));

  const parService = new Map();
  for (const a of abonnements) {
    if (!parService.has(a.service_assurance_id)) parService.set(a.service_assurance_id, []);
    parService.get(a.service_assurance_id).push(a);
  }

  for (const id of serviceIds) {
    const liste = parService.get(id) ?? [];
    const valides = liste
      .filter((a) => a.date_debut <= aujourdhui && a.date_fin > aujourdhui)
      .sort((x, y) => y.niveau.rang - x.niveau.rang || y.date_fin - x.date_fin);

    if (valides.length) {
      const a = valides[0];
      resultats.set(id, {
        droits: droitsDuNiveau(a.niveau),
        statut_abonnement: "actif",
        date_fin: a.date_fin,
        en_grace: false,
        abonnement_id: a.abonnement_id,
      });
      continue;
    }

    const echus = liste.filter((a) => a.date_fin <= aujourdhui).sort((x, y) => y.date_fin - x.date_fin);
    const dernier = echus[0];
    if (dernier) {
      const grace = graceParPays.get(dernier.service.pays_id) ?? GRACE_PAR_DEFAUT;
      const finGrace = new Date(dernier.date_fin);
      finGrace.setUTCDate(finGrace.getUTCDate() + grace);
      if (aujourdhui < finGrace) {
        resultats.set(id, {
          droits: DROITS_MINIMAUX,
          statut_abonnement: "grace",
          date_fin: dernier.date_fin,
          en_grace: true,
          abonnement_id: dernier.abonnement_id,
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
    });
  }
  return resultats;
}

export async function resoudreDroits(serviceAssuranceId) {
  return (await resoudreDroitsEnLot([serviceAssuranceId])).get(serviceAssuranceId);
}

/** Droits exposés au public : sans quotas ni indicateurs internes. */
export function droitsPublics(droits) {
  const { max_agences, max_photos, max_gestionnaires, ...reste } = droits;
  return reste;
}

/**
 * Pour les lectures annexes (activités, agences, contact) : le droit est-il
 * accordé AU PUBLIC ? Faux si la fiche n'est pas `publie`.
 */
export async function droitPublicAccorde(serviceAssuranceId, cle) {
  const service = await prisma.serviceAssurance.findUnique({
    where: { service_assurance_id: serviceAssuranceId },
    select: { statut_verification: true },
  });
  if (!service || service.statut_verification !== "publie") return false;
  const { droits } = await resoudreDroits(serviceAssuranceId);
  return droits[cle] === true;
}

/**
 * Ids des fiches publiées dont le droit `cle` est accordé (lectures sans
 * filtre de fiche). Invariant : un niveau de rang supérieur cumule les droits
 * des rangs inférieurs, sinon cette fonction et resoudreDroits divergent.
 */
export async function idsServicesAvecDroit(cle) {
  if (!CLES_DROITS_BOOLEENS.includes(cle)) {
    throw new Error(`Droit d'abonnement inconnu : ${cle}`);
  }
  const aujourdhui = debutDuJourUtc();
  const abonnements = await prisma.abonnementAssurance.findMany({
    where: {
      statut: "actif",
      date_debut: { lte: aujourdhui },
      date_fin: { gt: aujourdhui },
      niveau: { [cle]: true },
      service: { statut_verification: "publie" },
    },
    select: { service_assurance_id: true },
  });
  return [...new Set(abonnements.map((a) => a.service_assurance_id))];
}