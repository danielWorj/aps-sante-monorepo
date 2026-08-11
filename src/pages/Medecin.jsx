import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import med1 from '../assets/img/med1.jpg';
import pub4 from '../assets/img/ads/pub4.jpg';
import {
  listerMedecins,
  listerSpecialites,
  creerMedecin,
} from '../services/medecinService';
// Référentiels géographiques (Pays / Ville) : geoService.js est la
// source unique (routes génériques /pays, /villes, partagées par tous
// les modules annuaire) — voir src/services/geoService.js.
import { listerPays, listerVilles } from '../services/geoService';
// Styles spécifiques à la page : modal "Devenir médecin" élégant +
// zones d'upload (fichier à placer à côté de ce composant).
import './../assets/styles/medecin.css';

const RESULTATS_PAR_PAGE = 10;

// Photo par défaut si le médecin n'a pas encore de photo_url (nullable
// en base — voir schema.prisma).
const PHOTO_PAR_DEFAUT = med1;

// Champs par défaut du formulaire de création. Reflète exactement les
// champs obligatoires de POST /medecins (voir medecin.controller.js,
// creerMedecin : nom, prenom, email, pays_id, specialite_id,
// numero_ordre, pays_exercice_id, ville_exercice_id,
// teleconsultation_activee, tarif_indicatif + fichiers cni/attestation
// obligatoires, photo optionnelle).
const FORMULAIRE_VIDE = {
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  pays_id: '',
  specialite_id: '',
  numero_ordre: '',
  pays_exercice_id: '',
  ville_exercice_id: '',
  teleconsultation_activee: false,
  tarif_indicatif: '',
};

// Étapes du wizard "Devenir médecin" (1 → 2 → 3 → 4)
const ETAPES_FORMULAIRE = [
  { id: 1, libelle: 'Informations' },
  { id: 2, libelle: 'Spécialité & Ordre' },
  { id: 3, libelle: 'Justificatifs' },
  { id: 4, libelle: 'Confirmation' },
];

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

  // Pop-up "Devenir médecin"
  const [popupOuvert, setPopupOuvert] = useState(false);

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
                <button type="button" className="btn btn-primary" onClick={() => setPopupOuvert(true)}>
                  <i className="fa-solid fa-user-doctor" /> Devenir médecin
                </button>
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

      {popupOuvert && (
        <DevenirMedecinModal
          specialites={specialites}
          pays={pays}
          onFermer={() => setPopupOuvert(false)}
        />
      )}
    </>
  );
}

/* =====================================================================
   Zone d'upload élégante — pointillés, icône à gauche, texte centré
   (conforme à la maquette : "Glissez le fichier ici / PDF, JPG — 5 Mo max")
===================================================================== */
function Dropzone({ id, label, icone, accept, fichier, onFichier, optionnel }) {
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef(null);
  return (
    <div className="mb-3">
      <label className="form-label-aps" htmlFor={id}>
        {label}
        {!optionnel && <span className="dm-star" title="Obligatoire">*</span>}
      </label>
      <div
        className={`dropzone ${fichier ? 'has-file' : ''} ${survol ? 'is-dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFichier(f);
        }}
      >
        <i className={`fa-solid ${icone} dropzone-icon`} />
        {fichier ? (
          <>
            <strong className="dropzone-title">{fichier.name}</strong>
            <span className="dropzone-hint">
              <i className="fa-solid fa-circle-check" /> Fichier prêt pour l&apos;envoi
            </span>
          </>
        ) : (
          <>
            <strong className="dropzone-title">Glissez le fichier ici</strong>
            <span className="dropzone-hint">PDF, JPG — 5 Mo max</span>
          </>
        )}
        <button
          type="button"
          className="dropzone-remove"
          aria-label="Retirer le fichier"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inputRef.current) inputRef.current.value = '';
            onFichier(null);
          }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
        <input
          ref={inputRef}
          type="file"
          id={id}
          accept={accept}
          onChange={(e) => onFichier(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
}

/* =====================================================================
   Stepper du wizard — pastilles numérotées + lignes de liaison
   (étape active/validée en vert, comme la maquette)
===================================================================== */
function Stepper({ etape, onNaviguer }) {
  return (
    <div className="dm-stepper" aria-label="Étapes du formulaire">
      {ETAPES_FORMULAIRE.map((e, i) => (
        <Fragment key={e.id}>
          {i > 0 && <span className={`dm-step-line ${etape >= e.id ? 'done' : ''}`} />}
          <button
            type="button"
            className={`dm-step ${etape === e.id ? 'active' : ''} ${etape > e.id ? 'done' : ''}`}
            onClick={() => onNaviguer(e.id)}
            disabled={e.id >= etape}
            aria-current={etape === e.id ? 'step' : undefined}
          >
            <span className="dm-step-dot">
              {etape > e.id ? <i className="fa-solid fa-check" /> : e.id}
            </span>
            <span className="dm-step-label">{e.libelle}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/* =====================================================================
   Pop-up "Devenir médecin" — wizard en 4 étapes :
   1 Informations → 2 Spécialité & Ordre → 3 Justificatifs → 4 Confirmation
   ⚠️ POST /medecins est réservé à admin/superadmin côté backend (voir
   medecin.routes.js : authentifier + autoriser("admin","superadmin")).
===================================================================== */
function DevenirMedecinModal({ specialites, pays, onFermer }) {
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [villes, setVilles] = useState([]);
  const [fichiers, setFichiers] = useState({ cni: null, attestation: null, photo: null });
  const [etape, setEtape] = useState(1);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null); // { medecin, utilisateur } après succès

  useEffect(() => {
    if (!form.pays_exercice_id) {
      setVilles([]);
      return;
    }
    listerVilles(form.pays_exercice_id)
      .then((donnees) => setVilles(donnees.villes || []))
      .catch(() => setVilles([]));
  }, [form.pays_exercice_id]);

  function majChamp(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  /* ------------------------- Validation par étape ------------------------- */
  function etapeValide(num) {
    if (num === 1) {
      return (
        form.nom.trim() !== '' &&
        form.prenom.trim() !== '' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      );
    }
    if (num === 2) {
      return (
        form.pays_id !== '' &&
        form.specialite_id !== '' &&
        form.numero_ordre.trim() !== '' &&
        form.pays_exercice_id !== '' &&
        form.ville_exercice_id !== '' &&
        form.tarif_indicatif !== ''
      );
    }
    if (num === 3) {
      return Boolean(fichiers.cni) && Boolean(fichiers.attestation);
    }
    return true;
  }

  const ERREURS_ETAPES = {
    1: 'Veuillez renseigner le nom, le prénom et un email valide.',
    2: 'Veuillez compléter tous les champs obligatoires (pays, spécialité, n° d\u2019ordre, ville, tarif).',
    3: 'La CNI et l\u2019attestation sont obligatoires.',
  };

  function continuer() {
    setErreur(null);
    if (!etapeValide(etape)) {
      setErreur(ERREURS_ETAPES[etape]);
      return;
    }
    setEtape((e) => Math.min(4, e + 1));
  }

  function precedent() {
    setErreur(null);
    setEtape((e) => Math.max(1, e - 1));
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreur(null);
    // Double contrôle avant envoi (parcours complet 1→4)
    if (!etapeValide(1) || !etapeValide(2)) { setEtape(!etapeValide(1) ? 1 : 2); return; }
    if (!fichiers.cni || !fichiers.attestation) {
      setEtape(3);
      setErreur('La CNI et l\u2019attestation sont obligatoires.');
      return;
    }
    setEnvoi(true);
    try {
      const donnees = await creerMedecin(form, fichiers);
      setResultat(donnees);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  /* Libellés pour le récapitulatif (étape 4) */
  const nomSpecialite = specialites.find((s) => s.specialite_id === form.specialite_id)?.nom || '—';
  const nomPaysCompte = pays.find((p) => p.pays_id === form.pays_id)?.nom || '—';
  const nomPaysExercice = pays.find((p) => p.pays_id === form.pays_exercice_id)?.nom || '—';
  const nomVilleExercice = villes.find((v) => v.ville_id === form.ville_exercice_id)?.nom || '—';

  return (
    <div className="dm-overlay" role="dialog" aria-modal="true" onClick={onFermer}>
      <div className="dm-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* ---------- En-tête ---------- */}
        <div className="dm-modal-head">
          <div className="dm-head-icon"><i className="fa-solid fa-user-doctor" /></div>
          <div className="dm-head-text">
            <h3>Devenir médecin</h3>
            <p>Rejoignez le réseau de soins APS — fiche vérifiée par l&apos;Ordre.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm-aps" onClick={onFermer} aria-label="Fermer">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {resultat ? (
          <div className="form-done">
            <div className="form-done-check"><i className="fa-solid fa-check" /></div>
            <p>
              Fiche médecin créée avec succès pour{' '}
              <strong>{resultat.utilisateur.prenom} {resultat.utilisateur.nom}</strong>.
            </p>
            <p className="dm-password-note">
              Mot de passe temporaire (à communiquer une seule fois, non récupérable ensuite) :{' '}
              <code>{resultat.utilisateur.mot_de_passe_temporaire}</code>
            </p>
            <button type="button" className="btn btn-primary" onClick={onFermer}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={soumettre}>
            {/* ---------- Stepper 1 → 4 ---------- */}
            <Stepper etape={etape} onNaviguer={(id) => id < etape && setEtape(id)} />

            {/* ================= ÉTAPE 1 — Informations ================= */}
            {etape === 1 && (
              <div className="dm-step-panel">
                <div className="dm-section">Identité du praticien</div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-nom">Nom</label>
                    <input className="form-control" id="dm-nom" required value={form.nom}
                      placeholder="Ex. Kamga" onChange={(e) => majChamp('nom', e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-prenom">Prénom</label>
                    <input className="form-control" id="dm-prenom" required value={form.prenom}
                      placeholder="Ex. Aïcha" onChange={(e) => majChamp('prenom', e.target.value)} />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-email">Email professionnel</label>
                    <input type="email" className="form-control" id="dm-email" required value={form.email}
                      placeholder="dr.nom@clinique.cm" onChange={(e) => majChamp('email', e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-telephone">Téléphone (optionnel)</label>
                    <input className="form-control" id="dm-telephone" value={form.telephone}
                      placeholder="+237 6 XX XX XX XX" onChange={(e) => majChamp('telephone', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* ================= ÉTAPE 2 — Spécialité & Ordre ================= */}
            {etape === 2 && (
              <div className="dm-step-panel">
                <div className="dm-section">Exercice &amp; tarification</div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-pays-compte">Pays (compte utilisateur)</label>
                    <select className="form-select" id="dm-pays-compte" required value={form.pays_id}
                      onChange={(e) => majChamp('pays_id', e.target.value)}>
                      <option value="">Sélectionner...</option>
                      {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-specialite">Spécialité</label>
                    <select className="form-select" id="dm-specialite" required value={form.specialite_id}
                      onChange={(e) => majChamp('specialite_id', e.target.value)}>
                      <option value="">Sélectionner...</option>
                      {specialites.map((s) => <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-numero-ordre">Numéro d&apos;ordre</label>
                    <input className="form-control" id="dm-numero-ordre" required value={form.numero_ordre}
                      placeholder="Ex. ORD-2026-0145" onChange={(e) => majChamp('numero_ordre', e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-tarif">Tarif indicatif (FCFA)</label>
                    <input type="number" min="0" step="1" className="form-control" id="dm-tarif" required
                      value={form.tarif_indicatif} onChange={(e) => majChamp('tarif_indicatif', e.target.value)} />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-pays-exercice">Pays d&apos;exercice</label>
                    <select
                      className="form-select"
                      id="dm-pays-exercice"
                      required
                      value={form.pays_exercice_id}
                      onChange={(e) => {
                        majChamp('pays_exercice_id', e.target.value);
                        majChamp('ville_exercice_id', '');
                      }}
                    >
                      <option value="">Sélectionner...</option>
                      {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="dm-ville-exercice">Ville d&apos;exercice</label>
                    <select
                      className="form-select"
                      id="dm-ville-exercice"
                      required
                      value={form.ville_exercice_id}
                      onChange={(e) => majChamp('ville_exercice_id', e.target.value)}
                      disabled={!form.pays_exercice_id}
                    >
                      <option value="">Sélectionner...</option>
                      {villes.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-check form-switch dm-switch">
                  <input
                    type="checkbox" className="form-check-input" id="dm-teleconsultation"
                    checked={form.teleconsultation_activee}
                    onChange={(e) => majChamp('teleconsultation_activee', e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="dm-teleconsultation">
                    Téléconsultation activée
                    <span className="dm-switch-hint">Consultations à distance via APS</span>
                  </label>
                </div>
              </div>
            )}

            {/* ================= ÉTAPE 3 — Justificatifs ================= */}
            {etape === 3 && (
              <div className="dm-step-panel">
                <div className="dm-section">Documents justificatifs</div>
                <Dropzone
                  id="dm-cni"
                  label="Pièce d'identité"
                  icone="fa-id-card"
                  accept="image/*,.pdf"
                  fichier={fichiers.cni}
                  onFichier={(f) => setFichiers((s) => ({ ...s, cni: f }))}
                />
                <Dropzone
                  id="dm-attestation"
                  label="Attestation d'inscription à l'Ordre"
                  icone="fa-file-shield"
                  accept="image/*,.pdf"
                  fichier={fichiers.attestation}
                  onFichier={(f) => setFichiers((s) => ({ ...s, attestation: f }))}
                />
                <Dropzone
                  id="dm-photo"
                  label="Photo de profil (optionnel)"
                  icone="fa-camera"
                  accept="image/*"
                  optionnel
                  fichier={fichiers.photo}
                  onFichier={(f) => setFichiers((s) => ({ ...s, photo: f }))}
                />
              </div>
            )}

            {/* ================= ÉTAPE 4 — Confirmation ================= */}
            {etape === 4 && (
              <div className="dm-step-panel">
                <div className="dm-section">Récapitulatif</div>
                <div className="dm-recap">
                  <div className="dm-recap-row"><span>Praticien</span><strong>Dr {form.prenom} {form.nom}</strong></div>
                  <div className="dm-recap-row"><span>Email professionnel</span><strong>{form.email}</strong></div>
                  {form.telephone && (
                    <div className="dm-recap-row"><span>Téléphone</span><strong>{form.telephone}</strong></div>
                  )}
                  <div className="dm-recap-row"><span>Pays (compte)</span><strong>{nomPaysCompte}</strong></div>
                  <div className="dm-recap-row"><span>Spécialité</span><strong>{nomSpecialite}</strong></div>
                  <div className="dm-recap-row"><span>Numéro d&apos;ordre</span><strong>{form.numero_ordre}</strong></div>
                  <div className="dm-recap-row"><span>Lieu d&apos;exercice</span><strong>{nomVilleExercice} — {nomPaysExercice}</strong></div>
                  <div className="dm-recap-row">
                    <span>Téléconsultation</span>
                    <strong>{form.teleconsultation_activee ? 'Activée' : 'Non activée'}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span>Tarif indicatif</span>
                    <strong>{Number(form.tarif_indicatif || 0).toLocaleString('fr-FR')} FCFA</strong>
                  </div>
                </div>

                <div className="dm-section">Documents joints</div>
                <div className="dm-recap">
                  <div className="dm-recap-row">
                    <span><i className="fa-solid fa-id-card" /> Pièce d&apos;identité</span>
                    <strong>{fichiers.cni?.name}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span><i className="fa-solid fa-file-shield" /> Attestation d&apos;inscription à l&apos;Ordre</span>
                    <strong>{fichiers.attestation?.name}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span><i className="fa-solid fa-camera" /> Photo de profil</span>
                    <strong>{fichiers.photo?.name || 'Non fournie'}</strong>
                  </div>
                </div>

                <p className="dm-password-note">
                  À la création, un mot de passe temporaire sera généré et affiché une seule fois.
                </p>
              </div>
            )}

            {erreur && (
              <div className="dm-error">
                <i className="fa-solid fa-triangle-exclamation" /> {erreur}
              </div>
            )}

            {/* ---------- Pied : navigation entre étapes ---------- */}
            <div className="dm-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={etape === 1 ? onFermer : precedent}
                disabled={envoi}
              >
                {etape === 1 ? 'Annuler' : <><i className="fa-solid fa-arrow-left" /> Précédent</>}
              </button>
              {etape < 4 ? (
                <button type="button" className="btn btn-primary" onClick={continuer}>
                  Continuer <i className="fa-solid fa-arrow-right" />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={envoi}>
                  {envoi
                    ? <><i className="fa-solid fa-circle-notch fa-spin" /> Envoi...</>
                    : <><i className="fa-solid fa-paper-plane" /> Créer la fiche médecin</>}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}