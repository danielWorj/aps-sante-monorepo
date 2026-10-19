// utils/periodesAgenda.js
//
// Regroupement des tranches du référentiel Horaire en trois périodes de la
// journée (matin, après-midi, soirée) pour l'agenda du médecin : il coche une
// période entière, puis affine heure par heure s'il le souhaite. Purement
// visuel : le serveur ne connaît que des horaire_id.
//
// Bornes (heure murale de DÉBUT de la tranche) : matin avant 12:00,
// après-midi de 12:00 à 18:00, soirée à partir de 18:00. Toute tranche du
// référentiel tombe donc dans une période.

export const PERIODES_AGENDA = [
  { cle: 'matin', libelle: 'Matin', icone: 'fa-sun', avant: '12:00' },
  { cle: 'apres_midi', libelle: 'Après-midi', icone: 'fa-cloud-sun', avant: '18:00' },
  { cle: 'soiree', libelle: 'Soirée', icone: 'fa-moon', avant: '24:00' },
];

// "HH:mm:ss" | horodatage ISO complet | déjà "HH:mm" -> "HH:mm"
export function formatHeure(valeur) {
  if (!valeur) return '--:--';
  const m = String(valeur).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(valeur);
}

export function periodeDeHeure(heure) {
  const hhmm = formatHeure(heure);
  return (PERIODES_AGENDA.find((p) => hhmm < p.avant) ?? PERIODES_AGENDA[PERIODES_AGENDA.length - 1]).cle;
}

/**
 * Horaires triés et regroupés par période ; les périodes vides sont omises.
 * Chaque groupe porte sa plage lisible (« 08:00 – 12:00 »).
 * @param {Array<{ horaire_id, heure_debut, heure_fin }>} horaires
 */
export function grouperParPeriode(horaires) {
  const tries = [...horaires].sort((a, b) => formatHeure(a.heure_debut).localeCompare(formatHeure(b.heure_debut)));
  return PERIODES_AGENDA.map((p) => {
    const liste = tries.filter((h) => periodeDeHeure(h.heure_debut) === p.cle);
    return {
      ...p,
      horaires: liste,
      plage: liste.length
        ? `${formatHeure(liste[0].heure_debut)} – ${formatHeure(liste[liste.length - 1].heure_fin)}`
        : '',
    };
  }).filter((g) => g.horaires.length > 0);
}

/** « complet » | « partiel » | « vide » : état d'une période pour une sélection. */
export function etatPeriode(groupe, selection) {
  const n = groupe.horaires.filter((h) => selection.has(h.horaire_id)).length;
  if (n === 0) return 'vide';
  return n === groupe.horaires.length ? 'complet' : 'partiel';
}

/** Résumé court d'une journée : « Matin · Après-midi (partiel) » ou « Fermé ». */
export function resumeJournee(groupes, selection) {
  const parties = groupes
    .map((g) => ({ g, etat: etatPeriode(g, selection) }))
    .filter(({ etat }) => etat !== 'vide')
    .map(({ g, etat }) => (etat === 'partiel' ? `${g.libelle} (partiel)` : g.libelle));
  return parties.length ? parties.join(' · ') : 'Fermé';
}
