// assurance-dashboard.jsx — portail assurance, « Tableau de bord ».
//
// Métriques de la fiche, toutes calculées par le serveur
// (GET /services-assurance/:id/tableau-de-bord) : demandes reçues (à
// traiter, période, taux et délai moyen de traitement, dernières reçues),
// consultations de la fiche publique, contenus et quotas de l'abonnement,
// complétude. Les courbes jour par jour exigent le droit
// « statistiques complètes » de l'abonnement.
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { AssurancePortailPage } from '../layouts/assurance.portail-sidebar';
import BarresQuotidiennes from './BarresQuotidiennes';
import { BandeauGrace } from '../../assurances/gestion/AbonnementAssurance';
import { dernierJour, formatDate } from '../../assurances/gestion/datesAbonnement';
import { STATUTS_DEMANDE, obtenirTableauDeBord } from '../../../services/portailAssuranceService';

const PERIODES = [7, 30, 90];
const nombre = (n) => (n ?? 0).toLocaleString('fr-FR');
const dateHeure = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function delaiLisible(heures) {
  if (heures === null || heures === undefined) return '—';
  if (heures < 1) return '< 1 h';
  if (heures < 48) return `${Math.round(heures)} h`;
  return `${Math.round(heures / 24)} j`;
}

const LIEN_COMPLETUDE = {
  description: '/portail/assurance-profil',
  logo: '/portail/assurance-profil',
  geolocalisation: '/portail/assurance-profil',
  activites: '/portail/assurance-profil#activites',
  agences: '/portail/assurance-profil#agences',
  photos: '/portail/assurance-medias',
};

function Tuile({ icone, couleur, valeur, libelle }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${couleur}`}><i className={`fa-solid ${icone}`}></i></div>
      <div>
        <div className="stat-value">{valeur}</div>
        <div className="stat-label">{libelle}</div>
      </div>
    </div>
  );
}

function LigneQuota({ libelle, utilise, max }) {
  const illimite = max === null || max === undefined;
  const pct = illimite || max === 0 ? null : Math.min(100, Math.round((utilise / max) * 100));
  return (
    <tr>
      <td>{libelle}</td>
      <td className="text-end">
        <strong>{nombre(utilise)}</strong>
        <span className="text-faint"> / {illimite ? 'illimité' : max === 0 ? 'non inclus' : max}</span>
        {pct !== null && (
          <div className="quota-jauge" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        )}
      </td>
    </tr>
  );
}

export default function AssuranceDashboard() {
  const { serviceId } = useOutletContext();
  const [jours, setJours] = useState(30);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(
    () =>
      obtenirTableauDeBord(serviceId, jours)
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err?.message || 'Tableau de bord indisponible.')),
    [serviceId, jours]
  );
  useEffect(() => { charger(); }, [charger]);

  const selecteur = (
    <div className="aps-tabs aps-tabs-compact" role="group" aria-label="Période">
      {PERIODES.map((p) => (
        <button key={p} type="button" className={jours === p ? 'active' : ''} aria-pressed={jours === p} onClick={() => setJours(p)}>
          {p} j
        </button>
      ))}
    </div>
  );

  return (
    <AssurancePortailPage
      titre="Tableau de bord"
      description="L'activité de votre fiche : demandes reçues, consultations et état de votre présence."
      actions={selecteur}
    >
      {erreur && (
        <div className="alert alert-danger d-flex align-items-center" role="alert">
          <i className="fa-solid fa-circle-exclamation me-2"></i>
          <div className="flex-grow-1">{erreur}</div>
          <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
        </div>
      )}
      {!erreur && !donnees && (
        <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>
      )}
      {donnees && <Contenu d={donnees} jours={jours} />}
    </AssurancePortailPage>
  );
}

function Contenu({ d, jours }) {
  const { fiche, abonnement, demandes, vues, contenus, completude } = d;
  const actif = abonnement.statut_abonnement === 'actif';

  return (
    <>
      {fiche.statut_verification !== 'publie' && (
        <div className="banner-institutionnel mb-3">
          <i className="fa-solid fa-hourglass-half" />
          <span>
            Votre fiche est en cours de vérification par ApSa : elle n&apos;est pas visible du public pour le moment.
          </span>
        </div>
      )}
      <BandeauGrace abonnement={abonnement} />
      {!actif && !abonnement.en_grace && (
        <div className="alert alert-info d-flex align-items-center gap-2 flex-wrap">
          <i className="fa-solid fa-circle-info"></i>
          <span className="flex-grow-1">
            Sans abonnement, votre fiche reste en présence minimale : ni contacts, ni activités, ni agences, ni
            formulaire de mise en relation.
          </span>
          <Link to="/portail/assurance-abonnement" className="btn btn-primary btn-sm-aps">Activer un abonnement</Link>
        </div>
      )}

      <div className="stat-row">
        <Tuile icone="fa-inbox" couleur="i-gold" valeur={nombre(demandes.a_traiter)} libelle="Demandes à traiter" />
        <Tuile icone="fa-envelope-open-text" couleur="i-primary" valeur={nombre(demandes.periode.total)} libelle={`Demandes reçues (${jours} j)`} />
        <Tuile icone="fa-eye" couleur="i-teal" valeur={nombre(vues.totaux.periode.vues)} libelle={`Vues de la fiche (${jours} j)`} />
        <Tuile
          icone="fa-stopwatch"
          couleur="i-violet"
          valeur={delaiLisible(demandes.delai_moyen_traitement_heures)}
          libelle={`Délai moyen de traitement${demandes.taux_traitement !== null ? ` · ${demandes.taux_traitement} % traitées` : ''}`}
        />
      </div>

      <div className="row g-4">
        <div className="col-xl-7 d-flex flex-column gap-4">
          <div className="info-card">
            <h3><i className="fa-solid fa-chart-column" /> Activité jour par jour</h3>
            {d.statistiques_detaillees && demandes.serie && vues.serie ? (
              <div className="d-flex flex-column gap-4">
                <BarresQuotidiennes titre="Demandes reçues" serie={demandes.serie} cle="demandes" unite="demande" />
                <BarresQuotidiennes titre="Vues de la fiche" serie={vues.serie} cle="vues" unite="vue" />
              </div>
            ) : (
              <p className="minimal-note mb-0">
                Les courbes jour par jour sont incluses dans les abonnements « statistiques complètes ». Vos totaux
                restent affichés ci-dessus.{' '}
                <Link to="/portail/assurance-abonnement">Voir les formules</Link>
              </p>
            )}
            <table className="hours-table mt-3" style={{ width: '100%', fontSize: '.88rem' }}>
              <thead><tr><th></th><th>Vues</th><th title="Visiteurs différents chaque jour, additionnés sur la période">Visiteurs / jour</th></tr></thead>
              <tbody>
                <tr><td>7 derniers jours</td><td><strong>{nombre(vues.totaux.sept_jours.vues)}</strong></td><td>{nombre(vues.totaux.sept_jours.visiteurs)}</td></tr>
                <tr><td>{jours} derniers jours</td><td><strong>{nombre(vues.totaux.periode.vues)}</strong></td><td>{nombre(vues.totaux.periode.visiteurs)}</td></tr>
                <tr><td>Depuis le début</td><td>{nombre(vues.totaux.depuis_le_debut.vues)}</td><td>{nombre(vues.totaux.depuis_le_debut.visiteurs)}</td></tr>
              </tbody>
            </table>
            <p className="minimal-note mt-2 mb-0">
              Vos propres consultations, celles d&apos;ApSa et des robots ne sont pas comptées.
            </p>
          </div>

          <div className="info-card">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="mb-0"><i className="fa-solid fa-inbox" /> Dernières demandes</h3>
              <Link to="/portail/assurance-demandes" className="small">Toutes les demandes <i className="fa-solid fa-arrow-right" /></Link>
            </div>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {Object.entries(STATUTS_DEMANDE).map(([cle, st]) => (
                <span key={cle} className={`chip ${st.chip}`}>
                  <i className={`fa-solid ${st.icone}`}></i> {st.label} : {nombre(demandes.par_statut[cle])}
                </span>
              ))}
            </div>
            {demandes.dernieres.length === 0 ? (
              <div className="aps-empty-state"><i className="fa-solid fa-inbox"></i><div>Aucune demande reçue pour l&apos;instant.</div></div>
            ) : (
              <ul className="list-unstyled mb-0">
                {demandes.dernieres.map((dm) => {
                  const st = STATUTS_DEMANDE[dm.statut];
                  return (
                    <li key={dm.mise_en_relation_id} className="py-2 border-bottom d-flex gap-2 align-items-start">
                      <span className={`chip ${st.chip} flex-none`}>{st.label}</span>
                      <div className="flex-grow-1 min-w-0">
                        <div className="small"><strong>{dm.demandeur || 'Utilisateur'}</strong> <span className="text-faint">· {dateHeure(dm.date_creation)}</span></div>
                        <div className="small text-faint text-truncate">{dm.extrait}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="col-xl-5 d-flex flex-column gap-4">
          <div className="info-card">
            <h3><i className="fa-solid fa-id-card" /> Abonnement</h3>
            {actif ? (
              <p className="mb-2">
                <strong>{abonnement.niveau?.libelle}</strong> — valable jusqu&apos;au{' '}
                {formatDate(dernierJour(abonnement.date_fin))} inclus ({abonnement.jours_restants} j restants).
              </p>
            ) : (
              <p className="mb-2">{abonnement.en_grace ? 'Expiré (période de grâce).' : 'Aucun abonnement actif.'}</p>
            )}
            <Link to="/portail/assurance-abonnement" className="btn btn-outline-primary btn-sm-aps">
              {actif ? 'Gérer mon abonnement' : 'Activer un abonnement'}
            </Link>
          </div>

          <div className="info-card">
            <h3><i className="fa-solid fa-layer-group" /> Contenus de la fiche</h3>
            <table className="hours-table" style={{ width: '100%', fontSize: '.88rem' }}>
              <tbody>
                <tr><td>Activités / produits</td><td className="text-end"><strong>{nombre(contenus.activites)}</strong> <span className="text-faint">({nombre(contenus.options)} options)</span></td></tr>
                <LigneQuota libelle="Agences" {...contenus.agences} />
                <LigneQuota libelle="Photos" {...contenus.photos} />
                <LigneQuota libelle="Vidéos" {...contenus.videos} />
              </tbody>
            </table>
          </div>

          <div className="info-card">
            <h3><i className="fa-solid fa-list-check" /> Complétude de la fiche</h3>
            <div className="d-flex align-items-center gap-3 mb-2">
              <div className="stat-value">{completude.score} %</div>
              <div className="quota-jauge flex-grow-1" role="progressbar" aria-valuenow={completude.score} aria-valuemin={0} aria-valuemax={100} aria-label="Complétude">
                <span style={{ width: `${completude.score}%` }} />
              </div>
            </div>
            <ul className="list-unstyled mb-0 small">
              {completude.elements.map((e) => (
                <li key={e.cle} className="py-1">
                  <i className={`fa-solid ${e.ok ? 'fa-circle-check text-success' : 'fa-circle text-faint'} me-2`}></i>
                  {e.ok ? e.libelle : <Link to={LIEN_COMPLETUDE[e.cle]}>{e.libelle}</Link>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
