// src/components/PagePresence.jsx
//
// Pages d'abonnement de présence : un seul écran par fonction, paramétré
// par le type d'acteur de l'URL (/…/pharmacie, /…/structure, /…/medecin).
// La clé remonte la page quand on passe d'un type à l'autre depuis le menu.
import { useParams } from 'react-router-dom';
import { TYPES_PRESENCE } from '../services/abonnementPresenceService';

export default function PagePresence({ page: Page }) {
  const { type } = useParams();
  if (!TYPES_PRESENCE[type]) {
    return <main className="aps-content"><div className="alert alert-warning">Type d&apos;acteur inconnu.</div></main>;
  }
  return <Page key={type} type={type} />;
}
