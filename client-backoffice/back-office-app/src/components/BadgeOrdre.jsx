// src/components/BadgeOrdre.jsx
// Badge « Appartient à l'Ordre » / « N'est pas dans l'Ordre » d'une fiche
// médecin (medecin.statut_ordre, tenu à jour par la synchronisation du
// registre ONMC côté serveur).

import { PAR_VALEUR, nomCorrespond } from './statutOrdre';

const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : null);

export default function BadgeOrdre({ medecin, compact = false }) {
  const statut = PAR_VALEUR[medecin?.statut_ordre] || PAR_VALEUR.non_verifie;
  const verifieLe = dateCourte(medecin?.ordre_verifie_le);
  const ecartNom =
    medecin?.statut_ordre === 'inscrit' && !nomCorrespond(medecin.nom, medecin.prenom, medecin.ordre_nom_onmc);
  const titre = [
    statut.libelle,
    medecin?.ordre_nom_onmc ? `Nom au tableau : ${medecin.ordre_nom_onmc}` : null,
    ecartNom ? 'Attention : le nom au tableau diffère du nom de la fiche' : null,
    verifieLe ? `Vérifié le ${verifieLe}` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <span className={`aps-badge ${ecartNom ? 'is-warning' : statut.badge}`} title={titre} style={{ whiteSpace: 'nowrap' }}>
      <i className={`fa-solid ${ecartNom ? 'fa-triangle-exclamation' : statut.icone}`}></i>
      {!compact && <> {statut.libelle}</>}
    </span>
  );
}
