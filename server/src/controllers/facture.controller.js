// src/controllers/facture.controller.js
// Politique de fonds v2 — GET /api/paiement/rendez-vous/:id/facture
//
// Renvoie les DONNÉES (JSON) de la facture récapitulative : aucun PDF, aucune
// dépendance. La facture n'est jamais stockée : elle est recalculée à chaque
// appel (facture.service.js) à partir de montant_honoraires et des lignes de
// taux FIGÉES sur la transaction. Le client n'envoie jamais de montant (D5).
//
// Deux modes, selon l'état du rendez-vous :
//   - RDV payé (escrow + transaction)     : facture du paiement abouti ;
//   - RDV non payé (« cree »), patient    : aperçu AVANT paiement pour
//     l'agrégateur choisi (?agregateur=stripe|campay), même structure et
//     mêmes montants que le devis / le paiement.
//
// Visibilité par rôle (D7) :
//   patient : H, frais d'agrégateur, CP (ligne « Commission APS »), total ;
//             jamais CM ni le net du médecin ;
//   médecin : la consultation seule (H) — ni CP, ni frais, ni total payé ;
//   admin   : la facture du patient + `detail_admin` (CM et net médecin).
// RDV non payé et médecin (D8) : 409 RDV_NON_PAYE, aucune donnée.

import prisma from "../lib/prisma.js";
import { decomposerMontant } from "../services/tarification.service.js";
import {
  construireFacture,
  construireApercuFacture,
  projeterFacturePourMedecin,
} from "../services/facture.service.js";
import { decimalesPourMontant } from "../utils/montants.js";
import { verifierRdvPayable, repondreSiBaremeAbsent } from "./paiement.controller.js";

const MESSAGE_RDV_NON_PAYE =
  "Ce rendez-vous n'est pas encore payé : aucune facture n'est disponible.";

/** Identité, spécialité, pays et ville d'exercice du médecin (en-tête de la facture). */
async function chargerInfosMedecin(medecin_id) {
  return prisma.medecin.findUnique({
    where: { medecin_id },
    include: { utilisateur: true, specialite: true, pays_exercice: true, ville_exercice: true },
  });
}

/** Lignes figées sur la transaction : références, jamais des montants. */
function lignesFigees(transaction) {
  return {
    frais_envoi: transaction.frais_envoi ?? null,
    commission_patient: transaction.ligne_commission_patient ?? null,
  };
}

export async function obtenirFactureRdv(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) return res.status(404).json({ message: "Rendez-vous introuvable." });

    // --- Qui appelle ? (le statut du RDV est relu en base, jamais d'après le client)
    const estAdmin = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    const patient = await prisma.patient.findUnique({
      where: { utilisateur_id: req.utilisateur.utilisateur_id },
    });
    const estPatientConcerne = Boolean(patient && patient.patient_id === rdv.patient_id);

    let estMedecinConcerne = false;
    if (!estPatientConcerne && !estAdmin) {
      const medecinCourant = await prisma.medecin.findUnique({
        where: { utilisateur_id: req.utilisateur.utilisateur_id },
      });
      estMedecinConcerne = Boolean(medecinCourant && medecinCourant.medecin_id === rdv.medecin_id);
    }
    if (!estPatientConcerne && !estMedecinConcerne && !estAdmin) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    const vueMedecinSeul = estMedecinConcerne && !estAdmin;

    // D8 : un RDV non payé n'existe pas pour le médecin.
    if (vueMedecinSeul && rdv.statut === "cree") {
      return res.status(409).json({ code: "RDV_NON_PAYE", message: MESSAGE_RDV_NON_PAYE });
    }

    const escrow = await prisma.compteEscrow.findUnique({
      where: { rdv_id: rdv.rdv_id },
      include: {
        transaction: {
          include: { ligne_commission: true, ligne_commission_patient: true, frais_envoi: true },
        },
      },
    });

    // ------------------------------------------------------------------
    // Mode 1 : paiement abouti -> facture
    // ------------------------------------------------------------------
    if (escrow) {
      const transaction = escrow.transaction;
      const infos = await chargerInfosMedecin(rdv.medecin_id);
      if (!infos) return res.status(404).json({ message: "Médecin introuvable." });

      const facture = construireFacture({
        rdv,
        medecin: infos.utilisateur,
        specialite: infos.specialite,
        pays: infos.pays_exercice,
        ville: infos.ville_exercice,
        transaction,
        lignes: lignesFigees(transaction),
        // Date du paiement : création de l'escrow (à la finalisation du paiement).
        date_paiement: escrow.date_creation,
      });

      if (vueMedecinSeul) {
        const vue = projeterFacturePourMedecin(facture, {
          honoraires: transaction.montant_honoraires,
          decimales: decimalesPourMontant({ fournisseur: transaction.fournisseur, devise: transaction.devise }),
        });
        if (!vue) {
          return res.status(404).json({ message: "Facture indisponible pour ce rendez-vous." });
        }
        return res.status(200).json(vue);
      }

      if (estAdmin) {
        // L'admin voit tout (D7) : CM et net médecin en plus de la facture patient.
        let detailAdmin = null;
        if (
          transaction.montant_honoraires != null &&
          transaction.ligne_commission &&
          transaction.frais_envoi
        ) {
          const d = decomposerMontant(
            transaction.montant_honoraires,
            {
              commission: transaction.ligne_commission,
              commission_patient: transaction.ligne_commission_patient,
              frais_envoi: transaction.frais_envoi,
            },
            decimalesPourMontant({ fournisseur: transaction.fournisseur, devise: transaction.devise })
          );
          detailAdmin = {
            commission_patient: d.commissionPatient,
            commission_medecin: d.commissionMedecin,
            net_medecin: d.netMedecin,
          };
        }
        return res.status(200).json({ ...facture, detail_admin: detailAdmin });
      }

      return res.status(200).json(facture);
    }

    // ------------------------------------------------------------------
    // Mode 2 : pas encore de paiement -> aperçu (patient propriétaire seulement)
    // ------------------------------------------------------------------
    if (!estPatientConcerne) {
      return res.status(404).json({ message: "Aucune facture : ce rendez-vous n'a pas été payé." });
    }
    const agregateur = req.query.agregateur;
    if (agregateur !== "stripe" && agregateur !== "campay") {
      return res.status(400).json({
        message: "Rendez-vous non payé : précisez ?agregateur=stripe|campay pour obtenir l'aperçu de la facture.",
      });
    }

    // Mêmes contrôles et même calcul que le paiement (404, 403, 409, 400) ;
    // répond seule en cas de refus, n'écrit rien en base.
    const ctx = await verifierRdvPayable(req, res, agregateur);
    if (!ctx) return;

    const infos = await chargerInfosMedecin(rdv.medecin_id);
    const apercu = construireApercuFacture({
      rdv: ctx.rdv,
      medecin: infos?.utilisateur ?? ctx.rdv.medecin.utilisateur,
      specialite: infos?.specialite,
      pays: infos?.pays_exercice,
      ville: infos?.ville_exercice,
      agregateur,
      devise: ctx.devise,
      honoraires: ctx.honoraires,
      lignes: {
        frais_envoi: ctx.fraisActifs.envoi,
        commission_patient: ctx.lignesTarifaires.commission_patient,
      },
      date: new Date(),
    });
    return res.status(200).json(apercu);
  } catch (err) {
    if (repondreSiBaremeAbsent(err, res)) return;
    next(err);
  }
}