// GestionAssurance.jsx — espace de gestion d'une fiche assurance
// (guide abonnements assurances v3, §2.2.1). Route /assurances/:id/gestion,
// protégée par RequireAuth ; le serveur n'autorise que l'agent de la fiche
// ou un administrateur (GET /services-assurance/:id/gestion).
//
// L'agent utilise désormais le portail assurance (/portail/assurance) ;
// cette page reste l'accès direct à une fiche donnée (administration).
// Ses blocs sont partagés avec le portail (components/assurances/gestion).
//
// Les contenus (activités, agences) sont lus dans la réponse /gestion,
// JAMAIS dans les GET publics (qui renvoient [] hors droits) : la donnée
// est toujours conservée et réapparaît au public dès la réactivation.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenirGestionServiceAssurance } from '../services/abonnementAssuranceService';
import AbonnementAssurance, { BandeauGrace } from '../components/assurances/gestion/AbonnementAssurance';
import AgencesAssurance from '../components/assurances/gestion/AgencesAssurance';
import ActivitesAssurance from '../components/assurances/gestion/ActivitesAssurance';

export default function GestionAssurance() {
  const { id } = useParams();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(() => {
    obtenirGestionServiceAssurance(id)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err.status === 403
        ? "Cet espace est réservé à l'agent de la fiche ou à un administrateur."
        : err.message || 'Espace indisponible.'));
  }, [id]);

  useEffect(() => { charger(); }, [charger]);

  if (erreur) {
    return (
      <div className="container-aps" style={{ padding: '3rem 0' }}>
        <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>
      </div>
    );
  }
  if (!donnees) {
    return <div className="container-aps" style={{ padding: '3rem 0' }}><p className="minimal-note">Chargement de votre espace…</p></div>;
  }

  const { service_assurance: fiche, droits, quotas } = donnees;

  return (
    <section style={{ padding: '2rem 0' }}>
      <div className="container-aps">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <span className="eyebrow">Espace gestionnaire</span>
            <h1 style={{ fontSize: '1.6rem' }}>{fiche.nom}</h1>
          </div>
          {fiche.statut_verification === 'publie' && (
            <Link to={`/assurances/${id}`} className="btn btn-outline-primary btn-sm-aps">
              <i className="fa-solid fa-eye" /> Voir ma fiche publique
            </Link>
          )}
        </div>

        {fiche.statut_verification !== 'publie' && (
          <div className="banner-institutionnel mb-3">
            <i className="fa-solid fa-hourglass-half" />
            <span>Votre fiche est en cours de vérification : elle n&apos;est pas encore visible du public et ne peut pas être abonnée.</span>
          </div>
        )}
        <BandeauGrace abonnement={donnees.abonnement} />

        <div className="row g-4">
          <div className="col-lg-5">
            <AbonnementAssurance serviceId={id} donnees={donnees} onRecharger={charger} />
          </div>
          <div className="col-lg-7 d-flex flex-column gap-4">
            <AgencesAssurance
              serviceId={id}
              agences={donnees.agences}
              quota={quotas.agences}
              visiblesAuPublic={droits.afficher_agences}
              onChange={charger}
            />
            <ActivitesAssurance
              serviceId={id}
              activites={donnees.activites}
              visiblesAuPublic={droits.afficher_activites}
              onChange={charger}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
