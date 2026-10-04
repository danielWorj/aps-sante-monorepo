// avertissement-annulation.jsx
//
// Politique de fonds v2 §3-§4 — conséquence financière d'une annulation, AVANT
// confirmation. Indicatif : le serveur applique la règle et le toast final
// affiche le résultat réel. Un RDV non payé ne met aucun fonds en jeu.
//
// Règle de remboursement (D3) : la commission APS patient (CP) n'est JAMAIS rendue au
// patient, sauf si le médecin est fautif ; les frais d'envoi ne sont jamais rendus.
// Hors faute du médecin, le patient reçoit uniquement les honoraires (H) moins les frais
// de remboursement de l'agrégateur (F).
// Visibilité (D7) : le patient ne voit jamais la part médecin (CM) ; le médecin ne voit
// jamais CP ni le détail du remboursement du patient. Aucun montant de CM ici.
import React, { useEffect, useState } from 'react';
import { obtenirStatutPaiementRdv } from '../../../services/paiementService';
import { estTardif, montantDevise } from '../../../utils/fonds';

function message({ role, rdv, paiement }) {
  const honoraires = paiement?.decomposition?.honoraires;
  const devise = paiement?.devise;

  if (rdv.statut === 'a_reprogrammer') {
    // Deux absents sans reprogrammation : le patient reçoit H − CM − F (CP conservée par APS).
    // Seul le principe est affiché au patient, jamais le montant de la part médecin (D7).
    return role === 'patient'
      ? 'Les deux parties étaient absentes. Si vous annulez, vous serez remboursé d’une partie de vos honoraires, après déduction des frais de remboursement du moyen de paiement et des frais de service APS retenus sur cette consultation. La commission APS et les frais d’envoi ne sont pas remboursés. Le montant exact vous sera indiqué à l’annulation.'
      : 'Les deux parties étaient absentes. Si vous annulez, le patient est remboursé et vous ne percevez aucun honoraire. Aucune amende.';
  }

  const tardif = estTardif(rdv.date_creneau);
  if (role === 'patient') {
    return tardif
      ? 'Le rendez-vous a lieu dans moins de 24 h : aucun remboursement. Le médecin sera rémunéré pour ce créneau.'
      : `Le rendez-vous a lieu dans plus de 24 h : vous serez remboursé de vos honoraires${honoraires != null ? ` (${montantDevise(honoraires, devise)})` : ''} moins les frais de remboursement du moyen de paiement. La commission APS et les frais d’envoi ne sont pas remboursés.`;
  }
  return tardif
    ? 'Le rendez-vous a lieu dans moins de 24 h : le patient sera remboursé, vous ne percevrez aucun honoraire, et une amende sera enregistrée à votre nom (un pourcentage de votre prochaine libération de fonds, reversé à APS).'
    : 'Le patient sera remboursé. Vous ne percevrez aucun honoraire pour ce rendez-vous.';
}

/** @param {{ rdv: object, role: 'patient'|'medecin' }} props */
export default function AvertissementAnnulation({ rdv, role }) {
  const [etat, setEtat] = useState({ chargement: true, paiement: null, erreur: false });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { paiement } = await obtenirStatutPaiementRdv(rdv.rdv_id);
        if (!annule) setEtat({ chargement: false, paiement, erreur: false });
      } catch {
        if (!annule) setEtat({ chargement: false, paiement: null, erreur: true });
      }
    })();
    return () => { annule = true; };
  }, [rdv.rdv_id]);

  if (etat.chargement) return <small className="text-muted"><span className="spinner-border spinner-border-sm me-1" />Vérification du paiement…</small>;
  if (etat.erreur) return null; // n'empêche pas l'annulation ; le serveur tranche

  const paye = etat.paiement?.statut === 'reussie';
  if (!paye) {
    return (
      <div className="note-box"><i className="fa-solid fa-circle-info"></i>
        <span>Ce rendez-vous n’a pas été payé : aucun fonds n’est concerné.</span></div>
    );
  }
  return (
    <div className="note-box"><i className="fa-solid fa-scale-balanced"></i>
      <span>{message({ role, rdv, paiement: etat.paiement })}</span></div>
  );
}