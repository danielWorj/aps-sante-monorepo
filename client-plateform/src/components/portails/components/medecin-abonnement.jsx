// src/components/portails/components/medecin-abonnement.jsx
//
// Portail médecin — « Mon abonnement » de présence. Dans un pays où
// l'administration n'a pas rendu l'abonnement obligatoire, le médecin
// garde toutes ses fonctionnalités et n'a rien à souscrire ; sinon, sans
// abonnement actif, sa fiche repasse au palier Basique (plus de prise de
// rendez-vous en ligne). Information factuelle, aucun boost commercial.
import { useCallback, useEffect, useState } from 'react';
import PortailSidebar from '../layouts/portail-sidebar';
import { obtenirMonActeur, obtenirGestionPresence } from '../../../services/abonnementPresenceService';
import MonAbonnementPresence from '../../abonnements/MonAbonnementPresence';
import StatistiquesFichePresence from '../../abonnements/StatistiquesFichePresence';

export default function MedecinAbonnement() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  // Pas de setState synchrone : appelée depuis un effet (react-hooks/set-state-in-effect).
  const charger = useCallback(
    () =>
      obtenirMonActeur('medecin')
        .then(({ fiche }) => obtenirGestionPresence('medecin', fiche.acteur_id))
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => {
          setErreur(err?.status === 404 ? "Aucun profil médecin n'est associé à ce compte." : err?.message || 'Chargement impossible.');
        }),
    []
  );
  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main">
          <h1 className="h4 mb-3"><i className="fa-solid fa-id-card-clip me-2"></i>Mon abonnement</h1>
          {erreur && (
            <div className="alert alert-danger" role="alert">
              <i className="fa-solid fa-triangle-exclamation me-2"></i>{erreur}
            </div>
          )}
          {!erreur && !donnees && (
            <div className="text-center py-5">
              <div className="spinner-border text-primary mb-3" role="status" />
              <div>Chargement…</div>
            </div>
          )}
          {donnees && (
            <>
              {donnees.abonnement_requis && ['aucun', 'grace'].includes(donnees.abonnement.statut_abonnement) && (
                <div className="alert alert-warning">
                  <i className="fa-solid fa-circle-info me-2"></i>
                  Dans votre pays, l&apos;abonnement de présence est requis : sans abonnement actif, les patients ne
                  peuvent plus prendre rendez-vous en ligne avec vous et votre photo et votre biographie sont masquées.
                </div>
              )}
              <MonAbonnementPresence type="medecin" donnees={donnees} onRecharger={charger} />
              <StatistiquesFichePresence type="medecin" acteurId={donnees.fiche.acteur_id} />
            </>
          )}
        </main>
        <PortailSidebar />
      </div>
    </div>
  );
}
