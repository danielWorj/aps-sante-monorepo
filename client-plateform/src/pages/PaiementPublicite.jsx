// src/pages/PaiementPublicite.jsx
//
// Page ouverte par le lien du message WhatsApp « publicité acceptée » :
// récapitulatif de la publicité, facture récapitulative (montant initial,
// frais d'agrégateur selon le moyen choisi, montant final), puis choix du
// moyen de paiement — mêmes composants que le paiement d'un rendez-vous
// (ChoixMoyenPaiement, PaiementMobileMoney) via adaptateurPublicite.
// Connexion requise : seul l'annonceur (ou un admin) peut payer.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ChoixMoyenPaiement from '../components/paiement/ChoixMoyenPaiement';
import PaiementMobileMoney from '../components/paiement/PaiementMobileMoney';
import { FactureAdaptateur } from '../components/paiement/FactureRecapitulative';
import { adaptateurPublicite } from '../components/paiement/adaptateurs';
import { libellePosition, obtenirDevisPublicite } from '../services/publiciteService';
import { dateHeure } from '../utils/fonds';
import { LiensLegaux } from '../components/legal/CaseAcceptationLegale';
import './Publicite.css';

const formatJour = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

export default function PaiementPublicite() {
  const { id } = useParams();
  const adaptateur = useMemo(() => adaptateurPublicite(id), [id]);
  const [devis, setDevis] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [etape, setEtape] = useState(null); // null | 'choix' | 'momo'

  useEffect(() => {
    let annule = false;
    obtenirDevisPublicite(id, 'stripe')
      .then((d) => { if (!annule) setDevis(d); })
      .catch((e) => { if (!annule) setErreur(e); });
    return () => { annule = true; };
  }, [id]);

  if (erreur) {
    const deja = erreur.data?.code === 'PUBLICITE_NON_PAYABLE' && /déjà payée/.test(erreur.message);
    return (
      <div className="container-aps status-page">
        <div className={`status-card ${deja ? 'is-success' : 'is-neutral'}`}>
          <div className="status-card-icon"><i className={`fa-solid ${deja ? 'fa-check' : 'fa-circle-info'}`} /></div>
          <h1>{deja ? 'Publicité déjà payée' : 'Paiement indisponible'}</h1>
          <p className="status-card-text">{erreur.message}</p>
          <div className="status-card-actions">
            <Link to={`/portail/annonceur/publicites/${id}`} className="btn btn-primary btn-lg-aps">Voir ma publicité</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!devis) {
    return (
      <div className="container-aps status-page">
        <div className="status-card is-pending"><div className="status-card-spinner" /><h1>Chargement…</h1></div>
      </div>
    );
  }

  const p = devis.publicite;
  return (
    <section className="pub-page">
      <div className="container-aps">
        <header className="pub-page-entete">
          <span className="pub-surtitre"><i className="fa-solid fa-circle-check" /> Publicité acceptée</span>
          <h1>Finalisez votre réservation</h1>
          <p>
            Réglez avant le <strong>{dateHeure(p.date_limite_paiement)}</strong> : passé ce délai, la position est
            libérée pour d’autres annonceurs.
          </p>
        </header>

        <div className="row g-4">
          <div className="col-lg-5">
            <div className="pub-bloc pub-recap">
              <img src={p.visuel_url} alt={p.titre} />
              <h2>{p.titre}</h2>
              {p.description && <p>{p.description}</p>}
              <dl>
                <dt>Emplacement</dt><dd>{p.emplacement} · {libellePosition(p.rang)}</dd>
                <dt>Diffusion</dt><dd>du {formatJour(p.date_debut)} au {formatJour(devis.entete.date_fin_incluse)}</dd>
              </dl>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="pub-bloc">
              <h2 className="h5 mb-3">Facture récapitulative</h2>
              <FactureAdaptateur adaptateur={adaptateur} agregateur="stripe" telechargeable={false} />
              <p className="form-hint mt-2">
                Les frais de paiement dépendent du moyen choisi (carte ou Mobile Money) : le détail exact est
                affiché à l’étape suivante.
              </p>
              <button type="button" className="btn btn-primary btn-lg-aps w-100 mt-2" onClick={() => setEtape('choix')}>
                <i className="fa-solid fa-lock" /> Payer ma publicité
              </button>
              <p className="form-hint mt-2 mb-0 text-center">
                En payant, vous acceptez les <LiensLegaux />.
              </p>
            </div>
          </div>
        </div>
      </div>

      {etape === 'choix' && (
        <ChoixMoyenPaiement adaptateur={adaptateur} onFermer={() => setEtape(null)} onChoisirMobileMoney={() => setEtape('momo')} />
      )}
      {etape === 'momo' && <PaiementMobileMoney adaptateur={adaptateur} onFermer={() => setEtape(null)} />}
    </section>
  );
}
