import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import med1 from '../assets/img/med1.jpg';
import med2 from '../assets/img/med2.avif';
import med3 from '../assets/img/med3.jpg';
import med4 from '../assets/img/med4.jpg';
import med5 from '../assets/img/med5.jpg';

import { obtenirMedecin } from '../services/medecinService';
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

// Créneaux d'exemple affichés dans la colonne latérale. Aucun endpoint
// de disponibilités n'est exposé par medecinService.js à ce jour — un
// clic sur un créneau pré-remplit simplement la date/heure du
// formulaire de rendez-vous ci-dessous plutôt que de réserver un vrai
// slot serveur. À remplacer par un vrai référentiel de disponibilités
// dès qu'il existera côté API.
const CRENEAUX_EXEMPLE = ['08:30', '09:15', '10:00', '14:00', '14:45', '16:30'];

export default function ProfilMedecin() {
  // ⚠️ Suppose une route déclarée `/profil/:id` (cohérent avec les
  // <Link to={`/profil/${m.medecin_id}`}> de Medecin.jsx). À ajuster
  // si le nom du paramètre de route diffère réellement.
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('presentation');

  const [medecin, setMedecin] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

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
  function allerVersRendezVous(type, heureCreneau) {
    const params = new URLSearchParams({ type });
    if (heureCreneau) params.set('heure', heureCreneau);
    navigate(`/rendez-vous/${id}?${params.toString()}`);
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
              </div>
            </div>
            <div className="profile-actions">
              <button type="button" className="btn btn-primary btn-lg-aps" onClick={() => allerVersRendezVous('physique')}>
                <i className="fa-solid fa-calendar-check" /> Prendre RDV
              </button>
              {medecin.teleconsultation_activee && (
                <button type="button" className="btn btn-outline-primary" onClick={() => allerVersRendezVous('teleconsultation')}>
                  <i className="fa-solid fa-video" /> Téléconsulter
                </button>
              )}
              {medecin.utilisateur?.telephone && (
                <a href={`tel:${medecin.utilisateur.telephone}`} className="btn btn-ghost"><i className="fa-solid fa-phone" /></a>
              )}
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
                      <h3><i className="fa-solid fa-location-dot" /> Localisation</h3>
                      <p style={{ fontSize: '.9rem' }}>{localisation || 'Localisation non renseignée'}</p>
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
                      <p style={{ fontSize: '.88rem', color: 'var(--ink-soft)' }}>
                        Les avis patients ne sont pas encore exposés par l&apos;API — cette section sera
                        alimentée dès qu&apos;un endpoint dédié existera côté service.
                      </p>
                    </div>
                  </div>
                )}

                {/* Tarifs */}
                {tab === 'tarifs' && (
                  <div className="tab-panel active">
                    <div className="info-card">
                      <h3><i className="fa-solid fa-money-bill-wave" /> Tarifs</h3>
                      {medecin.tarif_indicatif !== undefined && medecin.tarif_indicatif !== null ? (
                        <table className="hours-table">
                          <tbody>
                            <tr>
                              <td>Consultation (tarif indicatif)</td>
                              <td>{Number(medecin.tarif_indicatif).toLocaleString('fr-FR')} FCFA</td>
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
                <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>Choisissez un créneau indicatif ou saisissez votre propre date.</p>
                <div className="slot-mini-grid">
                  {CRENEAUX_EXEMPLE.map((slot) => (
                    <button
                      type="button"
                      className="slot-mini"
                      key={slot}
                      onClick={() => allerVersRendezVous('physique', slot)}
                      style={{ cursor: 'pointer', border: 0 }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn btn-primary btn-block-aps mt-3" onClick={() => allerVersRendezVous('physique')}>
                  Prendre rendez-vous
                </button>
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