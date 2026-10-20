import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ApsSelect from '../components/ui/ApsSelect';
import med1 from '../assets/img/med1.jpg';
import SliderPublicite from '../components/publicite/SliderPublicite';
import { PAGES_PUBLICITE } from '../services/publiciteService';
import {
  listerMedecins,
  listerSpecialites,
} from '../services/medecinService';
// Référentiels géographiques (Pays / Ville) : geoService.js est la
// source unique (routes génériques /pays, /villes, partagées par tous
// les modules annuaire) — voir src/services/geoService.js.
import { listerPays, listerVilles } from '../services/geoService';
import { useGeolocation } from '../hooks/useGeolocation';
import GoogleMapListe from '../components/maps/GoogleMapListe';
import './../assets/styles/medecin.css';
import './../assets/styles/annuaire-2026.css';

// Grille de cartes photo : 3 colonnes × 2 lignes.
const RESULTATS_PAR_PAGE = 6;

// Photo par défaut si le médecin n'a pas encore de photo_url (nullable
// en base — voir schema.prisma).
const PHOTO_PAR_DEFAUT = med1;

// Rayons proposés pour le filtre « Autour de moi » (voir
// server/src/lib/geo.js : rayon par défaut 10 km si non précisé).
const RAYONS_KM = [5, 10, 25, 50];

// Seules les fiches validées sont montrées en recherche de proximité
// (décision D4). Hors mode « Autour de moi », le paramètre n'est pas
// envoyé : le comportement historique de GET /medecins est inchangé.
const STATUT_PUBLIC = 'publie';

function nomCompletMedecin(m) {
  return `Dr. ${m.utilisateur?.prenom || ''} ${m.utilisateur?.nom || ''}`.trim();
}

// Lien « Itinéraire » Google Maps. `origine` (facultative) vient du hook
// useGeolocation déjà instancié par la page ; sans elle, Google Maps
// demande lui-même le point de départ (même patron que Pharmacie.jsx).
function lienItineraire(destLat, destLng, origine) {
  if (destLat == null || destLng == null) return null;
  const destination = `${destLat},${destLng}`;
  return origine
    ? `https://www.google.com/maps/dir/?api=1&origin=${origine.latitude},${origine.longitude}&destination=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export default function Medecin() {
  // Écran 1.1.3 du parcours d'onboarding (croquis) : arrivée ici
  // depuis OnboardingMedecinSpecialite.jsx avec specialite_id,
  // pays_exercice_id et ville_exercice_id déjà choisis en query
  // params — ils servent de valeurs initiales des filtres pour que la
  // "liste des médecins obtenus" soit déjà pré-filtrée, sans que
  // l'utilisateur ait à ressaisir sa recherche.
  const [searchParams] = useSearchParams();

  const [view, setView] = useState('list'); // 'list' | 'map'
  const [page, setPage] = useState(1);

  // Résultats + référentiels
  const [medecins, setMedecins] = useState([]);
  const [chargementMedecins, setChargementMedecins] = useState(true);
  const [erreurMedecins, setErreurMedecins] = useState(null);
  const [specialites, setSpecialites] = useState([]);
  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);

  // Filtres — envoyés tels quels aux query params de GET /medecins
  // (voir listerMedecins dans medecin.controller.js : specialite_id,
  // ville_exercice_id, pays_exercice_id, recherche).
  const [filtres, setFiltres] = useState({
    specialite_id: searchParams.get('specialite_id') || '',
    pays_exercice_id: searchParams.get('pays_exercice_id') || '',
    ville_exercice_id: searchParams.get('ville_exercice_id') || '',
    recherche: searchParams.get('recherche') || '',
  });

  // Filtre « Autour de moi » — API navigateur native (useGeolocation),
  // aucune librairie carto. Refus de permission / navigateur non
  // compatible : on retombe sur les filtres habituels (aucun lat/lng
  // envoyé), avec un message discret sous le sélecteur de rayon.
  const {
    position: positionActuelle,
    loading: geoEnCours,
    error: geoErreur,
    demanderPosition,
  } = useGeolocation();
  const [autourDeMoi, setAutourDeMoi] = useState(false);
  const [rayonKm, setRayonKm] = useState(10);

  function handleToggleAutourDeMoi(actif) {
    setAutourDeMoi(actif);
    if (actif && !positionActuelle) demanderPosition();
  }

  // Filtres réellement envoyés à GET /medecins. La proximité n'est
  // ajoutée que si le mode est actif ET qu'une position a été obtenue ;
  // dans ce cas seulement on demande aussi les fiches publiées (D4).
  // Le tri par distance renvoyé par le serveur n'est jamais recalculé
  // côté front. useMemo : l'effet de chargement ne se relance que si
  // l'un de ces éléments change réellement.
  const attentePosition = autourDeMoi && !positionActuelle && geoEnCours;

  const filtresEnvoyes = useMemo(() => {
    if (autourDeMoi && positionActuelle) {
      return {
        ...filtres,
        lat: positionActuelle.latitude,
        lng: positionActuelle.longitude,
        rayon_km: rayonKm,
        statut_verification: STATUT_PUBLIC,
      };
    }
    return filtres;
  }, [filtres, autourDeMoi, positionActuelle, rayonKm]);

  /* ---------------------------------------------------------------
     Chargement des référentiels (spécialités, pays) au montage
  --------------------------------------------------------------- */
  useEffect(() => {
    listerSpecialites().then(setSpecialites).catch(() => setSpecialites([]));
    listerPays()
      .then((donnees) => setPays(donnees.pays || []))
      .catch(() => setPays([]));
  }, []);

  /* ---------------------------------------------------------------
     Villes du filtre — dépendantes du pays d'exercice sélectionné
  --------------------------------------------------------------- */
  useEffect(() => {
    if (!filtres.pays_exercice_id) {
      setVillesFiltre([]);
      return;
    }
    listerVilles(filtres.pays_exercice_id)
      .then((donnees) => setVillesFiltre(donnees.villes || []))
      .catch(() => setVillesFiltre([]));
  }, [filtres.pays_exercice_id]);

  /* ---------------------------------------------------------------
     Chargement des médecins — relancé à chaque changement de filtre
  --------------------------------------------------------------- */
  useEffect(() => {
    let annule = false;
    setChargementMedecins(true);
    setErreurMedecins(null);
    // « Autour de moi » coché mais position pas encore reçue : on
    // n'interroge pas l'API (sinon elle renverrait TOUS les médecins,
    // non triés, avant de se recharger avec lat/lng). Le chargement est
    // relancé dès que la position arrive (filtresEnvoyes change) ou en
    // cas d'échec (attentePosition repasse à false -> liste classique).
    if (attentePosition) return undefined;
    listerMedecins(filtresEnvoyes)
      .then((donnees) => {
        if (!annule) {
          setMedecins(donnees || []);
          setPage(1);
        }
      })
      .catch((err) => {
        if (!annule) setErreurMedecins(err.message || "Impossible de charger l'annuaire des médecins.");
      })
      .finally(() => {
        if (!annule) setChargementMedecins(false);
      });
    return () => {
      annule = true;
    };
  }, [filtresEnvoyes, attentePosition]);

  function soumettreFiltres(e) {
    e.preventDefault();
    // Les <select> de la colonne filtre écrivent déjà directement dans
    // `filtres` via onChange — la recherche se relance automatiquement
    // (useEffect ci-dessus). Ce handler existe pour permettre la
    // soumission au clavier (Entrée) et éviter le rechargement de page.
  }

  const lienDemandeRapide = useMemo(() => {
    const params = new URLSearchParams();
    if (filtres.specialite_id) params.set('specialite_id', filtres.specialite_id);
    if (filtres.pays_exercice_id) params.set('pays_id', filtres.pays_exercice_id);
    if (filtres.ville_exercice_id) params.set('ville_id', filtres.ville_exercice_id);
    const qs = params.toString();
    return `/demande-rapide${qs ? `?${qs}` : ''}`;
  }, [filtres.specialite_id, filtres.pays_exercice_id, filtres.ville_exercice_id]);

  const totalPages = Math.max(1,Math.ceil(medecins.length / RESULTATS_PAR_PAGE));
  const medecinsPage = useMemo(
    () => medecins.slice((page - 1) * RESULTATS_PAR_PAGE, page * RESULTATS_PAR_PAGE),
    [medecins, page]
  );

  // Points de l'onglet « Carte » : tous les résultats (pas seulement la
  // page courante) ayant une position ; les autres sont comptés pour le
  // message « N médecin(s) sans localisation ».
  const { pointsCarte, sansLocalisation } = useMemo(() => {
    const points = [];
    medecins.forEach((m) => {
      const lat = m.geolocalisation?.latitude;
      const lng = m.geolocalisation?.longitude;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({
          id: m.medecin_id,
          latitude: lat,
          longitude: lng,
          titre: nomCompletMedecin(m),
          sousTitre: [m.specialite?.nom, m.ville_exercice?.nom].filter(Boolean).join(' · '),
          lien: `/profil/${m.medecin_id}`,
        });
      }
    });
    return { pointsCarte: points, sansLocalisation: medecins.length - points.length };
  }, [medecins]);

  const nomSpecialite = specialites.find((s) => String(s.specialite_id) === String(filtres.specialite_id))?.nom;
  const nomVille = villesFiltre.find((v) => String(v.ville_id) === String(filtres.ville_exercice_id))?.nom;
  const titre = nomSpecialite
    ? `${nomSpecialite}${nomVille ? ` à ${nomVille}` : ''}`
    : `Médecins et professionnels de santé${nomVille ? ` à ${nomVille}` : ''}`;
  const nbFiltresActifs = [filtres.specialite_id, filtres.pays_exercice_id, filtres.recherche, autourDeMoi]
    .filter(Boolean).length;

  function reinitialiserFiltres() {
    setFiltres({ specialite_id: '', pays_exercice_id: '', ville_exercice_id: '', recherche: '' });
    setAutourDeMoi(false);
  }

  return (
    <>
      {/* ============================ EN-TÊTE + RECHERCHE ============================ */}
      <div className="annuaire26-tete">
        <div className="container-aps">
          <div className="aps-t-xs">
            <Link to="/home" className="annuaire26-fil">Accueil</Link> / Médecins
            {nomSpecialite && <> / {nomSpecialite}</>}
          </div>
          <div className="annuaire26-titre">
            <h1 className="aps-h3">{titre}</h1>
            {!chargementMedecins && !erreurMedecins && (
              <span className="aps-t-s">
                <b style={{ color: 'var(--primary-hover)' }}>{medecins.length}</b>{' '}
                {medecins.length > 1 ? 'professionnels trouvés' : 'professionnel trouvé'}
              </span>
            )}
          </div>
          <form className="aps-sbar annuaire26-sbar" onSubmit={soumettreFiltres}>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-stethoscope" />
              <div>
                <label htmlFor="f-specialite">Spécialité</label>
                <ApsSelect variante="nu"
                  id="f-specialite"
                  value={filtres.specialite_id}
                  onChange={(e) => setFiltres((f) => ({ ...f, specialite_id: e.target.value }))}
                >
                  <option value="">Toutes les spécialités</option>
                  {specialites.map((s) => (
                    <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                  ))}
                </ApsSelect>
              </div>
            </div>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-user-doctor" />
              <div>
                <label htmlFor="f-recherche">Nom du médecin</label>
                <input
                  type="text"
                  id="f-recherche"
                  placeholder="Nom ou prénom"
                  value={filtres.recherche}
                  onChange={(e) => setFiltres((f) => ({ ...f, recherche: e.target.value }))}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg-aps">
              <i className="fa-solid fa-magnifying-glass" /> Rechercher
            </button>
          </form>
        </div>
      </div>

      {/* ============================ FILTRES + RÉSULTATS ============================ */}
      <section className="annuaire26-corps">
        <div className="container-aps">
            <div className="aps-card annuaire26-filtres is-horizontal">
              <div className="d-flex justify-content-between align-items-center">
                <h2 className="aps-h4" style={{ fontSize: '1.07rem' }}>Filtres</h2>
                {nbFiltresActifs > 0 && (
                  <button type="button" className="aps-reset" onClick={reinitialiserFiltres}>
                    <i className="fa-solid fa-rotate-left" /> Réinitialiser
                  </button>
                )}
              </div>

              <div className="annuaire26-filtre">
                <label className="form-label-aps" htmlFor="f-pays">Pays</label>
                <ApsSelect
                  id="f-pays"
                  value={filtres.pays_exercice_id}
                  onChange={(e) =>
                    setFiltres((f) => ({ ...f, pays_exercice_id: e.target.value, ville_exercice_id: '' }))
                  }
                >
                  <option value="">Tous les pays</option>
                  {pays.map((p) => (
                    <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                  ))}
                </ApsSelect>
              </div>
              <div className="annuaire26-filtre">
                <label className="form-label-aps" htmlFor="f-ville">Ville</label>
                <ApsSelect
                  id="f-ville"
                  value={filtres.ville_exercice_id}
                  onChange={(e) => setFiltres((f) => ({ ...f, ville_exercice_id: e.target.value }))}
                  disabled={!filtres.pays_exercice_id}
                >
                  <option value="">Toutes les villes</option>
                  {villesFiltre.map((v) => (
                    <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                  ))}
                </ApsSelect>
              </div>

              <div className="annuaire26-sep" />
              <div className="d-flex justify-content-between align-items-center gap-2">
                <label htmlFor="f-autour" className="annuaire26-switch-lib">
                  <b>Autour de moi</b>
                  <span className="aps-t-xs">Selon votre position</span>
                </label>
                <div className="form-check form-switch m-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="f-autour"
                    checked={autourDeMoi}
                    onChange={(e) => handleToggleAutourDeMoi(e.target.checked)}
                  />
                </div>
              </div>
              {autourDeMoi && (
                <div className="annuaire26-filtre">
                  <span className="form-label-aps">Rayon de recherche</span>
                  <div className="d-flex flex-wrap gap-2">
                    {RAYONS_KM.map((km) => (
                      <button
                        type="button"
                        key={km}
                        className={`aps-chip is-sm ${rayonKm === km ? 'is-on' : ''}`}
                        onClick={() => setRayonKm(km)}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                  {geoEnCours && <p className="minimal-note mt-2">Localisation en cours…</p>}
                  {geoErreur && (
                    <p className="minimal-note mt-2">
                      <i className="fa-solid fa-triangle-exclamation" /> {geoErreur}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* RDV aléatoire (« Demande express ») : le patient publie spécialité,
                ville, jour et heure ; les médecins disponibles répondent.
                Spécialité, pays et ville filtrés ici sont transmis à la page publique
                /demande-rapide (compte patient créé ou connexion sur place). */}

          <div className="annuaire26-grille">
          <div className="annuaire26-resultats">
            <div className="annuaire26-barre">
              <div className="d-flex flex-wrap gap-2">
                {nomSpecialite && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setFiltres((f) => ({ ...f, specialite_id: '' }))}>
                    {nomSpecialite} <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {nomVille && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setFiltres((f) => ({ ...f, ville_exercice_id: '' }))}>
                    {nomVille} <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {filtres.recherche && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setFiltres((f) => ({ ...f, recherche: '' }))}>
                    « {filtres.recherche} » <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {autourDeMoi && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setAutourDeMoi(false)}>
                    ≤ {rayonKm} km <i className="fa-solid fa-xmark" />
                  </button>
                )}
              </div>
              <div className="d-flex align-items-center gap-2 ms-auto">
                {/* RDV aléatoire : spécialité, pays et ville filtrés sont transmis à /demande-rapide. */}
                <Link to={lienDemandeRapide} className="btn btn-primary btn-sm-aps">
                  <i className="fa-solid fa-bullhorn" /> Demande express
                </Link>
                <Link to="/devenir-medecin" className="btn btn-outline-primary btn-sm-aps">
                  <i className="fa-solid fa-user-doctor" /> Devenir médecin
                </Link>
                <div className="annuaire26-seg" role="group" aria-label="Affichage">
                  <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}
                    aria-pressed={view === 'list'} title="Grille">
                    <i className="fa-solid fa-table-cells-large" />
                  </button>
                  <button type="button" className={view === 'map' ? 'is-on' : ''} onClick={() => setView('map')}
                    aria-pressed={view === 'map'} title="Carte">
                    <i className="fa-solid fa-map-location-dot" />
                  </button>
                </div>
              </div>
            </div>

            {chargementMedecins && (
              <div className="info-card annuaire26-etat">Chargement de l&apos;annuaire…</div>
            )}
            {!chargementMedecins && erreurMedecins && (
              <div className="info-card annuaire26-etat" style={{ color: 'var(--danger)' }}>
                {erreurMedecins}
              </div>
            )}
            {!chargementMedecins && !erreurMedecins && medecins.length === 0 && (
              <div className="info-card annuaire26-etat">
                Aucun médecin ne correspond à ces critères.
                {nbFiltresActifs > 0 && (
                  <div className="mt-2">
                    <button type="button" className="aps-reset" onClick={reinitialiserFiltres}>
                      <i className="fa-solid fa-rotate-left" /> Réinitialiser les filtres
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Vue grille : cartes photo, bloc d'informations posé sur l'image */}
            {!chargementMedecins && !erreurMedecins && medecins.length > 0 && view === 'list' && (
              <>
                <div className="annuaire26-cartes">
                  {medecinsPage.map((m) => {
                    const nomComplet = nomCompletMedecin(m);
                    const hrefItineraire = lienItineraire(
                      m.geolocalisation?.latitude,
                      m.geolocalisation?.longitude,
                      positionActuelle
                    );
                    const lieu = [
                      m.specialite?.nom || 'Spécialité non renseignée',
                      m.ville_exercice?.nom,
                      typeof m.distance_km === 'number' ? `${m.distance_km.toFixed(1)} km` : null,
                    ].filter(Boolean).join(' · ');
                    // Abonnement de présence : RDV en ligne fermé si le serveur le refuse.
                    const rdvOuvert = m.droits?.prise_rdv_en_ligne !== false;
                    return (
                      <article className="aps-dc is-tall" key={m.medecin_id}>
                        <img src={m.photo_url || PHOTO_PAR_DEFAUT} alt="" loading="lazy" />
                        <Link to={`/profil/${m.medecin_id}`} className="aps-dc-lien" aria-label={`Voir le profil de ${nomComplet}`} />
                        <div className="aps-dc-top">
                          {m.teleconsultation_activee ? (
                            <span className="aps-pill is-white">
                              <i className="fa-solid fa-video" style={{ color: 'var(--info)' }} /> Vidéo
                            </span>
                          ) : (
                            <span className="aps-pill is-white"><span className="d" /> Au cabinet</span>
                          )}
                          {hrefItineraire && (
                            <a
                              href={hrefItineraire}
                              target="_blank"
                              rel="noreferrer"
                              className="aps-dc-fav"
                              title="Itinéraire"
                              aria-label="Itinéraire"
                              onClick={() => {
                                // Sans position utilisateur, ce clic s'ouvre sans
                                // origine (Google Maps la demandera) ; on la
                                // demande pour les clics suivants.
                                if (!positionActuelle) demanderPosition();
                              }}
                            >
                              <i className="fa-solid fa-diamond-turn-right" />
                            </a>
                          )}
                        </div>
                        <div className="aps-dc-info">
                          <div className="aps-dc-nm">
                            {nomComplet}
                            {m.statut_verification === 'publie' && (
                              <i className="fa-solid fa-circle-check verif" title="Vérifié à l'Ordre" />
                            )}
                          </div>
                          <div className="aps-dc-sp">{lieu}</div>
                          <div className="aps-dc-ft">
                            {m.nombre_avis > 0 ? (
                              <Link to={`/profil/${m.medecin_id}?onglet=avis`} className="aps-stars">
                                <i className="fa-solid fa-star" />
                                {Number(m.note_moyenne).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                <span className="aps-t-xs">({m.nombre_avis})</span>
                              </Link>
                            ) : (
                              <span className="aps-t-xs">Nouveau</span>
                            )}
                            {m.tarif_indicatif !== undefined && m.tarif_indicatif !== null && (
                              <span>{Number(m.tarif_indicatif).toLocaleString('fr-FR')} F</span>
                            )}
                            <Link
                              to={rdvOuvert ? `/rendez-vous/${m.medecin_id}` : `/profil/${m.medecin_id}`}
                              className="aps-dc-go"
                              title={rdvOuvert ? 'Prendre rendez-vous' : 'Voir le profil'}
                              aria-label={rdvOuvert ? `Prendre rendez-vous avec ${nomComplet}` : `Voir le profil de ${nomComplet}`}
                            >
                              <i className={`fa-solid ${rdvOuvert ? 'fa-calendar-check' : 'fa-arrow-right'}`} />
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="annuaire26-pagination">
                    <span className="aps-t-xs">
                      Affichage de {(page - 1) * RESULTATS_PAR_PAGE + 1} à {Math.min(page * RESULTATS_PAR_PAGE, medecins.length)} sur {medecins.length}
                    </span>
                    <nav aria-label="Pagination des résultats">
                      <ul className="pagination mb-0">
                        <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                          <button type="button" className="page-link" aria-label="Page précédente"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            <i className="fa-solid fa-chevron-left" />
                          </button>
                        </li>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                          <li className={`page-item ${page === n ? 'active' : ''}`} key={n}>
                            <button type="button" className="page-link" onClick={() => setPage(n)}>{n}</button>
                          </li>
                        ))}
                        <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                          <button type="button" className="page-link" aria-label="Page suivante"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                            <i className="fa-solid fa-chevron-right" />
                          </button>
                        </li>
                      </ul>
                    </nav>
                  </div>
                )}
              </>
            )}
            {/* Vue carte */}
            {!chargementMedecins && !erreurMedecins && medecins.length > 0 && view === 'map' && (
              <div>
                <GoogleMapListe points={pointsCarte} hauteur="520px" />
                {sansLocalisation > 0 && (
                  <p className="minimal-note mt-2">
                    <i className="fa-solid fa-circle-info" /> {sansLocalisation}{' '}
                    {sansLocalisation > 1 ? 'médecins sans localisation' : 'médecin sans localisation'}
                  </p>
                )}
              </div>
            )}
          </div>
          <aside className="annuaire26-pubs" aria-label="Publicités">
            <div className="ad-flyer">
              <SliderPublicite code={PAGES_PUBLICITE.medecin} />
            </div>
          </aside>
          </div>
        </div>
      </section>
    </>
  );
}
