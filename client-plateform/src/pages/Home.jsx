import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ApsSelect from '../components/ui/ApsSelect';
import heroImg from '../assets/img/med7.jpg';
import parcoursImg from '../assets/img/structure2.jpg';
import pharmaImg from '../assets/img/pharma1.jpg';
import structureImg from '../assets/img/structure1.jpg';
import assuranceImg from '../assets/img/structure3.jpg';
import laboratoireImg from '../assets/img/structure4.jpg';
import medecinParDefaut from '../assets/img/med1.jpg';
import mobileApp from '../assets/img/mobileapp.png';
import { useTelechargementApk } from '../hooks/useTelechargementApk';
import ApkPreteModal from '../components/apk/ApkPreteModal';
import { listerMedecins, listerSpecialites } from '../services/medecinService';
import '../assets/styles/home-2026.css';
import { usePays } from '../context/PaysContext';
import ChoixPays from '../components/geoloc/ChoixPays';
import { aUnTarif, libelleTarif } from '../utils/tarif';

// Accueil public — refonte UI web 2026 (mobile/new-web-ui.html, écran 01) :
// bloc d'accroche sur fond vert très clair avec barre de recherche, services,
// médecins en cartes photo, parcours, annuaires, application, bandeau pro.

const NB_MEDECINS_ACCUEIL = 4;

const SERVICES = [
  {
    to: '/medecin', icone: 'fa-stethoscope', ton: '', vert: true,
    titre: 'Consultation au cabinet',
    texte: 'Choisissez un créneau parmi les disponibilités du médecin, confirmées en temps réel.',
    action: 'Prendre RDV',
  },
  {
    to: '/medecin', icone: 'fa-video', ton: 'is-sky',
    titre: 'Téléconsultation',
    texte: 'Consultez en vidéo depuis chez vous, ordonnance envoyée dans votre espace.',
    action: 'Consulter en vidéo',
  },
  {
    to: '/demande-rapide', icone: 'fa-bullhorn', ton: 'is-violet',
    titre: 'Demande express',
    texte: 'Fixez le jour et l’heure, les médecins disponibles vous répondent.',
    action: 'Publier une demande',
  },
  {
    to: '/pharmacie', icone: 'fa-prescription-bottle-medical', ton: '',
    titre: 'Pharmacies de garde',
    texte: 'Les pharmacies ouvertes autour de vous, avec appel direct et itinéraire.',
    action: 'Voir les gardes',
  },
  {
    to: '/structure-sante', icone: 'fa-hospital', ton: 'is-amber',
    titre: 'Structures de santé',
    texte: 'Hôpitaux, cliniques et laboratoires, avec leurs services et leurs médecins.',
    action: 'Explorer',
  },
  {
    to: '/assurance', icone: 'fa-shield-heart', ton: 'is-coral',
    titre: 'Assurances santé',
    texte: 'Comparez les offres des assureurs partenaires, un conseiller vous recontacte.',
    action: 'Comparer',
  },
];

const ETAPES = [
  {
    titre: 'Choisissez un créneau',
    texte: 'Filtrez par spécialité, ville et type de consultation. Chaque fiche affiche ses disponibilités.',
  },
  {
    titre: 'Payez par Mobile Money',
    texte: 'MTN MoMo ou Orange Money. Les fonds restent sous séquestre jusqu’à la consultation.',
  },
  {
    titre: 'Consultez, puis donnez votre avis',
    texte: 'Remettez votre code de consultation au médecin. Votre avis est ensuite marqué « vérifié ».',
  },
];

const GARANTIES = [
  { icone: 'fa-user-check', titre: 'Vérifiés à l’Ordre', texte: 'Chaque médecin est contrôlé' },
  { icone: 'fa-lock', titre: 'Paiement sous séquestre', texte: 'Versé après la consultation' },
  { icone: 'fa-mobile-screen', titre: 'Mobile Money', texte: 'MTN MoMo · Orange Money' },
  { icone: 'fa-earth-africa', titre: 'Plusieurs pays', texte: 'Numéros d’urgence locaux' },
];

function nomMedecin(m) {
  return `Dr ${m.utilisateur?.prenom || ''} ${m.utilisateur?.nom || ''}`.trim();
}

function formaterNote(n) {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/* Carte annuaire : photo pleine, bloc d'informations posé dessus. */
function CarteMedecin({ m }) {
  const lieu = [m.specialite?.nom, m.ville_exercice?.nom].filter(Boolean).join(' · ');
  return (
    <Link to={`/profil/${m.medecin_id}`} className="aps-dc">
      <img src={m.photo_url || medecinParDefaut} alt="" loading="lazy" />
      <div className="aps-dc-top">
        {m.teleconsultation_activee ? (
          <span className="aps-pill is-white"><i className="fa-solid fa-video" style={{ color: 'var(--info)' }} /> Vidéo</span>
        ) : (
          <span className="aps-pill is-white"><span className="d" /> Au cabinet</span>
        )}
      </div>
      <div className="aps-dc-info">
        <div className="aps-dc-nm">
          {nomMedecin(m)}
          {m.statut_verification === 'publie' && <i className="fa-solid fa-circle-check verif" title="Vérifié" />}
        </div>
        <div className="aps-dc-sp">{lieu || 'Spécialité non renseignée'}</div>
        <div className="aps-dc-ft">
          {m.nombre_avis > 0 ? (
            <span className="aps-stars">
              <i className="fa-solid fa-star" /> {formaterNote(m.note_moyenne)}
              <span className="aps-t-xs">({m.nombre_avis})</span>
            </span>
          ) : (
            <span className="aps-t-xs">Nouveau</span>
          )}
          {aUnTarif(m.tarif_indicatif) && (
            <span className="aps-dc-tarif">{libelleTarif(m.tarif_indicatif)}</span>
          )}
          <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { hash } = useLocation();

  // Liens « /home#application » (pied de page) : React Router ne fait pas
  // défiler jusqu'à l'ancre, on s'en charge.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  // Recherche du bloc d'accroche : renvoie vers l'annuaire pré-filtré
  // (Medecin.jsx lit specialite_id et recherche dans l'URL).
  const [specialites, setSpecialites] = useState([]);
  const [specialiteId, setSpecialiteId] = useState('');
  const [recherche, setRecherche] = useState('');
  const [medecins, setMedecins] = useState([]);
  // Pays de l'utilisateur (détecté ou choisi) et ses villes.
  const { paysId, villes } = usePays();
  const [villeId, setVilleId] = useState('');

  useEffect(() => { setVilleId(''); }, [paysId]);

  useEffect(() => {
    let annule = false;
    listerSpecialites()
      .then((s) => { if (!annule) setSpecialites(s || []); })
      .catch(() => {});
    return () => { annule = true; };
  }, []);

  // Aperçu de l'annuaire : médecins du pays de l'utilisateur (tous les pays
  // s'il n'y en a encore aucun), fiches publiées puis mieux notées d'abord.
  useEffect(() => {
    let annule = false;
    const trier = (liste) => [...(liste || [])].sort((a, b) =>
      (b.statut_verification === 'publie') - (a.statut_verification === 'publie')
      || (Number(b.note_moyenne) || 0) - (Number(a.note_moyenne) || 0));
    (async () => {
      try {
        let liste = await listerMedecins(paysId ? { pays_exercice_id: paysId } : {});
        if (paysId && !liste?.length) liste = await listerMedecins({});
        if (!annule) setMedecins(trier(liste).slice(0, NB_MEDECINS_ACCUEIL));
      } catch {
        // Aperçu facultatif.
      }
    })();
    return () => { annule = true; };
  }, [paysId]);

  function rechercher(e, idSpecialite = specialiteId) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (idSpecialite) params.set('specialite_id', idSpecialite);
    if (paysId) params.set('pays_exercice_id', paysId);
    if (paysId && villeId) params.set('ville_exercice_id', villeId);
    if (recherche.trim()) params.set('recherche', recherche.trim());
    const qs = params.toString();
    navigate(`/medecin${qs ? `?${qs}` : ''}`);
  }

  // Téléchargement de l'APK active (même logique que le pied de page).
  const apk = useTelechargementApk();

  return (
    <div className="home26">
      {/* ============================ ACCROCHE ============================ */}
      <section className="home26-hero-wrap">
        <div className="container-aps">
          <div className="home26-hero">
            <div className="home26-hero-txt">
              <span className="aps-pill home26-badge"><span className="d" /> Médecins vérifiés à l&apos;Ordre</span>
              <h1 className="aps-h1">
                Des soins de qualité,<br />réservés en <span className="home26-accent">quelques clics</span>.
              </h1>
              <p className="aps-t-s home26-lead">
                Trouvez un médecin disponible, une pharmacie de garde ou un hôpital proche.
                Payez par Mobile Money, l&apos;argent n&apos;est versé qu&apos;après la consultation.
              </p>

              <form className="aps-sbar home26-sbar" onSubmit={rechercher}>
                <div className="aps-sbar-f">
                  <i className="fa-solid fa-stethoscope" />
                  <div>
                    <label htmlFor="h-specialite">Spécialité</label>
                    <ApsSelect variante="nu" id="h-specialite" value={specialiteId} onChange={(e) => setSpecialiteId(e.target.value)}>
                      <option value="">Toutes les spécialités</option>
                      {specialites.map((s) => (
                        <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                      ))}
                    </ApsSelect>
                  </div>
                </div>
                {villes.length > 0 && (
                  <div className="aps-sbar-f">
                    <i className="fa-solid fa-location-dot" />
                    <div>
                      <label htmlFor="h-ville">Ville</label>
                      <ApsSelect variante="nu" id="h-ville" value={villeId} onChange={(e) => setVilleId(e.target.value)}>
                        <option value="">Toutes les villes</option>
                        {villes.map((v) => (
                          <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                        ))}
                      </ApsSelect>
                    </div>
                  </div>
                )}
                <div className="aps-sbar-f">
                  <i className="fa-solid fa-user-doctor" />
                  <div>
                    <label htmlFor="h-nom">Médecin</label>
                    <input
                      id="h-nom"
                      type="text"
                      placeholder="Nom ou prénom"
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-lg-aps">
                  <i className="fa-solid fa-magnifying-glass" /> Rechercher
                </button>
              </form>

              <ChoixPays id="h-pays" className="home26-pays" />

              {specialites.length > 0 && (
                <div className="home26-populaires">
                  <span className="aps-t-xs">Populaire :</span>
                  {specialites.slice(0, 4).map((s) => (
                    <button
                      type="button"
                      key={s.specialite_id}
                      className="aps-chip is-sm"
                      onClick={(e) => rechercher(e, s.specialite_id)}
                    >
                      {s.nom}
                    </button>
                  ))}
                </div>
              )}

              <div className="home26-urgence">
                <Link to="/urgences" className="home26-urgence-lnk">
                  <i className="fa-solid fa-truck-medical" /> Une urgence ? Voir les numéros de votre pays
                </Link>
              </div>
            </div>

            <div className="home26-hero-visuel" aria-hidden="true">
              <div className="home26-hero-photo" style={{ backgroundImage: `url(${heroImg})` }} />
              <div className="aps-card has-shadow aps-float home26-flot home26-flot-1">
                <div className="d-flex justify-content-between align-items-center">
                  <span className="aps-pill"><i className="fa-solid fa-check" /> RDV confirmé</span>
                  <span className="aps-t-xs">Demain</span>
                </div>
                <div className="d-flex align-items-center gap-2 mt-3">
                  <span className="aps-ic is-sm"><i className="fa-solid fa-user-doctor" /></span>
                  <div>
                    <div className="home26-flot-t">Code de consultation reçu</div>
                    <div className="aps-t-xs">À remettre au médecin</div>
                  </div>
                </div>
              </div>
              <div className="aps-card has-shadow aps-float home26-flot home26-flot-2" style={{ animationDelay: '-2s' }}>
                <div className="d-flex align-items-center gap-2">
                  <span className="aps-ic is-sm"><i className="fa-solid fa-lock" /></span>
                  <div>
                    <div className="home26-flot-t">Paiement protégé</div>
                    <div className="aps-t-xs">MTN MoMo · Orange Money</div>
                  </div>
                </div>
              </div>
              <div className="aps-card has-shadow aps-float home26-flot home26-flot-3" style={{ animationDelay: '-4s' }}>
                <div className="d-flex align-items-center gap-2">
                  <span className="aps-ic is-sm"><i className="fa-solid fa-prescription-bottle-medical" /></span>
                  <div className="flex-grow-1">
                    <div className="home26-flot-t">Pharmacie de garde</div>
                    <div className="aps-t-xs">Ouverte près de vous</div>
                  </div>
                  <span className="aps-pill"><span className="d" /> 24/7</span>
                </div>
              </div>
            </div>
          </div>

          {/* Garanties */}
          <div className="home26-garanties">
            {GARANTIES.map((g) => (
              <div key={g.titre} className="home26-garantie">
                <span className="aps-ic"><i className={`fa-solid ${g.icone}`} /></span>
                <div>
                  <b>{g.titre}</b>
                  <div className="aps-t-xs">{g.texte}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ SERVICES ============================ */}
      <section className="home26-sec">
        <div className="container-aps">
          <div className="aps-sec-head">
            <div>
              <span className="aps-over">Nos services</span>
              <h2 className="aps-h2 mt-2">Tout votre parcours de soins,<br />au même endroit.</h2>
            </div>
            <p className="aps-t-s">De la recherche d&apos;un médecin à la mise en relation avec votre assurance, sans paperasse.</p>
          </div>
          <div className="aps-grid-3">
            {SERVICES.map((s) => (
              <Link key={s.titre} to={s.to} className={`aps-card ${s.vert ? 'is-green' : ''}`}>
                <span className={`aps-ic ${s.vert ? 'is-white' : s.ton}`}><i className={`fa-solid ${s.icone}`} /></span>
                <h3 className="aps-h4 mt-3">{s.titre}</h3>
                <p className="aps-t-s home26-service-txt">{s.texte}</p>
                <span className="aps-lnk" style={s.vert ? { color: '#fff' } : undefined}>
                  {s.action} <i className="fa-solid fa-arrow-right" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ MÉDECINS ============================ */}
      {medecins.length > 0 && (
        <section className="home26-sec">
          <div className="container-aps">
            <div className="aps-sec-head">
              <div>
                <span className="aps-over">Professionnels vérifiés</span>
                <h2 className="aps-h2 mt-2">Rencontrez nos médecins</h2>
              </div>
              <Link to="/medecin" className="aps-lnk">Tout l&apos;annuaire <i className="fa-solid fa-arrow-right" /></Link>
            </div>
            <div className="aps-grid-4">
              {medecins.map((m) => <CarteMedecin key={m.medecin_id} m={m} />)}
            </div>
            <div className="d-flex justify-content-center mt-4">
              <Link to="/medecin" className="btn btn-outline-primary">
                Voir tous les médecins <i className="fa-solid fa-arrow-right" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ============================ PARCOURS ============================ */}
      <section className="home26-sec">
        <div className="container-aps home26-parcours">
          <div className="home26-parcours-photo" style={{ backgroundImage: `url(${parcoursImg})` }}>
            <div className="aps-card has-shadow home26-sequestre">
              <div className="aps-t-xs">Somme sous séquestre</div>
              <b className="home26-sequestre-montant">Protégée</b>
              <div className="d-flex align-items-center gap-2 mt-2 aps-t-xs" style={{ color: 'var(--ink-soft)' }}>
                <i className="fa-solid fa-lock" style={{ color: 'var(--primary)' }} />
                Versée au médecin après la consultation
              </div>
            </div>
          </div>
          <div>
            <span className="aps-over">Comment ça marche</span>
            <h2 className="aps-h2 mt-2">Trois étapes, aucune surprise.</h2>
            <ol className="home26-etapes">
              {ETAPES.map((e, i) => (
                <li key={e.titre}>
                  <span className={`home26-etape-num ${i === 0 ? 'is-on' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="aps-h4">{e.titre}</h3>
                    <p className="aps-t-s mb-0 mt-1">{e.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ============================ ANNUAIRES ============================ */}
      <section className="home26-sec">
        <div className="container-aps">
          <div className="aps-sec-head">
            <div>
              <span className="aps-over">Près de chez vous</span>
              <h2 className="aps-h2 mt-2">Pharmacies, hôpitaux, laboratoires, assureurs</h2>
            </div>
            <Link to="/pharmacie" className="aps-lnk">Pharmacies de garde <i className="fa-solid fa-arrow-right" /></Link>
          </div>
          <div className="aps-grid-4">
            <Link to="/pharmacie" className="aps-dc is-wide">
              <img src={pharmaImg} alt="" loading="lazy" />
              <div className="aps-dc-top"><span className="aps-pill is-white"><span className="d" /> Gardes en direct</span></div>
              <div className="aps-dc-info">
                <div className="d-flex align-items-center gap-2">
                  <div className="flex-grow-1">
                    <div className="aps-dc-nm">Pharmacies</div>
                    <div className="aps-dc-sp">De garde ou horaires classiques</div>
                  </div>
                  <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
                </div>
              </div>
            </Link>
            <Link to="/structure-sante" className="aps-dc is-wide">
              <img src={structureImg} alt="" loading="lazy" />
              <div className="aps-dc-top"><span className="aps-pill is-white"><span className="d" /> Fiches vérifiées</span></div>
              <div className="aps-dc-info">
                <div className="d-flex align-items-center gap-2">
                  <div className="flex-grow-1">
                    <div className="aps-dc-nm">Structures de santé</div>
                    <div className="aps-dc-sp">Hôpitaux, cliniques, laboratoires</div>
                  </div>
                  <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
                </div>
              </div>
            </Link>
            <Link to="/laboratoires" className="aps-dc is-wide">
              <img src={laboratoireImg} alt="" loading="lazy" />
              <div className="aps-dc-top"><span className="aps-pill is-white"><span className="d" /> Examens &amp; tarifs</span></div>
              <div className="aps-dc-info">
                <div className="d-flex align-items-center gap-2">
                  <div className="flex-grow-1">
                    <div className="aps-dc-nm">Laboratoires</div>
                    <div className="aps-dc-sp">Analyses et centres de prélèvement</div>
                  </div>
                  <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
                </div>
              </div>
            </Link>
            <Link to="/assurance" className="aps-dc is-wide">
              <img src={assuranceImg} alt="" loading="lazy" />
              <div className="aps-dc-top"><span className="aps-pill is-white"><span className="d" /> Mise en relation</span></div>
              <div className="aps-dc-info">
                <div className="d-flex align-items-center gap-2">
                  <div className="flex-grow-1">
                    <div className="aps-dc-nm">Assurances santé</div>
                    <div className="aps-dc-sp">Compagnies et courtiers</div>
                  </div>
                  <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ============================ APPLICATION MOBILE ============================ */}
      <section className="home26-sec" id="application">
        <div className="container-aps">
          <div className="home26-app">
            <div>
              <span className="aps-over">Application mobile</span>
              <h2 className="aps-h2 mt-2">ApSa dans votre poche, où que vous soyez</h2>
              <p className="aps-t-s mt-3" style={{ maxWidth: 480 }}>
                Trouvez un professionnel, prenez rendez-vous et accédez aux numéros d&apos;urgence
                directement depuis votre téléphone.
              </p>
              <ul className="home26-app-liste">
                <li><i className="fa-solid fa-check" /> Recherche et rendez-vous en quelques secondes</li>
                <li><i className="fa-solid fa-check" /> Rappels avant chaque consultation</li>
                <li><i className="fa-solid fa-check" /> Numéros d&apos;urgence et pharmacies de garde</li>
                <li><i className="fa-solid fa-check" /> Installation directe, sans passer par un store</li>
              </ul>

              <div className="d-flex gap-3 flex-wrap align-items-center">
                <button
                  type="button"
                  className="btn btn-dark btn-lg-aps"
                  onClick={apk.lancer}
                  disabled={!apk.disponible || apk.enCours}
                  title={apk.disponible ? undefined : 'Application momentanément indisponible au téléchargement'}
                >
                  {apk.enCours ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" /> Téléchargement… {apk.libelleProgression}
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-download" /> Télécharger l&apos;application
                    </>
                  )}
                </button>
                <span className="aps-t-xs">
                  <i className="fa-brands fa-android" /> Fichier APK · Android 7.0 ou plus
                </span>
              </div>

              {apk.enCours && (
                <div
                  className="progress mt-3"
                  role="progressbar"
                  aria-label="Progression du téléchargement de l'application"
                  aria-valuenow={apk.progression}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ maxWidth: 320 }}
                >
                  <div
                    className={`progress-bar${apk.progression < 100 ? ' progress-bar-striped progress-bar-animated' : ''}`}
                    style={{ width: apk.tailleInconnue ? '100%' : `${apk.progression}%` }}
                  ></div>
                </div>
              )}

              {apk.erreur && (
                <div className="alert alert-danger mt-3 mb-0" style={{ maxWidth: 420 }} role="alert">
                  <i className="fa-solid fa-circle-exclamation me-2" />
                  {apk.erreur}
                </div>
              )}
              <ApkPreteModal apk={apk} />
            </div>

            <div className="home26-app-visuel">
              <div className="app-phone">
                <div className="app-phone-notch" />
                <div className="app-phone-screen">
                  <img src={mobileApp} alt="Aperçu de l'application ApSa" />
                </div>
              </div>
              <div className="app-badge-float app-badge-security">
                <i className="fa-solid fa-shield-halved" /> Fichier vérifié
              </div>
              <div className="app-badge-float app-badge-rating">
                <i className="fa-solid fa-star" /> Simple &amp; rapide
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ BANDEAU PROFESSIONNELS ============================ */}
      <section className="home26-sec home26-sec-last" id="rejoindre">
        <div className="container-aps">
          <div className="home26-pro">
            <div>
              <span className="aps-over" style={{ color: 'var(--primary-tint-strong)' }}>Professionnels de santé</span>
              <h2 className="aps-h2 mt-2" style={{ color: '#fff' }}>Rejoignez ApSa et remplissez votre agenda.</h2>
              <p className="home26-pro-txt">
                Médecins, pharmacies, cliniques et assureurs : un profil vérifié, un agenda en ligne
                et des paiements sécurisés.
              </p>
            </div>
            <div className="home26-pro-liens">
              <Link to="/devenir-medecin"><i className="fa-solid fa-stethoscope" /><b>Devenir médecin partenaire</b><i className="fa-solid fa-arrow-right" /></Link>
              <Link to="/pharmacie/creation"><i className="fa-solid fa-prescription-bottle-medical" /><b>Inscrire ma pharmacie</b><i className="fa-solid fa-arrow-right" /></Link>
              <Link to="/structure-sante/creation"><i className="fa-solid fa-hospital" /><b>Inscrire ma structure de santé</b><i className="fa-solid fa-arrow-right" /></Link>
              <Link to="/laboratoires/creation"><i className="fa-solid fa-flask-vial" /><b>Inscrire mon laboratoire</b><i className="fa-solid fa-arrow-right" /></Link>
              <Link to="/assurances/creation"><i className="fa-solid fa-shield-heart" /><b>Inscrire mon assurance</b><i className="fa-solid fa-arrow-right" /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
