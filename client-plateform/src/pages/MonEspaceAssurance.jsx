// MonEspaceAssurance.jsx
// Ancienne entrée de l'agent d'une fiche assurance (/mon-espace-assurance),
// conservée pour les liens existants (e-mails, favoris) : l'espace de
// l'agent est désormais le portail assurance, qui retrouve lui-même la
// fiche du compte (PortailAssuranceLayout).
import { Navigate } from 'react-router-dom';

export default function MonEspaceAssurance() {
  return <Navigate to="/portail/assurance" replace />;
}
