import { useState } from 'react';
import { Link } from 'react-router-dom';

import med1 from '../assets/img/med1.jpg';
import med2 from '../assets/img/med2.avif';
import med3 from '../assets/img/med3.jpg';
import med4 from '../assets/img/med4.jpg';
import med5 from '../assets/img/med5.jpg';

const TABS = [
  { id: 'presentation', label: 'Présentation' },
  { id: 'horaires', label: 'Horaires & localisation' },
  { id: 'avis', label: 'Avis (126)' },
  { id: 'tarifs', label: 'Tarifs & assurances' },
];

function StarRow({ filled = 5 }) {
  return (
    <div className="review-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <i key={i} className={i < filled ? 'fa-solid fa-star' : 'fa-regular fa-star'} />
      ))}
    </div>
  );
}

export default function ProfilMedecin() {
  const [tab, setTab] = useState('presentation');

  return (
    <>
      {/* ============================ FIL D'ARIANE ============================ */}
      <div className="container-aps" style={{ paddingTop: '1.1rem', fontSize: '.82rem' }}>
        <Link to="/" className="text-muted-soft">Accueil</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/medecin" className="text-muted-soft">Médecins</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <span className="text-faint">Dr. Aïcha Ngo</span>
      </div>

      {/* ============================ EN-TÊTE FICHE ============================ */}
      <section className="profile-header" style={{ paddingTop: '1.5rem' }}>
        <div className="container-aps">
          <div className="profile-header-inner">
            <div className="profile-avatar"><img src={med1} alt="Dr. Aïcha Ngo" /></div>
            <div>
              <h1>Dr. Aïcha Ngo</h1>
              <div className="practitioner-meta mb-2">
                <span>Pédiatre</span>
                <span>&middot;</span>
                <span><i className="fa-solid fa-location-dot" /> Douala — Bonapriso</span>
                <span>&middot;</span>
                <span className="rating"><i className="fa-solid fa-star" /> 4.8 (126 avis)</span>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <span className="chip chip-verifie"><i className="fa-solid fa-circle" /> Vérifiée à l&apos;Ordre — ONMC-2024-00123</span>
                <span className="chip chip-dispo"><i className="fa-solid fa-circle" /> Disponible aujourd&apos;hui</span>
              </div>
            </div>
            <div className="profile-actions">
              <Link to="/rendez-vous/aicha-ngo" className="btn btn-primary btn-lg-aps">
                <i className="fa-solid fa-calendar-check" /> Prendre RDV
              </Link>
              <a href="#" className="btn btn-outline-primary"><i className="fa-solid fa-video" /> Téléconsulter</a>
              <a href="tel:+237600000000" className="btn btn-ghost"><i className="fa-solid fa-phone" /></a>
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
                        Le Dr. Aïcha Ngo exerce la pédiatrie depuis plus de 10 ans à Douala. Son cabinet accueille les
                        enfants de la naissance à l&apos;adolescence, pour le suivi de croissance, les vaccinations et les
                        consultations générales. Consultations disponibles au cabinet ou en téléconsultation.
                      </p>
                    </div>
                    <div className="info-card">
                      <h3><i className="fa-solid fa-graduation-cap" /> Formation &amp; expérience</h3>
                      <ul style={{ fontSize: '.9rem', color: 'var(--ink-soft)', paddingLeft: '1.1rem', margin: 0 }}>
                        <li className="mb-2">Doctorat en médecine — Université de Douala</li>
                        <li className="mb-2">Spécialisation en pédiatrie — 10 ans d&apos;exercice</li>
                        <li>Membre inscrit à l&apos;Ordre National des Médecins</li>
                      </ul>
                    </div>
                    <div className="info-card">
                      <h3><i className="fa-solid fa-language" /> Langues parlées</h3>
                      <div className="d-flex gap-2 flex-wrap">
                        <span className="chip chip-complet">Français</span>
                        <span className="chip chip-complet">Anglais</span>
                        <span className="chip chip-complet">Douala</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Horaires & localisation */}
                {tab === 'horaires' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <h3><i className="fa-solid fa-clock" /> Horaires d&apos;ouverture</h3>
                      <table className="hours-table">
                        <tbody>
                          <tr><td>Lundi — Vendredi</td><td>08h00 — 17h00</td></tr>
                          <tr><td>Samedi</td><td>08h00 — 13h00</td></tr>
                          <tr><td>Dimanche</td><td className="closed">Fermé</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="info-card">
                      <h3><i className="fa-solid fa-location-dot" /> Localisation</h3>
                      <p style={{ fontSize: '.9rem' }}>Rue des Manguiers, Bonapriso, Douala</p>
                      <div
                        style={{
                          height: 220, borderRadius: 10, background: 'var(--surface-alt)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)',
                        }}
                      >
                        <i className="fa-solid fa-map-location-dot" style={{ fontSize: '1.8rem' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Avis */}
                {tab === 'avis' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <div className="review-item">
                        <div className="review-head">
                          <div className="review-avatar">MT</div>
                          <div>
                            <strong style={{ fontSize: '.88rem' }}>Marie T.</strong>
                            <StarRow filled={5} />
                          </div>
                        </div>
                        <p style={{ fontSize: '.88rem', marginBottom: 0 }}>Très à l&apos;écoute, mon fils s&apos;est senti en confiance dès la première visite.</p>
                      </div>
                      <div className="review-item">
                        <div className="review-head">
                          <div className="review-avatar">PK</div>
                          <div>
                            <strong style={{ fontSize: '.88rem' }}>Paul K.</strong>
                            <StarRow filled={4} />
                          </div>
                        </div>
                        <p style={{ fontSize: '.88rem', marginBottom: 0 }}>Rendez-vous respecté à l&apos;heure, explications claires sur le traitement.</p>
                      </div>
                      <div className="review-item">
                        <div className="review-head">
                          <div className="review-avatar">SN</div>
                          <div>
                            <strong style={{ fontSize: '.88rem' }}>Sarah N.</strong>
                            <StarRow filled={5} />
                          </div>
                        </div>
                        <p style={{ fontSize: '.88rem', marginBottom: 0 }}>Téléconsultation très pratique, ordonnance reçue le jour même.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tarifs */}
                {tab === 'tarifs' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <h3><i className="fa-solid fa-money-bill-wave" /> Tarifs des consultations</h3>
                      <table className="hours-table">
                        <tbody>
                          <tr><td>Consultation standard</td><td>15 000 FCFA</td></tr>
                          <tr><td>Téléconsultation</td><td>10 000 FCFA</td></tr>
                          <tr><td>Suivi vaccinal</td><td>8 000 FCFA</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="info-card">
                      <h3><i className="fa-solid fa-shield-heart" /> Assurances acceptées</h3>
                      <div className="d-flex gap-2 flex-wrap">
                        <span className="chip chip-complet">Activa Assurances</span>
                        <span className="chip chip-complet">Saham Assurance Cameroun</span>
                        <span className="chip chip-complet">NSIA Assurances</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Colonne latérale */}
            <div className="col-lg-4">
              <div className="info-card">
                <h3><i className="fa-solid fa-calendar-days" /> Prochains créneaux</h3>
                <div className="slot-mini-grid">
                  {['08:30', '09:15', '10:00', '14:00', '14:45', '16:30'].map((slot) => (
                    <span className="slot-mini" key={slot}>{slot}</span>
                  ))}
                </div>
                <Link to="/rendez-vous/aicha-ngo" className="btn btn-primary btn-block-aps mt-3">Voir tous les créneaux</Link>
              </div>

              <div className="info-card">
                <h3><i className="fa-solid fa-lock" /> Paiement sécurisé</h3>
                <p style={{ fontSize: '.85rem' }}>Vos honoraires sont conservés sous séquestre (escrow) et libérés uniquement après la consultation.</p>
              </div>
            </div>
          </div>

          {/* Professionnels similaires */}
          <div className="section-head mt-5">
            <span className="eyebrow">Vous pourriez aussi consulter</span>
            <h2 style={{ fontSize: '1.4rem' }}>Professionnels similaires</h2>
          </div>
          <div className="row g-3">
            {[
              { id: 'chantal-mvondo', name: 'Dr. Chantal Mvondo', specialty: 'Médecine générale', photo: med3 },
              { id: 'lea-abena', name: 'Dr. Léa Abena', specialty: 'Gynécologue', photo: med5 },
              { id: 'serge-etoundi', name: 'Dr. Serge Etoundi', specialty: 'Dentiste', photo: med4 },
              { id: 'bertrand-foka', name: 'Dr. Bertrand Foka', specialty: 'Cardiologue', photo: med2 },
            ].map((doc) => (
              <div className="col-6 col-md-3" key={doc.id}>
                <div className="mini-card">
                  <div className="avatar-ph"><img src={doc.photo} alt={doc.name} /></div>
                  <h4>{doc.name}</h4>
                  <p>{doc.specialty}</p>
                  <Link to={`/profil/${doc.id}`} className="btn btn-outline-primary btn-sm-aps btn-block-aps">Voir le profil</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}