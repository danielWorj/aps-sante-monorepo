// PortailLaboratoireLayout.jsx
//
// Portail laboratoire : le gérant d'un laboratoire d'analyses gère SA fiche
// (celle de l'espace actif, GET /laboratoires/mon-laboratoire). Le layout
// retrouve la fiche une fois et la transmet aux pages par le contexte
// d'Outlet (useOutletContext) : { laboratoireId, fiche, rechargerFiche }.
import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import LaboratoirePortailNavbar from '../components/portails/layouts/laboratoire.portail-navbar';
import PortailFooter from '../components/portails/layouts/portail-footer';
import { obtenirMonLaboratoire } from '../services/laboratoireService';
import '../assets/styles/laboratoire.css';

function EtatSansFiche({ erreur }) {
  return (
    <div className="container-aps status-page">
      <div className="status-card is-neutral">
        <div className="status-card-icon"><i className="fa-solid fa-flask-vial" /></div>
        <h1>Aucun laboratoire</h1>
        <p className="status-card-text">
          {erreur === 'aucune' ? "Votre compte n'est rattaché à aucun laboratoire d'analyses." : erreur}
        </p>
        <div className="status-card-actions">
          <Link to="/laboratoires/creation" className="btn btn-primary btn-lg-aps">Inscrire mon laboratoire</Link>
        </div>
      </div>
    </div>
  );
}

export default function PortailLaboratoireLayout() {
  const [fiche, setFiche] = useState(null);
  const [erreur, setErreur] = useState(null);

  const rechargerFiche = useCallback(
    () =>
      obtenirMonLaboratoire()
        .then((f) => { setFiche(f); setErreur(null); })
        .catch((err) => setErreur(err.status === 404 ? 'aucune' : err.message || 'Portail indisponible.')),
    []
  );

  useEffect(() => { rechargerFiche(); }, [rechargerFiche]);

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
    contenu = <Outlet context={{ laboratoireId: fiche.laboratoire_id, fiche, rechargerFiche }} />;
  }

  return (
    <div className="portail">
      <LaboratoirePortailNavbar />
      {contenu}
      <PortailFooter espace="Espace laboratoire" />
    </div>
  );
}
