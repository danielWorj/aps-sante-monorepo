// src/controllers/documentLegal.controller.js
// Documents légaux (CGU, politique de confidentialité).
//
//   - Public : lecture de la version en vigueur (ou d'une version
//     archivée) et de l'historique, pour les pages /cgu et
//     /confidentialite du site (l'application mobile ouvre ces pages).
//   - Superadmin : brouillon -> publication -> archivage, et liste des
//     comptes ayant accepté chaque version.
//
// Une version publiée ou archivée n'est plus modifiable : pour corriger
// le texte, on crée une nouvelle version (pré-remplie avec la dernière).

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { LONGUEUR_HTML_MAX, nettoyerHtmlDocumentLegal, texteBrut } from "../lib/htmlDocumentLegal.js";
import {
  LIBELLES_DOCUMENT_LEGAL,
  TYPES_DOCUMENT_LEGAL,
  obtenirVersionEnVigueur,
} from "../services/documentLegal.service.js";

const PAR_PAGE = 25;
const LONGUEUR_TEXTE_MIN = 200;
// Repère laissé dans le modèle de départ : interdit à la publication.
const A_COMPLETER = "[À compléter]";

const texte = (v) => (typeof v === "string" ? v.trim() : "");
const typeValide = (t) => TYPES_DOCUMENT_LEGAL.includes(t);

// Plan de départ de la toute première version : uniquement des intitulés
// d'articles usuels, le texte juridique reste à rédiger.
const PLANS_DE_DEPART = {
  cgu: [
    "Article 1 – Objet",
    "Article 2 – Définitions",
    "Article 3 – Accès au service et création de compte",
    "Article 4 – Services proposés",
    "Article 5 – Rendez-vous, téléconsultation et paiement",
    "Article 6 – Obligations de l'utilisateur",
    "Article 7 – Rôle et responsabilité d'ApSa",
    "Article 8 – Professionnels et établissements référencés",
    "Article 9 – Avis et contenus publiés",
    "Article 10 – Données personnelles",
    "Article 11 – Propriété intellectuelle",
    "Article 12 – Suspension et résiliation du compte",
    "Article 13 – Modification des conditions",
    "Article 14 – Droit applicable et litiges",
    "Article 15 – Contact",
  ],
  confidentialite: [
    "1. Responsable du traitement",
    "2. Données collectées",
    "3. Finalités et bases légales",
    "4. Données de santé",
    "5. Destinataires des données",
    "6. Transferts hors du pays",
    "7. Durées de conservation",
    "8. Sécurité",
    "9. Vos droits",
    "10. Cookies et traceurs",
    "11. Modification de la politique",
    "12. Contact",
  ],
};

function contenuDeDepart(type) {
  return PLANS_DE_DEPART[type].map((t) => `<h2>${t}</h2><p>${A_COMPLETER}</p>`).join("");
}

const SELECT_LISTE = {
  version_document_legal_id: true,
  type: true,
  numero: true,
  titre: true,
  resume_modifications: true,
  statut: true,
  date_publication: true,
  date_archivage: true,
  date_creation: true,
  date_modification: true,
  _count: { select: { acceptations: true } },
};

function presenterVersion(v) {
  const { _count, ...reste } = v;
  return { ...reste, ...(_count ? { nombre_acceptations: _count.acceptations } : {}) };
}

/* ===================================================================
 * Public
 * =================================================================== */

/**
 * GET /api/documents-legaux/:type?version=N — PUBLIQUE.
 * Sans `version` : version en vigueur. Avec : une version publiée ou
 * archivée (jamais un brouillon). Renvoie aussi l'historique.
 */
export async function obtenirDocumentLegal(req, res, next) {
  try {
    const { type } = req.params;
    if (!typeValide(type)) return res.status(404).json({ message: "Document introuvable." });

    const numero = Number.parseInt(req.query.version, 10);
    const version = Number.isInteger(numero)
      ? await prisma.versionDocumentLegal.findFirst({
        where: { type, numero, statut: { in: ["publiee", "archivee"] } },
      })
      : await obtenirVersionEnVigueur(type);

    if (!version) {
      return res.status(404).json({ message: `${LIBELLES_DOCUMENT_LEGAL[type]} : document pas encore publié.` });
    }

    const historique = await prisma.versionDocumentLegal.findMany({
      where: { type, statut: { in: ["publiee", "archivee"] } },
      orderBy: { numero: "desc" },
      select: { numero: true, statut: true, date_publication: true, date_archivage: true },
    });

    return res.status(200).json({
      type,
      libelle: LIBELLES_DOCUMENT_LEGAL[type],
      numero: version.numero,
      titre: version.titre,
      contenu_html: version.contenu_html,
      resume_modifications: version.resume_modifications,
      date_publication: version.date_publication,
      date_archivage: version.date_archivage,
      en_vigueur: version.statut === "publiee",
      historique: historique.map((h) => ({
        numero: h.numero,
        en_vigueur: h.statut === "publiee",
        date_publication: h.date_publication,
        date_archivage: h.date_archivage,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Back-office (superadmin)
 * =================================================================== */

/** GET /api/admin/documents-legaux?type=cgu — versions d'un type, plus récente d'abord. */
export async function listerVersionsDocumentLegal(req, res, next) {
  try {
    const type = req.query.type;
    if (!typeValide(type)) return res.status(400).json({ message: "Type de document invalide." });
    const versions = await prisma.versionDocumentLegal.findMany({
      where: { type },
      orderBy: { numero: "desc" },
      select: SELECT_LISTE,
    });
    return res.status(200).json({
      type,
      libelle: LIBELLES_DOCUMENT_LEGAL[type],
      versions: versions.map(presenterVersion),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/documents-legaux/versions/:id — version complète (avec contenu). */
export async function obtenirVersionDocumentLegal(req, res, next) {
  try {
    const version = await prisma.versionDocumentLegal.findUnique({
      where: { version_document_legal_id: req.params.id },
      select: { ...SELECT_LISTE, contenu_html: true },
    });
    if (!version) return res.status(404).json({ message: "Version introuvable." });
    return res.status(200).json({ version: presenterVersion(version) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/documents-legaux { type } — nouveau brouillon, pré-rempli
 * avec la dernière version (ou un plan d'articles pour la première).
 * Un seul brouillon à la fois par type.
 */
export async function creerBrouillonDocumentLegal(req, res, next) {
  try {
    const type = req.body?.type;
    if (!typeValide(type)) return res.status(400).json({ message: "Type de document invalide." });

    const brouillon = await prisma.versionDocumentLegal.findFirst({
      where: { type, statut: "brouillon" },
      select: { version_document_legal_id: true },
    });
    if (brouillon) {
      return res.status(409).json({
        message: "Un brouillon existe déjà pour ce document : modifiez-le ou supprimez-le.",
        version_document_legal_id: brouillon.version_document_legal_id,
      });
    }

    const derniere = await prisma.versionDocumentLegal.findFirst({
      where: { type },
      orderBy: { numero: "desc" },
      select: { numero: true, titre: true, contenu_html: true },
    });

    let version;
    try {
      version = await prisma.versionDocumentLegal.create({
        data: {
          type,
          numero: (derniere?.numero ?? 0) + 1,
          titre: derniere?.titre ?? LIBELLES_DOCUMENT_LEGAL[type],
          contenu_html: derniere?.contenu_html ?? contenuDeDepart(type),
          cree_par_id: req.utilisateur.utilisateur_id,
        },
        select: { ...SELECT_LISTE, contenu_html: true },
      });
    } catch (err) {
      // Deux créations simultanées : la contrainte (type, numero) tranche.
      if (err.code === "P2002") return res.status(409).json({ message: "Un brouillon vient d'être créé : actualisez la page." });
      throw err;
    }

    return res.status(201).json({ message: "Brouillon créé.", version: presenterVersion(version) });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/documents-legaux/versions/:id { titre?, contenu_html?, resume_modifications? } — brouillon seulement. */
export async function modifierBrouillonDocumentLegal(req, res, next) {
  try {
    const donnees = {};
    if (req.body?.titre !== undefined) {
      const titre = texte(req.body.titre);
      if (titre.length < 3 || titre.length > 200) {
        return res.status(400).json({ message: "Le titre doit contenir entre 3 et 200 caractères." });
      }
      donnees.titre = titre;
    }
    if (req.body?.contenu_html !== undefined) {
      if (typeof req.body.contenu_html !== "string" || req.body.contenu_html.length > LONGUEUR_HTML_MAX) {
        return res.status(400).json({ message: "Contenu invalide ou trop long." });
      }
      donnees.contenu_html = nettoyerHtmlDocumentLegal(req.body.contenu_html);
    }
    if (req.body?.resume_modifications !== undefined) {
      donnees.resume_modifications = texte(req.body.resume_modifications).slice(0, 2000) || null;
    }
    if (!Object.keys(donnees).length) return res.status(400).json({ message: "Aucune modification fournie." });

    const { count } = await prisma.versionDocumentLegal.updateMany({
      where: { version_document_legal_id: req.params.id, statut: "brouillon" },
      data: donnees,
    });
    if (!count) {
      return res.status(409).json({ message: "Seul un brouillon peut être modifié : créez une nouvelle version." });
    }

    const version = await prisma.versionDocumentLegal.findUnique({
      where: { version_document_legal_id: req.params.id },
      select: { ...SELECT_LISTE, contenu_html: true },
    });
    return res.status(200).json({ message: "Brouillon enregistré.", version: presenterVersion(version) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/documents-legaux/versions/:id/publier — le brouillon
 * entre en vigueur immédiatement ; la version précédente est archivée.
 */
export async function publierVersionDocumentLegal(req, res, next) {
  try {
    const brouillon = await prisma.versionDocumentLegal.findUnique({
      where: { version_document_legal_id: req.params.id },
    });
    if (!brouillon) return res.status(404).json({ message: "Version introuvable." });
    if (brouillon.statut !== "brouillon") return res.status(409).json({ message: "Cette version est déjà publiée ou archivée." });

    const contenu = texteBrut(brouillon.contenu_html);
    if (contenu.includes(A_COMPLETER)) {
      return res.status(400).json({ message: `Le texte contient encore des passages « ${A_COMPLETER} ».` });
    }
    if (contenu.length < LONGUEUR_TEXTE_MIN) {
      return res.status(400).json({ message: "Le texte est trop court pour être publié." });
    }
    if (brouillon.numero > 1 && !brouillon.resume_modifications) {
      return res.status(400).json({ message: "Résumez ce qui change par rapport à la version précédente avant de publier." });
    }

    const maintenant = new Date();
    const version = await prisma.$transaction(async (tx) => {
      const precedentes = await tx.versionDocumentLegal.findMany({
        where: { type: brouillon.type, statut: "publiee" },
        select: { version_document_legal_id: true, numero: true },
      });
      await tx.versionDocumentLegal.updateMany({
        where: { type: brouillon.type, statut: "publiee" },
        data: { statut: "archivee", date_archivage: maintenant },
      });
      const { count } = await tx.versionDocumentLegal.updateMany({
        where: { version_document_legal_id: brouillon.version_document_legal_id, statut: "brouillon" },
        data: { statut: "publiee", date_publication: maintenant, publie_par_id: req.utilisateur.utilisateur_id },
      });
      if (!count) {
        const err = new Error("Cette version vient d'être publiée par ailleurs.");
        err.status = 409;
        throw err;
      }
      await journaliserAudit(tx, {
        acteur_id: req.utilisateur.utilisateur_id,
        type: "DOCUMENT_LEGAL_PUBLIE",
        objet_type: "version_document_legal",
        objet_id: brouillon.version_document_legal_id,
        details: {
          type: brouillon.type,
          numero: brouillon.numero,
          versions_archivees: precedentes.map((p) => p.numero),
        },
      });
      return tx.versionDocumentLegal.findUnique({
        where: { version_document_legal_id: brouillon.version_document_legal_id },
        select: { ...SELECT_LISTE, contenu_html: true },
      });
    });

    return res.status(200).json({
      message: `${LIBELLES_DOCUMENT_LEGAL[brouillon.type]} : version ${brouillon.numero} publiée.`,
      version: presenterVersion(version),
    });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ message: err.message });
    next(err);
  }
}

/** DELETE /api/admin/documents-legaux/versions/:id — brouillon seulement. */
export async function supprimerBrouillonDocumentLegal(req, res, next) {
  try {
    const { count } = await prisma.versionDocumentLegal.deleteMany({
      where: { version_document_legal_id: req.params.id, statut: "brouillon" },
    });
    if (!count) return res.status(409).json({ message: "Seul un brouillon peut être supprimé." });
    return res.status(200).json({ message: "Brouillon supprimé." });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/documents-legaux/versions/:id/acceptations?recherche=&page= */
export async function listerAcceptationsDocumentLegal(req, res, next) {
  try {
    const recherche = texte(req.query.recherche);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const where = {
      version_document_legal_id: req.params.id,
      ...(recherche
        ? {
          utilisateur: {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
              { email: { contains: recherche, mode: "insensitive" } },
              { telephone: { contains: recherche } },
            ],
          },
        }
        : {}),
    };

    const [acceptations, total] = await Promise.all([
      prisma.acceptationDocumentLegal.findMany({
        where,
        orderBy: { date_acceptation: "desc" },
        skip: (page - 1) * PAR_PAGE,
        take: PAR_PAGE,
        select: {
          acceptation_document_legal_id: true,
          contexte: true,
          adresse_ip: true,
          date_acceptation: true,
          utilisateur: {
            select: {
              utilisateur_id: true, nom: true, prenom: true, email: true, telephone: true,
              role: { select: { libelle: true } },
            },
          },
        },
      }),
      prisma.acceptationDocumentLegal.count({ where }),
    ]);

    return res.status(200).json({
      acceptations,
      pagination: { page, par_page: PAR_PAGE, total, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) },
    });
  } catch (err) {
    next(err);
  }
}
