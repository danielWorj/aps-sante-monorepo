// assurance-abonnement.jsx — portail assurance, « Abonnement ».
//
// État de l'abonnement de la fiche, avantages inclus, historique et
// factures ; activation, renouvellement ou montée de niveau (même parcours
// de paiement que partout : Stripe, Mobile Money ou virement). Une fiche
// non publiée ne peut pas être abonnée (règle serveur).
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AssurancePortailPage } from '../layouts/assurance.portail-sidebar';
import AbonnementAssurance, { BandeauGrace } from '../../assurances/gestion/AbonnementAssurance';
import { LIBELLES_AVANTAGES_ASSURANCE, obtenirGestionServiceAssurance } from '../../../services/abonnementAssuranceService';

const quota = (v, unite) => (v === null || v === undefined ? `${unite} illimité(e)s` : v === 0 ? null : `${v} ${unite}`);

function AvantagesActuels({ droits }) {
  const inclus = LIBELLES_AVANTAGES_ASSURANCE.filter(([cle]) => droits[cle]).map(([, l]) => l);
  const quotas = [quota(droits.max_agences, 'agence(s)'), quota(droits.max_photos, 'photo(s)')].filter(Boolean);
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-list-check" /> Ce que votre fiche affiche aujourd&apos;hui</h3>
      {inclus.length === 0 ? (
        <p className="mb-0" style={{ fontSize: '.9rem' }}>
          Présence minimale : dénomination, type et localisation uniquement.
        </p>
      ) : (
        <ul className="list-unstyled mb-0 small">
          {[...inclus, ...quotas].map((l) => (
            <li key={l} className="py-1"><i className="fa-solid fa-check text-success me-2" />{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AssuranceAbonnement() {
  const { serviceId, fiche } = useOutletContext();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(
    () =>
      obtenirGestionServiceAssurance(serviceId)
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err?.message || 'Abonnement indisponible.')),
    [serviceId]
  );
  useEffect(() => { charger(); }, [charger]);

  return (
    <AssurancePortailPage
      titre="Abonnement"
      description="Votre abonnement décide de ce que le public voit sur votre fiche. Vos contenus sont toujours conservés."
    >
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && (
        <>
          {fiche.statut_verification !== 'publie' && (
            <div className="banner-institutionnel mb-3">
              <i className="fa-solid fa-hourglass-half" />
              <span>Votre fiche est en cours de vérification : l&apos;abonnement pourra être activé dès sa publication.</span>
            </div>
          )}
          <BandeauGrace abonnement={donnees.abonnement} />
          <div className="row g-4">
            <div className="col-xl-7">
              <AbonnementAssurance
                serviceId={serviceId}
                donnees={donnees}
                onRecharger={charger}
                souscriptionInitiale={donnees.abonnement.statut_abonnement !== 'actif' && fiche.statut_verification === 'publie'}
              />
            </div>
            <div className="col-xl-5">
              <AvantagesActuels droits={donnees.droits} />
            </div>
          </div>
        </>
      )}
    </AssurancePortailPage>
  );
}
