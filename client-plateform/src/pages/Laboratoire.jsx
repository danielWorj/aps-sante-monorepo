// Page « Laboratoires » — annuaire des laboratoires d'analyses.
// Mêmes gabarits que les annuaires pharmacies / assurances (annuaire-2026) :
// barre de recherche (nom du laboratoire ou examen recherché), filtres en
// bandeau (pays, ville du référentiel, autour de moi), cartes photo,
// pagination de 6, publicités à droite. Données : GET /api/laboratoires.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePays, usePaysFiltre } from '../context/PaysContext';
import ApsSelect from '../components/ui/ApsSelect';
import SliderPublicite from '../components/publicite/SliderPublicite';
import { PAGES_PUBLICITE } from '../services/publiciteService';
import { listerLaboratoires } from '../services/laboratoireService';
import { listerVilles } from '../services/geoService';
import { useGeolocation } from '../hooks/useGeolocation';
import '../assets/styles/annuaire-2026.css';

const RAYONS_KM = [5, 10, 25, 50];
const RESULTATS_PAR_PAGE = 6;

function lienItineraire(lat, lng, origine) {
  if (lat == null || lng == null) return null;
  const destination = `${lat},${lng}`;
  return origine
    ? `https://www.google.com/maps/dir/?api=1&origin=${origine.latitude},${origine.longitude}&destination=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function CarteLaboratoire({ labo, positionActuelle, demanderPosition }) {
  const hrefItineraire = lienItineraire(labo.geolocalisation?.latitude, labo.geolocalisation?.longitude, positionActuelle);
  const lieu = [
    [labo.ville?.nom, labo.pays?.nom].filter(Boolean).join(', '),
    typeof labo.distance_km === 'number' ? `${labo.distance_km.toFixed(1)} km` : null,
  ].filter(Boolean).join(' · ');

  return (
    <article className="aps-dc is-wide">
      {labo.image_url ? (
        <img src={labo.image_url} alt="" loading="lazy" />
      ) : (
        <div className="aps-dc-ph"><i className="fa-solid fa-flask-vial" /></div>
      )}
      <Link to={`/laboratoires/${labo.laboratoire_id}`} className="aps-dc-lien" aria-label={`Voir la fiche de ${labo.nom}`} />
      <div className="aps-dc-top">
        <span className="aps-pill is-white">
          <i className="fa-solid fa-vials" style={{ color: 'var(--primary)' }} />{' '}
          {labo.nb_examens} examen{labo.nb_examens > 1 ? 's' : ''}
          {labo.note_moyenne !== null && (
            <> · <i className="fa-solid fa-star" style={{ color: '#E0A100' }} /> {labo.note_moyenne.toLocaleString('fr-FR')}</>
          )}
        </span>
        {hrefItineraire && (
          <a
            href={hrefItineraire}
            target="_blank"
            rel="noreferrer"
            className="aps-dc-fav"
            title="Itinéraire"
            aria-label="Itinéraire"
            onClick={() => { if (!positionActuelle) demanderPosition(); }}
          >
            <i className="fa-solid fa-diamond-turn-right" />
          </a>
        )}
      </div>
      <div className="aps-dc-info">
        <div className="d-flex align-items-center gap-2">
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div className="aps-dc-nm text-truncate">
              {labo.nom}
              <i className="fa-solid fa-circle-check verif" title="Vérifié ApSa" />
            </div>
            <div className="aps-dc-sp text-truncate">
              {lieu || 'Localisation non renseignée'}
              {labo.nb_centres > 1 ? ` · ${labo.nb_centres} centres` : ''}
            </div>
          </div>
          <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
        </div>
      </div>
    </article>
  );
}

export default function Laboratoire() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [labos, setLabos] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [page, setPage] = useState(1);

  const [paysId, setPaysId] = usePaysFiltre(searchParams.get('pays_id') || '');
  const { listePays } = usePays();
  const [villeId, setVilleId] = useState(searchParams.get('ville_id') || '');
  const [villes, setVilles] = useState([]);
  const [recherche, setRecherche] = useState(searchParams.get('recherche') || '');
  const [examen, setExamen] = useState(searchParams.get('examen') || '');

  const { position: positionActuelle, loading: geoEnCours, error: geoErreur, demanderPosition } = useGeolocation();
  const [autourDeMoi, setAutourDeMoi] = useState(false);
  const [rayonKm, setRayonKm] = useState(10);

  const charger = async () => {
    setChargement(true);
    setErreur('');
    try {
      const proximite = autourDeMoi && positionActuelle
        ? { lat: positionActuelle.latitude, lng: positionActuelle.longitude, rayon_km: rayonKm }
        : {};
      setLabos(await listerLaboratoires({
        pays_id: paysId || undefined,
        ville_id: villeId || undefined,
        recherche: recherche.trim() || undefined,
        examen: examen.trim() || undefined,
        ...proximite,
      }));
      setPage(1);
    } catch (err) {
      setErreur(err.data?.message || err.message || "Impossible de charger l'annuaire.");
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paysId]);

  useEffect(() => {
    if (autourDeMoi && positionActuelle) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionActuelle]);

  // Villes du référentiel pour le pays choisi.
  useEffect(() => {
    if (!paysId) return undefined;
    let annule = false;
    listerVilles(paysId)
      .then((d) => { if (!annule) setVilles(d?.villes || []); })
      .catch(() => { if (!annule) setVilles([]); });
    return () => { annule = true; };
  }, [paysId]);

  const villesDuPays = paysId ? villes : [];
  const totalPages = Math.max(1, Math.ceil(labos.length / RESULTATS_PAR_PAGE));
  const labosPage = useMemo(
    () => labos.slice((page - 1) * RESULTATS_PAR_PAGE, page * RESULTATS_PAR_PAGE),
    [labos, page]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    charger();
  };

  const basculerAutourDeMoi = (actif) => {
    setAutourDeMoi(actif);
    if (actif && !positionActuelle) demanderPosition();
  };

  const reinitialiser = () => {
    setPaysId('');
    setVilleId('');
    setRecherche('');
    setExamen('');
    setAutourDeMoi(false);
  };
  const nbFiltresActifs = [paysId, villeId, recherche, examen, autourDeMoi].filter(Boolean).length;

  return (
    <>
      <div className="annuaire26-tete">
        <div className="container-aps">
          <div className="aps-t-xs">
            <Link to="/home" className="annuaire26-fil">Accueil</Link> / Laboratoires
          </div>
          <div className="annuaire26-titre">
            <h1 className="aps-h3">Laboratoires d&apos;analyses médicales</h1>
            {!chargement && !erreur && (
              <span className="aps-t-s">
                <b style={{ color: 'var(--primary-hover)' }}>{labos.length}</b>{' '}
                {labos.length > 1 ? 'laboratoires référencés' : 'laboratoire référencé'}
              </span>
            )}
          </div>
          <p className="aps-t-s mt-2 mb-0" style={{ maxWidth: 720 }}>
            Trouvez un laboratoire, consultez ses examens, ses tarifs indicatifs et ses centres de prélèvement.
          </p>
          <form className="aps-sbar annuaire26-sbar" onSubmit={handleSubmit}>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-vials" />
              <div>
                <label htmlFor="f-examen">Examen recherché</label>
                <input id="f-examen" placeholder="Glycémie, NFS, test de grossesse…" value={examen} onChange={(e) => setExamen(e.target.value)} />
              </div>
            </div>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-magnifying-glass" />
              <div>
                <label htmlFor="f-recherche">Laboratoire</label>
                <input id="f-recherche" placeholder="Nom du laboratoire…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg-aps">
              <i className="fa-solid fa-magnifying-glass" /> Rechercher
            </button>
          </form>
        </div>
      </div>

      <section className="annuaire26-corps">
        <div className="container-aps">
          <form className="aps-card annuaire26-filtres is-horizontal" onSubmit={handleSubmit}>
            <div className="d-flex justify-content-between align-items-center">
              <h2 className="aps-h4" style={{ fontSize: '1.07rem' }}>Filtres</h2>
              {nbFiltresActifs > 0 && (
                <button type="button" className="aps-reset" onClick={reinitialiser}>
                  <i className="fa-solid fa-rotate-left" /> Réinitialiser
                </button>
              )}
            </div>
            <div className="annuaire26-filtre">
              <label className="form-label-aps" htmlFor="f-pays">Pays</label>
              <ApsSelect id="f-pays" value={paysId} onChange={(e) => { setPaysId(e.target.value); setVilleId(''); }}>
                <option value="">Tous les pays</option>
                {listePays.map((p) => <option key={p.pays_id} value={String(p.pays_id)}>{p.nom}</option>)}
              </ApsSelect>
            </div>
            <div className="annuaire26-filtre">
              <label className="form-label-aps" htmlFor="f-ville">Ville</label>
              <ApsSelect id="f-ville" value={villeId} onChange={(e) => setVilleId(e.target.value)}>
                <option value="">Toutes les villes</option>
                {villesDuPays.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
              </ApsSelect>
            </div>
            <div className="annuaire26-sep" />
            <div className="d-flex justify-content-between align-items-center gap-2">
              <label htmlFor="f-autour" className="annuaire26-switch-lib">
                <b>Autour de moi</b>
                <span className="aps-t-xs">Selon votre position</span>
              </label>
              <div className="form-check form-switch m-0">
                <input className="form-check-input" type="checkbox" role="switch" id="f-autour"
                  checked={autourDeMoi} onChange={(e) => basculerAutourDeMoi(e.target.checked)} />
              </div>
            </div>
            {autourDeMoi && (
              <div className="annuaire26-filtre">
                <span className="form-label-aps">Rayon de recherche</span>
                <div className="d-flex flex-wrap gap-2">
                  {RAYONS_KM.map((km) => (
                    <button type="button" key={km} className={`aps-chip is-sm ${rayonKm === km ? 'is-on' : ''}`} onClick={() => setRayonKm(km)}>
                      {km} km
                    </button>
                  ))}
                </div>
                {geoEnCours && <p className="minimal-note mt-2">Localisation en cours…</p>}
                {geoErreur && <p className="minimal-note mt-2"><i className="fa-solid fa-triangle-exclamation" /> {geoErreur}</p>}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-sm-aps w-100 mt-3">Appliquer les filtres</button>
          </form>

          <div className="annuaire26-grille">
            <div className="annuaire26-resultats">
              <div className="annuaire26-barre">
                <div className="ms-auto">
                  <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => navigate('/laboratoires/creation')}>
                    <i className="fa-solid fa-plus" /> Inscrire mon laboratoire
                  </button>
                </div>
              </div>
              {chargement && <div className="info-card annuaire26-etat">Chargement de l&apos;annuaire…</div>}
              {!chargement && erreur && (
                <div className="info-card annuaire26-etat" style={{ color: 'var(--danger)' }}>
                  <i className="fa-solid fa-triangle-exclamation" /> {erreur}
                </div>
              )}
              {!chargement && !erreur && labos.length === 0 && (
                <div className="info-card annuaire26-etat">
                  {examen.trim() ? `Aucun laboratoire ne propose « ${examen.trim()} » avec ces critères.` : 'Aucun laboratoire ne correspond à ces critères.'}
                </div>
              )}
              {!chargement && !erreur && labos.length > 0 && (
                <>
                  <div className="annuaire26-cartes is-larges">
                    {labosPage.map((l) => (
                      <CarteLaboratoire key={l.laboratoire_id} labo={l} positionActuelle={positionActuelle} demanderPosition={demanderPosition} />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="annuaire26-pagination">
                      <span className="aps-t-xs">
                        Affichage de {(page - 1) * RESULTATS_PAR_PAGE + 1} à {Math.min(page * RESULTATS_PAR_PAGE, labos.length)} sur {labos.length}
                      </span>
                      <nav aria-label="Pagination des résultats">
                        <ul className="pagination mb-0">
                          <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                            <button type="button" className="page-link" aria-label="Page précédente" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                              <i className="fa-solid fa-chevron-left" />
                            </button>
                          </li>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                            <li className={`page-item ${page === n ? 'active' : ''}`} key={n}>
                              <button type="button" className="page-link" onClick={() => setPage(n)}>{n}</button>
                            </li>
                          ))}
                          <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                            <button type="button" className="page-link" aria-label="Page suivante" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                              <i className="fa-solid fa-chevron-right" />
                            </button>
                          </li>
                        </ul>
                      </nav>
                    </div>
                  )}
                </>
              )}
            </div>
            <aside className="annuaire26-pubs" aria-label="Publicités">
              <div className="ad-flyer">
                {/* Pas encore d'emplacement publicitaire dédié aux laboratoires :
                    même emplacement que l'annuaire des structures de santé. */}
                <SliderPublicite code={PAGES_PUBLICITE.structure} />
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
