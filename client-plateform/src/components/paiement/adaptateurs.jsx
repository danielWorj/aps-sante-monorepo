// src/components/paiement/adaptateurs.js
//
// Adaptateurs des composants de paiement (guide abonnements assurances v3,
// §2.2.3). ChoixMoyenPaiement, PaiementMobileMoney, AnnulerPaiementEnCours
// et la facture ne connaissent plus l'objet payé : ils appellent les
// méthodes d'un adaptateur. Un seul jeu de composants, donc un seul
// endroit où corriger un défaut de sécurité.
//
// Contrat d'un adaptateur :
//   cle                         identifiant stable (dépendance des effets)
//   demanderStripe()            -> url Stripe Checkout
//   demanderCampay(numero)      -> { reference, ussd_code, operateur, incertain? }
//   obtenirDevis(agregateur)    -> { total, devise, ... }
//   obtenirFacture(agregateur?) -> facture / devis affichable (lignes, total, devise)
//   lireStatut()                -> { paiement: { statut }, tentative_campay, ... }
//   estAnnule(statut)           -> l'objet n'est plus payable (RDV annulé, brouillon annulé)
//   annuler()                   -> annule le paiement en cours
//   urlSucces                   page de succès après paiement Mobile Money
//   texteIntro                  phrase sous le titre de la fenêtre de choix
//   texteDevis(devis)           résumé sous chaque moyen (facultatif)
//   texteAnnule                 message quand estAnnule(statut)

import {
  demanderPaiementRdv,
  demanderPaiementCampay,
  obtenirDevisPaiement,
  obtenirFacture,
  obtenirStatutPaiementRdv,
  annulerPaiementEnCours,
} from '../../services/paiementService';
import {
  demanderPaiementAbonnement,
  demanderPaiementCampayAbonnement,
  obtenirDevisAbonnement,
  obtenirStatutPaiementAbonnement,
  annulerPaiementAbonnement,
} from '../../services/abonnementAssuranceService';
import {
  demanderPaiementPresence,
  demanderPaiementCampayPresence,
  obtenirDevisPresence,
  obtenirStatutPaiementPresence,
  annulerPaiementPresence,
} from '../../services/abonnementPresenceService';
import { montantDevise } from '../../utils/fonds';

export function adaptateurRdv(rdvId) {
  return {
    cle: `rdv:${rdvId}`,
    demanderStripe: () => demanderPaiementRdv(rdvId),
    demanderCampay: (numero) => demanderPaiementCampay(rdvId, numero),
    obtenirDevis: (agregateur) => obtenirDevisPaiement(rdvId, agregateur),
    obtenirFacture: (agregateur) => obtenirFacture(rdvId, agregateur),
    lireStatut: () => obtenirStatutPaiementRdv(rdvId),
    estAnnule: (statut) => statut?.statut_rdv === 'annule',
    annuler: () => annulerPaiementEnCours(rdvId),
    urlSucces: `/paiement/succes?rdv_id=${rdvId}`,
    texteIntro: 'Choisissez votre moyen de paiement. Votre rendez-vous sera confirmé dès la réception du règlement.',
    texteAnnule: 'Ce rendez-vous a été annulé.',
    texteDevis: null, // résumé historique du RDV (remboursement estimé), voir ChoixMoyenPaiement
  };
}

export function adaptateurAbonnement(abonnementId) {
  return {
    cle: `abonnement:${abonnementId}`,
    demanderStripe: () => demanderPaiementAbonnement(abonnementId),
    demanderCampay: (numero) => demanderPaiementCampayAbonnement(abonnementId, numero),
    obtenirDevis: (agregateur) => obtenirDevisAbonnement(abonnementId, agregateur),
    // Avant paiement : le devis tient lieu d'aperçu de facture.
    obtenirFacture: (agregateur) => obtenirDevisAbonnement(abonnementId, agregateur || 'stripe'),
    lireStatut: () => obtenirStatutPaiementAbonnement(abonnementId),
    estAnnule: (statut) => statut?.statut_abonnement === 'annule',
    annuler: () => annulerPaiementAbonnement(abonnementId),
    urlSucces: `/paiement/abonnement/succes?abonnement_id=${abonnementId}`,
    texteIntro: 'Choisissez votre moyen de paiement. Votre abonnement sera activé dès la réception du règlement.',
    texteAnnule: "Cette demande d'abonnement a expiré. Recommencez depuis la page des abonnements.",
    texteDevis: (d) => (
      <small>
        Total : <strong>{montantDevise(d.total, d.devise)}</strong>
        {d.frais_agregateur > 0 && (
          <> (dont {montantDevise(d.frais_agregateur, d.devise)} de frais d&apos;agrégateur)</>
        )}
      </small>
    ),
  };
}

/** Abonnement de présence (pharmacie, centre de santé, médecin) : même contrat. */
export function adaptateurAbonnementPresence(abonnementId) {
  return {
    ...adaptateurAbonnement(abonnementId),
    cle: `abonnement-presence:${abonnementId}`,
    demanderStripe: () => demanderPaiementPresence(abonnementId),
    demanderCampay: (numero) => demanderPaiementCampayPresence(abonnementId, numero),
    obtenirDevis: (agregateur) => obtenirDevisPresence(abonnementId, agregateur),
    obtenirFacture: (agregateur) => obtenirDevisPresence(abonnementId, agregateur || 'stripe'),
    lireStatut: () => obtenirStatutPaiementPresence(abonnementId),
    annuler: () => annulerPaiementPresence(abonnementId),
    urlSucces: `/paiement/abonnement-presence/succes?abonnement_id=${abonnementId}`,
  };
}
