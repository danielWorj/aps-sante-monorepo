// medecin-tableau-de-bord.jsx — portail médecin, « Tableau de bord ».
//
// Toutes les métriques sont calculées par le serveur
// (GET /medecins/mon-espace/tableau-de-bord?du&au&granularite) et comparées
// à la période précédente de même durée :
//   - audience (vues, visiteurs, engagements) : selon les droits
//     « statistiques » de l'abonnement de présence — totaux, puis courbes et
//     détail des engagements avec « statistiques détaillées » ;
//   - activité (RDV, consultations, nouveaux patients, créneaux demandés) et
//     réputation (notes) : toujours visibles.
// Les filtres (période, découpage) s'appliquent à toute la page ; pendant
// un rechargement, l'affichage précédent reste en place, atténué.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortailSidebar from '../layouts/portail-sidebar';
import CourbeTemporelle from './graphiques/CourbeTemporelle';
import { CarteCreneaux, Entonnoir, Sparkline, Variation } from './graphiques/Petits';
import { plageLisible } from './graphiques/periodes';
import { Etoiles } from '../../avis/Etoiles';
import { TYPES_ENGAGEMENT, obtenirTableauDeBordMedecin } from '../../../services/reputationMedecinService';

const isoJour = (d) => d.toISOString().slice(0, 10);
const decaler = (d, jours) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + jours); return r; };
const aujourdhui = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

const PRESETS = [
  { cle: '7j', libelle: '7 jours', bornes: (a) => ({ du: decaler(a, -6), au: a }), granularite: 'jour' },
  { cle: '30j', libelle: '30 jours', bornes: (a) => ({ du: decaler(a, -29), au: a }), granularite: 'jour' },
  { cle: '90j', libelle: '3 mois', bornes: (a) => ({ du: decaler(a, -89), au: a }), granularite: 'semaine' },
  {
    cle: '12m',
    libelle: '12 mois',
    bornes: (a) => ({ du: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 11, 1)), au: a }),
    granularite: 'mois',
  },
  { cle: 'perso', libelle: 'Personnalisé' },
];
const GRANULARITES = [
  { cle: 'jour', libelle: 'Jour' },
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
];

const nombre = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('fr-FR'));
const pct = (n) => (n === null || n === undefined ? '—' : `${n.toLocaleString('fr-FR')} %`);
const note1 = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export default function MedecinTableauDeBord() {
  const [preset, setPreset] = useState('30j');
  const [granularite, setGranularite] = useState('jour');
  const [perso, setPerso] = useState(() => ({ du: isoJour(decaler(aujourdhui(), -29)), au: isoJour(aujourdhui()) }));
  const [donnees, setDonnees] = useState(null);
  const [cleChargee, setCleChargee] = useState(null);
  const [erreur, setErreur] = useState(null);

  const bornes = useMemo(() => {
    if (preset === 'perso') return perso;
    const b = PRESETS.find((p) => p.cle === preset).bornes(aujourdhui());
    return { du: isoJour(b.du), au: isoJour(b.au) };
  }, [preset, perso]);

  const joursPeriode = Math.round((new Date(bornes.au) - new Date(bornes.du)) / 86_400_000) + 1;
  const jourAutorise = joursPeriode <= 120;

  // « En chargement » = la réponse affichée n'est pas celle des filtres
  // courants (pas de setState synchrone dans l'effet).
  const cle = `${bornes.du}|${bornes.au}|${granularite}`;
  const chargement = cleChargee !== cle;
  const charger = useCallback(
    () =>
      obtenirTableauDeBordMedecin({ ...bornes, granularite })
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err?.status === 404 ? "Aucune fiche médecin n'est associée à ce compte." : err?.message || 'Tableau de bord indisponible.'))
        .finally(() => setCleChargee(`${bornes.du}|${bornes.au}|${granularite}`)),
    [bornes, granularite]
  );
  useEffect(() => { charger(); }, [charger]);

  const choisirPreset = (p) => {
    setPreset(p.cle);
    if (p.granularite) setGranularite(p.granularite);
  };

  const majPerso = (champ, valeur) => {
    const suivant = { ...perso, [champ]: valeur };
    if (!suivant.du || !suivant.au || suivant.du > suivant.au) return setPerso(suivant);
    const jours = Math.round((new Date(suivant.au) - new Date(suivant.du)) / 86_400_000) + 1;
    if (jours > 120 && granularite === 'jour') setGranularite(jours > 365 ? 'mois' : 'semaine');
    setPerso(suivant);
  };

  const persoValide = preset !== 'perso' || (perso.du && perso.au && perso.du <= perso.au);

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main tdb">
          <header className="portail-head">
            <div>
              <span className="eyebrow">Espace médecin</span>
              <h1>Tableau de bord</h1>
              <p>
                {donnees
                  ? <>Activité {plageLisible(donnees.periode.du, donnees.periode.au)}, comparée aux {donnees.periode.jours} jours précédents.</>
                  : 'Audience de votre fiche, rendez-vous et réputation.'}
              </p>
            </div>
            <Link to="/portail/medecin-avis" className="btn btn-outline-primary btn-sm-aps">
              <i className="fa-solid fa-star" /> Avis &amp; notes
            </Link>
          </header>

          <div className="tdb-filtres" role="toolbar" aria-label="Filtres du tableau de bord">
            <div className="tdb-segment" role="group" aria-label="Période">
              {PRESETS.map((p) => (
                <button key={p.cle} type="button" className={preset === p.cle ? 'is-actif' : ''} aria-pressed={preset === p.cle} onClick={() => choisirPreset(p)}>
                  {p.libelle}
                </button>
              ))}
            </div>
            <div className="tdb-segment" role="group" aria-label="Découpage">
              {GRANULARITES.map((g) => {
                const interdit = g.cle === 'jour' && !jourAutorise;
                return (
                  <button
                    key={g.cle}
                    type="button"
                    className={granularite === g.cle ? 'is-actif' : ''}
                    aria-pressed={granularite === g.cle}
                    disabled={interdit}
                    title={interdit ? 'Vue par jour limitée à 120 jours' : undefined}
                    onClick={() => setGranularite(g.cle)}
                  >
                    {g.libelle}
                  </button>
                );
              })}
            </div>
            {preset === 'perso' && (
              <div className="tdb-dates">
                <label>
                  <span>Du</span>
                  <input type="date" className="form-control form-control-sm" value={perso.du} max={perso.au || isoJour(aujourdhui())} onChange={(e) => majPerso('du', e.target.value)} />
                </label>
                <label>
                  <span>Au</span>
                  <input type="date" className="form-control form-control-sm" value={perso.au} min={perso.du} max={isoJour(aujourdhui())} onChange={(e) => majPerso('au', e.target.value)} />
                </label>
              </div>
            )}
          </div>

          {!persoValide && (
            <div className="alert alert-warning py-2"><i className="fa-solid fa-calendar-xmark me-2" />Choisissez une date de début antérieure à la date de fin.</div>
          )}

          {erreur && (
            <div className="alert alert-danger d-flex align-items-center" role="alert">
              <i className="fa-solid fa-circle-exclamation me-2" />
              <div className="flex-grow-1">{erreur}</div>
              <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
            </div>
          )}

          {!donnees && !erreur && (
            <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>
          )}

          {donnees && (
            <div className={`tdb-contenu ${chargement ? 'is-chargement' : ''}`} aria-busy={chargement}>
              <Contenu d={donnees} />
            </div>
          )}
        </main>
        <PortailSidebar />
      </div>
    </div>
  );
}

function TuileKpi({ icone, teinte, libelle, valeur, variation, serie, inverse, verrou }) {
  return (
    <div className={`tdb-kpi ${verrou ? 'is-verrouille' : ''}`}>
      <div className="tdb-kpi-haut">
        <span className={`stat-icon ${teinte}`}><i className={`fa-solid ${icone}`} /></span>
        <span className="tdb-kpi-libelle">{libelle}</span>
      </div>
      {verrou ? (
        <div className="tdb-kpi-verrou"><i className="fa-solid fa-lock" /> Inclus dans les formules avec statistiques</div>
      ) : (
        <>
          <div className="tdb-kpi-valeur">{valeur}</div>
          <div className="tdb-kpi-bas">
            <Variation valeur={variation} inverse={inverse} suffixe="" />
            {serie && <Sparkline valeurs={serie} libelle={`Tendance : ${libelle}`} />}
          </div>
        </>
      )}
    </div>
  );
}

function Contenu({ d }) {
  const { audience, activite, reputation, periode } = d;
  const detaillees = audience.disponible && audience.detaillees;

  const metriques = useMemo(() => {
    const liste = [];
    if (detaillees) {
      liste.push({ cle: 'vues', libelle: 'Vues de la fiche', unite: 'vue', forme: 'aire', serie: audience.serie, champ: 'vues' });
      liste.push({ cle: 'visiteurs', libelle: 'Visiteurs', unite: 'visiteur', forme: 'aire', serie: audience.serie, champ: 'visiteurs' });
    }
    liste.push({ cle: 'rdv', libelle: 'RDV demandés', unite: 'rendez-vous', forme: 'colonnes', serie: activite.serie, champ: 'rdv_demandes', invariable: true });
    liste.push({ cle: 'consultations', libelle: 'Consultations', unite: 'consultation', forme: 'colonnes', serie: activite.serie, champ: 'consultations' });
    liste.push({ cle: 'patients', libelle: 'Nouveaux patients', unite: 'patient', forme: 'colonnes', serie: activite.serie, champ: 'nouveaux_patients' });
    liste.push({
      cle: 'note', libelle: 'Note moyenne', unite: '', forme: 'aire', serie: reputation.serie, champ: 'note_moyenne',
      format: (n) => `${note1(n)} / 5`,
    });
    if (detaillees) {
      liste.push({ cle: 'engagements', libelle: 'Engagements', unite: 'engagement', forme: 'colonnes', serie: audience.serie, champ: 'engagements' });
    }
    return liste;
  }, [detaillees, audience.serie, activite.serie, reputation.serie]);

  const [metrique, setMetrique] = useState(metriques[0].cle);
  const m = metriques.find((x) => x.cle === metrique) ?? metriques[0];
  const serieGraphe = m.serie.map((p) => ({ cle: p.cle, debut: p.debut, fin: p.fin, valeur: p[m.champ] }));
  const format = m.format ?? (m.invariable ? (n) => `${n.toLocaleString('fr-FR')} rendez-vous` : undefined);

  const resume = reputation.resume;
  const maxDistribution = Math.max(1, ...Object.values(resume.distribution));

  return (
    <>
      {d.fiche.statut_verification !== 'publie' && (
        <div className="banner-institutionnel mb-3">
          <i className="fa-solid fa-hourglass-half" />
          <span>Votre fiche n&apos;est pas encore publiée : elle n&apos;est pas visible des patients, l&apos;audience reste donc à zéro.</span>
        </div>
      )}

      {/* KPI */}
      <div className="tdb-kpis">
        <TuileKpi
          icone="fa-eye" teinte="i-teal" libelle="Vues de la fiche"
          verrou={!audience.disponible}
          valeur={nombre(audience.totaux?.vues)}
          variation={audience.variations?.vues}
          serie={detaillees ? audience.serie.map((p) => p.vues) : null}
        />
        <TuileKpi
          icone="fa-calendar-plus" teinte="i-primary" libelle="RDV demandés"
          valeur={nombre(activite.totaux.rdv_demandes)}
          variation={activite.variations.rdv_demandes}
          serie={activite.serie.map((p) => p.rdv_demandes)}
        />
        <TuileKpi
          icone="fa-stethoscope" teinte="i-violet" libelle="Consultations réalisées"
          valeur={nombre(activite.totaux.consultations)}
          variation={activite.variations.consultations}
          serie={activite.serie.map((p) => p.consultations)}
        />
        <TuileKpi
          icone="fa-user-plus" teinte="i-gold" libelle="Nouveaux patients"
          valeur={nombre(activite.totaux.nouveaux_patients)}
          variation={activite.variations.nouveaux_patients}
          serie={activite.serie.map((p) => p.nouveaux_patients)}
        />
      </div>

      <div className="tdb-grille">
        {/* Évolution */}
        <section className="info-card tdb-evolution">
          <div className="tdb-carte-entete">
            <h3><i className="fa-solid fa-chart-line" /> Évolution</h3>
            <div className="tdb-onglets" role="tablist" aria-label="Métrique affichée">
              {metriques.map((x) => (
                <button key={x.cle} type="button" role="tab" aria-selected={x.cle === m.cle} className={x.cle === m.cle ? 'is-actif' : ''} onClick={() => setMetrique(x.cle)}>
                  {x.libelle}
                </button>
              ))}
            </div>
          </div>
          <CourbeTemporelle
            key={`${m.cle}-${periode.granularite}`}
            serie={serieGraphe}
            granularite={periode.granularite}
            unite={m.unite}
            forme={m.forme}
            formatValeur={format}
          />
          {audience.disponible && !audience.detaillees && (
            <p className="minimal-note mt-2 mb-0">
              Les courbes d&apos;audience (vues, visiteurs, engagements) sont incluses dans les formules « statistiques détaillées ».{' '}
              <Link to="/portail/medecin-abonnement">Voir les formules</Link>
            </p>
          )}
        </section>

        {/* Réputation */}
        <section className="info-card tdb-reputation">
          <h3><i className="fa-solid fa-star" /> Votre réputation</h3>
          {resume.nombre ? (
            <>
              <div className="tdb-rep-score">
                <div className="tdb-rep-valeur">{note1(resume.moyenne)}<span>/5</span></div>
                <div>
                  <Etoiles valeur={resume.moyenne} />
                  <div className="text-faint small">{nombre(resume.nombre)} avis publiés</div>
                </div>
              </div>
              <ul className="tdb-rep-distribution" aria-label="Répartition des notes">
                {[5, 4, 3, 2, 1].map((n) => (
                  <li key={n}>
                    <span>{n}</span>
                    <span className="rd-piste"><span style={{ width: `${(resume.distribution[n] / maxDistribution) * 100}%` }} /></span>
                    <span className="text-faint">{resume.distribution[n]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-faint">Aucun avis publié pour l&apos;instant. Vos patients sont invités à noter chaque consultation terminée.</p>
          )}
          <div className="tdb-rep-periode">
            <div>
              <span className="text-faint small d-block">Sur la période</span>
              <strong>{nombre(reputation.periode.avis)} avis</strong>
              {reputation.periode.note_moyenne !== null && <span className="text-faint"> · {note1(reputation.periode.note_moyenne)}/5</span>}
            </div>
            {resume.taux_recommandation !== null && (
              <div className="text-end">
                <span className="text-faint small d-block">Recommandation</span>
                <strong>{resume.taux_recommandation} %</strong>
              </div>
            )}
          </div>
          <Link to="/portail/medecin-avis" className="btn btn-primary btn-sm-aps w-100 mt-3">
            Lire et répondre aux avis <i className="fa-solid fa-arrow-right" />
          </Link>
        </section>

        {/* Parcours */}
        <section className="info-card">
          <h3><i className="fa-solid fa-filter" /> Parcours patient</h3>
          {audience.disponible ? (
            <>
              <Entonnoir
                etapes={[
                  { libelle: 'Visiteurs de la fiche', icone: 'fa-eye', valeur: audience.totaux.visiteurs },
                  ...(audience.totaux.engagements_par_type
                    ? [{ libelle: 'Clics « Prendre RDV »', icone: 'fa-hand-pointer', valeur: audience.totaux.engagements_par_type.clic_rdv }]
                    : []),
                  { libelle: 'RDV demandés', icone: 'fa-calendar-plus', valeur: activite.totaux.rdv_demandes },
                  { libelle: 'RDV payés', icone: 'fa-credit-card', valeur: activite.totaux.rdv_payes },
                ]}
              />
              <p className="minimal-note mt-2 mb-0">
                Taux de conversion : <strong>{pct(activite.totaux.taux_conversion)}</strong> des visiteurs demandent un rendez-vous.
                Les RDV demandés incluent ceux pris hors fiche (offres rapides, lien direct).
              </p>
            </>
          ) : (
            <Verrou />
          )}
        </section>

        {/* Engagements */}
        <section className="info-card">
          <h3><i className="fa-solid fa-hand-pointer" /> Engagements sur votre fiche</h3>
          {detaillees ? (
            <ul className="tdb-engagements">
              {Object.entries(TYPES_ENGAGEMENT).map(([cle, t]) => {
                const v = audience.totaux.engagements_par_type?.[cle] ?? 0;
                const max = Math.max(1, ...Object.values(audience.totaux.engagements_par_type ?? {}));
                return (
                  <li key={cle}>
                    <span className="tdb-eng-libelle"><i className={`fa-solid ${t.icone}`} /> {t.libelle}</span>
                    <span className="rd-piste"><span style={{ width: `${(v / max) * 100}%` }} /></span>
                    <strong>{nombre(v)}</strong>
                  </li>
                );
              })}
              <li className="tdb-eng-total">
                <span>Taux d&apos;engagement</span>
                <span />
                <strong>{pct(audience.totaux.taux_engagement)}</strong>
              </li>
            </ul>
          ) : audience.disponible ? (
            <>
              <div className="tdb-chiffre">{nombre(audience.totaux.engagements)} <span>engagements</span></div>
              <p className="minimal-note mb-0">
                Le détail (prises de RDV, contacts, itinéraires, partages, lectures des avis) est inclus dans les formules
                « statistiques détaillées ». <Link to="/portail/medecin-abonnement">Voir les formules</Link>
              </p>
            </>
          ) : (
            <Verrou />
          )}
        </section>

        {/* Créneaux */}
        <section className="info-card">
          <h3><i className="fa-solid fa-calendar-week" /> Créneaux les plus demandés</h3>
          <CarteCreneaux carte={activite.carte_creneaux} />
        </section>

        {/* Activité */}
        <section className="info-card">
          <h3><i className="fa-solid fa-clipboard-list" /> Activité détaillée</h3>
          <table className="tdb-table">
            <tbody>
              <tr><td>Rendez-vous à venir (7 jours)</td><td><strong>{nombre(activite.a_venir_7_jours)}</strong></td></tr>
              <tr>
                <td>RDV payés</td>
                <td><strong>{nombre(activite.totaux.rdv_payes)}</strong> <span className="text-faint">({pct(activite.totaux.taux_paiement)} des demandes)</span></td>
              </tr>
              <tr>
                <td>Consultations au cabinet / en vidéo</td>
                <td><strong>{nombre(activite.totaux.consultations_physiques)}</strong> / <strong>{nombre(activite.totaux.teleconsultations)}</strong></td>
              </tr>
              <tr>
                <td>Annulations de RDV payés</td>
                <td>
                  <strong>{nombre(activite.totaux.annulations)}</strong>
                  {activite.totaux.annulations_par_vous > 0 && <span className="text-faint"> (dont {activite.totaux.annulations_par_vous} par vous)</span>}
                  <div><Variation valeur={activite.variations.annulations} inverse suffixe="" /></div>
                </td>
              </tr>
              {audience.disponible && (
                <tr>
                  <td>Visiteurs uniques / jour (cumul)</td>
                  <td><strong>{nombre(audience.totaux.visiteurs)}</strong> <Variation valeur={audience.variations.visiteurs} suffixe="" /></td>
                </tr>
              )}
            </tbody>
          </table>
          {audience.disponible && (
            <p className="minimal-note mt-2 mb-0">Vos propres consultations de la fiche, celles d&apos;APS Santé et des robots ne sont pas comptées.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Verrou() {
  return (
    <div className="tdb-verrou">
      <i className="fa-solid fa-chart-pie" />
      <div>
        <strong>Statistiques d&apos;audience non incluses</strong>
        <p className="mb-2">Découvrez combien de patients consultent votre fiche et ce qu&apos;ils y font.</p>
        <Link to="/portail/medecin-abonnement" className="btn btn-outline-primary btn-sm-aps">Voir les formules</Link>
      </div>
    </div>
  );
}
