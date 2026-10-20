// src/lib/acteursPresence.js
// Abonnements de présence (pharmacies, centres de santé, médecins) : tout
// ce qui diffère d'un type d'acteur à l'autre est décrit ICI, une fois.
// Le reste du module (droits, achat, paiement, cycle, administration) est
// écrit une seule fois pour les trois types.
//
// Une fiche « normalisée » a toujours la forme :
//   { acteur_id, nom, pays_id, statut_verification, date_premiere_publication }

import prisma from "./prisma.js";

export const TYPES_ACTEUR_PRESENCE = ["pharmacie", "structure", "medecin"];

export function estTypeActeurPresence(type) {
  return TYPES_ACTEUR_PRESENCE.includes(type);
}

/**
 * Fiche en ligne : publiée, ou déjà publiée une fois et repassée
 * « en_cours » après une modification de son gestionnaire (elle reste
 * affichée au public pendant la modération et garde donc ses droits).
 * Une fiche jamais publiée, ou retirée (« non_publie »), n'a aucun droit
 * enrichi.
 */
export function estFicheEnLigne(fiche) {
  if (!fiche) return false;
  if (fiche.statut_verification === "publie") return true;
  return fiche.statut_verification === "en_cours" && !!fiche.date_premiere_publication;
}

const ACTEURS = {
  pharmacie: {
    libelle: "pharmacie",
    table: "pharmacie",
    cle: "pharmacie_id",
    lienGestion: (id) => `/pharmacie/${id}/gestion`,
    async charger(client, id) {
      const f = await client.pharmacie.findUnique({
        where: { pharmacie_id: id },
        select: { pharmacie_id: true, nom: true, pays_id: true, statut_verification: true, date_premiere_publication: true },
      });
      return f && {
        acteur_id: f.pharmacie_id, nom: f.nom, pays_id: f.pays_id, statut_verification: f.statut_verification,
        date_premiere_publication: f.date_premiere_publication,
      };
    },
    async chargerPlusieurs(client, ids) {
      const fiches = await client.pharmacie.findMany({
        where: { pharmacie_id: { in: ids } },
        select: { pharmacie_id: true, pays_id: true, statut_verification: true, date_premiere_publication: true },
      });
      return fiches.map((f) => ({
        acteur_id: f.pharmacie_id, pays_id: f.pays_id, statut_verification: f.statut_verification,
        date_premiere_publication: f.date_premiere_publication,
      }));
    },
    async lister(client, { ids, pays_id, recherche, statut_verification }) {
      const where = {};
      if (ids) where.pharmacie_id = { in: ids };
      if (pays_id) where.pays_id = pays_id;
      if (statut_verification) where.statut_verification = statut_verification;
      if (recherche) where.nom = { contains: recherche, mode: "insensitive" };
      const fiches = await client.pharmacie.findMany({
        where,
        select: {
          pharmacie_id: true, nom: true, pays_id: true, statut_verification: true, date_premiere_publication: true,
          pays: { select: { nom: true } },
        },
        orderBy: { nom: "asc" },
      });
      return fiches.map((f) => ({
        acteur_id: f.pharmacie_id, nom: f.nom, pays_id: f.pays_id, pays: f.pays, statut_verification: f.statut_verification,
      }));
    },
    async gestionnaires(client, id) {
      const agents = await client.agentPharmacie.findMany({
        where: { pharmacie_id: id },
        select: { utilisateur_id: true, utilisateur: { select: { statut_compte: true } } },
      });
      return agents.map((a) => ({ utilisateur_id: a.utilisateur_id, statut_compte: a.utilisateur.statut_compte }));
    },
    // Plusieurs pharmacies possibles par compte : celle de l'espace actif
    // (« pharmacie:<id> ») si elle est rattachée, sinon la première.
    async acteurDeUtilisateur(utilisateur_id, espaceActif = null) {
      const agents = await prisma.agentPharmacie.findMany({ where: { utilisateur_id }, select: { pharmacie_id: true }, orderBy: { agent_id: "asc" } });
      const prefere = typeof espaceActif === "string" && espaceActif.startsWith("pharmacie:") ? espaceActif.slice(10) : null;
      return (agents.find((a) => a.pharmacie_id === prefere) ?? agents[0])?.pharmacie_id ?? null;
    },
  },

  structure: {
    libelle: "centre de santé",
    table: "structure_sante",
    cle: "structure_id",
    lienGestion: (id) => `/structure-sante/${id}/gestion`,
    async charger(client, id) {
      const f = await client.structureSante.findUnique({
        where: { structure_id: id },
        select: {
          structure_id: true, nom: true, pays_id: true, statut_verification: true, date_premiere_publication: true,
          type_structure: true,
        },
      });
      return f && {
        acteur_id: f.structure_id, nom: f.nom, pays_id: f.pays_id, statut_verification: f.statut_verification,
        date_premiere_publication: f.date_premiere_publication, type_structure: f.type_structure,
      };
    },
    async chargerPlusieurs(client, ids) {
      const fiches = await client.structureSante.findMany({
        where: { structure_id: { in: ids } },
        select: { structure_id: true, pays_id: true, statut_verification: true, date_premiere_publication: true },
      });
      return fiches.map((f) => ({
        acteur_id: f.structure_id, pays_id: f.pays_id, statut_verification: f.statut_verification,
        date_premiere_publication: f.date_premiere_publication,
      }));
    },
    async lister(client, { ids, pays_id, recherche, statut_verification }) {
      const where = {};
      if (ids) where.structure_id = { in: ids };
      if (pays_id) where.pays_id = pays_id;
      if (statut_verification) where.statut_verification = statut_verification;
      if (recherche) where.nom = { contains: recherche, mode: "insensitive" };
      const fiches = await client.structureSante.findMany({
        where,
        select: {
          structure_id: true, nom: true, pays_id: true, statut_verification: true, date_premiere_publication: true, type_structure: true,
          pays: { select: { nom: true } },
        },
        orderBy: { nom: "asc" },
      });
      return fiches.map((f) => ({
        acteur_id: f.structure_id, nom: f.nom, pays_id: f.pays_id, pays: f.pays, statut_verification: f.statut_verification,
        type_structure: f.type_structure,
      }));
    },
    async gestionnaires(client, id) {
      const agents = await client.agentStructureSante.findMany({
        where: { structure_id: id },
        select: { utilisateur_id: true, utilisateur: { select: { statut_compte: true } } },
      });
      return agents.map((a) => ({ utilisateur_id: a.utilisateur_id, statut_compte: a.utilisateur.statut_compte }));
    },
    // Plusieurs structures possibles par compte : celle de l'espace actif
    // (« structure:<id> ») si elle est rattachée, sinon la première.
    async acteurDeUtilisateur(utilisateur_id, espaceActif = null) {
      const agents = await prisma.agentStructureSante.findMany({ where: { utilisateur_id }, select: { structure_id: true }, orderBy: { agent_id: "asc" } });
      const prefere = typeof espaceActif === "string" && espaceActif.startsWith("structure:") ? espaceActif.slice(10) : null;
      return (agents.find((a) => a.structure_id === prefere) ?? agents[0])?.structure_id ?? null;
    },
  },

  medecin: {
    libelle: "médecin",
    table: "medecin",
    cle: "medecin_id",
    lienGestion: () => "/portail/medecin-abonnement",
    async charger(client, id) {
      const m = await client.medecin.findUnique({
        where: { medecin_id: id },
        select: {
          medecin_id: true, pays_exercice_id: true, statut_verification: true, date_premiere_publication: true,
          utilisateur: { select: { nom: true, prenom: true } },
        },
      });
      return m && {
        acteur_id: m.medecin_id, nom: nomMedecin(m.utilisateur), pays_id: m.pays_exercice_id, statut_verification: m.statut_verification,
        date_premiere_publication: m.date_premiere_publication,
      };
    },
    async chargerPlusieurs(client, ids) {
      const medecins = await client.medecin.findMany({
        where: { medecin_id: { in: ids } },
        select: { medecin_id: true, pays_exercice_id: true, statut_verification: true, date_premiere_publication: true },
      });
      return medecins.map((m) => ({
        acteur_id: m.medecin_id, pays_id: m.pays_exercice_id, statut_verification: m.statut_verification,
        date_premiere_publication: m.date_premiere_publication,
      }));
    },
    async lister(client, { ids, pays_id, recherche, statut_verification }) {
      const where = {};
      if (ids) where.medecin_id = { in: ids };
      if (pays_id) where.pays_exercice_id = pays_id;
      if (statut_verification) where.statut_verification = statut_verification;
      if (recherche) {
        where.utilisateur = {
          OR: [
            { nom: { contains: recherche, mode: "insensitive" } },
            { prenom: { contains: recherche, mode: "insensitive" } },
          ],
        };
      }
      const medecins = await client.medecin.findMany({
        where,
        select: {
          medecin_id: true, pays_exercice_id: true, statut_verification: true, date_premiere_publication: true,
          utilisateur: { select: { nom: true, prenom: true } },
          pays_exercice: { select: { nom: true } },
          specialite: { select: { nom: true } },
        },
      });
      return medecins
        .map((m) => ({
          acteur_id: m.medecin_id, nom: nomMedecin(m.utilisateur), pays_id: m.pays_exercice_id, pays: m.pays_exercice,
          statut_verification: m.statut_verification, specialite: m.specialite?.nom ?? null,
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    },
    async gestionnaires(client, id) {
      const m = await client.medecin.findUnique({
        where: { medecin_id: id },
        select: { utilisateur_id: true, utilisateur: { select: { statut_compte: true } } },
      });
      return m ? [{ utilisateur_id: m.utilisateur_id, statut_compte: m.utilisateur.statut_compte }] : [];
    },
    async acteurDeUtilisateur(utilisateur_id) {
      const m = await prisma.medecin.findUnique({ where: { utilisateur_id }, select: { medecin_id: true } });
      return m?.medecin_id ?? null;
    },
  },
};

function nomMedecin(u) {
  return `Dr ${[u?.prenom, u?.nom].filter(Boolean).join(" ")}`.trim();
}

/** Description du type d'acteur ; lève si le type est inconnu (garde-fou : jamais d'entrée utilisateur brute). */
export function acteur(type) {
  const a = ACTEURS[type];
  if (!a) throw new Error(`Type d'acteur de présence inconnu : ${type}`);
  return a;
}

/** Colonne de abonnement_presence qui porte la fiche (pharmacie_id, structure_id, medecin_id). */
export function champActeur(type) {
  return acteur(type).cle;
}

/** Identifiant de la fiche portée par un abonnement. */
export function acteurIdDe(abonnement) {
  return abonnement[champActeur(abonnement.type_acteur)];
}

/** Filtre Prisma des abonnements d'une fiche. */
export function filtreAbonnementsDe(type, acteur_id) {
  return { type_acteur: type, [champActeur(type)]: acteur_id };
}

/**
 * Verrouille la fiche pour la durée de la transaction SQL `tx` (sérialise
 * webhook, callback, cron et actions admin). Table et colonne viennent de
 * la configuration ci-dessus, jamais de la requête.
 */
export async function verrouillerFichePresence(tx, type, acteur_id) {
  const { table, cle } = acteur(type);
  await tx.$queryRawUnsafe(`SELECT 1 FROM "${table}" WHERE "${cle}" = $1::uuid FOR UPDATE`, acteur_id);
}

export function estAdminOuSuperadmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/** Gestionnaire de CETTE fiche (agent, ou le médecin lui-même), ou admin / superadmin. */
export async function peutGererFichePresence(utilisateur, type, acteur_id) {
  if (!utilisateur) return false;
  if (estAdminOuSuperadmin(utilisateur)) return true;
  const id = await acteur(type).acteurDeUtilisateur(utilisateur.utilisateur_id);
  return !!id && id === acteur_id;
}
