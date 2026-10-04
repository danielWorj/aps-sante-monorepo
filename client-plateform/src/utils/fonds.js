// src/utils/fonds.js
//
// Politique de fonds v2 — helpers d'AFFICHAGE du portail patient/médecin.
// Aucun calcul métier : le serveur décide. Les délais (24 h, 48 h) ne servent
// qu'aux avertissements et compte à rebours.

export const DELAI_TARDIF_H = 24;
export const DELAI_REPROGRAMMATION_H = 48;

export const fcfa = (n) =>
  `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;

/** Montant dans sa devise (XAF par défaut). */
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
    ? new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

/** Annulation tardive = STRICTEMENT moins de 24 h avant le RDV (pile 24 h : non tardive). */
export function estTardif(dateCreneau, maintenant = new Date()) {
  return new Date(dateCreneau).getTime() - maintenant.getTime() < DELAI_TARDIF_H * 3600 * 1000;
}

/** Échéance de reprogrammation = passage à « a_reprogrammer » + 48 h (le délai ne se prolonge jamais). */
export function echeanceReprogrammation(rdv) {
  if (!rdv?.a_reprogrammer_le) return null;
  return new Date(new Date(rdv.a_reprogrammer_le).getTime() + DELAI_REPROGRAMMATION_H * 3600 * 1000);
}

export function tempsRestant(echeance, maintenant = Date.now()) {
  const ms = new Date(echeance).getTime() - maintenant;
  if (ms <= 0) return { expire: true, texte: 'délai dépassé' };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { expire: false, texte: h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h ${String(m).padStart(2, '0')} min` };
}

/* ── Créneaux d'agenda ──────────────────────────────────────────────
 * Convention du dépôt (voir medecin-agenda.jsx) : `creneau.date` et
 * `horaire.heure_debut` sont des valeurs « épinglées en UTC », lues par
 * découpage de chaîne. Le serveur (reprogrammation) compare la date et
 * l'heure UTC de `nouvelle_date` à l'agenda : on reconstruit donc l'ISO
 * de la même façon. */
const jour = (v) => String(v).slice(0, 10);
const hhmm = (v) => {
  const s = String(v);
  return (s.includes('T') ? s.split('T')[1] : s).slice(0, 5);
};
export const creneauVersISO = (c) => `${jour(c.date)}T${hhmm(c.horaire.heure_debut)}:00.000Z`;
export const libelleJour = (c) =>
  new Date(`${jour(c.date)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const libelleHeure = (c) => hhmm(c.horaire.heure_debut);

/**
 * Résume la réponse de PATCH /rendez-vous/:id/statut pour un toast, selon qui annule.
 * La réponse est FILTRÉE par rôle côté serveur (D7) : on n'affiche que ce qu'elle contient.
 *   patient : remboursement, commission_patient (CP conservée), commission_patient_rendue
 *             (CP rendue), medecin_fautif — jamais CM ni le versement du médecin ;
 *   médecin : remboursement SANS montant, versement_medecin, amende — jamais CP.
 * Règle D3 : CP n'est rendue au patient que si le médecin est fautif ; les frais d'envoi
 * ne sont jamais rendus.
 */
export function resumerAnnulation(data, role) {
  const r = data?.remboursement;
  const parts = ['Rendez-vous annulé.'];
  if (role === 'patient') {
    if (r?.statut === 'a_traiter') {
      parts.push(
        `Votre remboursement Mobile Money sera traité par notre équipe ; le montant reçu dépendra des frais du retrait (estimation : ${montantDevise(r.montant_estime_net, r.devise)}).`
      );
    } else if (r) {
      parts.push(`Remboursement de ${montantDevise(r.montant, r.devise)} en cours.`);
    } else if (data?.tardif) {
      parts.push('Aucun remboursement : annulation à moins de 24 h du rendez-vous.');
    }
    if (r) {
      parts.push(
        data?.medecin_fautif && Number(data?.commission_patient_rendue) > 0
          ? 'La commission APS vous est restituée, l’annulation étant à l’initiative du médecin.'
          : 'La commission APS et les frais d’envoi ne sont pas remboursés.'
      );
    }
  } else {
    if (r) parts.push('Le patient est remboursé.');
    if (data?.amende) parts.push('Une amende a été enregistrée : elle sera déduite de votre prochaine libération de fonds.');
  }
  return parts.join(' ');
}