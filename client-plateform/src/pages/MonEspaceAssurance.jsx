// MonEspaceAssurance.jsx
// Point d'entrée de l'agent d'une fiche assurance : retrouve SA fiche
// (GET /services-assurance/mon-service — un agent = une fiche) et redirige
// vers son espace de gestion. Protégée par RequireAuth (router.jsx).
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { obtenirMonServiceAssurance } from '../services/abonnementAssuranceService';

export default function MonEspaceAssurance() {
  const [etat, setEtat] = useState({ chargement: true });

  useEffect(() => {
    let annule = false;
    obtenirMonServiceAssurance()
      .then((d) => { if (!annule) setEtat({ id: d.service_assurance.service_assurance_id }); })
      .catch((err) => { if (!annule) setEtat({ erreur: err.status === 404 ? 'aucune' : err.message }); });
    return () => { annule = true; };
  }, []);

  if (etat.id) return <Navigate to={`/assurances/${etat.id}/gestion`} replace />;
  if (etat.chargement) {
    return <div className="container-aps" style={{ padding: '3rem 0' }}><p className="minimal-note">Chargement…</p></div>;
  }
  return (
    <div className="container-aps status-page">
      <div className="status-card is-neutral">
        <div className="status-card-icon"><i className="fa-solid fa-building-shield" /></div>
        <h1>Aucune fiche assurance</h1>
        <p className="status-card-text">
          {etat.erreur === 'aucune'
            ? "Votre compte n'est rattaché à aucune compagnie d'assurance ou à aucun courtier."
            : etat.erreur}
        </p>
        <div className="status-card-actions">
          <Link to="/assurances/creation" className="btn btn-primary btn-lg-aps">Référencer ma compagnie</Link>
        </div>
      </div>
    </div>
  );
}
