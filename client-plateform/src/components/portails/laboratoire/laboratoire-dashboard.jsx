// laboratoire-dashboard.jsx — portail laboratoire, « Tableau de bord ».
//
// Métriques calculées par le serveur (GET /laboratoires/:id/tableau-de-bord) :
// vues de la fiche publique, engagements des visiteurs (appels, e-mails,
// itinéraires, partages, consultations des examens et des avis), taux
// d'engagement, avis (note, répartition, en attente, derniers), contenus et
// complétude de la fiche. Courbes jour par jour sur 7, 30 ou 90 jours.
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { LaboratoirePortailPage } from '../layouts/laboratoire.portail-sidebar';
import BarresQuotidiennes from '../assurance/BarresQuotidiennes';
import { Etoiles } from '../../avis/Etoiles';
import { obtenirTableauDeBord } from '../../../services/laboratoireService';

const PERIODES = [7, 30, 90];
const nombre = (n) => (n ?? 0).toLocaleString('fr-FR');
const dateCourte = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

const LIEN_COMPLETUDE = {
  description: '/portail/laboratoire-profil',
  logo: '/portail/laboratoire-profil',
  geolocalisation: '/portail/laboratoire-profil',
  examens: '/portail/laboratoire-examens',
  centres: '/portail/laboratoire-centres',
  photos: '/portail/laboratoire-medias',
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

export default function LaboratoireDashboard() {
  const { laboratoireId } = useOutletContext();
  const [jours, setJours] = useState(30);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(
    () => obtenirTableauDeBord(laboratoireId, jours)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err?.message || 'Tableau de bord indisponible.')),
    [laboratoireId, jours]
  );
  useEffect(() => { charger(); }, [charger]);

  const selecteur = (
    <div className="aps-tabs aps-tabs-compact" role="group" aria-label="Période">
      {PERIODES.map((p) => (
        <button key={p} type="button" className={jours === p ? 'active' : ''} aria-pressed={jours === p} onClick={() => setJours(p)}>{p} j</button>
      ))}
    </div>
  );

  return (
    <LaboratoirePortailPage
      titre="Tableau de bord"
      description="L'audience de votre fiche : consultations, actions des visiteurs et avis."
      actions={selecteur}
    >
      {erreur && (
        <div className="alert alert-danger d-flex align-items-center" role="alert">
          <i className="fa-solid fa-circle-exclamation me-2"></i>
          <div className="flex-grow-1">{erreur}</div>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
        </div>
      )}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && <Contenu d={donnees} />}
    </LaboratoirePortailPage>
  );
}

function Contenu({ d }) {
  const { fiche, vues, engagements, avis, contenus, completude, jours } = d;
  return (
    <>
      {fiche.statut_verification !== 'publie' && (
        <div className="banner-institutionnel mb-3">
          <i className="fa-solid fa-hourglass-half" />
          <span>Votre fiche est en cours de vérification par ApSa : elle n&apos;est pas encore visible du public.</span>
        </div>
      )}

      <div className="stat-row">
        <Tuile icone="fa-eye" couleur="i-teal" valeur={nombre(vues.totaux.periode.vues)} libelle={`Vues de la fiche (${jours} j)`} />
        <Tuile icone="fa-hand-pointer" couleur="i-primary" valeur={nombre(engagements.total_periode)} libelle={`Engagements (${jours} j)`} />
        <Tuile
          icone="fa-percent"
          couleur="i-violet"
          valeur={d.taux_engagement === null ? '—' : `${d.taux_engagement.toLocaleString('fr-FR')} %`}
          libelle="Taux d'engagement"
        />
        <Tuile
          icone="fa-star"
          couleur="i-gold"
          valeur={avis.moyenne === null ? '—' : avis.moyenne.toLocaleString('fr-FR')}
          libelle={`Note moyenne · ${nombre(avis.nombre)} avis`}
        />
      </div>

      <div className="row g-4">
        <div className="col-xl-7 d-flex flex-column gap-4">
          <div className="info-card">
            <h3><i className="fa-solid fa-chart-column" /> Activité jour par jour</h3>
            <div className="d-flex flex-column gap-4">
              {vues.serie && <BarresQuotidiennes titre="Vues de la fiche" serie={vues.serie} cle="vues" unite="vue" />}
              <BarresQuotidiennes titre="Engagements des visiteurs" serie={engagements.serie} cle="engagements" unite="engagement" />
            </div>
            <table className="hours-table mt-3" style={{ width: '100%', fontSize: '.88rem' }}>
              <thead><tr><th></th><th>Vues</th><th title="Visiteurs différents chaque jour, additionnés sur la période">Visiteurs / jour</th></tr></thead>
              <tbody>
                <tr><td>7 derniers jours</td><td><strong>{nombre(vues.totaux.sept_jours.vues)}</strong></td><td>{nombre(vues.totaux.sept_jours.visiteurs)}</td></tr>
                <tr><td>{jours} derniers jours</td><td><strong>{nombre(vues.totaux.periode.vues)}</strong></td><td>{nombre(vues.totaux.periode.visiteurs)}</td></tr>
                <tr><td>Depuis le début</td><td>{nombre(vues.totaux.depuis_le_debut.vues)}</td><td>{nombre(vues.totaux.depuis_le_debut.visiteurs)}</td></tr>
              </tbody>
            </table>
            <p className="minimal-note mt-2 mb-0">Vos propres consultations, celles d&apos;ApSa et des robots ne sont pas comptées.</p>
          </div>

          <div className="info-card">
            <h3><i className="fa-solid fa-hand-pointer" /> Engagements par type ({jours} j)</h3>
            <div className="labo-engagements">
              {Object.entries(engagements.par_type).map(([cle, t]) => (
                <div key={cle} className="labo-engagement">
                  <div className="labo-engagement-valeur">{nombre(t.periode)}</div>
                  <div className="labo-engagement-libelle">{t.libelle}</div>
                  <div className="text-faint" style={{ fontSize: '.72rem' }}>{nombre(t.sept_jours)} sur 7 j</div>
                </div>
              ))}
            </div>
            <p className="minimal-note mt-2 mb-0">
              Un visiteur compte au plus une fois par jour et par type d&apos;action. Total depuis le début : {nombre(engagements.depuis_le_debut)}.
            </p>
          </div>
        </div>

        <div className="col-xl-5 d-flex flex-column gap-4">
          <div className="info-card">
            <h3><i className="fa-solid fa-star-half-stroke" /> Avis</h3>
            {avis.en_attente > 0 && (
              <p className="minimal-note">
                <i className="fa-solid fa-hourglass-half" /> {avis.en_attente} avis en cours de vérification par ApSa.
              </p>
            )}
            {avis.nombre === 0 ? (
              <div className="aps-empty-state"><i className="fa-regular fa-star"></i><div>Aucun avis publié pour l&apos;instant.</div></div>
            ) : (
              <>
                <div className="labo-resume-barres mb-3">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <div key={n} className="labo-barre">
                      <span>{n}</span>
                      <div className="quota-jauge flex-grow-1"><span style={{ width: `${(avis.distribution[n] / Math.max(1, avis.nombre)) * 100}%` }} /></div>
                      <span className="text-faint">{avis.distribution[n]}</span>
                    </div>
                  ))}
                </div>
                <ul className="list-unstyled mb-0">
                  {avis.derniers.map((a) => (
                    <li key={a.avis_id} className="py-2 border-bottom">
                      <div className="d-flex justify-content-between align-items-center small">
                        <strong>{a.auteur}</strong>
                        <span className="text-faint">{dateCourte(a.date_creation)}</span>
                      </div>
                      <Etoiles valeur={a.note} taille="sm" />
                      {a.commentaire && <div className="small text-faint text-truncate">{a.commentaire}</div>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="info-card">
            <h3><i className="fa-solid fa-layer-group" /> Contenus de la fiche</h3>
            <table className="hours-table" style={{ width: '100%', fontSize: '.88rem' }}>
              <tbody>
                <tr>
                  <td><Link to="/portail/laboratoire-examens">Examens</Link></td>
                  <td className="text-end"><strong>{nombre(contenus.examens)}</strong>
                    {contenus.examens_indisponibles > 0 && <span className="text-faint"> ({contenus.examens_indisponibles} indisponibles)</span>}
                  </td>
                </tr>
                <tr><td><Link to="/portail/laboratoire-centres">Centres de prélèvement</Link></td><td className="text-end"><strong>{nombre(contenus.centres)}</strong></td></tr>
                <tr><td><Link to="/portail/laboratoire-medias">Photos</Link></td><td className="text-end"><strong>{contenus.photos.utilise}</strong><span className="text-faint"> / {contenus.photos.max}</span></td></tr>
                <tr><td><Link to="/portail/laboratoire-medias">Vidéos</Link></td><td className="text-end"><strong>{contenus.videos.utilise}</strong><span className="text-faint"> / {contenus.videos.max}</span></td></tr>
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
