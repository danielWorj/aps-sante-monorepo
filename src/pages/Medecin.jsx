import { useState } from 'react';
import { Link } from 'react-router-dom';

import med1 from '../assets/img/med1.jpg';
import med2 from '../assets/img/med2.avif';
import med3 from '../assets/img/med3.jpg';
import med4 from '../assets/img/med4.jpg';
import med5 from '../assets/img/med5.jpg';
import pub4 from '../assets/img/ads/pub4.jpg';

/* ============================================================
   Medecin.jsx — ex pages/medecin.html
   ============================================================ */

const PRACTITIONERS = [
  {
    id: 'aicha-ngo',
    name: 'Dr. Aïcha Ngo',
    photo: med1,
    specialty: 'Pédiatre',
    location: 'Douala — Bonapriso',
    rating: '4.8 (126 avis)',
    tags: [
      { cls: 'chip-verifie', label: 'Vérifiée à l\u2019Ordre' },
      { cls: 'chip-dispo', label: 'Disponible aujourd\u2019hui' },
    ],
    price: '15 000 FCFA',
  },
  {
    id: 'bertrand-foka',
    name: 'Dr. Bertrand Foka',
    photo: med2,
    specialty: 'Cardiologue',
    location: 'Douala — Akwa',
    rating: '4.6 (58 avis)',
    tags: [
      { cls: 'chip-verifie', label: 'Vérifié à l\u2019Ordre' },
      { cls: 'chip-semaine', label: 'Disponible cette semaine' },
    ],
    price: '20 000 FCFA',
  },
  {
    id: 'chantal-mvondo',
    name: 'Dr. Chantal Mvondo',
    photo: med3,
    specialty: 'Médecine générale',
    location: 'Yaoundé — Bastos',
    rating: '4.9 (203 avis)',
    tags: [
      { cls: 'chip-verifie', label: 'Vérifiée à l\u2019Ordre' },
      { cls: 'chip-dispo', label: 'Disponible aujourd\u2019hui' },
    ],
    price: '10 000 FCFA',
  },
  {
    id: 'serge-etoundi',
    name: 'Dr. Serge Etoundi',
    photo: med4,
    specialty: 'Dentiste',
    location: 'Douala — Deido',
    rating: '4.4 (37 avis)',
    tags: [
      { cls: 'chip-verifie', label: 'Vérifié à l\u2019Ordre' },
      { cls: 'chip-complet', label: 'Complet cette semaine' },
    ],
    price: '18 000 FCFA',
  },
  {
    id: 'lea-abena',
    name: 'Dr. Léa Abena',
    photo: med5,
    specialty: 'Gynécologue',
    location: 'Yaoundé — Mvog-Mbi',
    rating: '4.7 (91 avis)',
    tags: [
      { cls: 'chip-verifie', label: 'Vérifiée à l\u2019Ordre' },
      { cls: 'chip-dispo', label: 'Téléconsultation dispo' },
    ],
    price: '17 000 FCFA',
  },
];

export default function Medecin() {
  const [view, setView] = useState('list'); // 'list' | 'map'

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
                <form onSubmit={(e) => e.preventDefault()}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-specialite">Spécialité</label>
                    <select className="form-select" id="f-specialite">
                      <option>Toutes les spécialités</option>
                      <option>Médecine générale</option>
                      <option>Pédiatrie</option>
                      <option>Gynécologie</option>
                      <option>Cardiologie</option>
                      <option>Dentisterie</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">Pays</label>
                    <select className="form-select" id="f-pays">
                      <option>Cameroun</option>
                      <option>Sénégal</option>
                      <option>Côte d&apos;Ivoire</option>
                      <option>Gabon</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">Ville / Quartier</label>
                    <select className="form-select" id="f-ville">
                      <option>Toutes les villes</option>
                      <option>Douala — Akwa</option>
                      <option>Douala — Bonanjo</option>
                      <option>Douala — Bonapriso</option>
                      <option>Douala — Deido</option>
                      <option>Yaoundé — Bastos</option>
                      <option>Yaoundé — Mvog-Mbi</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-dispo">Disponibilité</label>
                    <select className="form-select" id="f-dispo">
                      <option>N&apos;importe quand</option>
                      <option>Aujourd&apos;hui</option>
                      <option>Cette semaine</option>
                    </select>
                  </div>
                  <div className="d-flex flex-column gap-2 mb-3">
                    <span className="chip chip-verifie"><i className="fa-solid fa-circle" /> Vérifié à l&apos;Ordre uniquement</span>
                    <span className="chip chip-dispo"><i className="fa-solid fa-circle" /> Téléconsultation possible</span>
                  </div>
                  <button type="submit" className="btn btn-primary btn-block-aps">
                    <i className="fa-solid fa-magnifying-glass" /> Rechercher
                  </button>
                </form>
              </div>
            </div>

            {/* Colonne résultats — annuaire */}
            <div className="col-md-6">
              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: '.9rem' }}>
                  <strong style={{ color: 'var(--ink)' }}>{PRACTITIONERS.length + 8}</strong> professionnels trouvés
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

              {/* Vue liste */}
              {view === 'list' && (
                <div>
                  {PRACTITIONERS.map((p) => (
                    <div className="practitioner-card" key={p.id}>
                      <div className="avatar-ph"><img src={p.photo} alt={p.name} /></div>
                      <div>
                        <h3><Link to={`/profil/${p.id}`} style={{ color: 'var(--ink)' }}>{p.name}</Link></h3>
                        <div className="practitioner-meta">
                          <span>{p.specialty}</span>
                          <span>&middot;</span>
                          <span><i className="fa-solid fa-location-dot" /> {p.location}</span>
                          <span>&middot;</span>
                          <span className="rating"><i className="fa-solid fa-star" /> {p.rating}</span>
                        </div>
                        <div className="practitioner-tags">
                          {p.tags.map((t) => (
                            <span className={`chip ${t.cls}`} key={t.label}><i className="fa-solid fa-circle" /> {t.label}</span>
                          ))}
                        </div>
                      </div>
                      <div className="practitioner-actions">
                        <span className="price">{p.price}</span>
                        <Link to={`/profil/${p.id}`} className="btn btn-outline-primary btn-sm-aps">Voir le profil</Link>
                        <Link to={`/rendez-vous/${p.id}`} className="btn btn-primary btn-sm-aps">Prendre RDV</Link>
                      </div>
                    </div>
                  ))}

                  <nav aria-label="Pagination des résultats" className="mt-4">
                    <ul className="pagination justify-content-center">
                      <li className="page-item disabled"><a className="page-link" href="#">Précédent</a></li>
                      <li className="page-item active"><a className="page-link" href="#">1</a></li>
                      <li className="page-item"><a className="page-link" href="#">2</a></li>
                      <li className="page-item"><a className="page-link" href="#">3</a></li>
                      <li className="page-item"><a className="page-link" href="#">Suivant</a></li>
                    </ul>
                  </nav>
                </div>
              )}

              {/* Vue carte (placeholder) */}
              {view === 'map' && (
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