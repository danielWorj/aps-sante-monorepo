// pharmacie-avis.jsx — portail pharmacie, « Avis ».
//
// Avis publiés sur la pharmacie (après modération par ApSa) : note moyenne,
// répartition, liste. Lecture seule : l'agent ne peut ni supprimer ni
// modifier un avis ; un avis abusif se signale à ApSa.
import { useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Etoiles } from '../../avis/Etoiles';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { listerAvisGestion } from '../../../services/espacePresenceService';
import { EtatChargement } from './presenceCommun';
import { dateCourte, useRessource } from './presenceOutils';

export default function PharmacieAvis() {
  const { acteurId } = useOutletContext();
  const charger = useCallback(() => listerAvisGestion(acteurId), [acteurId]);
  const etat = useRessource(charger);
  const d = etat.donnees;

  return (
    <PresencePortailPage titre="Avis" description="Ce que les patients disent de votre pharmacie.">
      <EtatChargement {...etat}>
        {d && (
          <div className="row g-4">
            <div className="col-lg-4">
              <div className="info-card">
                <h3><i className="fa-solid fa-star" /> Note</h3>
                <div className="stat-value">{d.resume.moyenne === null ? '—' : d.resume.moyenne.toLocaleString('fr-FR')}<small className="text-faint"> / 5</small></div>
                <div className="text-faint small mb-3">{d.resume.nombre} avis publié{d.resume.nombre > 1 ? 's' : ''}</div>
                <div className="labo-resume-barres">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <div key={n} className="labo-barre">
                      <span>{n}</span>
                      <div className="quota-jauge flex-grow-1"><span style={{ width: `${(d.resume.distribution[n] / Math.max(1, d.resume.nombre)) * 100}%` }} /></div>
                      <span className="text-faint">{d.resume.distribution[n]}</span>
                    </div>
                  ))}
                </div>
                {d.en_attente > 0 && (
                  <p className="minimal-note mt-3 mb-0"><i className="fa-solid fa-hourglass-half" /> {d.en_attente} avis en cours de vérification par ApSa.</p>
                )}
              </div>
            </div>
            <div className="col-lg-8">
              <div className="info-card">
                <h3><i className="fa-solid fa-comments" /> Avis publiés</h3>
                {d.avis.length === 0 ? (
                  <div className="aps-empty-state"><i className="fa-regular fa-star"></i><div>Aucun avis publié pour l&apos;instant.</div></div>
                ) : d.avis.map((a) => (
                  <div key={a.avis_id} className="py-2 border-bottom">
                    <div className="d-flex justify-content-between align-items-center small">
                      <strong>{a.auteur}</strong>
                      <span className="text-faint">{dateCourte(a.date_creation)}</span>
                    </div>
                    <Etoiles valeur={a.note} taille="sm" />
                    {a.commentaire && <p className="small mb-0 mt-1" style={{ whiteSpace: 'pre-line' }}>{a.commentaire}</p>}
                  </div>
                ))}
                <p className="minimal-note mt-3 mb-0">
                  Chaque avis est vérifié par ApSa avant publication. Un avis abusif ou erroné ? <Link to="/contact">Signalez-le à ApSa</Link>.
                </p>
              </div>
            </div>
          </div>
        )}
      </EtatChargement>
    </PresencePortailPage>
  );
}
