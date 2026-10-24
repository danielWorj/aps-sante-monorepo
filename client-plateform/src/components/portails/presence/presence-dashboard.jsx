// presence-dashboard.jsx — portails pharmacie et centre de santé, « Tableau de bord ».
//
// Données calculées par le serveur (GET /:type/:id/tableau-de-bord) : état de
// la fiche et de l'abonnement, ouverture en ce moment, consultations de la
// fiche (selon l'abonnement), messages reçus, contenus publiés, complétude ;
// pour une pharmacie, garde en cours / prochaines gardes et avis.
import { useCallback, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import BarresQuotidiennes from '../assurance/BarresQuotidiennes';
import { Etoiles } from '../../avis/Etoiles';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { ESPACES_PRESENCE, libelleOuverture, obtenirTableauDeBordPresence } from '../../../services/espacePresenceService';
import { BandeauFicheHorsLigne, EtatChargement } from './presenceCommun';
import { dateCourte, dateHeure, useRessource } from './presenceOutils';

const PERIODES = [7, 30, 90];
const nombre = (n) => (n ?? 0).toLocaleString('fr-FR');

const LIBELLE_ABONNEMENT = {
  actif: 'Abonnement actif',
  gratuite: 'Offre de lancement',
  grace: 'Abonnement échu (période de grâce)',
  aucun: 'Présence minimale (sans abonnement)',
  non_requis: 'Sans abonnement',
};

function Tuile({ icone, couleur, valeur, libelle, lien }) {
  const contenu = (
    <div className="stat-card h-100">
      <div className={`stat-icon ${couleur}`}><i className={`fa-solid ${icone}`}></i></div>
      <div>
        <div className="stat-value">{valeur}</div>
        <div className="stat-label">{libelle}</div>
      </div>
    </div>
  );
  return lien ? <Link to={lien} className="text-reset text-decoration-none">{contenu}</Link> : contenu;
}

export default function PresenceDashboard() {
  const { type, acteurId } = useOutletContext();
  const [jours, setJours] = useState(30);
  const charger = useCallback(() => obtenirTableauDeBordPresence(type, acteurId, jours), [type, acteurId, jours]);
  const etat = useRessource(charger);

  const selecteur = (
    <div className="aps-tabs aps-tabs-compact" role="group" aria-label="Période">
      {PERIODES.map((p) => (
        <button key={p} type="button" className={jours === p ? 'active' : ''} aria-pressed={jours === p} onClick={() => setJours(p)}>{p} j</button>
      ))}
    </div>
  );

  return (
    <PresencePortailPage
      titre="Tableau de bord"
      description="L'essentiel de votre fiche : visibilité, messages, abonnement et ce qu'il reste à compléter."
      actions={selecteur}
    >
      <EtatChargement {...etat}>
        {etat.donnees && <Contenu d={etat.donnees} type={type} />}
      </EtatChargement>
    </PresencePortailPage>
  );
}

function Contenu({ d, type }) {
  const p = ESPACES_PRESENCE[type].portail;
  const { abonnement, vues, messages, contenus, completude, jours } = d;
  const ouverture = libelleOuverture(d.ouverture);

  return (
    <>
      <BandeauFicheHorsLigne fiche={d.fiche} />
      {abonnement.en_grace && (
        <div className="banner-institutionnel mt-2">
          <i className="fa-solid fa-triangle-exclamation" />
          <span>Votre abonnement a expiré : vos contenus enrichis sont masqués au public. <Link to={`${p}-abonnement`}>Renouveler</Link></span>
        </div>
      )}

      <div className="stat-row mt-3">
        <Tuile
          icone="fa-clock"
          couleur={d.ouverture?.ouvert ? 'i-teal' : 'i-violet'}
          valeur={d.ouverture ? (d.ouverture.ouvert ? 'Ouvert' : 'Fermé') : '—'}
          libelle={ouverture ?? 'Horaires non renseignés'}
          lien={`${p}-horaires`}
        />
        <Tuile
          icone="fa-envelope"
          couleur="i-primary"
          valeur={nombre(messages.non_lus)}
          libelle={`Message${messages.non_lus > 1 ? 's' : ''} non lu${messages.non_lus > 1 ? 's' : ''}`}
          lien={`${p}-messages`}
        />
        <Tuile
          icone="fa-eye"
          couleur="i-teal"
          valeur={vues.disponible ? nombre(vues.totaux.periode.vues) : '—'}
          libelle={vues.disponible ? `Vues de la fiche (${jours} j)` : 'Statistiques non incluses'}
          lien={vues.disponible ? undefined : `${p}-abonnement`}
        />
        {type === 'pharmacie' ? (
          <Tuile
            icone="fa-star"
            couleur="i-gold"
            valeur={d.avis.moyenne === null ? '—' : d.avis.moyenne.toLocaleString('fr-FR')}
            libelle={`Note moyenne · ${nombre(d.avis.nombre)} avis`}
            lien="/portail/pharmacie-avis"
          />
        ) : (
          <Tuile
            icone="fa-file-waveform"
            couleur="i-gold"
            valeur={nombre(contenus.prestations)}
            libelle="Prestations renseignées"
            lien="/portail/structure-prestations"
          />
        )}
      </div>

      <div className="row g-4">
        <div className="col-xl-7 d-flex flex-column gap-4">
          {type === 'pharmacie' && <CarteGardes gardes={d.gardes} />}

          <div className="info-card">
            <h3><i className="fa-solid fa-envelope" /> Derniers messages</h3>
            {messages.derniers.length === 0 ? (
              <div className="aps-empty-state"><i className="fa-regular fa-envelope"></i><div>Aucun message reçu.</div></div>
            ) : (
              <ul className="list-unstyled mb-2">
                {messages.derniers.map((m) => (
                  <li key={m.message_id} className="py-2 border-bottom">
                    <div className="d-flex justify-content-between align-items-center small">
                      <strong>{m.nom || m.email}{m.statut === 'non_lu' && <span className="chip chip-st-attente ms-2">Nouveau</span>}</strong>
                      <span className="text-faint">{dateHeure(m.date_creation)}</span>
                    </div>
                    <div className="small text-faint text-truncate">{m.contenu}</div>
                  </li>
                ))}
              </ul>
            )}
            <p className="minimal-note mb-0">
              {nombre(messages.recus_30_jours)} message(s) reçu(s) ces 30 derniers jours. <Link to={`${p}-messages`}>Tous les messages</Link>
            </p>
            {!d.droits.contact_direct && (
              <p className="minimal-note mt-2 mb-0">
                <i className="fa-solid fa-eye-slash" /> Le formulaire de contact de votre fiche est fermé : votre abonnement n&apos;inclut pas le contact direct.
              </p>
            )}
          </div>

          <div className="info-card">
            <h3><i className="fa-solid fa-chart-column" /> Consultations de la fiche</h3>
            {!vues.disponible ? (
              <p className="minimal-note mb-0">
                Les statistiques de consultation sont incluses avec un abonnement de présence. Les consultations de votre fiche
                sont déjà comptées : elles s&apos;afficheront ici dès la souscription. <Link to={`${p}-abonnement`}>Voir les abonnements</Link>
              </p>
            ) : (
              <>
                {vues.serie && <BarresQuotidiennes titre="Vues de la fiche" serie={vues.serie} cle="vues" unite="vue" />}
                <table className="hours-table mt-3" style={{ width: '100%', fontSize: '.88rem' }}>
                  <thead><tr><th></th><th>Vues</th><th title="Visiteurs différents chaque jour, additionnés sur la période">Visiteurs / jour</th></tr></thead>
                  <tbody>
                    <tr><td>7 derniers jours</td><td><strong>{nombre(vues.totaux.sept_jours.vues)}</strong></td><td>{nombre(vues.totaux.sept_jours.visiteurs)}</td></tr>
                    <tr><td>{jours} derniers jours</td><td><strong>{nombre(vues.totaux.periode.vues)}</strong></td><td>{nombre(vues.totaux.periode.visiteurs)}</td></tr>
                    <tr><td>Depuis le début</td><td>{nombre(vues.totaux.depuis_le_debut.vues)}</td><td>{nombre(vues.totaux.depuis_le_debut.visiteurs)}</td></tr>
                  </tbody>
                </table>
                {!vues.detaillees && <p className="minimal-note mt-2 mb-0">Le détail jour par jour est inclus avec les statistiques détaillées.</p>}
                <p className="minimal-note mt-2 mb-0">Vos propres consultations, celles d&apos;ApSa et des robots ne sont pas comptées.</p>
              </>
            )}
          </div>
        </div>

        <div className="col-xl-5 d-flex flex-column gap-4">
          <div className="info-card">
            <h3><i className="fa-solid fa-crown" /> Abonnement</h3>
            <p className="mb-1"><strong>{LIBELLE_ABONNEMENT[abonnement.statut_abonnement] ?? abonnement.statut_abonnement}</strong></p>
            {abonnement.statut_abonnement === 'actif' && abonnement.jours_restants !== null && (
              <p className="minimal-note mb-1">
                {abonnement.jours_restants > 0 ? `Encore ${abonnement.jours_restants} jour(s).` : "Se termine aujourd'hui."}
              </p>
            )}
            {abonnement.statut_abonnement === 'gratuite' && abonnement.date_fin && (
              <p className="minimal-note mb-1">Offerte jusqu&apos;au {dateCourte(abonnement.date_fin)} (veille incluse).</p>
            )}
            <Link to={`${p}-abonnement`} className="btn btn-outline-primary btn-sm-aps mt-2">Gérer mon abonnement</Link>
          </div>

          {type === 'pharmacie' && <CarteAvis avis={d.avis} />}

          <div className="info-card">
            <h3><i className="fa-solid fa-layer-group" /> Contenus de la fiche</h3>
            <table className="hours-table" style={{ width: '100%', fontSize: '.88rem' }}>
              <tbody>
                <tr>
                  <td><Link to={`${p}-photos`}>Photos</Link></td>
                  <td className="text-end"><strong>{nombre(contenus.photos.total)}</strong>
                    <span className="text-faint"> ({nombre(contenus.photos.visibles)} visible{contenus.photos.visibles > 1 ? 's' : ''} du public)</span>
                  </td>
                </tr>
                <tr>
                  <td><Link to={`${p}-actualites`}>Actualités</Link></td>
                  <td className="text-end"><strong>{nombre(contenus.actualites.total)}</strong>
                    <span className="text-faint"> ({nombre(contenus.actualites.en_ligne)} en ligne)</span>
                  </td>
                </tr>
                {type === 'structure' && (
                  <tr><td><Link to="/portail/structure-prestations">Prestations</Link></td><td className="text-end"><strong>{nombre(contenus.prestations)}</strong></td></tr>
                )}
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
                  {e.ok ? e.libelle : <Link to={`${p}-${e.rubrique}`}>{e.libelle}</Link>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

const plageGarde = (g) =>
  `${new Date(g.date_debut).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} → ${new Date(g.date_fin).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;

function CarteGardes({ gardes }) {
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-moon" /> Gardes</h3>
      {gardes.en_cours ? (
        <div className="banner-institutionnel mb-2">
          <i className="fa-solid fa-circle-dot" />
          <span><strong>Vous êtes de garde</strong> jusqu&apos;au {new Date(gardes.en_cours.date_fin).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}.</span>
        </div>
      ) : null}
      {gardes.prochaines.length === 0 ? (
        <p className="minimal-note mb-2">Aucune garde à venir dans les plannings publiés.</p>
      ) : (
        <ul className="list-unstyled mb-2 small">
          {gardes.prochaines.map((g) => (
            <li key={g.garde_id} className="py-1"><i className="fa-regular fa-calendar me-2" />{plageGarde(g)}{g.ville?.nom ? ` · ${g.ville.nom}` : ''}</li>
          ))}
        </ul>
      )}
      <p className="minimal-note mb-0">Les gardes sont fixées par l&apos;autorité de votre pays et publiées par ApSa. <Link to="/portail/pharmacie-gardes">Calendrier complet</Link></p>
    </div>
  );
}

function CarteAvis({ avis }) {
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-star-half-stroke" /> Avis</h3>
      {avis.en_attente > 0 && <p className="minimal-note"><i className="fa-solid fa-hourglass-half" /> {avis.en_attente} avis en cours de vérification par ApSa.</p>}
      {avis.nombre === 0 ? (
        <div className="aps-empty-state"><i className="fa-regular fa-star"></i><div>Aucun avis publié pour l&apos;instant.</div></div>
      ) : (
        <ul className="list-unstyled mb-2">
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
      )}
      <Link to="/portail/pharmacie-avis" className="small">Tous les avis</Link>
    </div>
  );
}
