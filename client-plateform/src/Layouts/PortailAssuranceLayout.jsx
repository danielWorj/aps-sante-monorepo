// PortailAssuranceLayout.jsx
//
// Portail assurance : l'agent d'une compagnie / d'un courtier gère SA fiche
// (un agent = une fiche, GET /services-assurance/mon-service). Le layout
// retrouve la fiche une fois et la transmet aux pages par le contexte
// d'Outlet (useOutletContext) :
//   { serviceId, fiche, nouvellesDemandes, rafraichirCompteurs, rechargerFiche }
// Il tient aussi le compteur de demandes « nouvelles » (badge du menu),
// rafraîchi toutes les 60 s quand l'onglet est visible.
import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import AssurancePortailNavbar from '../components/portails/layouts/assurance.portail-navbar';
import PortailFooter from '../components/portails/layouts/portail-footer';
import { obtenirMonServiceAssurance } from '../services/abonnementAssuranceService';
import { listerDemandes } from '../services/portailAssuranceService';

const INTERVALLE_MS = 60000;

function EtatSansFiche({ erreur }) {
  return (
    <div className="container-aps status-page">
      <div className="status-card is-neutral">
        <div className="status-card-icon"><i className="fa-solid fa-building-shield" /></div>
        <h1>Aucune fiche assurance</h1>
        <p className="status-card-text">
          {erreur === 'aucune'
            ? "Votre compte n'est rattaché à aucune compagnie d'assurance ni à aucun courtier."
            : erreur}
        </p>
        <div className="status-card-actions">
          <Link to="/assurances/creation" className="btn btn-primary btn-lg-aps">Référencer ma compagnie</Link>
        </div>
      </div>
    </div>
  );
}

export default function PortailAssuranceLayout() {
  const [fiche, setFiche] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [nouvellesDemandes, setNouvellesDemandes] = useState(0);

  const rechargerFiche = useCallback(
    () =>
      obtenirMonServiceAssurance()
        .then((d) => { setFiche(d.service_assurance); setErreur(null); })
        .catch((err) => setErreur(err.status === 404 ? 'aucune' : err.message || 'Portail indisponible.')),
    []
  );

  const serviceId = fiche?.service_assurance_id;

  const rafraichirCompteurs = useCallback(() => {
    if (!serviceId) return Promise.resolve();
    return listerDemandes(serviceId, { limite: 1 })
      .then((d) => setNouvellesDemandes(d.compteurs?.nouvelle ?? 0))
      .catch(() => { /* badge seulement : silencieux */ });
  }, [serviceId]);

  useEffect(() => { rechargerFiche(); }, [rechargerFiche]);

  useEffect(() => {
    if (!serviceId) return undefined;
    rafraichirCompteurs();
    const id = setInterval(() => { if (!document.hidden) rafraichirCompteurs(); }, INTERVALLE_MS);
    return () => clearInterval(id);
  }, [serviceId, rafraichirCompteurs]);

  let contenu;
  if (erreur) contenu = <EtatSansFiche erreur={erreur} />;
  else if (!fiche) {
    contenu = (
      <div className="container-aps text-center py-5">
        <div className="spinner-border text-primary mb-3" role="status" />
        <div>Chargement de votre portail…</div>
      </div>
    );
  } else {
    contenu = <Outlet context={{ serviceId, fiche, nouvellesDemandes, rafraichirCompteurs, rechargerFiche }} />;
  }

  return (
    <div className="portail">
      <AssurancePortailNavbar nouvellesDemandes={nouvellesDemandes} />
      {contenu}
      <PortailFooter espace="Espace assurance" />
    </div>
  );
}
