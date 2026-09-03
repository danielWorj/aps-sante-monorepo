import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import med1 from '../assets/img/med1.jpg';
import pub4 from '../assets/img/ads/pub4.jpg';
import {
  listerMedecins,
  listerSpecialites,
} from '../services/medecinService';
// Référentiels géographiques (Pays / Ville) : geoService.js est la
// source unique (routes génériques /pays, /villes, partagées par tous
// les modules annuaire) — voir src/services/geoService.js.
import { listerPays, listerVilles } from '../services/geoService';
import './../assets/styles/medecin.css';

const RESULTATS_PAR_PAGE = 10;

// Photo par défaut si le médecin n'a pas encore de photo_url (nullable
// en base — voir schema.prisma).
const PHOTO_PAR_DEFAUT = med1;

export default function Medecin() {
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
    specialite_id: '',
    pays_exercice_id: '',
    ville_exercice_id: '',
    recherche: '',
  });

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
    listerMedecins(filtres)
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
  }, [filtres]);

  function soumettreFiltres(e) {
    e.preventDefault();
    // Les <select> de la colonne filtre écrivent déjà directement dans
    // `filtres` via onChange — la recherche se relance automatiquement
    // (useEffect ci-dessus). Ce handler existe pour permettre la
    // soumission au clavier (Entrée) et éviter le rechargement de page.
  }

  const totalPages = Math.max(1, Math.ceil(medecins.length / RESULTATS_PAR_PAGE));
  const medecinsPage = useMemo(
    () => medecins.slice((page - 1) * RESULTATS_PAR_PAGE, page * RESULTATS_PAR_PAGE),
    [medecins, page]
  );

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: '2.5rem 0 0' }}>
        <div className="container-aps">
          <span className="eyebrow">Annuaire</span>
          <h1 style={{ fontSize: '1.9rem', marginTop: '.5rem' }}>Trouver un médecin ou un professionnel de santé</h1>
          <p className="mt-2" style={{ maxWidth: 620 }}>
            Douala, Yaoundé et au-delà : filtrez par spécialité, quartier et disponibilité pour trouver le bon professionnel.
          </p>
        </div>
      </section>

      {/* ============================ FILTRES + RESULTATS ============================ */}
      <section style={{ paddingTop: '1.5rem' }}>
        <div className="container-aps">
          <div className="row g-4">
            {/* Colonne filtres */}
            <div className="col-md-3">
              <div className="filter-bar filter-sidebar">
                <h3 style={{ marginBottom: '1rem' }}><i className="fa-solid fa-sliders" /> Filtrer</h3>
                <form onSubmit={soumettreFiltres}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-specialite">Spécialité</label>
                    <select
                      className="form-select"
                      id="f-specialite"
                      value={filtres.specialite_id}
                      onChange={(e) => setFiltres((f) => ({ ...f, specialite_id: e.target.value }))}
                    >
                      <option value="">Toutes les spécialités</option>
                      {specialites.map((s) => (
                        <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">Pays</label>
                    <select
                      className="form-select"
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
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">Ville</label>
                    <select
                      className="form-select"
                      id="f-ville"
                      value={filtres.ville_exercice_id}
                      onChange={(e) => setFiltres((f) => ({ ...f, ville_exercice_id: e.target.value }))}
                      disabled={!filtres.pays_exercice_id}
                    >
                      <option value="">Toutes les villes</option>
                      {villesFiltre.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-recherche">Nom du médecin</label>
                    {/* Input TEXTE → form-control (SANS chevron) */}
                    <input
                      type="text"
                      className="form-control"
                      id="f-recherche"
                      placeholder="Nom ou prénom"
                      value={filtres.recherche}
                      onChange={(e) => setFiltres((f) => ({ ...f, recherche: e.target.value }))}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block-aps">
                    <i className="fa-solid fa-magnifying-glass" /> Rechercher
                  </button>
                </form>
              </div>
            </div>

            {/* Colonne résultats — annuaire */}
            <div className="col-md-6">
              {/* Bouton "Devenir médecin" — juste au-dessus de la liste */}
              <div className="d-flex justify-content-end mb-3">
                <Link to="/devenir-medecin" className="btn btn-primary">
                  <i className="fa-solid fa-user-doctor" /> Devenir médecin
                </Link>
              </div>
              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: '.9rem' }}>
                  <strong style={{ color: 'var(--ink)' }}>{medecins.length}</strong> professionnels trouvés
                </span>
                <div className="view-toggle">
                  <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                    <i className="fa-solid fa-list" /> Liste
                  </button>
                  <button type="button" className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
                    <i className="fa-solid fa-map-location-dot" /> Carte
                  </button>
                </div>
              </div>
              {chargementMedecins && (
                <div className="info-card" style={{ padding: '2rem', textAlign: 'center' }}>
                  Chargement de l&apos;annuaire...
                </div>
              )}
              {!chargementMedecins && erreurMedecins && (
                <div className="info-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger, #c0392b)' }}>
                  {erreurMedecins}
                </div>
              )}
              {!chargementMedecins && !erreurMedecins && medecins.length === 0 && (
                <div className="info-card" style={{ padding: '2rem', textAlign: 'center' }}>
                  Aucun médecin ne correspond à ces critères.
                </div>
              )}
              {/* Vue liste */}
              {!chargementMedecins && !erreurMedecins && medecins.length > 0 && view === 'list' && (
                <div>
                  {medecinsPage.map((m) => {
                    const nomComplet = `Dr. ${m.utilisateur?.prenom || ''} ${m.utilisateur?.nom || ''}`.trim();
                    const tags = [];
                    if (m.statut_verification === 'publie') {
                      tags.push({ cls: 'chip-verifie', label: "Vérifié à l'Ordre" });
                    }
                    if (m.teleconsultation_activee) {
                      tags.push({ cls: 'chip-dispo', label: 'Téléconsultation dispo' });
                    }
                    return (
                      <div className="practitioner-card" key={m.medecin_id}>
                        <div className="avatar-ph">
                          <img src={m.photo_url || PHOTO_PAR_DEFAUT} alt={nomComplet} />
                        </div>
                        <div>
                          <h3>
                            <Link to={`/profil/${m.medecin_id}`} style={{ color: 'var(--ink)' }}>{nomComplet}</Link>
                          </h3>
                          <div className="practitioner-meta">
                            <span>{m.specialite?.nom || 'Spécialité non renseignée'}</span>
                            {(m.ville_exercice?.nom || m.pays_exercice?.nom) && (
                              <>
                                <span>&middot;</span>
                                <span>
                                  <i className="fa-solid fa-location-dot" />{' '}
                                  {[m.ville_exercice?.nom, m.pays_exercice?.nom].filter(Boolean).join(' — ')}
                                </span>
                              </>
                            )}
                          </div>
                          {tags.length > 0 && (
                            <div className="practitioner-tags">
                              {tags.map((t) => (
                                <span className={`chip ${t.cls}`} key={t.label}>
                                  <i className="fa-solid fa-circle" /> {t.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="practitioner-actions">
                          {m.tarif_indicatif !== undefined && m.tarif_indicatif !== null && (
                            <span className="price">{Number(m.tarif_indicatif).toLocaleString('fr-FR')} FCFA</span>
                          )}
                          <Link to={`/profil/${m.medecin_id}`} className="btn btn-outline-primary btn-sm-aps">Voir le profil</Link>
                          <Link to={`/rendez-vous/${m.medecin_id}`} className="btn btn-primary btn-sm-aps">Prendre RDV</Link>
                        </div>
                      </div>
                    );
                  })}
                  {totalPages > 1 && (
                    <nav aria-label="Pagination des résultats" className="mt-4">
                      <ul className="pagination justify-content-center">
                        <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                          <button type="button" className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            Précédent
                          </button>
                        </li>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                          <li className={`page-item ${page === n ? 'active' : ''}`} key={n}>
                            <button type="button" className="page-link" onClick={() => setPage(n)}>{n}</button>
                          </li>
                        ))}
                        <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                          <button type="button" className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                            Suivant
                          </button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              )}
              {/* Vue carte (placeholder) */}
              {!chargementMedecins && !erreurMedecins && medecins.length > 0 && view === 'map' && (
                <div>
                  <div
                    className="info-card"
                    style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '.6rem' }}
                  >
                    <i className="fa-solid fa-map-location-dot" style={{ fontSize: '2.2rem', color: 'var(--primary)' }} />
                    <p className="mb-0" style={{ fontSize: '.9rem' }}>La carte interactive s&apos;affiche ici, centrée sur votre zone de recherche.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Colonne flyer publicitaire */}
            <div className="col-md-3">
              <div className="ad-flyer">
                <a href="#" className="ad-slot">
                  <span className="ad-tag">Publicité</span>
                  <img src={pub4} alt="Publicité — Journée internationale des infirmières, Croix-Rouge" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}