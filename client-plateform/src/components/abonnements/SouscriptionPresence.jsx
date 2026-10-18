// src/components/abonnements/SouscriptionPresence.jsx
//
// Souscription d'un abonnement de présence par le gestionnaire d'une fiche
// (pharmacie, centre de santé, médecin) — même parcours que
// SouscriptionAssurance.jsx :
//   1. offres : niveaux vendables et montants par durée, CALCULÉS PAR LE
//      SERVEUR pour cette fiche (renouvellement, montée au prorata) ;
//   2. récapitulatif -> « Payer » crée le brouillon ;
//   3. carte (Stripe Checkout), Mobile Money (CamPay) ou virement.
// Gratuité d'amorçage ou montant nul : activé directement, sans paiement.
// Médecins : rien à souscrire tant que l'abonnement n'est pas obligatoire
// dans leur pays (décision du back-office).
//
// Le montant n'est JAMAIS envoyé : seulement niveau_id et duree_mois.
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LIBELLES_AVANTAGES,
  obtenirOffresPresence,
  creerBrouillonPresence,
  choisirVirementPresence,
  annulerPaiementPresence,
} from '../../services/abonnementPresenceService';
import ChoixMoyenPaiement from '../paiement/ChoixMoyenPaiement';
import PaiementMobileMoney from '../paiement/PaiementMobileMoney';
import { adaptateurAbonnementPresence } from '../paiement/adaptateurs';
import { montantDevise } from '../../utils/fonds';

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
        {Object.entries(offre.avantages).filter(([, actif]) => actif).map(([cle]) => (
          <li key={cle}><i className="fa-solid fa-check" /> {LIBELLES_AVANTAGES[cle] ?? cle}</li>
        ))}
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
 * @param {{ type: 'pharmacie'|'structure'|'medecin', acteurId: string, onActive?: () => void }} props
 *   onActive : appelé quand un abonnement est activé sans paiement (gratuité).
 */
export default function SouscriptionPresence({ type, acteurId, onActive, intention, onIntentionTraitee }) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurRecap, setErreurRecap] = useState(null);
  const [codeErreur, setCodeErreur] = useState(null);
  const [abonnementId, setAbonnementId] = useState(null);
  const [etape, setEtape] = useState(null); // recap | choix | momo | virement | active
  const [virement, setVirement] = useState(null);

  // Formule choisie avant la connexion (niveau + durée, lus dans l'URL par
  // la page) : ouverte une seule fois, au premier chargement des offres.
  const intentionRef = useRef(intention);
  const onIntentionTraiteeRef = useRef(onIntentionTraitee);
  useEffect(() => { onIntentionTraiteeRef.current = onIntentionTraitee; });
  const reprendreIntention = useCallback((d) => {
    const voulue = intentionRef.current;
    if (!voulue) return;
    intentionRef.current = null;
    const offre = d.offres?.find((o) => o.niveau_id === voulue.niveau_id);
    const choix = offre?.durees.find((x) => x.disponible && x.duree_mois === voulue.duree_mois);
    if (offre && choix) {
      setSelection({ offre, choix });
      setEtape('recap');
    }
    onIntentionTraiteeRef.current?.();
  }, []);

  const charger = useCallback(() => {
    obtenirOffresPresence(type, acteurId)
      .then((d) => {
        setDonnees(d);
        setErreur(null);
        reprendreIntention(d);
      })
      .catch((err) => setErreur(err?.message || 'Offres indisponibles pour le moment.'));
  }, [type, acteurId, reprendreIntention]);

  useEffect(() => { charger(); }, [charger]);

  const adaptateur = useMemo(() => (abonnementId ? adaptateurAbonnementPresence(abonnementId) : null), [abonnementId]);

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
      const { abonnement, active } = await creerBrouillonPresence(type, {
        acteur_id: acteurId,
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
      await annulerPaiementPresence(donnees.brouillon.abonnement_id);
      await payer();
    } catch (err) {
      setErreurRecap(err?.message || "Impossible d'annuler le paiement en cours.");
    }
  };

  const demanderVirement = async () => {
    try {
      setVirement(await choisirVirementPresence(abonnementId));
      setEtape('virement');
    } catch (err) {
      setErreurRecap(err?.message || 'Le virement est indisponible pour le moment.');
      setEtape('recap');
    }
  };

  if (erreur) {
    return <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>;
  }
  if (!donnees) return <p className="minimal-note">Chargement des offres…</p>;

  const { fiche, abonnement_courant: courant, brouillon, offres, abonnement_requis: requis } = donnees;

  // en_ligne : publiée, ou déjà publiée et en re-modération (souscription possible).
  if (!(fiche.en_ligne ?? fiche.statut_verification === 'publie')) {
    return (
      <div className="banner-institutionnel">
        <i className="fa-solid fa-hourglass-half" />
        <span>
          Votre fiche « {fiche.nom} » doit être vérifiée et publiée par ApSa avant de pouvoir souscrire un abonnement.
        </span>
      </div>
    );
  }

  if (!requis) {
    return (
      <div className="banner-institutionnel">
        <i className="fa-solid fa-circle-check" />
        <span>
          Aucun abonnement n&apos;est requis pour les médecins de votre pays pour le moment : votre fiche dispose déjà
          de toutes ses fonctionnalités (photo, biographie, prise de rendez-vous en ligne).
        </span>
      </div>
    );
  }

  const estPaiementEnCours = codeErreur === 'PAIEMENT_EN_COURS' && !!brouillon;

  return (
    <>
      <div className="info-card mb-3">
        <h3><i className="fa-solid fa-id-card" /> {fiche.nom}</h3>
        <p className="mb-0" style={{ fontSize: '.9rem' }}>
          {courant.statut_abonnement === 'actif' && (
            <>Abonnement « {courant.niveau_presence} » actif jusqu&apos;au {formatDate(dernierJour(courant.date_fin))} inclus.</>
          )}
          {courant.statut_abonnement === 'grace' && (
            <>Votre abonnement a expiré le {formatDate(dernierJour(courant.date_fin))} : les informations enrichies de votre fiche ne sont plus visibles du public.</>
          )}
          {courant.statut_abonnement === 'gratuite' && (
            <>Offre de lancement : le niveau « {courant.niveau_presence} » vous est offert
            {courant.date_fin ? ` jusqu'au ${formatDate(dernierJour(courant.date_fin))} inclus` : ''}, sans souscription.</>
          )}
          {courant.statut_abonnement === 'aucun' && (
            <>Votre fiche est au palier Basique (gratuit) : informations factuelles uniquement, contact non exposé.</>
          )}
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
      {!offres.length && <p className="minimal-note">Aucune formule n&apos;est proposée pour le moment.</p>}
      <p className="minimal-note mt-2">
        L&apos;abonnement enrichit votre fiche d&apos;informations factuelles ; il ne modifie jamais votre classement
        dans les résultats et n&apos;affiche aucune mention « Sponsorisé ».
      </p>

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
          {erreurRecap && <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreurRecap}</p>}
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

      {etape === 'momo' && adaptateur && <PaiementMobileMoney adaptateur={adaptateur} onFermer={fermer} />}

      {etape === 'virement' && virement && (
        <Modale titre="Paiement par virement" onFermer={fermer}>
          <p>{virement.instructions}</p>
          <dl className="facture-infos">
            <dt>Montant</dt><dd><strong>{montantDevise(virement.montant, virement.devise)}</strong></dd>
            <dt>Référence</dt><dd><code>{virement.reference}</code></dd>
          </dl>
          <button type="button" className="btn btn-primary btn-block-aps w-100 mt-3" onClick={fermer}>J&apos;ai compris</button>
        </Modale>
      )}

      {etape === 'active' && (
        <Modale titre="Abonnement activé" onFermer={fermer}>
          <p>Votre abonnement est actif : les informations enrichies de votre fiche sont désormais visibles du public.</p>
          <button type="button" className="btn btn-primary btn-block-aps w-100" onClick={fermer}>
            Continuer
          </button>
        </Modale>
      )}
    </>
  );
}
