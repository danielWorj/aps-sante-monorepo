// src/components/abonnements/MonAbonnementPresence.jsx
//
// État de l'abonnement de présence d'une fiche, vu par son gestionnaire :
// niveau et échéance, période de grâce, paiement en attente (reprise),
// historique avec factures, et accès à la souscription. Partagé par
// l'espace pharmacie / centre de santé et le portail médecin.
// Données : GET /abonnements-presence/:type/gestion (passées par le parent).
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { obtenirFacturePresence } from '../../services/abonnementPresenceService';
import ChoixMoyenPaiement from '../paiement/ChoixMoyenPaiement';
import PaiementMobileMoney from '../paiement/PaiementMobileMoney';
import { FactureChargee } from '../paiement/FactureRecapitulative';
import { adaptateurAbonnementPresence } from '../paiement/adaptateurs';
import { montantDevise } from '../../utils/fonds';
import SouscriptionPresence from './SouscriptionPresence';

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

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

function dernierJour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

function ModaleFacture({ abonnementId, onFermer }) {
  return createPortal(
    <div className="rdv-modal-overlay" onClick={onFermer}>
      <div className="rdv-modal" role="dialog" aria-modal="true" aria-label="Facture" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rdv-modal-close" onClick={onFermer} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>
        <FactureChargee cle={`facture-abonnement-presence:${abonnementId}`} charger={() => obtenirFacturePresence(abonnementId)} />
      </div>
    </div>,
    document.body
  );
}

/**
 * @param {{ type: string, donnees: object, onRecharger: () => void }} props
 *   donnees : réponse de GET /abonnements-presence/:type/gestion
 */
export default function MonAbonnementPresence({ type, donnees, onRecharger }) {
  const { fiche, abonnement, brouillon, historique, abonnement_requis: requis } = donnees;
  const [souscription, setSouscription] = useState(false);
  const [factureOuverte, setFactureOuverte] = useState(null);
  const [reprise, setReprise] = useState(null); // { id, etape: 'choix' | 'momo' }
  const adaptateur = useMemo(() => (reprise ? adaptateurAbonnementPresence(reprise.id) : null), [reprise]);

  const fermerReprise = () => { setReprise(null); onRecharger(); };

  return (
    <>
      <div className="info-card mb-3">
        <h3><i className="fa-solid fa-id-card" /> Mon abonnement de présence</h3>

        {abonnement.en_grace && (
          <div className="banner-institutionnel mb-3">
            <i className="fa-solid fa-triangle-exclamation" />
            <span>
              Votre abonnement a expiré le {formatDate(dernierJour(abonnement.date_fin))} : les informations enrichies
              de votre fiche sont masquées au public. Renouvelez-le pour qu&apos;elles réapparaissent, sans ressaisie.
            </span>
          </div>
        )}

        {abonnement.statut_abonnement === 'actif' ? (
          <table className="hours-table" style={{ width: '100%' }}>
            <tbody>
              <tr><td>Niveau</td><td><strong>{abonnement.niveau?.libelle}</strong></td></tr>
              <tr><td>Valable jusqu&apos;au</td><td>{formatDate(dernierJour(abonnement.date_fin))} inclus</td></tr>
              <tr><td>Jours restants</td><td>{abonnement.jours_restants}</td></tr>
            </tbody>
          </table>
        ) : abonnement.statut_abonnement === 'gratuite' ? (
          <p style={{ fontSize: '.9rem' }}>
            <i className="fa-solid fa-gift me-1" /> Offre de lancement : votre fiche bénéficie gratuitement du niveau
            « {donnees.droits.niveau_presence} »
            {abonnement.date_fin ? <> jusqu&apos;au {formatDate(dernierJour(abonnement.date_fin))} inclus</> : null}, sans
            souscription. Vous pouvez passer à un niveau supérieur ci-dessous.
          </p>
        ) : abonnement.statut_abonnement === 'non_requis' ? (
          <p style={{ fontSize: '.9rem' }}>
            Aucun abonnement n&apos;est requis pour les médecins de votre pays pour le moment : votre fiche dispose de
            toutes ses fonctionnalités (photo, biographie, prise de rendez-vous en ligne).
          </p>
        ) : (
          <p style={{ fontSize: '.9rem' }}>
            {abonnement.statut_abonnement === 'grace'
              ? 'Abonnement expiré (période de grâce).'
              : 'Aucun abonnement actif : votre fiche est au palier Basique (informations factuelles, contact non exposé).'}
          </p>
        )}

        {/* en_ligne : publiée, ou déjà publiée et en re-modération (droits conservés). */}
        {!(fiche.en_ligne ?? fiche.statut_verification === 'publie') && (
          <p className="minimal-note mt-2 mb-0">
            <i className="fa-solid fa-hourglass-half" /> Votre fiche est en cours de vérification par ApSa : les informations
            enrichies apparaîtront au public après validation.
          </p>
        )}
        {fiche.en_ligne && fiche.statut_verification !== 'publie' && (
          <p className="minimal-note mt-2 mb-0">
            <i className="fa-solid fa-hourglass-half" /> Vos dernières modifications sont en cours de vérification par ApSa.
            Votre fiche reste en ligne et garde les avantages de votre abonnement.
          </p>
        )}

        {brouillon && brouillon.origine !== 'virement' && (
          <div className="minimal-note mt-2">
            <i className="fa-solid fa-hourglass-half" /> Abonnement « {brouillon.niveau.libelle} » ({brouillon.duree_mois} mois,{' '}
            {montantDevise(brouillon.montant_total, brouillon.devise)}) en attente de paiement.{' '}
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setReprise({ id: brouillon.abonnement_id, etape: 'choix' })}>
              Reprendre le paiement
            </button>
          </div>
        )}
        {brouillon && brouillon.origine === 'virement' && (
          <div className="minimal-note mt-2">
            <i className="fa-solid fa-building-columns" /> Abonnement « {brouillon.niveau.libelle} » en attente de votre virement
            ({montantDevise(brouillon.montant_total, brouillon.devise)}, référence <strong>{brouillon.abonnement_id}</strong>).
          </div>
        )}

        {(requis || abonnement.statut_abonnement === 'actif') && (
          <div className="d-flex gap-2 flex-wrap mt-3">
            <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setSouscription((v) => !v)}>
              <i className="fa-solid fa-arrows-rotate" />{' '}
              {souscription ? 'Masquer les formules' : abonnement.statut_abonnement === 'actif' ? 'Renouveler ou passer au niveau supérieur' : 'Souscrire un abonnement'}
            </button>
          </div>
        )}
      </div>

      {souscription && (
        <div className="mb-3">
          <SouscriptionPresence type={type} acteurId={fiche.acteur_id} onActive={onRecharger} />
        </div>
      )}

      {historique.length > 0 && (
        <div className="info-card mb-3">
          <h3><i className="fa-solid fa-clock-rotate-left" /> Historique</h3>
          <div className="table-responsive">
            <table className="hours-table" style={{ width: '100%' }}>
              <thead>
                <tr><th>Niveau</th><th>Période</th><th>Montant</th><th>Statut</th><th>Facture</th></tr>
              </thead>
              <tbody>
                {historique.map((a) => (
                  <tr key={a.abonnement_id}>
                    <td>{a.niveau?.libelle}<div className="minimal-note">{LIBELLE_ORIGINE[a.origine] ?? a.origine}</div></td>
                    <td>{a.date_debut ? `${formatDate(a.date_debut)} → ${formatDate(dernierJour(a.date_fin))}` : '—'}</td>
                    <td>{montantDevise(a.montant_total, a.devise)}</td>
                    <td>{LIBELLE_STATUT[a.statut] ?? a.statut}</td>
                    <td>
                      {a.facture ? (
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setFactureOuverte(a.abonnement_id)}>
                          {a.facture.numero}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {factureOuverte && <ModaleFacture abonnementId={factureOuverte} onFermer={() => setFactureOuverte(null)} />}

      {reprise?.etape === 'choix' && adaptateur && (
        <ChoixMoyenPaiement
          adaptateur={adaptateur}
          onFermer={fermerReprise}
          onChoisirMobileMoney={() => setReprise((r) => ({ ...r, etape: 'momo' }))}
        />
      )}
      {reprise?.etape === 'momo' && adaptateur && <PaiementMobileMoney adaptateur={adaptateur} onFermer={fermerReprise} />}
    </>
  );
}
