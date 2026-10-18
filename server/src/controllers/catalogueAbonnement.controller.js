// src/controllers/catalogueAbonnement.controller.js
// Catalogue PUBLIC des abonnements (page « Abonnements » du site, visiteur
// non connecté) : niveaux vendables, avantages, remises par durée et prix
// indicatifs du pays, tels que définis dans la console d'administration.
//
// Lecture seule, aucune donnée de fiche : le montant réellement débité
// reste celui calculé par /offres pour la fiche du gestionnaire connecté
// (renouvellement, montée de niveau au prorata, gratuité).
//
//   GET /abonnements-presence/:type/catalogue?pays_id=
//   GET /abonnements-assurance/catalogue?pays_id=
//
// pays_id absent ou sans tarif : premier pays tarifé (Cameroun en priorité).

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { calculerMontantsAbonnement, DUREES_PROPOSEES } from "../services/tarifAbonnementAssurance.service.js";

const AVANTAGES_PRESENCE = {
  pharmacie: ["contact_direct", "photos", "description_enrichie", "statistiques", "statistiques_detaillees"],
  structure: ["contact_direct", "photos", "description_enrichie", "presentation_equipe", "multimedia", "statistiques", "statistiques_detaillees", "multi_utilisateurs", "support_prioritaire"],
  medecin: ["contact_direct", "photos", "description_enrichie", "prise_rdv_en_ligne", "multimedia", "statistiques", "statistiques_detaillees", "support_prioritaire"],
};

const AVANTAGES_ASSURANCE = ["siege_complet", "afficher_activites", "afficher_agences", "formulaire_contact", "suivi_demandes"];

/** Pays distincts des tarifs, triés (Cameroun d'abord, puis par nom). */
function paysDesTarifs(tarifs) {
  const parId = new Map();
  for (const t of tarifs) parId.set(t.pays.pays_id, { pays_id: t.pays.pays_id, nom: t.pays.nom, code_iso2: t.pays.code_iso2 });
  return [...parId.values()].sort((a, b) =>
    (a.code_iso2 === "CM" ? -1 : b.code_iso2 === "CM" ? 1 : a.nom.localeCompare(b.nom, "fr")));
}

function gratuiteEnCours(config) {
  if (!config?.gratuite_active) return null;
  if (config.gratuite_jusqu_au && config.gratuite_jusqu_au < debutDuJourUtc()) return null;
  return { niveau_id: config.gratuite_niveau_id, jusqu_au: config.gratuite_jusqu_au };
}

/** Durées proposées et montants, à partir du prix mensuel du pays (sans prorata). */
function dureesPour(tarif, remises) {
  return remises.map((r) => {
    if (!tarif) return { duree_mois: r.duree_mois, remise_pourcent: Number(r.remise_pourcent), disponible: false };
    const m = calculerMontantsAbonnement({
      prix_mensuel: tarif.prix_mensuel,
      duree_mois: r.duree_mois,
      remise_pourcent: r.remise_pourcent,
      devise: tarif.devise,
    });
    return {
      duree_mois: r.duree_mois,
      remise_pourcent: Number(r.remise_pourcent),
      prix_mensuel: Number(tarif.prix_mensuel),
      prix_mensuel_effectif: m.total / r.duree_mois,
      montant_total: m.total,
      devise: tarif.devise,
      disponible: true,
    };
  });
}

export async function catalogueAbonnementPresence(req, res, next) {
  try {
    const { type } = req.params;
    const [niveaux, remises] = await Promise.all([
      prisma.niveauAbonnementPresence.findMany({ where: { type_acteur: type, actif: true }, orderBy: { rang: "asc" } }),
      prisma.remiseDureeAbonnementPresence.findMany({
        where: { type_acteur: type, duree_mois: { in: DUREES_PROPOSEES } },
        orderBy: { duree_mois: "asc" },
      }),
    ]);
    const tarifs = await prisma.tarifAbonnementPresence.findMany({
      where: { actif: true, niveau_id: { in: niveaux.map((n) => n.niveau_id) } },
      include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
    });

    const pays_disponibles = paysDesTarifs(tarifs);
    const pays = pays_disponibles.find((p) => p.pays_id === req.query.pays_id) ?? pays_disponibles[0] ?? null;
    const config = pays
      ? await prisma.configAbonnementPresence.findUnique({ where: { type_acteur_pays_id: { type_acteur: type, pays_id: pays.pays_id } } })
      : null;

    const offres = niveaux.map((niveau) => ({
      niveau_id: niveau.niveau_id,
      code: niveau.code,
      libelle: niveau.libelle,
      rang: niveau.rang,
      avantages: Object.fromEntries(AVANTAGES_PRESENCE[type].map((cle) => [cle, niveau[cle]])),
      durees: dureesPour(pays && tarifs.find((t) => t.niveau_id === niveau.niveau_id && t.pays_id === pays.pays_id), remises),
    }));

    return res.status(200).json({
      type_acteur: type,
      pays,
      pays_disponibles,
      gratuite: gratuiteEnCours(config),
      // Médecins : false = tous les droits sans abonnement dans ce pays.
      abonnement_obligatoire: type === "medecin" ? !!config?.abonnement_obligatoire : true,
      offres,
    });
  } catch (err) {
    next(err);
  }
}

export async function catalogueAbonnementAssurance(req, res, next) {
  try {
    const [niveaux, remises] = await Promise.all([
      prisma.niveauAbonnementAssurance.findMany({ where: { actif: true }, orderBy: { rang: "asc" } }),
      prisma.remiseDureeAbonnementAssurance.findMany({
        where: { duree_mois: { in: DUREES_PROPOSEES } },
        orderBy: { duree_mois: "asc" },
      }),
    ]);
    const tarifs = await prisma.tarifAbonnementAssurance.findMany({
      where: { actif: true, niveau_id: { in: niveaux.map((n) => n.niveau_id) } },
      include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
    });

    const pays_disponibles = paysDesTarifs(tarifs);
    const pays = pays_disponibles.find((p) => p.pays_id === req.query.pays_id) ?? pays_disponibles[0] ?? null;
    const config = pays
      ? await prisma.configAbonnementAssurance.findUnique({ where: { pays_id: pays.pays_id } })
      : null;

    const offres = niveaux.map((niveau) => {
      // Tarif « tous types » de préférence ; sinon le moins cher des tarifs
      // par type d'acteur, affiché « à partir de ».
      const duPays = pays ? tarifs.filter((t) => t.niveau_id === niveau.niveau_id && t.pays_id === pays.pays_id) : [];
      const general = duPays.find((t) => t.type_acteur === null);
      const tarif = general ?? [...duPays].sort((a, b) => Number(a.prix_mensuel) - Number(b.prix_mensuel))[0];
      return {
        niveau_id: niveau.niveau_id,
        code: niveau.code,
        libelle: niveau.libelle,
        rang: niveau.rang,
        avantages: {
          ...Object.fromEntries(AVANTAGES_ASSURANCE.map((cle) => [cle, niveau[cle]])),
          max_agences: niveau.max_agences,
        },
        a_partir_de: !general && duPays.length > 1,
        durees: dureesPour(tarif, remises),
      };
    });

    return res.status(200).json({
      pays,
      pays_disponibles,
      gratuite: gratuiteEnCours(config),
      offres,
    });
  } catch (err) {
    next(err);
  }
}
