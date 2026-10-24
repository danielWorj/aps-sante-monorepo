// PortailPresenceLayout.jsx
//
// Portails pharmacie et centre de santé : l'agent gère SA fiche, celle de
// l'espace actif (GET /pharmacies/mon-espace ou /centres-sante/mon-espace).
// Le layout retrouve la fiche une fois et la transmet aux pages par le
// contexte d'Outlet (useOutletContext) :
//   { type, acteurId, fiche, droits, statutAbonnement, equipe, badges,
//     rechargerFiche, rafraichirMessages }
import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import PortailTopbar from '../components/portails/layouts/portail-topbar';
import PortailFooter from '../components/portails/layouts/portail-footer';
import { LIENS_PORTAIL_PRESENCE } from '../components/portails/layouts/presence.liens';
import { useAnnoncesNonLues } from '../components/annonces/annoncesVues';
import { ESPACES_PRESENCE, listerMessagesGestion, obtenirMaFiche } from '../services/espacePresenceService';
import '../assets/styles/laboratoire.css';

function EtatSansFiche({ type, erreur, onReessayer }) {
  const config = ESPACES_PRESENCE[type];
  return (
    <div className="container-aps status-page">
      <div className="status-card is-neutral">
        <div className="status-card-icon"><i className={`fa-solid ${config.icone}`} /></div>
        <h1>{type === 'pharmacie' ? 'Aucune pharmacie' : 'Aucun centre de santé'}</h1>
        <p className="status-card-text">
          {erreur === 'aucune' ? `Votre compte n'est rattaché à aucune fiche ${config.libelle} dans cet espace.` : erreur}
        </p>
        <div className="status-card-actions">
          {erreur === 'aucune'
            ? <Link to={config.creation} className="btn btn-primary btn-lg-aps">Référencer ma {type === 'pharmacie' ? 'pharmacie' : 'structure'}</Link>
            : <button type="button" className="btn btn-primary btn-lg-aps" onClick={onReessayer}>Réessayer</button>}
        </div>
      </div>
    </div>
  );
}

export default function PortailPresenceLayout({ type }) {
  const config = ESPACES_PRESENCE[type];
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [messagesNonLus, setMessagesNonLus] = useState(0);
  const annonces = useAnnoncesNonLues();

  const rechargerFiche = useCallback(
    () =>
      obtenirMaFiche(type)
        .then((d) => { setDonnees(d); setErreur(null); return d; })
        .catch((err) => setErreur(err.status === 404 ? 'aucune' : err.message || 'Portail indisponible.')),
    [type]
  );

  const acteurId = donnees?.fiche?.acteur_id;
  const rafraichirMessages = useCallback(() => {
    if (!acteurId) return;
    listerMessagesGestion(type, acteurId, 'non_lu')
      .then((d) => setMessagesNonLus(d.compteurs?.non_lu ?? 0))
      .catch(() => { /* pastille seulement */ });
  }, [type, acteurId]);

  useEffect(() => { rechargerFiche(); }, [rechargerFiche]);
  useEffect(() => { rafraichirMessages(); }, [rafraichirMessages]);

  const badges = { annonces, messages: messagesNonLus };

  let contenu;
  if (erreur) contenu = <EtatSansFiche type={type} erreur={erreur} onReessayer={rechargerFiche} />;
  else if (!donnees) {
    contenu = (
      <div className="container-aps text-center py-5">
        <div className="spinner-border text-primary mb-3" role="status" />
        <div>Chargement de votre espace…</div>
      </div>
    );
  } else {
    contenu = (
      <Outlet
        context={{
          type,
          acteurId,
          fiche: donnees.fiche,
          droits: donnees.droits,
          statutAbonnement: donnees.statut_abonnement,
          equipe: donnees.equipe,
          badges,
          rechargerFiche,
          rafraichirMessages,
        }}
      />
    );
  }

  return (
    <div className="portail">
      <PortailTopbar
        espace={config.espace}
        accueil={config.portail}
        liens={LIENS_PORTAIL_PRESENCE[type]}
        badges={badges}
        cheminNotifications={`${config.portail}-messages`}
      />
      {contenu}
      <PortailFooter espace={config.espace} />
    </div>
  );
}
