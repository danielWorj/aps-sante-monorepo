import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import med1 from '../assets/img/med1.jpg';

import {
  listerMedecins,
  obtenirMedecin,
  listerCreneauxLibres,
  listerDisponibilitesMedecin,
  JOURS_SEMAINE_AGENDA,
} from '../services/medecinService';
import { dateHeureLisible, grouperParJour, heureLocale, plageRecherche } from '../utils/creneaux';
import GoogleMapView from '../components/maps/GoogleMapView';
import AvisPublicsMedecin from '../components/avis/AvisPublicsMedecin';
import { Etoiles } from '../components/avis/Etoiles';
import { signalerEngagement } from '../services/reputationMedecinService';
import { useToast } from '../components/feedback';
import { aUnTarif, libelleTarif, montantTarif } from '../utils/tarif';
// La prise de rendez-vous (créneau, motif, inscription patient,
// POST /rendez-vous...) ne se fait plus dans une modale sur cette
// page : elle vit désormais entièrement dans src/pages/RendezVous.jsx,
// vers laquelle on redirige (voir allerVersRendezVous ci-dessous).
// creerRendezVous / TYPES_RENDEZ_VOUS / MOTIF_RENDEZ_VOUS_LONGUEUR_MAX,
// listerPays, inscrirePatient et useAuth (qui n'étaient utilisés que
// par l'ancienne ReservationModal) ne sont donc plus importés ici.

// Photo par défaut si le médecin n'a pas encore de photo_url (nullable
// en base — voir schema.prisma), cohérent avec Medecin.jsx.
const PHOTO_PAR_DEFAUT = med1;

const TABS = [
  { id: 'presentation', label: 'Présentation' },
  { id: 'horaires', label: 'Horaires & localisation' },
  { id: 'avis', label: 'Avis' },
  { id: 'tarifs', label: 'Tarifs & assurances' },
];

// Colonne latérale : les prochains créneaux LIBRES de l'agenda du médecin
// (GET /medecins/:id/agenda?libres=true). Un clic ouvre la page de prise de
// rendez-vous avec ce créneau présélectionné (?creneau=<id>).
const NB_PROCHAINS_CRENEAUX = 6;

// Bas de fiche : autres médecins publiés de la même spécialité.
const NB_MEDECINS_SIMILAIRES = 4;

// "09:00:00" | ISO "1970-01-01T09:00:00.000Z" -> "09:00" (heure murale du
// médecin, sans conversion de fuseau : c'est ce qu'il a déclaré).
function heureMurale(valeur) {
  const m = String(valeur ?? '').match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '--:--';
}

// Gabarit hebdomadaire -> plages lisibles par jour : les tranches
// consécutives (fin de l'une = début de la suivante) sont fusionnées.
function plagesParJour(disponibilites) {
  const parJour = new Map();
  (disponibilites || []).forEach((d) => {
    if (!parJour.has(d.jour_semaine)) parJour.set(d.jour_semaine, []);
    parJour.get(d.jour_semaine).push({ debut: heureMurale(d.horaire?.heure_debut), fin: heureMurale(d.horaire?.heure_fin) });
  });
  const resultat = new Map();
  parJour.forEach((tranches, jour) => {
    const triees = tranches.sort((a, b) => a.debut.localeCompare(b.debut));
    const plages = [];
    triees.forEach((t) => {
      const derniere = plages[plages.length - 1];
      if (derniere && derniere.fin === t.debut) derniere.fin = t.fin;
      else plages.push({ ...t });
    });
    resultat.set(jour, plages);
  });
  return resultat;
}

export default function ProfilMedecin() {
  // ⚠️ Suppose une route déclarée `/profil/:id` (cohérent avec les
  // <Link to={`/profil/${m.medecin_id}`}> de Medecin.jsx). À ajuster
  // si le nom du paramètre de route diffère réellement.
  const { id } = useParams();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const toast = useToast();
  // ?onglet=avis : lien des notifications « le médecin a répondu à votre avis ».
  const [tab, setTabBrut] = useState(() => (TABS.some((t) => t.id === searchParams.get('onglet')) ? searchParams.get('onglet') : 'presentation'));
  // Engagements (statistiques du médecin) : envoyés sans attendre, une fois par onglet du navigateur.
  const setTab = (t) => {
    if (t === 'avis') signalerEngagement(id, 'lecture_avis');
    setTabBrut(t);
  };

  const [medecin, setMedecin] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  // Agenda public : prochains créneaux libres + horaires de la semaine.
  const [creneauxLibres, setCreneauxLibres] = useState([]);
  const [disponibilites, setDisponibilites] = useState([]);
  const [chargementAgenda, setChargementAgenda] = useState(true);

  useEffect(() => {
    let annule = false;
    const { date_debut, date_fin } = plageRecherche(21);
    Promise.all([
      listerCreneauxLibres(id, date_debut, date_fin).catch(() => []),
      listerDisponibilitesMedecin(id).catch(() => []),
    ])
      .then(([libres, gabarit]) => {
        if (annule) return;
        setCreneauxLibres(libres || []);
        setDisponibilites(gabarit || []);
      })
      .finally(() => {
        if (!annule) setChargementAgenda(false);
      });
    return () => {
      annule = true;
    };
  }, [id]);

  const prochainsCreneaux = useMemo(
    () => [...grouperParJour(creneauxLibres).values()].flat().slice(0, NB_PROCHAINS_CRENEAUX),
    [creneauxLibres]
  );
  const plagesHebdo = useMemo(() => plagesParJour(disponibilites), [disponibilites]);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreurChargement(null);

    obtenirMedecin(id)
      .then((donnees) => {
        if (!annule) setMedecin(donnees);
      })
      .catch((err) => {
        if (!annule) setErreurChargement(err.message || 'Impossible de charger cette fiche médecin.');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });

    return () => {
      annule = true;
    };
  }, [id]);

  // Médecins de la même spécialité (hors médecin affiché).
  const [similaires, setSimilaires] = useState([]);
  const specialiteId = medecin?.specialite_id ?? medecin?.specialite?.specialite_id;
  useEffect(() => {
    if (!specialiteId) return undefined;
    let annule = false;
    listerMedecins({ specialite_id: specialiteId, statut_verification: 'publie' })
      .then((liste) => {
        if (annule) return;
        setSimilaires((liste || []).filter((m) => String(m.medecin_id) !== String(id)).slice(0, NB_MEDECINS_SIMILAIRES));
      })
      .catch(() => {
        if (!annule) setSimilaires([]);
      });
    return () => {
      annule = true;
    };
  }, [specialiteId, id]);

  const nomComplet = useMemo(() => {
    if (!medecin) return '';
    return `Dr. ${medecin.utilisateur?.prenom || ''} ${medecin.utilisateur?.nom || ''}`.trim();
  }, [medecin]);

  // Redirige vers la page dédiée de prise de rendez-vous (RendezVous.jsx)
  // au lieu d'ouvrir une modale sur place.
  // ⚠️ Hypothèse sur le routeur (non fourni pour cette correction) : une
  // route `/rendez-vous/:id` existe, cohérente avec `/profil/:id` déjà
  // utilisée ci-dessus et avec `const { id: medecinId } = useParams();`
  // dans RendezVous.jsx. Si votre route porte un autre chemin ou un
  // autre nom de paramètre, ajustez uniquement le `navigate(...)`
  // ci-dessous.
  // Le type de consultation et, le cas échéant, le créneau rapide
  // choisi dans la colonne latérale sont transmis en query params ;
  // RendezVous.jsx peut les lire via useSearchParams() pour pré-remplir
  // l'étape 1 si besoin (non fait par défaut, la page démarre sinon
  // avec ses valeurs par défaut : type "physique", aucun jour/heure).
  function allerVersRendezVous(type, creneauId) {
    signalerEngagement(id, 'clic_rdv');
    const params = new URLSearchParams({ type });
    if (creneauId) params.set('creneau', creneauId);
    navigate(`/rendez-vous/${id}?${params.toString()}`);
  }

  async function partager() {
    signalerEngagement(id, 'partage');
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: nomComplet, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.succes('Lien de la fiche copié.');
      }
    } catch { /* partage annulé par l'utilisateur */ }
  }

  /* ------------------------------ États de chargement / erreur ------------------------------ */
  if (chargement) {
    return (
      <div className="container-aps" style={{ padding: '3rem 0', textAlign: 'center' }}>
        Chargement de la fiche médecin...
      </div>
    );
  }

  if (erreurChargement) {
    return (
      <div className="container-aps" style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--danger, #c0392b)' }}>
        {erreurChargement}
      </div>
    );
  }

  if (!medecin) {
    return (
      <div className="container-aps" style={{ padding: '3rem 0', textAlign: 'center' }}>
        Ce médecin est introuvable.
      </div>
    );
  }

  const localisation = [medecin.ville_exercice?.nom, medecin.pays_exercice?.nom].filter(Boolean).join(' — ');
  // Abonnement de présence : le serveur indique si la prise de RDV en ligne
  // est ouverte (pays où l'abonnement est obligatoire) et n'expose le
  // téléphone (contact_telephone) qu'avec le droit « contact direct ».
  const rdvEnLigne = medecin.droits?.prise_rdv_en_ligne !== false;
  const telephone = medecin.contact_telephone ?? medecin.utilisateur?.telephone ?? null;

  // Le backend renvoie la position sous `geolocalisation: { latitude, longitude } | null`
  // (même contrat que les pharmacies et centres de santé).
  const lat = medecin.geolocalisation?.latitude;
  const lng = medecin.geolocalisation?.longitude;
  const aUneLocalisation = lat != null && lng != null;

  return (
    <>
      {/* ============================ FIL D'ARIANE ============================ */}
      <div className="container-aps" style={{ paddingTop: '1.1rem', fontSize: '.82rem' }}>
        <Link to="/" className="text-muted-soft">Accueil</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/medecin" className="text-muted-soft">Médecins</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <span className="text-faint">{nomComplet}</span>
      </div>

      {/* ============================ EN-TÊTE FICHE ============================ */}
      <section className="profile-header" style={{ paddingTop: '1.5rem' }}>
        <div className="container-aps">
          <div className="profile-header-inner">
            <div className="profile-avatar"><img src={medecin.photo_url || PHOTO_PAR_DEFAUT} alt={nomComplet} /></div>
            <div>
              <h1>{nomComplet}</h1>
              <div className="practitioner-meta mb-2">
                <span>{medecin.specialite?.nom || 'Spécialité non renseignée'}</span>
                {localisation && (
                  <>
                    <span>&middot;</span>
                    <span><i className="fa-solid fa-location-dot" /> {localisation}</span>
                  </>
                )}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {medecin.statut_verification === 'publie' && (
                  <span className="chip chip-verifie">
                    <i className="fa-solid fa-circle" /> Vérifiée à l&apos;Ordre
                    {medecin.numero_ordre ? ` — ${medecin.numero_ordre}` : ''}
                  </span>
                )}
                {medecin.teleconsultation_activee && (
                  <span className="chip chip-dispo"><i className="fa-solid fa-circle" /> Téléconsultation disponible</span>
                )}
                {aUnTarif(medecin.tarif_indicatif) && (
                  <span className="chip chip-tarif"><i className="fa-solid fa-money-bill-wave" /> {libelleTarif(medecin.tarif_indicatif)}</span>
                )}
              </div>
              {medecin.nombre_avis > 0 && (
                <button type="button" className="profil-note" onClick={() => setTab('avis')}>
                  <Etoiles valeur={Number(medecin.note_moyenne)} taille="sm" />
                  <strong>{Number(medecin.note_moyenne).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
                  <span>({medecin.nombre_avis} avis)</span>
                </button>
              )}
            </div>
            <div className="profile-actions">
              {rdvEnLigne && (
                <button type="button" className="btn btn-primary btn-lg-aps" onClick={() => allerVersRendezVous('physique')}>
                  <i className="fa-solid fa-calendar-check" /> Prendre RDV
                </button>
              )}
              {rdvEnLigne && medecin.teleconsultation_activee && (
                <button type="button" className="btn btn-outline-primary" onClick={() => allerVersRendezVous('teleconsultation')}>
                  <i className="fa-solid fa-video" /> Téléconsulter
                </button>
              )}
              {telephone && (
                <a href={`tel:${telephone}`} className="btn btn-ghost" aria-label="Appeler" onClick={() => signalerEngagement(id, 'clic_contact')}>
                  <i className="fa-solid fa-phone" />
                </a>
              )}
              <button type="button" className="btn btn-ghost" aria-label="Partager la fiche" onClick={partager}>
                <i className="fa-solid fa-share-nodes" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ CORPS ============================ */}
      <section style={{ paddingTop: '2.25rem' }}>
        <div className="container-aps">
          <div className="row g-4">

            {/* Colonne principale */}
            <div className="col-lg-8">
              <div className="aps-tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={tab === t.id ? 'active' : ''}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.id === 'avis' && medecin.nombre_avis > 0 && <span className="tab-count">{medecin.nombre_avis}</span>}
                  </button>
                ))}
              </div>

              <div>
                {/* Présentation */}
                {tab === 'presentation' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <h3><i className="fa-solid fa-user" /> À propos</h3>
                      <p style={{ fontSize: '.92rem' }}>
                        {nomComplet} exerce en tant que {medecin.specialite?.nom || 'professionnel de santé'}
                        {localisation ? ` à ${localisation}` : ''}.
                        {medecin.teleconsultation_activee
                          ? ' Consultations disponibles au cabinet ou en téléconsultation.'
                          : ' Consultations disponibles au cabinet.'}
                      </p>
                    </div>
                    <div className="info-card">
                      <h3><i className="fa-solid fa-id-card" /> Informations professionnelles</h3>
                      <ul style={{ fontSize: '.9rem', color: 'var(--ink-soft)', paddingLeft: '1.1rem', margin: 0 }}>
                        <li className="mb-2">Spécialité : {medecin.specialite?.nom || 'non renseignée'}</li>
                        {medecin.numero_ordre && <li className="mb-2">Numéro d&apos;ordre : {medecin.numero_ordre}</li>}
                        {medecin.statut_verification === 'publie' && <li>Membre inscrit à l&apos;Ordre National des Médecins</li>}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Horaires & localisation */}
                {tab === 'horaires' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <h3><i className="fa-solid fa-clock" /> Horaires de consultation</h3>
                      {chargementAgenda ? (
                        <p style={{ fontSize: '.88rem', color: 'var(--ink-soft)' }}>Chargement…</p>
                      ) : plagesHebdo.size === 0 ? (
                        <p style={{ fontSize: '.88rem', color: 'var(--ink-soft)' }}>
                          Ce médecin n&apos;a pas encore publié ses horaires de consultation.
                        </p>
                      ) : (
                        <table className="hours-table">
                          <tbody>
                            {JOURS_SEMAINE_AGENDA.map((j) => {
                              const plages = plagesHebdo.get(j.valeur);
                              return (
                                <tr key={j.valeur}>
                                  <td>{j.libelle}</td>
                                  <td>
                                    {plages
                                      ? plages.map((pl) => `${pl.debut} – ${pl.fin}`).join(' · ')
                                      : <span className="text-faint">Fermé</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="info-card">
                      <h3><i className="fa-solid fa-location-dot" /> Localisation</h3>
                      <p style={{ fontSize: '.9rem' }}>{localisation || 'Localisation non renseignée'}</p>
                      {aUneLocalisation ? (
                        <>
                          <GoogleMapView latitude={lat} longitude={lng} nom={nomComplet} />
                          <a
                            className="btn btn-outline-primary btn-sm-aps mt-2"
                            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => signalerEngagement(id, 'clic_itineraire')}
                          >
                            <i className="fa-solid fa-route" /> Itinéraire
                          </a>
                        </>
                      ) : (
                        <div
                          style={{
                            height: 220, borderRadius: 10, background: 'var(--surface-alt)',
                            display: 'flex', flexDirection: 'column', gap: '.5rem',
                            alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)',
                            fontSize: '.88rem',
                          }}
                        >
                          <i className="fa-solid fa-map-location-dot" style={{ fontSize: '1.8rem' }} />
                          <span>Localisation non renseignée par ce médecin.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Avis */}
                {tab === 'avis' && (
                  <div className="tab-panel active">
                    <AvisPublicsMedecin medecinId={id} nomMedecin={nomComplet} />
                  </div>
                )}

                {/* Tarifs */}
                {tab === 'tarifs' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <h3><i className="fa-solid fa-money-bill-wave" /> Tarifs</h3>
                      {aUnTarif(medecin.tarif_indicatif) ? (
                        <table className="hours-table">
                          <tbody>
                            <tr>
                              <td>Consultation (tarif indicatif)</td>
                              <td>{montantTarif(medecin.tarif_indicatif)}</td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <p style={{ fontSize: '.9rem' }}>Tarif non renseigné.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Colonne latérale */}
            <div className="col-lg-4">
              <div className="info-card">
                <h3><i className="fa-solid fa-calendar-days" /> Prendre rendez-vous</h3>
                {!rdvEnLigne ? (
                  <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>
                    Ce médecin ne propose pas la prise de rendez-vous en ligne pour le moment.
                  </p>
                ) : chargementAgenda ? (
                  <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>Chargement des disponibilités…</p>
                ) : prochainsCreneaux.length === 0 ? (
                  <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>
                    Aucun créneau disponible dans les prochains jours.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>Prochains créneaux disponibles :</p>
                    <div className="slot-mini-grid">
                      {prochainsCreneaux.map((c) => (
                        <button
                          type="button"
                          className="slot-mini"
                          key={c.creneau_id}
                          title={dateHeureLisible(c.debut)}
                          onClick={() => allerVersRendezVous('physique', c.creneau_id)}
                          style={{ cursor: 'pointer', border: 0 }}
                        >
                          {new Date(c.debut).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                          {' · '}
                          {heureLocale(c.debut)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {rdvEnLigne && (
                  <button type="button" className="btn btn-primary btn-block-aps mt-3" onClick={() => allerVersRendezVous('physique')}>
                    Prendre rendez-vous
                  </button>
                )}
              </div>

              <div className="info-card">
                <h3><i className="fa-solid fa-lock" /> Paiement sécurisé</h3>
                <p style={{ fontSize: '.85rem' }}>Vos honoraires sont conservés sous séquestre et libérés uniquement après la consultation.</p>
              </div>
            </div>
          </div>

          {/* Professionnels similaires : même spécialité */}
          {similaires.length > 0 && (
            <>
              <div className="section-head mt-5">
                <span className="eyebrow">Vous pourriez aussi consulter</span>
                <h2 style={{ fontSize: '1.4rem' }}>
                  Autres médecins en {medecin.specialite?.nom || 'même spécialité'}
                </h2>
              </div>
              <div className="row g-3">
                {similaires.map((doc) => {
                  const nom = `Dr. ${doc.utilisateur?.prenom || ''} ${doc.utilisateur?.nom || ''}`.trim();
                  const lieu = [doc.ville_exercice?.nom, doc.pays_exercice?.nom].filter(Boolean).join(' — ');
                  return (
                    <div className="col-6 col-md-3" key={doc.medecin_id}>
                      <div className="mini-card">
                        <div className="avatar-ph"><img src={doc.photo_url || PHOTO_PAR_DEFAUT} alt={nom} /></div>
                        <h4>{nom}</h4>
                        <p>{lieu || doc.specialite?.nom || ''}</p>
                        {aUnTarif(doc.tarif_indicatif) && <p className="mini-card-tarif">{libelleTarif(doc.tarif_indicatif)}</p>}
                        <Link to={`/profil/${doc.medecin_id}`} className="btn btn-outline-primary btn-sm-aps btn-block-aps">
                          <i className="fa-regular fa-eye" /> Voir le profil
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}