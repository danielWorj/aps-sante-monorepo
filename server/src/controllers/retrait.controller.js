// src/controllers/retrait.controller.js
// Phase 6 — Retrait du médecin. Toute la logique métier vit dans services/retrait.service.js.

import prisma from "../lib/prisma.js";
import { CampayError } from "../lib/campayService.js";
import {
  RetraitError, creerDemandeRetrait, executerRetrait, listerRetraitsAdmin, listerRetraitsMedecin,
  marquerRetraitEchoue, rattacherReferenceRetrait, rejeterRetrait, soldeCampayAdmin,
  vueRetraitMedecin, RETRAIT_MONTANT_MAX, RETRAIT_MONTANT_MIN,
} from "../services/retrait.service.js";
import { soldePortefeuille } from "../services/portefeuille.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUTS = ["en_attente_validation", "en_cours", "reussie", "echouee", "rejetee"];

const estAdmin = (u) => u?.role === "admin" || u?.role === "superadmin";

// Traduit les erreurs métier / CamPay en réponses HTTP ; le reste part au gestionnaire global.
function repondreErreur(err, res, next) {
  if (err instanceof RetraitError) return res.status(err.status).json({ message: err.message });
  if (err instanceof CampayError) {
    console.error("[retrait] Erreur CamPay :", err.code, err.payload ?? err.message);
    return res.status(err.status >= 500 ? 502 : 400).json({ message: err.message, code: err.code });
  }
  return next(err);
}

// Charge le médecin ciblé et vérifie l'accès : propriétaire (ou admin si `adminAutorise`).
async function medecinAutorise(req, res, { adminAutorise }) {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ message: "Identifiant médecin invalide." });
    return null;
  }
  const medecin = await prisma.medecin.findUnique({ where: { medecin_id: req.params.id } });
  if (!medecin) {
    res.status(404).json({ message: "Médecin introuvable." });
    return null;
  }
  const proprietaire = req.utilisateur.utilisateur_id === medecin.utilisateur_id;
  if (!proprietaire && !(adminAutorise && estAdmin(req.utilisateur))) {
    res.status(403).json({ message: "Accès refusé : ce portefeuille ne vous appartient pas." });
    return null;
  }
  return medecin;
}

// POST /api/medecins/:id/retraits  { mobile_money_id, montant } — médecin propriétaire UNIQUEMENT
export async function demanderRetrait(req, res, next) {
  try {
    const medecin = await medecinAutorise(req, res, { adminAutorise: false });
    if (!medecin) return;

    const { mobile_money_id, montant } = req.body ?? {};
    if (typeof mobile_money_id !== "string" || !UUID.test(mobile_money_id)) {
      return res.status(400).json({ message: "Choisissez un numéro Mobile Money valide." });
    }
    // Le montant est validé (entier, min/max) par le service.
    const demande = await creerDemandeRetrait({ medecin_id: medecin.medecin_id, mobile_money_id, montant });
    return res.status(201).json(vueRetraitMedecin(demande));
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

// GET /api/medecins/:id/retraits — médecin propriétaire ou admin
export async function listerMesRetraits(req, res, next) {
  try {
    const medecin = await medecinAutorise(req, res, { adminAutorise: true });
    if (!medecin) return;
    const [retraits, solde, mobileMoneys] = await Promise.all([
      listerRetraitsMedecin(medecin.medecin_id),
      soldePortefeuille(medecin.medecin_id),
      // Numéros proposables comme destination (évite un second appel côté mobile).
      prisma.mobileMoney.findMany({
        where: { medecin_id: medecin.medecin_id },
        select: { id: true, numero: true, titulaire: true, type_mobile_money: { select: { libelle: true } } },
      }),
    ]);
    return res.status(200).json({
      solde,
      retraits,
      mobile_moneys: mobileMoneys,
      limites: { montant_min: RETRAIT_MONTANT_MIN(), montant_max: RETRAIT_MONTANT_MAX(), devise: "XAF" },
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────────────────────

// GET /api/retraits?statut=
export async function listerRetraits(req, res, next) {
  try {
    const { statut } = req.query;
    if (statut !== undefined && !STATUTS.includes(statut)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    return res.status(200).json(await listerRetraitsAdmin({ statut }));
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

// GET /api/retraits/solde-campay
export async function obtenirSoldeCampay(_req, res, next) {
  try {
    return res.status(200).json(await soldeCampayAdmin());
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

function idDemande(req, res) {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ message: "Identifiant de demande invalide." });
    return null;
  }
  return req.params.id;
}

// POST /api/retraits/:id/approuver
export async function approuverRetrait(req, res, next) {
  try {
    const id = idDemande(req, res);
    if (!id) return;
    const { demande, incertain } = await executerRetrait(id, { admin_utilisateur_id: req.utilisateur.utilisateur_id });
    return res.status(incertain ? 202 : 200).json({ demande, incertain });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

// POST /api/retraits/:id/rejeter  { motif }
export async function rejeterDemandeRetrait(req, res, next) {
  try {
    const id = idDemande(req, res);
    if (!id) return;
    const demande = await rejeterRetrait(id, {
      admin_utilisateur_id: req.utilisateur.utilisateur_id,
      motif: req.body?.motif,
    });
    return res.status(200).json({ demande });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

// POST /api/retraits/:id/rattacher-reference  { reference }
export async function rattacherReference(req, res, next) {
  try {
    const id = idDemande(req, res);
    if (!id) return;
    const demande = await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id: id } });
    if (!demande) return res.status(404).json({ message: "Demande introuvable." });
    const rattachee = await rattacherReferenceRetrait(demande, req.body?.reference);
    if (!rattachee) {
      return res.status(409).json({
        message: "Référence non rattachée : CamPay ne confirme pas qu'elle correspond à cette demande (external_reference / montant).",
      });
    }
    return res.status(200).json({ demande: rattachee });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

// POST /api/retraits/:id/marquer-echoue  { motif }
export async function marquerEchoue(req, res, next) {
  try {
    const id = idDemande(req, res);
    if (!id) return;
    const demande = await marquerRetraitEchoue(id, {
      admin_utilisateur_id: req.utilisateur.utilisateur_id,
      motif: req.body?.motif,
    });
    return res.status(200).json({ demande });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}