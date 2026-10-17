// src/components/assurances/SouscriptionAssurance.jsx
//
// Souscription d'un abonnement par le promoteur d'une fiche assurance
// (guide abonnements assurances v3, §2.2.2) :
//   1. offres : niveaux vendables et montants par durée, CALCULÉS PAR LE
//      SERVEUR pour cette fiche (renouvellement, montée au prorata) ;
//   2. récapitulatif (modale) : niveau, durée, total -> « Payer » crée le
//      brouillon (POST /abonnements-assurance) ;
//   3. choix du moyen : carte (Stripe Checkout), Mobile Money (CamPay) ou
//      virement (instructions, activation par l'administration).
// Gratuité d'amorçage ou montant nul : activé directement, sans paiement.
//
// Le montant n'est JAMAIS envoyé : seulement niveau_id et duree_mois.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  obtenirOffresAbonnement,
  creerBrouillonAbonnement,
  choisirVirementAbonnement,
  annulerPaiementAbonnement,
} from '../../services/abonnementAssuranceService';
import ChoixMoyenPaiement from '../paiement/ChoixMoyenPaiement';
import PaiementMobileMoney from '../paiement/PaiementMobileMoney';
import { adaptateurAbonnement } from '../paiement/adaptateurs';
import { montantDevise } from '../../utils/fonds';

const AVANTAGES = [
  ['siege_complet', 'Fiche du siège complète (contacts, agrément, présentation)'],
  ['afficher_activites', 'Activités et produits visibles'],
  ['afficher_agences', 'Agences visibles et localisables'],
  ['formulaire_contact', 'Formulaire de mise en relation'],
  ['suivi_demandes', 'Suivi des demandes reçues'],
];

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

/** date_fin est exclusive : dernier jour couvert = veille. */
function dernierJour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

function Modale({ titre, onFermer, children }) {
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onFermer?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onFermer]);
  return createPortal(
    <div className="rdv-modal-overlay" onClick={onFermer}>
      <div className="rdv-modal" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rdv-modal-close" onClick={onFermer} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>
        <h3 className="mb-3" style={{ fontSize: '1.15rem' }}>{titre}</h3>
        {children}
      </div>
    </div>,
    document.body
  );
}

function OffreCard({ offre, onChoisir, estCourant }) {
  const durees = offre.durees.filter((d) => d.disponible);
  const [duree, setDuree] = useState(durees[0]?.duree_mois ?? null);
  const choix = offre.durees.find((d) => d.duree_mois === duree);
  const indisponible = offre.durees.find((d) => !d.disponible);

  return (
    <div className={`plan-card${estCourant ? ' is-popular' : ''}`}>
      {estCourant && <span className="plan-ribbon">Votre niveau</span>}
      {offre.gratuite && !estCourant && <span className="plan-badge-top">Offert</span>}
      <div className="plan-card-head">
        <h3>{offre.libelle}</h3>
      </div>

      {choix ? (
        <>
          <div className="plan-price">
            <span className="plan-price-amount">{montantDevise(choix.montant_total, choix.devise)}</span>
            <span className="plan-price-unit">/ {choix.duree_mois} mois</span>
          </div>
          <p className="plan-price-sub">
            {montantDevise(choix.prix_mensuel, choix.devise)} par mois
            {choix.remise_pourcent > 0 && <> · remise {choix.remise_pourcent} %</>}
            {choix.credit_prorata > 0 && <> · crédit de {montantDevise(choix.credit_prorata, choix.devise)} déduit</>}
          </p>
          {offre.gratuite && (
            <p className="plan-price-sub">
              Offert pendant la période de lancement
              {offre.gratuite.jusqu_au ? ` (jusqu'au ${formatDate(offre.gratuite.jusqu_au)})` : ''}.
            </p>
          )}
          <label className="form-label-aps mt-2" htmlFor={`duree-${offre.niveau_id}`}>Durée</label>
          <select
            id={`duree-${offre.niveau_id}`}
            className="form-select mb-2"
            value={duree ?? ''}
            onChange={(e) => setDuree(Number(e.target.value))}
          >
            {durees.map((d) => (
              <option key={d.duree_mois} value={d.duree_mois}>
                {d.duree_mois} mois{d.remise_pourcent > 0 ? ` (-${d.remise_pourcent} %)` : ''}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="plan-price-sub">{indisponible?.message || 'Formule indisponible pour le moment.'}</p>
      )}

      <ul className="plan-features">
        {AVANTAGES.filter(([cle]) => offre.avantages[cle]).map(([cle, libelle]) => (
          <li key={cle}><i className="fa-solid fa-check" /> {libelle}</li>
        ))}
        {offre.avantages.afficher_agences && (
          <li>
            <i className="fa-solid fa-check" />{' '}
            {offre.avantages.max_agences === null ? 'Agences illimitées' : `Jusqu'à ${offre.avantages.max_agences} agence(s)`}
          </li>
        )}
      </ul>

      <button
        type="button"
        className="btn btn-block-aps btn-primary"
        disabled={!choix}
        onClick={() => onChoisir(offre, choix)}
      >
        {estCourant ? 'Renouveler' : choix?.montee_de_niveau ? 'Passer à ce niveau' : 'Choisir cette formule'}
      </button>
    </div>
  );
}

/**
 * @param {{ serviceAssuranceId: string, onActive?: () => void }} props
 *   onActive : appelé quand un abonnement est activé sans paiement (gratuité).
 */
export default function SouscriptionAssurance({ serviceAssuranceId, onActive }) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(null); // { offre, choix }
  const [envoi, setEnvoi] = useState(false);
  const [erreurRecap, setErreurRecap] = useState(null);
  const [codeErreur, setCodeErreur] = useState(null);
  const [abonnementId, setAbonnementId] = useState(null);
  const [etape, setEtape] = useState(null); // recap | choix | momo | virement | active
  const [virement, setVirement] = useState(null);

  const charger = useCallback(() => {
    obtenirOffresAbonnement(serviceAssuranceId)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err?.message || 'Offres indisponibles pour le moment.'));
  }, [serviceAssuranceId]);

  useEffect(() => { charger(); }, [charger]);

  const adaptateur = useMemo(() => (abonnementId ? adaptateurAbonnement(abonnementId) : null), [abonnementId]);

  const fermer = () => {
    setEtape(null);
    setSelection(null);
    setErreurRecap(null);
    setCodeErreur(null);
    setVirement(null);
    charger();
  };

  const payer = async () => {
    if (envoi || !selection) return;
    setEnvoi(true);
    setErreurRecap(null);
    setCodeErreur(null);
    try {
      const { abonnement, active } = await creerBrouillonAbonnement({
        service_assurance_id: serviceAssuranceId,
        niveau_id: selection.offre.niveau_id,
        duree_mois: selection.choix.duree_mois,
      });
      setAbonnementId(abonnement.abonnement_id);
      if (active) {
        setEtape('active');
        onActive?.();
      } else {
        setEtape('choix');
      }
    } catch (err) {
      setErreurRecap(err?.message || "Impossible de préparer l'abonnement. Réessayez.");
      setCodeErreur(err?.data?.code ?? null);
    } finally {
      setEnvoi(false);
    }
  };

  const annulerPaiementEnCours = async () => {
    if (!donnees?.brouillon) return;
    setErreurRecap(null);
    try {
      await annulerPaiementAbonnement(donnees.brouillon.abonnement_id);
      await payer();
    } catch (err) {
      setErreurRecap(err?.message || "Impossible d'annuler le paiement en cours.");
    }
  };

  const demanderVirement = async () => {
    try {
      setVirement(await choisirVirementAbonnement(abonnementId));
      setEtape('virement');
    } catch (err) {
      setErreurRecap(err?.message || 'Le virement est indisponible pour le moment.');
      setEtape('recap');
    }
  };

  if (erreur) {
    return (
      <p className="status-card-error">
        <i className="fa-solid fa-circle-exclamation" /> {erreur}
      </p>
    );
  }
  if (!donnees) return <p className="minimal-note">Chargement des offres…</p>;

  const { service_assurance: service, abonnement_courant: courant, brouillon, offres } = donnees;

  if (service.statut_verification !== 'publie') {
    return (
      <div className="banner-institutionnel">
        <i className="fa-solid fa-hourglass-half" />
        <span>
          Votre fiche « {service.nom} » doit être vérifiée et publiée par ApSa avant de pouvoir souscrire un abonnement.
        </span>
      </div>
    );
  }

  const estPaiementEnCours = codeErreur === 'PAIEMENT_EN_COURS' && !!brouillon;

  return (
    <>
      <div className="info-card mb-3">
        <h3><i className="fa-solid fa-id-card" /> {service.nom}</h3>
        <p className="mb-0" style={{ fontSize: '.9rem' }}>
          {courant.statut_abonnement === 'actif' && (
            <>Abonnement « {courant.niveau_presence} » actif jusqu'au {formatDate(dernierJour(courant.date_fin))} inclus.</>
          )}
          {courant.statut_abonnement === 'grace' && (
            <>Votre abonnement a expiré le {formatDate(dernierJour(courant.date_fin))} : vos contenus enrichis ne sont plus visibles du public.</>
          )}
          {courant.statut_abonnement === 'aucun' && <>Votre fiche est en présence minimale.</>}
        </p>
        {brouillon && brouillon.origine === 'virement' && (
          <p className="minimal-note mt-2 mb-0">
            <i className="fa-solid fa-building-columns" /> Un abonnement « {brouillon.niveau.libelle} » attend la
            réception de votre virement ({montantDevise(brouillon.montant_total, brouillon.devise)}, référence{' '}
            <strong>{brouillon.abonnement_id}</strong>).
          </p>
        )}
      </div>

      <div className="plan-grid">
        {offres.map((offre) => (
          <OffreCard
            key={offre.niveau_id}
            offre={offre}
            estCourant={courant.statut_abonnement === 'actif' && courant.niveau_presence === offre.code}
            onChoisir={(o, choix) => { setSelection({ offre: o, choix }); setEtape('recap'); }}
          />
        ))}
      </div>
      {!offres.length && <p className="minimal-note">Aucune formule n'est proposée pour le moment.</p>}

      {etape === 'recap' && selection && (
        <Modale titre="Récapitulatif de votre abonnement" onFermer={fermer}>
          <dl className="facture-infos mb-3">
            <dt>Niveau</dt><dd>{selection.offre.libelle}</dd>
            <dt>Durée</dt><dd>{selection.choix.duree_mois} mois</dd>
            {selection.choix.remise_pourcent > 0 && (<><dt>Remise</dt><dd>{selection.choix.remise_pourcent} %</dd></>)}
            {selection.choix.credit_prorata > 0 && (
              <><dt>Crédit</dt><dd>{montantDevise(selection.choix.credit_prorata, selection.choix.devise)} (abonnement en cours)</dd></>
            )}
            <dt>Total</dt><dd><strong>{montantDevise(selection.choix.montant_total, selection.choix.devise)}</strong></dd>
          </dl>
          <p className="minimal-note">
            {selection.choix.montee_de_niveau
              ? 'Le nouveau niveau démarre dès le paiement ; il remplace votre abonnement actuel.'
              : courant.statut_abonnement === 'actif'
                ? 'La nouvelle période démarre à la fin de votre abonnement en cours.'
                : 'Votre abonnement démarre dès la réception du paiement.'}
          </p>
          {erreurRecap && (
            <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreurRecap}</p>
          )}
          {estPaiementEnCours && (
            <button type="button" className="btn btn-outline-primary btn-sm-aps w-100 mb-2" onClick={annulerPaiementEnCours}>
              <i className="fa-solid fa-ban" /> Annuler le paiement en cours et continuer
            </button>
          )}
          <button type="button" className="btn btn-primary btn-block-aps w-100" onClick={payer} disabled={envoi}>
            {envoi ? <><i className="fa-solid fa-spinner fa-spin" /> Préparation…</> : selection.choix.montant_total > 0 ? 'Payer' : 'Activer'}
          </button>
        </Modale>
      )}

      {etape === 'choix' && adaptateur && (
        <ChoixMoyenPaiement
          adaptateur={adaptateur}
          onFermer={fermer}
          onChoisirMobileMoney={() => setEtape('momo')}
          actionsSupplementaires={
            // Virement (montants élevés, EF-PAY-14) : activé par l'administration à réception.
            <button type="button" className="choix-paiement-option" onClick={demanderVirement}>
              <span className="choix-paiement-option-icon"><i className="fa-solid fa-building-columns" /></span>
              <span className="choix-paiement-option-body">
                <strong>Virement bancaire</strong>
                <small>Activation à réception des fonds par ApSa.</small>
              </span>
              <i className="fa-solid fa-chevron-right choix-paiement-option-arrow" />
            </button>
          }
        />
      )}

      {etape === 'momo' && adaptateur && (
        <PaiementMobileMoney adaptateur={adaptateur} onFermer={fermer} />
      )}

      {etape === 'virement' && virement && (
        <Modale titre="Paiement par virement" onFermer={fermer}>
          <p>{virement.instructions}</p>
          <dl className="facture-infos">
            <dt>Montant</dt><dd><strong>{montantDevise(virement.montant, virement.devise)}</strong></dd>
            <dt>Référence</dt><dd><code>{virement.reference}</code></dd>
          </dl>
          <button type="button" className="btn btn-primary btn-block-aps w-100 mt-3" onClick={fermer}>J'ai compris</button>
        </Modale>
      )}

      {etape === 'active' && (
        <Modale titre="Abonnement activé" onFermer={fermer}>
          <p>Votre abonnement est actif : vos contenus enrichis sont désormais visibles du public.</p>
          <Link to={`/assurances/${serviceAssuranceId}/gestion`} className="btn btn-primary btn-block-aps w-100">
            Gérer ma fiche
          </Link>
        </Modale>
      )}
    </>
  );
}
