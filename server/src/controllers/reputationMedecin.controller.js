// src/controllers/reputationMedecin.controller.js
// Réputation et métriques du médecin :
//   - tableau de bord du portail médecin (audience, activité, réputation) ;
//   - espace « Avis & notes » du médecin : lecture, réponse, signalement ;
//   - avis publics d'une fiche (synthèse + liste paginée) ;
//   - engagements des visiteurs sur la fiche publique ;
//   - côté patient : consultations à noter et avis déjà donnés.
// Le dépôt et la modération des avis restent dans avis.controller.js.
// Règles métier : services/avisMedecin.service.js,
// services/tableauDeBordMedecin.service.js, services/engagementMedecin.service.js.

import prisma from "../lib/prisma.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import {
  DELAI_AVIS_JOURS,
  MOTIF_SIGNALEMENT_MAX,
  REPONSE_MAX,
  SELECTION_AVIS_PUBLIC,
  notifierReponseAvis,
  presenterAvisPublic,
  resumeNotes,
} from "../services/avisMedecin.service.js";
import { resoudrePeriode, tableauDeBordMedecin } from "../services/tableauDeBordMedecin.service.js";
import { TYPES_ENGAGEMENT_MEDECIN, enregistrerEngagementMedecin } from "../services/engagementMedecin.service.js";

const estAdmin = (u) => u?.role === "admin" || u?.role === "superadmin";

const TRIS_AVIS = {
  recent: [{ date_creation: "desc" }],
  ancien: [{ date_creation: "asc" }],
  note_haute: [{ note: "desc" }, { date_creation: "desc" }],
  note_basse: [{ note: "asc" }, { date_creation: "desc" }],
};

function pagination(query, parDefaut = 10) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const parPage = Math.min(Math.max(Number.parseInt(query.par_page, 10) || parDefaut, 1), 50);
  return { page, parPage, skip: (page - 1) * parPage };
}

/** Filtres communs des listes d'avis (?note=1..5, ?tri=, ?commentaire=avec). */
function filtresListe(query) {
  const where = {};
  const note = Number(query.note);
  if (Number.isInteger(note) && note >= 1 && note <= 5) where.note = note;
  if (query.commentaire === "avec") where.commentaire = { not: null };
  return { where, orderBy: TRIS_AVIS[query.tri] ?? TRIS_AVIS.recent };
}

/**
 * Médecin visé : celui du compte connecté, ou ?medecin_id= pour un admin.
 * @returns {Promise<object|null>}
 */
async function medecinCible(req) {
  const select = {
    medecin_id: true,
    utilisateur_id: true,
    statut_verification: true,
    note_moyenne: true,
    nombre_avis: true,
    pays_exercice: { select: { fuseau_horaire: true } },
    utilisateur: { select: { prenom: true, nom: true } },
  };
  if (estAdmin(req.utilisateur) && req.query.medecin_id) {
    return prisma.medecin.findUnique({ where: { medecin_id: String(req.query.medecin_id) }, select });
  }
  return prisma.medecin.findUnique({ where: { utilisateur_id: req.utilisateur.utilisateur_id }, select });
}

const PAS_DE_FICHE = { message: "Aucune fiche médecin n'est associée à ce compte." };

/* ============================ Tableau de bord ============================ */

/**
 * GET /api/medecins/mon-espace/tableau-de-bord?du=AAAA-MM-JJ&au=AAAA-MM-JJ&granularite=jour|semaine|mois
 * Médecin connecté (ou admin avec ?medecin_id=). Défaut : 30 derniers jours, par jour.
 */
export async function obtenirTableauDeBordMedecin(req, res, next) {
  try {
    const medecin = await medecinCible(req);
    if (!medecin) return res.status(404).json(PAS_DE_FICHE);

    const periode = resoudrePeriode(req.query);
    if (periode.erreur) return res.status(periode.erreur.status).json({ message: periode.erreur.message });

    const donnees = await tableauDeBordMedecin({ medecin, periode, admin: estAdmin(req.utilisateur) });
    return res.status(200).json({
      fiche: {
        medecin_id: medecin.medecin_id,
        statut_verification: medecin.statut_verification,
        note_moyenne: medecin.note_moyenne === null ? null : Number(medecin.note_moyenne),
        nombre_avis: medecin.nombre_avis,
      },
      ...donnees,
    });
  } catch (err) {
    next(err);
  }
}

/* ========================= Espace avis du médecin ========================= */

/**
 * GET /api/medecins/mon-espace/avis?note=&reponse=avec|sans&commentaire=avec&tri=&page=&par_page=
 * Avis PUBLIÉS du médecin (les avis en attente de modération ne sont que
 * comptés : leur contenu n'est pas encore validé), synthèse des notes.
 */
export async function listerMesAvis(req, res, next) {
  try {
    const medecin = await medecinCible(req);
    if (!medecin) return res.status(404).json(PAS_DE_FICHE);

    const { where: filtres, orderBy } = filtresListe(req.query);
    if (req.query.reponse === "avec") filtres.reponse_medecin = { not: null };
    if (req.query.reponse === "sans") filtres.reponse_medecin = null;
    const where = { medecin_id: medecin.medecin_id, statut_moderation: "publie", ...filtres };
    const { page, parPage, skip } = pagination(req.query);

    const [resume, total, avis, enAttente, sansReponse] = await Promise.all([
      resumeNotes(medecin.medecin_id),
      prisma.avisMedecin.count({ where }),
      prisma.avisMedecin.findMany({
        where,
        orderBy,
        skip,
        take: parPage,
        select: { ...SELECTION_AVIS_PUBLIC, signale_le: true, motif_signalement: true },
      }),
      prisma.avisMedecin.count({ where: { medecin_id: medecin.medecin_id, statut_moderation: "en_attente" } }),
      prisma.avisMedecin.count({
        where: { medecin_id: medecin.medecin_id, statut_moderation: "publie", reponse_medecin: null },
      }),
    ]);

    return res.status(200).json({
      resume,
      en_attente_moderation: enAttente,
      sans_reponse: sansReponse,
      avis: avis.map((a) => ({
        ...presenterAvisPublic(a),
        signalement: a.signale_le ? { date: a.signale_le, motif: a.motif_signalement } : null,
      })),
      pagination: { page, par_page: parPage, total, pages: Math.max(1, Math.ceil(total / parPage)) },
    });
  } catch (err) {
    next(err);
  }
}

/** Avis publié du médecin connecté, ou réponse d'erreur déjà envoyée. */
async function avisDuMedecin(req, res) {
  const avis = await prisma.avisMedecin.findUnique({
    where: { avis_id: req.params.id },
    include: { medecin: { select: { utilisateur_id: true, utilisateur: { select: { prenom: true, nom: true } } } } },
  });
  if (!avis) {
    res.status(404).json({ message: "Avis introuvable." });
    return null;
  }
  if (avis.medecin.utilisateur_id !== req.utilisateur.utilisateur_id) {
    res.status(403).json({ message: "Seul le médecin concerné peut agir sur cet avis." });
    return null;
  }
  if (avis.statut_moderation !== "publie") {
    res.status(409).json({ message: "Cet avis n'est pas publié." });
    return null;
  }
  return avis;
}

/**
 * PUT /api/avis-medecin/:id/reponse   Body : { reponse }
 * Crée ou corrige la réponse publique du médecin (publiée immédiatement ;
 * l'administration peut toujours supprimer l'avis et sa réponse).
 */
export async function repondreAvis(req, res, next) {
  try {
    const avis = await avisDuMedecin(req, res);
    if (!avis) return;

    const texte = typeof req.body?.reponse === "string" ? req.body.reponse.trim() : "";
    if (!texte) return res.status(400).json({ message: "La réponse ne peut pas être vide." });
    if (texte.length > REPONSE_MAX) {
      return res.status(400).json({ message: `La réponse ne peut pas dépasser ${REPONSE_MAX} caractères.` });
    }

    const misAJour = await prisma.avisMedecin.update({
      where: { avis_id: avis.avis_id },
      data: { reponse_medecin: texte, date_reponse: new Date() },
      select: { ...SELECTION_AVIS_PUBLIC, utilisateur_id: true, medecin_id: true },
    });
    notifierReponseAvis(misAJour, avis.medecin);
    return res.status(200).json({ message: "Réponse publiée.", avis: presenterAvisPublic(misAJour) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/avis-medecin/:id/reponse — retire la réponse du médecin. */
export async function supprimerReponseAvis(req, res, next) {
  try {
    const avis = await avisDuMedecin(req, res);
    if (!avis) return;
    const misAJour = await prisma.avisMedecin.update({
      where: { avis_id: avis.avis_id },
      data: { reponse_medecin: null, date_reponse: null },
      select: SELECTION_AVIS_PUBLIC,
    });
    return res.status(200).json({ message: "Réponse retirée.", avis: presenterAvisPublic(misAJour) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/avis-medecin/:id/signaler   Body : { motif }
 * Signale l'avis au back-office (contenu abusif, patient inconnu...).
 * L'avis reste en ligne tant que l'administration n'a pas tranché.
 */
export async function signalerAvis(req, res, next) {
  try {
    const avis = await avisDuMedecin(req, res);
    if (!avis) return;
    const motif = typeof req.body?.motif === "string" ? req.body.motif.trim() : "";
    if (motif.length < 10) return res.status(400).json({ message: "Précisez le motif du signalement (10 caractères au moins)." });
    if (motif.length > MOTIF_SIGNALEMENT_MAX) {
      return res.status(400).json({ message: `Le motif ne peut pas dépasser ${MOTIF_SIGNALEMENT_MAX} caractères.` });
    }
    await prisma.avisMedecin.update({
      where: { avis_id: avis.avis_id },
      data: { signale_le: new Date(), motif_signalement: motif },
    });
    return res.status(200).json({ message: "Avis signalé : l'équipe APS Santé va l'examiner." });
  } catch (err) {
    next(err);
  }
}

/* ============================== Avis publics ============================== */

/**
 * GET /api/medecins/:id/avis?note=&tri=&commentaire=avec&page=&par_page=
 * PUBLIQUE : synthèse des notes et avis publiés, sans identifiant d'auteur.
 */
export async function listerAvisPublicsMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({
      where: { medecin_id: req.params.id },
      select: { medecin_id: true },
    });
    if (!medecin) return res.status(404).json({ message: "Médecin introuvable." });

    const { where: filtres, orderBy } = filtresListe(req.query);
    const where = { medecin_id: medecin.medecin_id, statut_moderation: "publie", ...filtres };
    const { page, parPage, skip } = pagination(req.query, 5);

    const [resume, total, avis] = await Promise.all([
      resumeNotes(medecin.medecin_id),
      prisma.avisMedecin.count({ where }),
      prisma.avisMedecin.findMany({ where, orderBy, skip, take: parPage, select: SELECTION_AVIS_PUBLIC }),
    ]);
    return res.status(200).json({
      resume,
      avis: avis.map(presenterAvisPublic),
      pagination: { page, par_page: parPage, total, pages: Math.max(1, Math.ceil(total / parPage)) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/medecins/:id/engagements   Body : { type }
 * PUBLIQUE (authentification optionnelle). Toujours 202 pour un type
 * valide : le visiteur n'a pas à savoir si son action a été comptée.
 */
export async function enregistrerEngagement(req, res, next) {
  try {
    const type = req.body?.type;
    if (!TYPES_ENGAGEMENT_MEDECIN.includes(type)) {
      return res.status(400).json({ message: `type invalide. Valeurs acceptées : ${TYPES_ENGAGEMENT_MEDECIN.join(", ")}.` });
    }
    const medecin = await prisma.medecin.findUnique({
      where: { medecin_id: req.params.id },
      select: { medecin_id: true, utilisateur_id: true },
    });
    if (!medecin) return res.status(404).json({ message: "Médecin introuvable." });
    enregistrerEngagementMedecin({ req, medecin, type });
    return res.status(202).end();
  } catch (err) {
    next(err);
  }
}

/* ================================ Patient ================================ */

const SELECTION_MEDECIN_COURTE = {
  medecin_id: true,
  photo_url: true,
  utilisateur: { select: { prenom: true, nom: true } },
  specialite: { select: { nom: true } },
};

// photo_url est stocké sous forme de nom Cloudinary (voir schema.prisma).
const avecPhoto = (m) => m && { ...m, photo_url: m.photo_url ? construireUrl(m.photo_url) : null };

/**
 * GET /api/avis-medecin/a-donner
 * Patient connecté : consultations terminées depuis moins de
 * DELAI_AVIS_JOURS jours, sans avis.
 */
export async function listerConsultationsANoter(req, res, next) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { utilisateur_id: req.utilisateur.utilisateur_id },
      select: { patient_id: true },
    });
    if (!patient) return res.status(200).json({ consultations: [], delai_jours: DELAI_AVIS_JOURS });

    const depuis = new Date(Date.now() - DELAI_AVIS_JOURS * 86_400_000);
    const rdv = await prisma.rendezVous.findMany({
      where: {
        patient_id: patient.patient_id,
        avis_medecin: null,
        OR: [{ termine_le: { gte: depuis } }, { termine_le: null, statut: "honore", date_creneau: { gte: depuis } }],
      },
      orderBy: [{ termine_le: "desc" }, { date_creneau: "desc" }],
      take: 20,
      select: {
        rdv_id: true, date_creneau: true, termine_le: true, type_rdv: true,
        medecin: { select: SELECTION_MEDECIN_COURTE },
      },
    });
    return res.status(200).json({
      consultations: rdv.map((r) => ({ ...r, medecin: avecPhoto(r.medecin) })),
      delai_jours: DELAI_AVIS_JOURS,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/avis-medecin/mes-avis — avis donnés par l'utilisateur connecté (tous statuts). */
export async function listerAvisDonnes(req, res, next) {
  try {
    const avis = await prisma.avisMedecin.findMany({
      where: { utilisateur_id: req.utilisateur.utilisateur_id },
      orderBy: { date_creation: "desc" },
      take: 50,
      select: {
        ...SELECTION_AVIS_PUBLIC,
        statut_moderation: true,
        medecin: { select: SELECTION_MEDECIN_COURTE },
      },
    });
    return res.status(200).json({
      avis: avis.map((a) => ({ ...presenterAvisPublic(a), statut_moderation: a.statut_moderation, medecin: avecPhoto(a.medecin) })),
    });
  } catch (err) {
    next(err);
  }
}
