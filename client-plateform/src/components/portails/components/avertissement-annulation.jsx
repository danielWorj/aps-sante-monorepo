// avertissement-annulation.jsx
//
// Politique de fonds v2 §3-§4 — conséquence financière d'une annulation, AVANT
// confirmation. Indicatif : le serveur applique la règle et le toast final
// affiche le résultat réel. Un RDV non payé ne met aucun fonds en jeu.
import React, { useEffect, useState } from 'react';
import { obtenirStatutPaiementRdv } from '../../../services/paiementService';
import { estTardif, montantDevise } from '../../../utils/fonds';

function message({ role, rdv, paiement }) {
  const honoraires = paiement?.decomposition?.honoraires;
  const devise = paiement?.devise;

  if (rdv.statut === 'a_reprogrammer') {
    return role === 'patient'
      ? 'Les deux parties étaient absentes. Si vous annulez, vous serez remboursé de vos honoraires moins les frais du moyen de paiement et la commission APS.'
      : 'Les deux parties étaient absentes. Si vous annulez, le patient est remboursé (honoraires moins frais et commission APS). Aucune amende.';
  }

  const tardif = estTardif(rdv.date_creneau);
  if (role === 'patient') {
    return tardif
      ? 'Le rendez-vous a lieu dans moins de 24 h : aucun remboursement. Le médecin sera rémunéré pour ce créneau.'
      : `Le rendez-vous a lieu dans plus de 24 h : vous serez remboursé de vos honoraires${honoraires != null ? ` (${montantDevise(honoraires, devise)})` : ''} moins les frais de remboursement du moyen de paiement.`;
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
