// MonEspacePresence.jsx
// Point d'entrée de l'agent d'une pharmacie ou d'un centre de santé :
// retrouve SA fiche (GET /abonnements-presence/:type/mon-acteur — un agent
// = une fiche) et redirige vers son espace de gestion. Protégée par
// RequireAuth (router.jsx).
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { obtenirMonActeur, TYPES_PRESENCE } from '../services/abonnementPresenceService';

export default function MonEspacePresence({ type }) {
  const config = TYPES_PRESENCE[type];
  const [etat, setEtat] = useState({ chargement: true });

  useEffect(() => {
    let annule = false;
    obtenirMonActeur(type)
      .then((d) => { if (!annule) setEtat({ id: d.fiche.acteur_id }); })
      .catch((err) => { if (!annule) setEtat({ erreur: err.status === 404 ? 'aucune' : err.message }); });
    return () => { annule = true; };
  }, [type]);

  if (etat.id) return <Navigate to={config.gestion(etat.id)} replace />;
  if (etat.chargement) {
    return <div className="container-aps" style={{ padding: '3rem 0' }}><p className="minimal-note">Chargement…</p></div>;
  }
  return (
    <div className="container-aps status-page">
      <div className="status-card is-neutral">
        <div className="status-card-icon"><i className="fa-solid fa-store" /></div>
        <h1>Aucune fiche {config.libelle}</h1>
        <p className="status-card-text">
          {etat.erreur === 'aucune' ? `Votre compte n'est rattaché à aucune fiche ${config.libelle}.` : etat.erreur}
        </p>
        <div className="status-card-actions">
          <Link to={config.creation} className="btn btn-primary btn-lg-aps">Référencer ma fiche</Link>
        </div>
      </div>
    </div>
  );
}
