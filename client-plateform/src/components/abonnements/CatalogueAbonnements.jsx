// src/components/abonnements/CatalogueAbonnements.jsx
//
// Vitrine de la page « Abonnements » pour un visiteur (ou un compte sans
// fiche du type affiché) : niveaux, avantages, remises par durée et prix
// du pays, LUS DEPUIS LA CONSOLE D'ADMINISTRATION (routes publiques
// /abonnements-presence/:type/catalogue et /abonnements-assurance/catalogue).
//
// Prix indicatifs : le montant débité reste celui calculé par le serveur
// pour la fiche du gestionnaire connecté (<SouscriptionPresence /> ou
// <SouscriptionAssurance />), qui tient compte du prorata et de la gratuité.
import { useEffect, useState } from 'react';
import { obtenirCataloguePresence, LIBELLES_AVANTAGES } from '../../services/abonnementPresenceService';
import { obtenirCatalogueAssurance, LIBELLES_AVANTAGES_ASSURANCE } from '../../services/abonnementAssuranceService';
import { montantDevise } from '../../utils/fonds';

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

function avantagesLisibles(type, avantages) {
  if (type === 'assurance') {
    const liste = LIBELLES_AVANTAGES_ASSURANCE.filter(([cle]) => avantages[cle]).map(([, libelle]) => libelle);
    if (avantages.afficher_agences) {
      liste.push(avantages.max_agences === null ? 'Agences illimitées' : `Jusqu'à ${avantages.max_agences} agence(s)`);
    }
    if (avantages.max_photos !== 0 && avantages.max_photos !== undefined) {
      liste.push(avantages.max_photos === null ? 'Photos illimitées' : `Jusqu'à ${avantages.max_photos} photo(s)`);
    }
    return liste;
  }
  return Object.entries(avantages).filter(([, actif]) => actif).map(([cle]) => LIBELLES_AVANTAGES[cle] ?? cle);
}

function BaseCard({ tier }) {
  return (
    <div className="plan-card is-base">
      <div className="plan-card-head">
        <h3>{tier.name}</h3>
      </div>
      <div className="plan-price">
        <span className="plan-price-amount">{tier.priceLabel}</span>
      </div>
      {tier.priceSub && <p className="plan-price-sub">{tier.priceSub}</p>}
      <ul className="plan-features">
        {tier.features.map((f, i) => (
          <li key={i}><i className="fa-solid fa-check" /> {f}</li>
        ))}
      </ul>
      <button type="button" className="btn btn-block-aps btn-outline-primary">Inclus automatiquement</button>
    </div>
  );
}

function OffreCard({ type, offre, offerte, gratuiteJusquAu, onChoisir }) {
  const durees = offre.durees.filter((d) => d.disponible);
  const [duree, setDuree] = useState(durees[0]?.duree_mois ?? null);
  const choix = durees.find((d) => d.duree_mois === duree);

  return (
    <div className="plan-card">
      {offerte && <span className="plan-badge-top">Offert</span>}
      <div className="plan-card-head">
        <h3>{offre.libelle}</h3>
        {choix && <span className="plan-duration">{choix.duree_mois} mois</span>}
      </div>

      {choix ? (
        <>
          <div className="plan-price">
            <span className="plan-price-amount">
              {offre.a_partir_de && <small>dès </small>}
              {montantDevise(Math.round(choix.prix_mensuel_effectif), choix.devise)}
            </span>
            <span className="plan-price-unit">/ mois</span>
          </div>
          <p className="plan-price-sub">
            {choix.duree_mois > 1 ? <>soit {montantDevise(choix.montant_total, choix.devise)} facturés</> : 'Sans engagement'}
            {choix.remise_pourcent > 0 && <> · remise {choix.remise_pourcent} %</>}
          </p>
          {offerte && (
            <p className="plan-price-sub">
              Offert pendant la période de lancement
              {gratuiteJusquAu ? ` (jusqu'au ${formatDate(gratuiteJusquAu)})` : ''}.
            </p>
          )}
          {durees.length > 1 && (
            <div className="plan-type-chips mb-2" role="group" aria-label="Durée">
              {durees.map((d) => (
                <button
                  key={d.duree_mois}
                  type="button"
                  className={`plan-type-chip${d.duree_mois === duree ? ' active' : ''}`}
                  onClick={() => setDuree(d.duree_mois)}
                >
                  {d.duree_mois} mois{d.remise_pourcent > 0 ? ` (-${d.remise_pourcent} %)` : ''}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="plan-price-sub">
          {offre.durees.length === 0
            ? "Aucune durée n'est encore proposée à la vente."
            : 'Tarif non encore défini pour ce pays.'}
        </p>
      )}

      <ul className="plan-features">
        {avantagesLisibles(type, offre.avantages).map((libelle) => (
          <li key={libelle}><i className="fa-solid fa-check" /> {libelle}</li>
        ))}
      </ul>

      <button type="button" className="btn btn-block-aps btn-primary" disabled={!choix} onClick={() => onChoisir(offre, choix)}>
        Choisir cette formule
      </button>
    </div>
  );
}

/**
 * @param {{ type: 'pharmacie'|'structure'|'medecin'|'assurance', baseTier?: object, onChoisir: (offre, choix) => void }} props
 */
export default function CatalogueAbonnements({ type, baseTier, onChoisir }) {
  const [paysId, setPaysId] = useState(null);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    const requete = type === 'assurance' ? obtenirCatalogueAssurance(paysId) : obtenirCataloguePresence(type, paysId);
    requete
      .then((d) => { if (!annule) { setDonnees(d); setErreur(null); } })
      .catch((err) => { if (!annule) setErreur(err?.message || 'Offres indisponibles pour le moment.'); });
    return () => { annule = true; };
  }, [type, paysId]);

  if (erreur) {
    return (
      <div className="banner-institutionnel">
        <i className="fa-solid fa-circle-exclamation" /> <span>{erreur}</span>
      </div>
    );
  }
  if (!donnees) return <p className="text-muted">Chargement des offres…</p>;

  const { pays, pays_disponibles: paysDisponibles, gratuite, offres } = donnees;
  const sansObligation = type === 'medecin' && donnees.abonnement_obligatoire === false;

  return (
    <>
      {paysDisponibles.length > 1 && (
        <div className="plan-selector mb-3">
          <label className="form-label-aps" htmlFor="catalogue-pays">
            <i className="fa-solid fa-earth-africa" /> Tarifs pour le pays :
          </label>
          <select
            id="catalogue-pays"
            className="form-select"
            value={pays?.pays_id ?? ''}
            onChange={(e) => setPaysId(e.target.value)}
          >
            {paysDisponibles.map((p) => (
              <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
            ))}
          </select>
        </div>
      )}

      {sansObligation && (
        <div className="banner-institutionnel mb-3">
          <i className="fa-solid fa-gift" />
          <span>
            {pays ? `Au ${pays.nom}, les` : 'Les'} médecins bénéficient actuellement de tous les avantages
            sans abonnement.
          </span>
        </div>
      )}

      {offres.length === 0 ? (
        <div className="banner-institutionnel">
          <i className="fa-solid fa-circle-info" />
          <span>Aucune formule n&apos;est proposée pour le moment.</span>
        </div>
      ) : (
        <div className="plan-grid">
          {baseTier && <BaseCard tier={baseTier} />}
          {offres.map((offre) => (
            <OffreCard
              key={`${offre.niveau_id}-${pays?.pays_id ?? ''}`}
              type={type}
              offre={offre}
              offerte={gratuite?.niveau_id === offre.niveau_id}
              gratuiteJusquAu={gratuite?.jusqu_au}
              onChoisir={onChoisir}
            />
          ))}
        </div>
      )}

      {pays && offres.length > 0 && (
        <p className="plan-price-sub mt-2">
          Prix indicatifs pour {pays.nom}. Le montant exact est calculé à la souscription
          depuis l&apos;espace de gestion de votre fiche.
        </p>
      )}
    </>
  );
}
