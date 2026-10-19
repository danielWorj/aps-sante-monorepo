// src/pages/PortailAnnonceur.jsx
//
// Portail de l'annonceur (v9) : toutes ses réservations d'espace avec leur
// statut, et pour chacune les statistiques de diffusion (affichages, clics,
// taux de clic, courbe jour par jour), la facture et les actions possibles
// (payer une publicité acceptée, retirer une demande non payée).
//
// /portail/annonceur                       liste + résumé
// /portail/annonceur/publicites/:id        détail d'une publicité
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FactureChargee } from '../components/paiement/FactureRecapitulative';
import { useConfirmation, useToast } from '../components/feedback';
import {
  STATUTS_PUBLICITE,
  annulerDemandePublicite,
  libellePosition,
  listerMesPublicites,
  obtenirFacturePublicite,
  obtenirPublicite,
  obtenirStatistiquesPublicite,
} from '../services/publiciteService';
import { dateHeure, montantDevise } from '../utils/fonds';
import './Publicite.css';

const formatJour = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const veille = (iso) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
};
const nombre = (n) => new Intl.NumberFormat('fr-FR').format(n ?? 0);

function Statut({ statut, enDiffusion }) {
  if (enDiffusion) return <span className="pub-statut is-success"><i className="fa-solid fa-circle" /> En diffusion</span>;
  const s = STATUTS_PUBLICITE[statut] ?? { libelle: statut, variante: 'neutral' };
  return <span className={`pub-statut is-${s.variante}`}>{s.libelle}</span>;
}

/** Courbe jour par jour : barres des affichages, points des clics (SVG, sans dépendance). */
function GraphiqueDiffusion({ serie }) {
  if (!serie?.length) return <p className="form-hint">La courbe apparaîtra dès le premier jour de diffusion.</p>;
  const max = Math.max(1, ...serie.map((j) => j.impressions));
  const largeur = 100 / serie.length;
  return (
    <figure className="pub-graphique">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img"
        aria-label={`Affichages par jour, maximum ${max}`}>
        {serie.map((j, i) => (
          <rect key={j.jour} x={i * largeur + largeur * 0.15} width={largeur * 0.7}
            y={40 - (j.impressions / max) * 38} height={(j.impressions / max) * 38} className="pub-graphique-barre">
            <title>{`${formatJour(j.jour)} : ${j.impressions} affichages, ${j.clics} clics`}</title>
          </rect>
        ))}
      </svg>
      <figcaption>
        <span>{formatJour(serie[0].jour)}</span>
        <span>Affichages par jour (survolez une barre pour le détail)</span>
        <span>{formatJour(serie[serie.length - 1].jour)}</span>
      </figcaption>
    </figure>
  );
}

function DetailPublicite({ id }) {
  const confirmer = useConfirmation();
  const toast = useToast();
  const navigate = useNavigate();
  const [pub, setPub] = useState(null);
  const [stats, setStats] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let annule = false;
    obtenirPublicite(id)
      .then((p) => {
        if (annule) return;
        setPub(p);
        if (['payee', 'expiree'].includes(p.statut)) obtenirStatistiquesPublicite(id).then((s) => !annule && setStats(s)).catch(() => {});
      })
      .catch((e) => !annule && setErreur(e.message));
    return () => { annule = true; };
  }, [id]);

  const retirer = async () => {
    const ok = await confirmer({
      titre: 'Retirer la demande',
      message: 'Elle ne pourra pas être reprise.',
      labelConfirmer: 'Retirer',
      variante: 'danger',
    });
    if (!ok) return;
    setOccupe(true);
    try {
      await annulerDemandePublicite(id);
      toast.succes('Demande retirée.');
      navigate('/portail/annonceur');
    } catch (e) {
      setErreur(e.message);
      setOccupe(false);
    }
  };

  if (erreur) return <div className="alert alert-danger">{erreur}</div>;
  if (!pub) return <p className="form-hint">Chargement…</p>;

  return (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="pub-bloc pub-recap">
          <img src={pub.visuel_url} alt={pub.titre} />
          <Statut statut={pub.statut} enDiffusion={pub.en_diffusion} />
          <h2>{pub.titre}</h2>
          <p>{pub.description}</p>
          <dl>
            <dt>Emplacement</dt><dd>{pub.emplacement_publicitaire?.libelle} · {libellePosition(pub.rang)}</dd>
            <dt>Diffusion</dt><dd>{formatJour(pub.date_debut)} → {formatJour(veille(pub.date_fin))}</dd>
            <dt>Montant</dt><dd>{montantDevise(pub.montant ?? 0, pub.devise)}</dd>
            <dt>Contact affiché</dt><dd>{pub.telephone_contact}{pub.email_contact && ` · ${pub.email_contact}`}</dd>
            {pub.localisation && (<><dt>Localisation</dt><dd>{pub.localisation}</dd></>)}
          </dl>
          {pub.statut === 'rejetee' && pub.motif_rejet && (
            <div className="alert alert-danger mt-2 mb-0"><strong>Motif du refus :</strong> {pub.motif_rejet}</div>
          )}
          {pub.statut === 'en_attente_paiement' && (
            <>
              <p className="form-hint mt-2">À régler avant le {dateHeure(pub.date_limite_paiement)}.</p>
              <Link to={`/publicite/${pub.publicite_id}/paiement`} className="btn btn-primary w-100">Payer maintenant</Link>
            </>
          )}
          {['en_moderation', 'en_attente_paiement'].includes(pub.statut) && (
            <button type="button" className="btn btn-ghost w-100 mt-2" onClick={retirer} disabled={occupe}>Retirer ma demande</button>
          )}
        </div>
      </div>
      <div className="col-lg-8">
        <div className="pub-bloc">
          <h2 className="h5 mb-3">Statistiques de diffusion</h2>
          {['payee', 'expiree'].includes(pub.statut) ? (
            <>
              <div className="pub-kpis">
                <div><small>Affichages</small><strong>{nombre(stats?.impressions ?? pub.statistiques.impressions)}</strong></div>
                <div><small>Clics</small><strong>{nombre(stats?.clics ?? pub.statistiques.clics)}</strong></div>
                <div><small>Taux de clic</small><strong>{stats ? `${stats.taux_clic} %` : '—'}</strong></div>
              </div>
              <GraphiqueDiffusion serie={stats?.serie} />
            </>
          ) : (
            <p className="form-hint">Les statistiques s’afficheront dès que votre publicité sera diffusée.</p>
          )}
        </div>
        {pub.facture && (
          <div className="pub-bloc mt-4">
            <h2 className="h5 mb-3">Facture {pub.facture.numero}</h2>
            <FactureChargee cle={`facture-publicite:${pub.publicite_id}`} charger={() => obtenirFacturePublicite(pub.publicite_id)} />
          </div>
        )}
      </div>
    </div>
  );
}

function ListePublicites() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(() => {
    listerMesPublicites().then(setDonnees).catch((e) => setErreur(e.message));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  if (erreur) return <div className="alert alert-danger">{erreur}</div>;
  if (!donnees) return <p className="form-hint">Chargement…</p>;
  const { publicites, resume } = donnees;

  return (
    <>
      <div className="pub-kpis mb-4">
        <div><small>Publicités</small><strong>{resume.total}</strong></div>
        <div><small>En diffusion</small><strong>{resume.en_diffusion}</strong></div>
        <div><small>Affichages</small><strong>{nombre(resume.impressions)}</strong></div>
        <div><small>Clics</small><strong>{nombre(resume.clics)}</strong></div>
      </div>
      {resume.a_payer > 0 && (
        <div className="alert alert-info">
          {resume.a_payer} publicité(s) acceptée(s) en attente de paiement : réglez-les avant la date limite pour garder votre position.
        </div>
      )}
      {publicites.length === 0 ? (
        <div className="pub-bloc text-center">
          <p>Vous n’avez encore réservé aucun espace.</p>
          <Link to="/publicite/reserver" className="btn btn-primary">Réserver un espace</Link>
        </div>
      ) : (
        <div className="pub-liste">
          {publicites.map((p) => (
            <Link key={p.publicite_id} to={`/portail/annonceur/publicites/${p.publicite_id}`} className="pub-ligne">
              <img src={p.visuel_url} alt="" />
              <div className="pub-ligne-corps">
                <strong>{p.titre}</strong>
                <small>{p.emplacement_publicitaire?.libelle} · {libellePosition(p.rang)} · {formatJour(p.date_debut)} → {formatJour(veille(p.date_fin))}</small>
              </div>
              <div className="pub-ligne-stats">
                <small>{nombre(p.statistiques.impressions)} affichages · {nombre(p.statistiques.clics)} clics</small>
                <Statut statut={p.statut} enDiffusion={p.en_diffusion} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function PortailAnnonceur() {
  const { id } = useParams();
  return (
    <section className="pub-page">
      <div className="container-aps">
        <header className="pub-page-entete d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <span className="pub-surtitre"><i className="fa-solid fa-bullhorn" /> Espace annonceur</span>
            <h1>{id ? 'Ma publicité' : 'Mes publicités'}</h1>
            {id && <Link to="/portail/annonceur" className="form-hint"><i className="fa-solid fa-arrow-left" /> Toutes mes publicités</Link>}
          </div>
          {!id && <Link to="/publicite/reserver" className="btn btn-primary"><i className="fa-solid fa-plus" /> Réserver un espace</Link>}
        </header>
        {id ? <DetailPublicite id={id} /> : <ListePublicites />}
      </div>
    </section>
  );
}
