// presence-abonnement.jsx — portails pharmacie et centre de santé, « Abonnement ».
//
// Abonnement de présence de la fiche (souscription, paiement, renouvellement,
// factures — MonAbonnementPresence), ce que le public voit selon cet
// abonnement, et statistiques de consultation.
// Données : GET /abonnements-presence/:type/gestion.
import { useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import MonAbonnementPresence from '../../abonnements/MonAbonnementPresence';
import StatistiquesFichePresence from '../../abonnements/StatistiquesFichePresence';
import { obtenirGestionPresence } from '../../../services/abonnementPresenceService';
import { EtatChargement } from './presenceCommun';
import { useRessource } from './presenceOutils';

function CeQueVoitLePublic({ type, droits }) {
  const lignes = [
    ['Nom, type, adresse, localisation sur la carte', true],
    ['Horaires d’ouverture' + (type === 'pharmacie' ? ' et gardes' : ''), true],
    ['Téléphone, e-mail et formulaire de contact', droits.contact_direct],
    ['Photo principale et galerie', droits.photos, droits.photos && droits.max_photos !== null && droits.max_photos !== undefined ? `${droits.max_photos} photo(s) au plus` : null],
    [type === 'pharmacie' ? 'Description et services particuliers' : 'Présentation, spécialités et prestations', droits.description_enrichie],
    ...(type === 'structure' ? [['Présentation de l’équipe', droits.presentation_equipe]] : []),
    ['Actualités', droits.description_enrichie],
    ['Statistiques de consultation (pour vous)', droits.statistiques],
  ];
  return (
    <div className="info-card mb-3">
      <h3><i className="fa-solid fa-eye" /> Ce que voit le public</h3>
      <ul className="list-unstyled mb-2" style={{ fontSize: '.9rem' }}>
        {lignes.map(([libelle, visible, detail]) => (
          <li key={libelle} className="py-1">
            <i className={`fa-solid ${visible ? 'fa-check text-success' : 'fa-eye-slash text-muted'} me-2`} />
            {libelle}{detail ? ` (${detail})` : ''} — {visible ? 'visible' : 'masqué'}
          </li>
        ))}
      </ul>
      <p className="minimal-note mb-0">L&apos;abonnement n&apos;influence jamais l&apos;ordre d&apos;affichage dans l&apos;annuaire.</p>
    </div>
  );
}

export default function PresenceAbonnement() {
  const { type, acteurId, rechargerFiche } = useOutletContext();
  const charger = useCallback(() => obtenirGestionPresence(type, acteurId), [type, acteurId]);
  const etat = useRessource(charger);

  const recharger = () => {
    etat.recharger();
    rechargerFiche();
  };

  return (
    <PresencePortailPage
      titre="Abonnement"
      description="Votre abonnement de présence décide de ce que le public voit sur votre fiche. Vos contenus sont toujours conservés."
    >
      <EtatChargement {...etat}>
        {etat.donnees && (
          <div className="row g-4">
            <div className="col-lg-7">
              <MonAbonnementPresence type={type} donnees={etat.donnees} onRecharger={recharger} />
            </div>
            <div className="col-lg-5">
              <CeQueVoitLePublic type={type} droits={etat.donnees.droits} />
              <StatistiquesFichePresence type={type} acteurId={acteurId} />
            </div>
          </div>
        )}
      </EtatChargement>
    </PresencePortailPage>
  );
}
