// src/components/medecin/BadgeOrdre.jsx
// Badge « Appartient à l'Ordre » / « N'est pas dans l'Ordre » d'une fiche
// médecin. medecin.statut_ordre est tenu à jour par le serveur à partir du
// Tableau de l'Ordre National des Médecins du Cameroun (ONMC) ; rien n'est
// affiché tant que la fiche n'a pas été vérifiée (non_verifie, ou médecin
// exerçant hors Cameroun).

export default function BadgeOrdre({ medecin, avecNumero = false, className = '' }) {
  const statut = medecin?.statut_ordre;
  if (statut !== 'inscrit' && statut !== 'non_inscrit') return null;

  const inscrit = statut === 'inscrit';
  const libelle = inscrit ? "Appartient à l'Ordre" : "N'est pas dans l'Ordre";
  const titre = inscrit
    ? "Inscrit au Tableau de l'Ordre National des Médecins du Cameroun"
    : "Numéro d'ordre introuvable au Tableau de l'Ordre National des Médecins du Cameroun";

  return (
    <span
      className={`aps-pill aps-badge-ordre ${inscrit ? '' : 'is-red'} ${className}`.trim()}
      title={titre}
    >
      <i className={`fa-solid ${inscrit ? 'fa-shield-halved' : 'fa-circle-xmark'}`} aria-hidden="true" />
      {libelle}
      {avecNumero && inscrit && medecin.numero_ordre ? ` — ${medecin.numero_ordre}` : ''}
    </span>
  );
}
