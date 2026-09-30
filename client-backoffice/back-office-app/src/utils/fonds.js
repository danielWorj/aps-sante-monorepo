// src/utils/fonds.js
//
// Politique de fonds v2 — helpers d'AFFICHAGE partagés par les pages
// finance du back-office. Aucun calcul métier ici : le serveur tranche.
// Les seules constantes sont les délais de la spec, pour les avertissements.

export const DELAI_TARDIF_H = 24;
export const DELAI_REPROGRAMMATION_H = 48;

export const fcfa = (n) =>
  `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;

/** Montant dans sa devise (XAF par défaut, sans décimales). */
export function montantDevise(n, devise = 'xaf') {
  const code = String(devise || 'xaf').toUpperCase();
  if (code === 'XAF') return fcfa(n);
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: code }).format(Number(n) || 0);
  } catch {
    return `${n} ${code}`;
  }
}

export const dateHeure = (iso) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** 0.025 -> « 2,5 % » */
export const pourcent = (taux) =>
  `${(Number(taux) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/** 0.025 -> "2.5" (valeur d'un champ de saisie en %) */
export const pourcentDepuisTaux = (taux) => String(Number((Number(taux) * 100).toFixed(2)));

/**
 * "2,5" (%) -> 0.025. Retourne null si invalide : le serveur n'accepte que
 * 0–1 avec 4 décimales au plus (Decimal(5,4)), donc 2 décimales en %.
 */
export function tauxDepuisPourcent(saisie) {
  const p = Number(String(saisie).trim().replace(',', '.'));
  if (!Number.isFinite(p) || p < 0 || p > 100) return null;
  const centiemes = p * 100;
  if (Math.abs(centiemes - Math.round(centiemes)) > 1e-9) return null;
  return Math.round(centiemes) / 10000;
}

/** Annulation tardive = strictement moins de 24 h avant le RDV (pile 24 h : non tardive). */
export function estTardif(dateCreneau, maintenant = new Date()) {
  return new Date(dateCreneau).getTime() - maintenant.getTime() < DELAI_TARDIF_H * 3600 * 1000;
}

/** Motifs fermés attendus par le serveur (MOTIFS_ANNULATION). */
export const MOTIFS_ANNULATION = [
  { valeur: 'changement_horaire_patient', libelle: 'Changement d’horaire (patient)' },
  { valeur: 'urgence_personnelle', libelle: 'Urgence personnelle' },
  { valeur: 'erreur_reservation', libelle: 'Erreur de réservation' },
  { valeur: 'professionnel_indisponible', libelle: 'Professionnel indisponible' },
  { valeur: 'autre', libelle: 'Autre' },
];

/** Conséquence attendue d'une annulation (§3-§4), pour l'avertissement AVANT confirmation. */
export function consequenceAnnulation(initiateur, tardif) {
  if (initiateur === 'patient') {
    return tardif
      ? 'Annulation patient à moins de 24 h : aucun remboursement. Le médecin est payé (honoraires − commission APS), la commission est versée à APS.'
      : 'Annulation patient à plus de 24 h : le patient est remboursé (honoraires − frais de remboursement).';
  }
  return tardif
    ? 'Annulation médecin à moins de 24 h : le patient est remboursé (honoraires − frais de remboursement) ET une amende est enregistrée au médecin.'
    : 'Annulation médecin à plus de 24 h : le patient est remboursé (honoraires − frais de remboursement).';
}

/** Résume la réponse de PATCH /rendez-vous/:id/statut (statut = annule). */
export function resumerAnnulation(data) {
  const lignes = ['Rendez-vous annulé.'];
  const r = data?.remboursement;
  if (r) {
    lignes.push(
      r.statut === 'a_traiter'
        ? `Remboursement CamPay de ${montantDevise(r.montant, r.devise)} à traiter (net estimé : ${montantDevise(r.montant_estime_net, r.devise)}). Voir « Remboursements CamPay ».`
        : `Remboursement de ${montantDevise(r.montant, r.devise)} déclenché (${r.statut}).`
    );
  } else if (data?.tardif) {
    lignes.push('Aucun remboursement (annulation à moins de 24 h).');
  } else {
    lignes.push('Aucun fonds à rembourser (rendez-vous non payé).');
  }
  if (Number(data?.versement_medecin) > 0) {
    lignes.push(`Médecin crédité de ${fcfa(data.versement_medecin)} (avant amendes) ; commission APS : ${fcfa(data.commission_aps)}.`);
  }
  if (data?.amende) lignes.push('Une amende a été enregistrée au médecin (imputée à sa prochaine libération).');
  return lignes.join(' ');
}
