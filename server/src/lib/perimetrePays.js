// src/lib/perimetrePays.js
//
// ABAC « périmètre pays » du back-office : un compte `admin` ne lit et
// n'écrit QUE les données de son pays (claim `pays_id` de l'access
// token) ; un `superadmin` n'a aucune restriction.
//
// Plutôt que de répéter un filtre `pays_id` dans chaque contrôleur (et
// d'en oublier un), le filtre est posé à UN seul endroit :
//   1. `poserPerimetrePays` (middleware global, index.js) lit le token de
//      la requête ; pour un admin, il exécute la suite de la requête dans
//      un contexte AsyncLocalStorage portant son pays ;
//   2. l'extension Prisma `extensionPerimetrePays` (lib/prisma.js) ajoute
//      à chaque requête de premier niveau le filtre du pays courant, selon
//      la règle du modèle (colonne directe ou chemin de relation, voir
//      REGLES ci-dessous), et refuse toute création hors du pays.
//
// Hors contexte (visiteur, patient, médecin, superadmin, tâches planifiées,
// webhooks) : aucune restriction, comportement inchangé.
//
// Limites assumées :
//  - les `include` / `select` imbriqués ne sont pas refiltrés (ils suivent
//    leur parent, déjà dans le périmètre) ;
//  - un modèle sans règle (référentiels globaux : langues, devises,
//    spécialités, niveaux d'abonnement, emplacements publicitaires,
//    annonces, WhatsApp, SMS…) n'est pas filtré : ses routes d'écriture
//    sont réservées au superadmin (voir les fichiers routes/) ;
//  - $queryRaw / $executeRaw ne sont pas filtrés (verrous et PostGIS
//    uniquement, toujours sur un identifiant déjà obtenu dans le périmètre).
import { AsyncLocalStorage } from "node:async_hooks";
import { verifierAccessToken } from "../utils/token.utils.js";

const stockage = new AsyncLocalStorage();

/** Pays imposé à la requête courante, ou null (aucune restriction). */
export function paysDuPerimetre() {
  return stockage.getStore()?.pays_id ?? null;
}

/** Exécute `fn` dans le périmètre d'un pays (tests, scripts). */
export function executerDansPerimetre(pays_id, fn) {
  return stockage.run({ pays_id }, fn);
}

/**
 * Exécute `fn` sans restriction de pays, même au sein d'une requête admin.
 * À réserver aux lectures techniques qui doivent voir toute la base (ex.
 * contrôle d'unicité d'un e-mail).
 */
export function horsPerimetre(fn) {
  return stockage.run({ pays_id: null }, fn);
}

export class ErreurHorsPerimetre extends Error {
  constructor(message = "Accès refusé : cette donnée relève d'un autre pays que le vôtre.") {
    super(message);
    this.name = "ErreurHorsPerimetre";
    this.status = 403;
  }
}

/**
 * Middleware global (monté avant les routes). Ne bloque JAMAIS : un token
 * absent, invalide ou expiré laisse passer la requête sans périmètre, et
 * c'est `authentifier` qui refusera ensuite si la route est protégée.
 * Un token admin révoqué n'ouvre rien de plus : il ne fait que restreindre.
 */
export function poserPerimetrePays(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  let payload;
  try {
    payload = verifierAccessToken(header.slice("Bearer ".length));
  } catch {
    return next();
  }
  if (payload?.scope || payload?.role !== "admin") return next();
  if (!payload.pays_id) {
    // Un admin sans pays ne doit rien voir : périmètre impossible.
    return stockage.run({ pays_id: "00000000-0000-0000-0000-000000000000" }, next);
  }
  return stockage.run({ pays_id: payload.pays_id }, next);
}

// ─── Règles par modèle ───────────────────────────────────────────────
// `filtre(p)` : clause where restreignant le modèle au pays p.
// `colonne`   : colonne pays portée directement par le modèle — sert à
//               vérifier les données d'une création / mise à jour.

const direct = (colonne = "pays_id") => ({
  colonne,
  filtre: (p) => ({ [colonne]: p }),
});
const via = (chemin) => ({ filtre: chemin });

const parMedecin = via((p) => ({ medecin: { is: { pays_exercice_id: p } } }));
const parUtilisateur = via((p) => ({ utilisateur: { is: { pays_id: p } } }));
const parPharmacie = via((p) => ({ pharmacie: { is: { pays_id: p } } }));
const parServiceAssurance = via((p) => ({ service_assurance: { is: { pays_id: p } } }));
const parLaboratoire = via((p) => ({ laboratoire: { is: { pays_id: p } } }));
const parPublicite = via((p) => ({ publicite: { is: { pays_id: p } } }));
const parRendezVous = via((p) => ({ rendez_vous: { is: { medecin: { is: { pays_exercice_id: p } } } } }));

const filtreAbonnementPresence = (p) => ({
  OR: [
    { pharmacie: { is: { pays_id: p } } },
    { structure: { is: { pays_id: p } } },
    { medecin: { is: { pays_exercice_id: p } } },
  ],
});

const filtreFichePresence = (p) => ({
  OR: [
    { pharmacie: { is: { pays_id: p } } },
    { structure: { is: { pays_id: p } } },
  ],
});

export const REGLES = {
  // Colonne pays directe
  Pays: direct(),
  Ville: direct(),
  Utilisateur: direct(),
  StructureSante: direct(),
  ServiceAssurance: direct(),
  Pharmacie: direct(),
  Laboratoire: direct(),
  Publicite: direct(),
  PlanningGarde: direct(),
  LigneTarifaire: direct(),
  ParametreAmende: direct(),
  ParametreDelaiLiberation: direct(),
  ParametreDelaiConfirmation: direct(),
  Urgence: direct(),
  TypeMobileMoney: direct(),
  TarifAbonnementAssurance: direct(),
  ConfigAbonnementAssurance: direct(),
  TarifAbonnementPresence: direct(),
  ConfigAbonnementPresence: direct(),
  OffreRdv: direct(),
  // Forfait sans pays = forfait historique, visible de tous en lecture.
  ForfaitPublicitaire: {
    colonne: "pays_id",
    filtre: (p) => ({ OR: [{ pays_id: p }, { pays_id: null }] }),
    filtreEcriture: (p) => ({ pays_id: p }),
  },
  Medecin: direct("pays_exercice_id"),
  Ordonnance: parMedecin,

  // Comptes rattachés à un utilisateur
  Patient: parUtilisateur,
  AgentStructureSante: parUtilisateur,
  AgentPharmacie: parUtilisateur,
  AgentAssurance: parUtilisateur,
  AgentLaboratoire: parUtilisateur,
  AgentAmbulance: parUtilisateur,
  AgentPompesFunebres: parUtilisateur,

  // Satellites d'un médecin
  RendezVous: parMedecin,
  AvisMedecin: parMedecin,
  AmendeMedecin: parMedecin,
  DemandeRetrait: parMedecin,
  PortefeuilleMedecin: parMedecin,
  ForfaitAbonnementMedecin: parMedecin,
  DisponibiliteMedecin: parMedecin,
  CreneauAgenda: parMedecin,
  MobileMoney: parMedecin,
  CompteBancaire: parMedecin,
  CompteStripeConnect: parMedecin,
  EngagementMedecin: parMedecin,
  ReponseOffreRdv: parMedecin,
  MouvementPortefeuille: via((p) => ({ portefeuille: { is: { medecin: { is: { pays_exercice_id: p } } } } })),
  CompteEscrow: parRendezVous,
  CommissionApsVersee: parRendezVous,

  // Satellites d'une pharmacie
  AvisPharmacie: parPharmacie,
  AbonnementPharmacie: parPharmacie,
  GardePharmacie: parPharmacie,

  // Espaces pharmacie / centre de santé (photos, actualités, messages, prestations)
  MediaFichePresence: via(filtreFichePresence),
  ActualiteFichePresence: via(filtreFichePresence),
  MessageFichePresence: via(filtreFichePresence),
  PrestationStructure: via((p) => ({ structure: { is: { pays_id: p } } })),

  // Satellites d'une assurance
  MiseEnRelation: parServiceAssurance,
  MediaAssurance: parServiceAssurance,
  Activite: parServiceAssurance,
  Agence: parServiceAssurance,
  OptionActivite: via((p) => ({ activite: { is: { service_assurance: { is: { pays_id: p } } } } })),
  AbonnementAssurance: via((p) => ({ service: { is: { pays_id: p } } })),
  FactureAbonnementAssurance: via((p) => ({ abonnement: { is: { service: { is: { pays_id: p } } } } })),

  // Satellites d'un laboratoire
  ExamenLaboratoire: parLaboratoire,
  CentreLaboratoire: parLaboratoire,
  MediaLaboratoire: parLaboratoire,
  AvisLaboratoire: parLaboratoire,
  EngagementLaboratoire: parLaboratoire,

  // Abonnements de présence (pharmacie, structure ou médecin)
  AbonnementPresence: via(filtreAbonnementPresence),
  FactureAbonnementPresence: via((p) => ({ abonnement: { is: filtreAbonnementPresence(p) } })),

  // Publicité
  FacturePublicite: parPublicite,
  StatistiquePubliciteJour: parPublicite,
  LigneForfaitPublicitaire: via((p) => ({
    forfait_publicitaire: { is: { OR: [{ pays_id: p }, { pays_id: null }] } },
  })),
};

// TransactionPaiement / RemboursementPaiement : la cible d'une transaction
// est un identifiant scalaire (rdv_id_cible, abonnement_*_id_cible,
// publicite_id_cible) et non une relation. On ne filtre donc que les
// LISTES (findMany / count…) : les identifiants des cibles du pays sont
// lus une fois par requête puis mis en cache dans le contexte.
const LECTURES_LISTE = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);

async function filtreTransactions(client, store) {
  if (store.filtreTransactions) return store.filtreTransactions;
  const p = store.pays_id;
  const [abosAssurance, abosPresence, publicites] = await horsPerimetre(() =>
    Promise.all([
      client.abonnementAssurance.findMany({ where: { service: { is: { pays_id: p } } }, select: { abonnement_id: true } }),
      client.abonnementPresence.findMany({ where: filtreAbonnementPresence(p), select: { abonnement_id: true } }),
      client.publicite.findMany({ where: { pays_id: p }, select: { publicite_id: true } }),
    ])
  );
  store.filtreTransactions = {
    OR: [
      { compte_escrow: { is: { rendez_vous: { is: { medecin: { is: { pays_exercice_id: p } } } } } } },
      { abonnement_assurance_id_cible: { in: abosAssurance.map((a) => a.abonnement_id) } },
      { abonnement_presence_id_cible: { in: abosPresence.map((a) => a.abonnement_id) } },
      { publicite_id_cible: { in: publicites.map((x) => x.publicite_id) } },
    ],
  };
  return store.filtreTransactions;
}

// ─── Application des règles ──────────────────────────────────────────

const LECTURES = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
]);
const ECRITURES_CIBLEES = new Set(["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert"]);
const CREATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

function avecFiltre(where, filtre) {
  const w = where ?? {};
  const et = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  return { ...w, AND: [...et, filtre] };
}

// Valeur de la colonne pays dans des données de création / mise à jour :
// `pays_id: "…"`, `pays_id: { set: "…" }` ou `pays: { connect: { pays_id } }`.
function paysDesDonnees(data, colonne) {
  if (!data || typeof data !== "object") return undefined;
  const v = data[colonne];
  if (typeof v === "string" || v === null) return v;
  if (v && typeof v === "object" && "set" in v) return v.set;
  const relation = colonne.replace(/_id$/, "");
  const connect = data[relation]?.connect;
  if (connect && typeof connect === "object") return connect.pays_id ?? connect[colonne];
  return undefined;
}

function verifierDonnees(regle, data, p, { creation }) {
  if (!regle.colonne) return;
  const lignes = Array.isArray(data) ? data : [data];
  for (const ligne of lignes) {
    const valeur = paysDesDonnees(ligne, regle.colonne);
    if (valeur === undefined && !creation) continue; // la mise à jour ne touche pas au pays
    if (valeur !== p) throw new ErreurHorsPerimetre();
  }
}

/** Extension Prisma (à brancher via prisma.$extends). */
export function extensionPerimetrePays(client) {
  return {
    name: "perimetre-pays",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const store = stockage.getStore();
          const p = store?.pays_id;
          if (!p) return query(args);

          if (model === "TransactionPaiement" || model === "RemboursementPaiement") {
            if (!LECTURES_LISTE.has(operation)) return query(args);
            const filtre = await filtreTransactions(client, store);
            const where = model === "TransactionPaiement" ? filtre : { transaction: { is: filtre } };
            return query({ ...args, where: avecFiltre(args?.where, where) });
          }

          const regle = REGLES[model];
          if (!regle) return query(args);
          const filtreEcriture = (regle.filtreEcriture ?? regle.filtre)(p);

          if (LECTURES.has(operation)) {
            return query({ ...args, where: avecFiltre(args?.where, regle.filtre(p)) });
          }
          if (CREATIONS.has(operation)) {
            verifierDonnees(regle, args?.data, p, { creation: true });
            return query(args);
          }
          if (ECRITURES_CIBLEES.has(operation)) {
            if (operation === "upsert") {
              verifierDonnees(regle, args?.create, p, { creation: true });
              verifierDonnees(regle, args?.update, p, { creation: false });
            } else if (args?.data) {
              verifierDonnees(regle, args.data, p, { creation: false });
            }
            return query({ ...args, where: avecFiltre(args?.where, filtreEcriture) });
          }
          return query(args);
        },
      },
    },
  };
}
