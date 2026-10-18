// src/components/assurances/gestion/AbonnementAssurance.jsx
//
// « Mon abonnement » d'une fiche assurance : état, brouillon à reprendre,
// historique et factures, souscription / renouvellement / montée de niveau,
// reprise d'un paiement. Partagé par le portail assurance (page
// Abonnement) et l'espace de gestion admin (/assurances/:id/gestion).
// `donnees` = réponse de GET /services-assurance/:id/gestion.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { obtenirFactureAbonnement } from '../../../services/abonnementAssuranceService';
import SouscriptionAssurance from '../SouscriptionAssurance';
import ChoixMoyenPaiement from '../../paiement/ChoixMoyenPaiement';
import PaiementMobileMoney from '../../paiement/PaiementMobileMoney';
import { FactureChargee } from '../../paiement/FactureRecapitulative';
import { adaptateurAbonnement } from '../../paiement/adaptateurs';
import { montantDevise } from '../../../utils/fonds';
import { dernierJour, formatDate } from './datesAbonnement';

const LIBELLE_STATUT = {
  actif: 'Actif',
  expire: 'Expiré',
  annule: 'Annulé',
  suspendu: 'Suspendu',
  remplace: 'Remplacé (montée de niveau)',
};

const LIBELLE_ORIGINE = {
  self_service: 'En ligne',
  admin: 'Administration',
  virement: 'Virement',
  geste: 'Geste commercial',
  gratuite: 'Offre de lancement',
};

/** Bandeau de période de grâce (le serveur n'expose pas la fin de grâce : on affiche l'échéance). */
export function BandeauGrace({ abonnement }) {
  if (!abonnement?.en_grace) return null;
  return (
    <div className="banner-institutionnel mb-3">
      <i className="fa-solid fa-triangle-exclamation" />
      <span>
        Votre abonnement a expiré le {formatDate(dernierJour(abonnement.date_fin))} : vos contenus enrichis
        sont masqués au public. Renouvelez-le pour qu&apos;ils réapparaissent, sans ressaisie.
      </span>
    </div>
  );
}

function ModaleFacture({ abonnementId, onFermer }) {
  return createPortal(
    <div className="rdv-modal-overlay" onClick={onFermer}>
      <div className="rdv-modal" role="dialog" aria-modal="true" aria-label="Facture" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rdv-modal-close" onClick={onFermer} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>
        <FactureChargee cle={`facture-abonnement:${abonnementId}`} charger={() => obtenirFactureAbonnement(abonnementId)} />
      </div>
    </div>,
    document.body
  );
}

function CarteAbonnement({ donnees, onSouscrire, onReprendre, souscriptionOuverte }) {
  const { abonnement, brouillon, historique } = donnees;
  const [factureOuverte, setFactureOuverte] = useState(null);

  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-id-card" /> Mon abonnement</h3>
      {abonnement.statut_abonnement === 'actif' ? (
        <table className="hours-table" style={{ width: '100%' }}>
          <tbody>
            <tr><td>Niveau</td><td><strong>{abonnement.niveau?.libelle}</strong></td></tr>
            <tr><td>Valable jusqu&apos;au</td><td>{formatDate(dernierJour(abonnement.date_fin))} inclus</td></tr>
            <tr><td>Jours restants</td><td>{abonnement.jours_restants}</td></tr>
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: '.9rem' }}>
          {abonnement.statut_abonnement === 'grace'
            ? 'Abonnement expiré (période de grâce).'
            : 'Aucun abonnement actif : votre fiche est en présence minimale (dénomination, type et localisation).'}
        </p>
      )}

      {brouillon && (
        <div className="minimal-note mt-2">
          <i className="fa-solid fa-hourglass-half" /> Abonnement « {brouillon.niveau.libelle} » ({brouillon.duree_mois} mois,{' '}
          {montantDevise(brouillon.montant_total, brouillon.devise)}) en attente de paiement.{' '}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => onReprendre(brouillon.abonnement_id)}>
            Reprendre le paiement
          </button>
        </div>
      )}

      <div className="d-flex gap-2 flex-wrap mt-3">
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={onSouscrire} aria-expanded={souscriptionOuverte}>
          <i className="fa-solid fa-arrows-rotate" />{' '}
          {abonnement.statut_abonnement === 'actif' ? 'Renouveler ou passer au niveau supérieur' : 'Activer un abonnement'}
        </button>
      </div>

      {historique.length > 0 && (
        <>
          <h4 className="mt-4" style={{ fontSize: '.95rem' }}>Historique</h4>
          <div className="table-responsive">
            <table className="hours-table" style={{ width: '100%', fontSize: '.85rem' }}>
              <thead>
                <tr><th>Niveau</th><th>Période</th><th>Montant</th><th>Statut</th><th>Origine</th><th>Facture</th></tr>
              </thead>
              <tbody>
                {historique.map((h) => (
                  <tr key={h.abonnement_id}>
                    <td>{h.niveau?.libelle}</td>
                    <td>{h.date_debut ? `${formatDate(h.date_debut)} → ${formatDate(dernierJour(h.date_fin))}` : '—'}</td>
                    <td>{montantDevise(h.montant_total, h.devise)}</td>
                    <td>{LIBELLE_STATUT[h.statut] ?? h.statut}</td>
                    <td>{LIBELLE_ORIGINE[h.origine] ?? h.origine}</td>
                    <td>
                      {h.facture ? (
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setFactureOuverte(h.abonnement_id)}>
                          {h.facture.numero}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {factureOuverte && <ModaleFacture abonnementId={factureOuverte} onFermer={() => setFactureOuverte(null)} />}
    </div>
  );
}

/**
 * @param {{ serviceId: string, donnees: object, onRecharger: () => void, souscriptionInitiale?: boolean }} props
 */
export default function AbonnementAssurance({ serviceId, donnees, onRecharger, souscriptionInitiale = false }) {
  const [souscription, setSouscription] = useState(souscriptionInitiale);
  const [reprise, setReprise] = useState(null); // { abonnementId, etape: 'choix'|'momo' }
  const adaptateurReprise = useMemo(
    () => (reprise ? adaptateurAbonnement(reprise.abonnementId) : null),
    [reprise?.abonnementId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <>
      <CarteAbonnement
        donnees={donnees}
        souscriptionOuverte={souscription}
        onSouscrire={() => setSouscription((s) => !s)}
        onReprendre={(abonnementId) => setReprise({ abonnementId, etape: 'choix' })}
      />

      {souscription && (
        <div className="mt-4">
          <h2 style={{ fontSize: '1.3rem' }}>Formules disponibles</h2>
          <SouscriptionAssurance serviceAssuranceId={serviceId} onActive={onRecharger} />
        </div>
      )}

      {reprise?.etape === 'choix' && adaptateurReprise && (
        <ChoixMoyenPaiement
          adaptateur={adaptateurReprise}
          onFermer={() => { setReprise(null); onRecharger(); }}
          onChoisirMobileMoney={() => setReprise({ ...reprise, etape: 'momo' })}
        />
      )}
      {reprise?.etape === 'momo' && adaptateurReprise && (
        <PaiementMobileMoney adaptateur={adaptateurReprise} onFermer={() => { setReprise(null); onRecharger(); }} />
      )}
    </>
  );
}
