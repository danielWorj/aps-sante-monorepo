// src/utils/fonds.js
//
// Politique de fonds v2 — helpers d'AFFICHAGE partagés par les pages
// finance du back-office. Aucun calcul métier ici : le serveur tranche.
// Les seules constantes sont les délais de la spec, pour les avertissements.
//
// Vocabulaire : H = honoraires ; F = frais de remboursement de l'agrégateur ;
// CM = commission MÉDECIN (retenue sur le médecin) ; CP = commission PATIENT
// (ajoutée au total payé). Le back-office est réservé aux admins : il affiche
// tout (CM et CP séparément), cf. D7. Les textes suivent la matrice D3 finale.

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

/** Bornes de T côté serveur (heures) : 0 à 30 jours. */
export const DELAI_LIBERATION_MIN_H = 0;
export const DELAI_LIBERATION_MAX_H = 720;

/** 48 -> « 48 h (2 j) » ; 36 -> « 36 h » ; 0 -> « 0 h (au prochain passage du cron) » */
export function heuresLisibles(heures) {
  const h = Number(heures);
  if (!Number.isFinite(h)) return '—';
  if (h === 0) return '0 h (au prochain passage du cron)';
  return h >= 24 && h % 24 === 0 ? `${h} h (${h / 24} j)` : `${h} h`;
}

/** Saisie « 48 » -> 48. Retourne null si ce n'est pas un entier compris entre 0 et 720. */
export function heuresDepuisSaisie(saisie) {
  const texte = String(saisie ?? '').trim();
  if (!/^\d+$/.test(texte)) return null;
  const h = Number(texte);
  return h >= DELAI_LIBERATION_MIN_H && h <= DELAI_LIBERATION_MAX_H ? h : null;
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

/**
 * Conséquence attendue d'une annulation (matrice D3 finale), pour l'avertissement
 * AVANT confirmation. `nonPaye` = RDV au statut « cree » : aucun fonds, ni CP ni CM.
 */
export function consequenceAnnulation(initiateur, tardif, { nonPaye = false } = {}) {
  if (nonPaye) {
    return 'Rendez-vous non payé : aucun fonds, aucune commission. Si un paiement aboutit après l’annulation, le patient sera remboursé de H − F (la commission patient CP reste à APS).';
  }
  if (initiateur === 'patient') {
    return tardif
      ? 'Annulation patient à moins de 24 h (patient fautif) : aucun remboursement. Le médecin reçoit H − CM (avant amendes) ; APS conserve CM + CP.'
      : 'Annulation patient à plus de 24 h : le patient est remboursé de H − F (honoraires moins frais de remboursement). Les frais d’envoi et CP ne sont pas rendus : APS conserve CP. Le médecin ne reçoit rien.';
  }
  return tardif
    ? 'Annulation médecin à moins de 24 h (médecin fautif) : le patient est remboursé de H + CP − F, le médecin ne reçoit rien ET une amende lui est enregistrée. Les frais d’envoi ne sont pas rendus.'
    : 'Annulation médecin à plus de 24 h (médecin fautif) : le patient est remboursé de H + CP − F, le médecin ne reçoit rien, APS ne conserve rien. Les frais d’envoi ne sont pas rendus.';
}

/** Conséquence d'une annulation pendant la reprogrammation (« deux absents sans reprogrammation »). */
export const CONSEQUENCE_DEUX_ABSENTS_SANS_REPROGRAMMATION =
  'Rendez-vous en attente de reprogrammation (les deux parties étaient absentes) : le patient est remboursé de H − CM − F, APS conserve CM + CP, sans amende.';

/** Libellés lisibles des événements de fonds (champ `evenement` de la réponse d'annulation). */
export const LIBELLES_EVENEMENTS = {
  annulation_patient: 'Annulation par le patient',
  annulation_medecin: 'Annulation par le médecin',
  patient_absent: 'Patient absent',
  medecin_absent: 'Médecin absent',
  deux_absents: 'Deux absents (en attente de reprogrammation)',
  deux_absents_sans_reprogrammation: 'Deux absents sans reprogrammation',
  paiement_tardif: 'Paiement arrivé après annulation',
};

/** Résume la réponse de PATCH /rendez-vous/:id/statut (statut = annule), vue admin : CP et CM séparées. */
export function resumerAnnulation(data) {
  const lignes = ['Rendez-vous annulé.'];
  if (data?.evenement && LIBELLES_EVENEMENTS[data.evenement]) {
    lignes.push(`Événement : ${LIBELLES_EVENEMENTS[data.evenement]}.`);
  }
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
  const cm = Number(data?.commission_medecin ?? data?.commission_aps) || 0;
  if (Number(data?.versement_medecin) > 0) {
    lignes.push(`Médecin crédité de ${fcfa(data.versement_medecin)} (avant amendes).`);
  }
  if (cm > 0) lignes.push(`CM conservée par APS : ${fcfa(cm)}.`);
  if (Number(data?.commission_patient) > 0) lignes.push(`CP conservée par APS : ${fcfa(data.commission_patient)}.`);
  if (Number(data?.commission_patient_rendue) > 0) {
    lignes.push(`CP rendue au patient (médecin fautif) : ${fcfa(data.commission_patient_rendue)}.`);
  }
  if (data?.amende) lignes.push('Une amende a été enregistrée au médecin (imputée à sa prochaine libération).');
  return lignes.join(' ');
}

/**
 * Lignes d'affichage de la répartition d'un paiement (vue admin) à partir de
 * GET /paiement/rendez-vous/:id/facture. Retourne null si la facture manque.
 * [{ cle, libelle, montant, detail?, fort? }] — montants déjà arrondis par le serveur.
 */
export function lignesRepartitionPaiement(facture) {
  if (!facture) return null;
  const devise = facture.devise;
  const lignes = (facture.lignes || []).map((l) => ({
    cle: l.code,
    libelle: l.code === 'commission_aps' ? 'Commission APS (CP)' : l.libelle,
    montant: montantDevise(l.montant, devise),
    detail: l.taux != null && l.base != null ? `${montantDevise(l.base, devise)} × ${pourcent(l.taux)}` : undefined,
  }));
  lignes.push({ cle: 'total', libelle: 'Total payé par le patient', montant: montantDevise(facture.total, devise), fort: true });
  const d = facture.detail_admin;
  if (d) {
    lignes.push({ cle: 'cm', libelle: 'Commission médecin (CM) — retenue sur le médecin', montant: montantDevise(d.commission_medecin, devise) });
    lignes.push({ cle: 'net', libelle: 'Net médecin (H − CM, avant amendes)', montant: montantDevise(d.net_medecin, devise) });
  }
  return lignes;
}