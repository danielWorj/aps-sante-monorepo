// FicheLaboratoire.jsx — fiche publique d'un laboratoire d'analyses.
//
// Même gabarit que FicheAssurance.jsx : en-tête (logo, nom, lieu, note),
// onglets — Informations, Examens, Centres, Avis, Galerie — et colonne de
// contact à droite. Les actions du visiteur (appel, e-mail, itinéraire,
// partage, consultation des examens / des avis) sont signalées au serveur
// pour le tableau de bord du laboratoire (POST /laboratoires/:id/engagements).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import GoogleMapView from '../components/maps/GoogleMapView';
import { Etoiles, SaisieEtoiles } from '../components/avis/Etoiles';
import { useToast } from '../components/feedback';
import { useAuth } from '../context/AuthContext';
import { obtenirPosition } from '../lib/geolocConsentement';
import {
  deposerAvis,
  formaterPrix,
  listerAvis,
  listerCentres,
  listerExamens,
  listerMediasPublics,
  obtenirLaboratoire,
  signalerEngagement,
} from '../services/laboratoireService';
import '../assets/styles/laboratoire.css';

function distanceKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const itineraire = (p) => (p ? `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}` : null);
const dateCourte = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/* ============================ Informations ============================ */

function PanneauInfos({ labo }) {
  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3><i className="fa-solid fa-flask-vial" /> Informations générales</h3>
        <table className="hours-table" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '200px' }} /><col /></colgroup>
          <tbody>
            <tr><td>Laboratoire</td><td>{labo.nom}</td></tr>
            <tr><td>Agrément</td><td>{labo.agrement}</td></tr>
            <tr><td>Adresse</td><td>{[labo.localisation, labo.ville?.nom, labo.pays?.nom].filter(Boolean).join(', ')}</td></tr>
            <tr><td>Téléphone</td><td><a href={`tel:${labo.telephone}`} onClick={() => signalerEngagement(labo.laboratoire_id, 'clic_telephone')}>{labo.telephone}</a></td></tr>
            <tr><td>Courriel</td><td><a href={`mailto:${labo.email}`} onClick={() => signalerEngagement(labo.laboratoire_id, 'clic_email')}>{labo.email}</a></td></tr>
          </tbody>
        </table>
      </div>
      {labo.description && (
        <div className="info-card">
          <h3><i className="fa-solid fa-circle-info" /> Présentation</h3>
          <p style={{ fontSize: '.9rem', whiteSpace: 'pre-line' }}>{labo.description}</p>
        </div>
      )}
      {labo.geolocalisation && (
        <div className="info-card">
          <h3><i className="fa-solid fa-map-location-dot" /> Localisation</h3>
          <GoogleMapView latitude={labo.geolocalisation.latitude} longitude={labo.geolocalisation.longitude} nom={labo.nom} />
        </div>
      )}
    </div>
  );
}

/* ============================ Examens ============================ */

function PanneauExamens({ labo, examens, categories }) {
  const [categorie, setCategorie] = useState('');
  const [recherche, setRecherche] = useState('');
  const filtres = useMemo(() => examens.filter((e) =>
    (!categorie || e.categorie === categorie)
    && (!recherche.trim() || e.nom.toLowerCase().includes(recherche.trim().toLowerCase()))), [examens, categorie, recherche]);

  if (!examens.length) return <p className="minimal-note">Ce laboratoire n&apos;a pas encore publié la liste de ses examens.</p>;

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <div className="labo-filtres-examens">
          <input className="form-control" placeholder="Rechercher un examen…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un examen" />
          {categories.length > 0 && (
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className={`aps-chip is-sm ${!categorie ? 'is-on' : ''}`} onClick={() => setCategorie('')}>Tous</button>
              {categories.map((c) => (
                <button type="button" key={c} className={`aps-chip is-sm ${categorie === c ? 'is-on' : ''}`} onClick={() => setCategorie(c)}>{c}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {filtres.length === 0 && <p className="minimal-note">Aucun examen pour ces critères.</p>}
      <div className="labo-examens">
        {filtres.map((e) => (
          <div key={e.examen_id} className="labo-examen">
            <div className="labo-examen-tete">
              <div>
                <strong>{e.nom}</strong>
                {e.categorie && <span className="chip chip-complet ms-2">{e.categorie}</span>}
              </div>
              <span className="labo-examen-prix">{formaterPrix(e.prix, labo.devise)}</span>
            </div>
            {e.description && <p className="labo-examen-desc">{e.description}</p>}
            <div className="practitioner-meta">
              {e.delai_resultat && <span><i className="fa-regular fa-clock" /> Résultat : {e.delai_resultat}</span>}
              {e.preparation && <span><i className="fa-solid fa-circle-exclamation" /> {e.preparation}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="minimal-note mt-2 mb-0">
        <i className="fa-solid fa-circle-info" /> Tarifs indicatifs communiqués par le laboratoire, à confirmer sur place.
      </p>
    </div>
  );
}

/* ============================ Centres ============================ */

function PanneauCentres({ labo, centres }) {
  const [position, setPosition] = useState(null);
  const [etatGeo, setEtatGeo] = useState('idle');
  const liste = useMemo(() => {
    if (!position) return centres;
    return centres
      .map((c) => (c.gps ? { ...c, distance: distanceKm(position, { lat: c.gps.latitude, lng: c.gps.longitude }) } : c))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [centres, position]);

  const localiser = () => {
    if (!navigator.geolocation) return setEtatGeo('erreur');
    setEtatGeo('cours');
    obtenirPosition(
      (p) => { setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }); setEtatGeo('idle'); },
      () => setEtatGeo('erreur')
    );
    return undefined;
  };

  if (!centres.length) return <p className="minimal-note">Aucun centre de prélèvement renseigné.</p>;

  return (
    <div className="tab-panel active">
      <button type="button" className="btn btn-outline-primary btn-sm-aps mb-3" onClick={localiser}>
        <i className="fa-solid fa-location-crosshairs" /> {etatGeo === 'cours' ? 'Localisation en cours…' : 'Centres les plus proches de moi'}
      </button>
      {etatGeo === 'erreur' && <p className="minimal-note">Localisation indisponible ou refusée.</p>}
      {liste.map((c) => (
        <div key={c.centre_id} className="insurer-card">
          <div className="insurer-head">
            <div className="d-flex gap-3">
              <div className="insurer-logo"><i className="fa-solid fa-house-medical" /></div>
              <div>
                <h3 style={{ marginBottom: '.3rem' }}>{c.nom}</h3>
                <div className="practitioner-meta">
                  <span><i className="fa-solid fa-location-dot" /> {[c.localisation, c.ville?.nom].filter(Boolean).join(', ')}</span>
                  {'distance' in c && <span>· {c.distance.toFixed(1)} km</span>}
                </div>
                {c.horaires && <div className="practitioner-meta mt-1"><span><i className="fa-regular fa-clock" /> {c.horaires}</span></div>}
              </div>
            </div>
            <div className="practitioner-actions" style={{ marginLeft: 0 }}>
              {c.telephone && (
                <a href={`tel:${c.telephone}`} className="btn btn-outline-primary btn-sm-aps" aria-label={`Appeler ${c.nom}`}
                  onClick={() => signalerEngagement(labo.laboratoire_id, 'clic_telephone')}>
                  <i className="fa-solid fa-phone" />
                </a>
              )}
              {c.gps && (
                <a href={itineraire(c.gps)} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm-aps" aria-label="Itinéraire"
                  onClick={() => signalerEngagement(labo.laboratoire_id, 'clic_itineraire')}>
                  <i className="fa-solid fa-diamond-turn-right" />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ Avis ============================ */

function FormulaireAvis({ laboId, monAvis, onDepose }) {
  const toast = useToast();
  const [note, setNote] = useState(monAvis?.note ?? null);
  const [commentaire, setCommentaire] = useState(monAvis?.commentaire ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const envoyer = async (e) => {
    e.preventDefault();
    if (!note) return setErreur('Choisissez une note.');
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await deposerAvis(laboId, { note, commentaire: commentaire.trim() });
      toast.succes(r.message || 'Avis envoyé.');
      onDepose();
    } catch (err) {
      setErreur(err.data?.message || err.message || "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
    return undefined;
  };

  return (
    <form className="info-card" onSubmit={envoyer}>
      <h3><i className="fa-solid fa-pen-to-square" /> {monAvis ? 'Modifier mon avis' : 'Donner mon avis'}</h3>
      {monAvis && (
        <p className="minimal-note">
          {monAvis.statut_moderation === 'en_attente' && 'Votre avis est en cours de vérification.'}
          {monAvis.statut_moderation === 'publie' && 'Votre avis est publié. Le modifier le renverra en vérification.'}
          {monAvis.statut_moderation === 'rejete' && "Votre avis n'a pas été publié. Vous pouvez le reformuler."}
        </p>
      )}
      <SaisieEtoiles valeur={note} onChange={setNote} nom="note-labo" libelle="Votre note" />
      <textarea className="form-control mt-3" rows={3} maxLength={2000} placeholder="Accueil, délais, qualité du prélèvement… (facultatif)"
        value={commentaire} onChange={(e) => setCommentaire(e.target.value)} aria-label="Commentaire" />
      {erreur && <p className="status-card-error mt-2 mb-0">{erreur}</p>}
      <button type="submit" className="btn btn-primary btn-sm-aps mt-3" disabled={envoi}>
        {envoi ? 'Envoi…' : monAvis ? 'Mettre à jour' : 'Publier mon avis'}
      </button>
    </form>
  );
}

function PanneauAvis({ labo }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState(null);
  const [avis, setAvis] = useState([]);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback((numero) =>
    listerAvis(labo.laboratoire_id, { page: numero, limite: 5 })
      .then((d) => {
        setDonnees(d);
        setAvis((prec) => (numero === 1 ? d.avis : [...prec, ...d.avis]));
        setErreur(null);
      })
      .catch((err) => setErreur(err.message || 'Avis indisponibles.')), [labo.laboratoire_id]);

  useEffect(() => { charger(1); }, [charger]);

  if (erreur && !donnees) return <p className="minimal-note">{erreur}</p>;
  if (!donnees) return <p className="minimal-note">Chargement des avis…</p>;
  const { resume } = donnees;
  const max = Math.max(1, ...Object.values(resume.distribution));
  const peutNoter = user && !labo.est_gestionnaire && !['admin', 'superadmin'].includes(user.role);

  return (
    <div className="tab-panel active">
      <div className="info-card">
        {resume.nombre ? (
          <div className="labo-resume-avis">
            <div className="labo-resume-note">
              <strong>{resume.moyenne.toLocaleString('fr-FR')}</strong>
              <Etoiles valeur={resume.moyenne} />
              <span className="text-faint small">{resume.nombre} avis</span>
            </div>
            <div className="labo-resume-barres">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="labo-barre">
                  <span>{n}</span>
                  <div className="quota-jauge flex-grow-1"><span style={{ width: `${(resume.distribution[n] / max) * 100}%` }} /></div>
                  <span className="text-faint">{resume.distribution[n]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="minimal-note mb-0"><i className="fa-regular fa-star" /> Pas encore d&apos;avis publié sur ce laboratoire.</p>
        )}
      </div>

      {peutNoter && <FormulaireAvis key={donnees.mon_avis?.avis_id ?? 'nouveau'} laboId={labo.laboratoire_id} monAvis={donnees.mon_avis} onDepose={() => { setPage(1); charger(1); }} />}
      {!user && (
        <p className="minimal-note"><i className="fa-solid fa-circle-info" /> <Link to="/login">Connectez-vous</Link> pour donner votre avis.</p>
      )}

      {avis.map((a) => (
        <article key={a.avis_id} className="carte-avis">
          <header className="carte-avis-entete">
            <div className="carte-avis-avatar" aria-hidden="true">{a.auteur.charAt(0)}</div>
            <div className="carte-avis-qui">
              <div className="carte-avis-nom">{a.auteur}</div>
              <div className="carte-avis-meta">{dateCourte(a.date_creation)}</div>
            </div>
            <div className="carte-avis-note"><Etoiles valeur={a.note} taille="sm" /><strong>{a.note}/5</strong></div>
          </header>
          {a.commentaire ? <p className="carte-avis-texte">{a.commentaire}</p> : <p className="carte-avis-texte is-vide">Note sans commentaire.</p>}
        </article>
      ))}
      {donnees.pagination.page < donnees.pagination.pages && (
        <div className="text-center mt-3">
          <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={() => { const p = page + 1; setPage(p); charger(p); }}>
            Voir plus d&apos;avis
          </button>
        </div>
      )}
      <p className="avis-publics-note mt-3">
        <i className="fa-solid fa-shield-halved" /> Chaque avis est vérifié par ApSa avant publication.
      </p>
    </div>
  );
}

/* ============================ Galerie ============================ */

function PanneauGalerie({ medias }) {
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-photo-film" /> Galerie</h3>
      <div className="galerie-assurance">
        {medias.map((m) => (
          <figure key={m.media_id}>
            {m.type === 'video'
              ? <video src={m.url} poster={m.vignette_url} controls preload="none" />
              : <a href={m.url} target="_blank" rel="noreferrer"><img src={m.vignette_url} alt={m.titre || 'Photo'} loading="lazy" /></a>}
            {m.titre && <figcaption>{m.titre}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
}

/* ============================ Contact ============================ */

function CarteContact({ labo }) {
  const toast = useToast();
  const id = labo.laboratoire_id;
  const partager = async () => {
    signalerEngagement(id, 'partage');
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: labo.nom, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.succes('Lien de la fiche copié.');
      }
    } catch {
      /* partage annulé par l'utilisateur */
    }
  };
  return (
    <div className="info-card labo-contact">
      <h3><i className="fa-solid fa-address-card" /> Contacter le laboratoire</h3>
      <a href={`tel:${labo.telephone}`} className="btn btn-primary btn-block-aps" onClick={() => signalerEngagement(id, 'clic_telephone')}>
        <i className="fa-solid fa-phone" /> Appeler {labo.telephone}
      </a>
      <a href={`mailto:${labo.email}`} className="btn btn-outline-primary btn-block-aps" onClick={() => signalerEngagement(id, 'clic_email')}>
        <i className="fa-solid fa-envelope" /> Écrire un e-mail
      </a>
      {labo.geolocalisation && (
        <a href={itineraire(labo.geolocalisation)} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-block-aps"
          onClick={() => signalerEngagement(id, 'clic_itineraire')}>
          <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
        </a>
      )}
      <button type="button" className="btn btn-ghost btn-block-aps" onClick={partager}>
        <i className="fa-solid fa-share-nodes" /> Partager la fiche
      </button>
      <p className="minimal-note mt-2 mb-0">
        <i className="fa-solid fa-circle-info" /> Les résultats d&apos;analyses sont remis directement par le laboratoire.
      </p>
    </div>
  );
}

/* ============================ Page ============================ */

export default function FicheLaboratoire() {
  const { id } = useParams();
  const [labo, setLabo] = useState(null);
  const [examens, setExamens] = useState({ examens: [], categories: [] });
  const [centres, setCentres] = useState([]);
  const [medias, setMedias] = useState([]);
  const [etat, setEtat] = useState('chargement'); // chargement | pret | introuvable | erreur
  const [onglet, setOnglet] = useState('infos');

  useEffect(() => {
    let annule = false;
    Promise.all([obtenirLaboratoire(id), listerExamens(id), listerCentres(id), listerMediasPublics(id).catch(() => [])])
      .then(([l, ex, ce, me]) => {
        if (annule) return;
        setLabo(l);
        setExamens(ex);
        setCentres(ce);
        setMedias(me);
        setOnglet('infos');
        setEtat('pret');
      })
      .catch((err) => { if (!annule) setEtat(err.status === 404 ? 'introuvable' : 'erreur'); });
    return () => { annule = true; };
  }, [id]);

  const ouvrir = (cle) => {
    setOnglet(cle);
    if (cle === 'examens') signalerEngagement(id, 'lecture_examens');
    if (cle === 'avis') signalerEngagement(id, 'lecture_avis');
  };

  if (etat === 'chargement') {
    return <div className="container-aps" style={{ padding: '3rem 0' }}><p className="minimal-note">Chargement de la fiche…</p></div>;
  }
  if (etat !== 'pret' || !labo) {
    return (
      <section style={{ padding: '3rem 0' }}>
        <div className="container-aps" style={{ maxWidth: 560, textAlign: 'center' }}>
          <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '1.8rem', color: 'var(--ink-faint)' }} />
          <h1 style={{ fontSize: '1.4rem', marginTop: '1rem' }}>{etat === 'introuvable' ? 'Fiche introuvable' : 'Fiche indisponible'}</h1>
          <p className="mt-2">
            {etat === 'introuvable'
              ? "Ce laboratoire n'existe pas ou n'est plus référencé dans l'annuaire."
              : 'La fiche ne peut pas être affichée pour le moment. Réessayez dans un instant.'}
          </p>
          <Link to="/laboratoires" className="btn btn-primary btn-sm-aps mt-2">Retour à l&apos;annuaire</Link>
        </div>
      </section>
    );
  }

  const onglets = [
    { cle: 'infos', libelle: 'Informations' },
    { cle: 'examens', libelle: `Examens (${examens.examens.length})` },
    { cle: 'centres', libelle: `Centres (${centres.length})` },
    { cle: 'avis', libelle: `Avis (${labo.resume_avis?.nombre ?? 0})` },
    ...(medias.length ? [{ cle: 'galerie', libelle: `Galerie (${medias.length})` }] : []),
  ];

  return (
    <>
      <div className="container-aps" style={{ paddingTop: '1.1rem', fontSize: '.82rem' }}>
        <Link to="/" className="text-muted-soft">Accueil</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/laboratoires" className="text-muted-soft">Laboratoires</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <span className="text-faint">{labo.nom}</span>
      </div>

      {labo.statut_verification !== 'publie' && (
        <div className="container-aps" style={{ paddingTop: '1rem' }}>
          <div className="banner-institutionnel">
            <i className="fa-solid fa-eye" />
            <span>Aperçu de votre fiche : elle n&apos;est pas encore visible du public (vérification par ApSa en cours).</span>
          </div>
        </div>
      )}

      <section className="profile-header" style={{ paddingTop: '1.5rem' }}>
        <div className="container-aps">
          <div className="profile-header-inner">
            <div className="profile-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {labo.image_url
                ? <img src={labo.image_url} alt={labo.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <i className="fa-solid fa-flask-vial" style={{ fontSize: '1.8rem' }} />}
            </div>
            <div>
              <h1>{labo.nom}</h1>
              <div className="practitioner-meta mb-2">
                <span>Laboratoire d&apos;analyses</span>
                <span>&middot;</span>
                <span><i className="fa-solid fa-location-dot" /> {[labo.ville?.nom, labo.pays?.nom].filter(Boolean).join(', ')}</span>
                {labo.resume_avis?.nombre > 0 && (
                  <>
                    <span>&middot;</span>
                    <span><Etoiles valeur={labo.resume_avis.moyenne} taille="sm" /> {labo.resume_avis.moyenne.toLocaleString('fr-FR')} ({labo.resume_avis.nombre})</span>
                  </>
                )}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {labo.statut_verification === 'publie' && <span className="chip chip-verifie"><i className="fa-solid fa-circle-check" /> Vérifié ApSa</span>}
                <span className="chip chip-complet">Agrément {labo.agrement}</span>
              </div>
            </div>
            <div className="profile-actions">
              <a href={`tel:${labo.telephone}`} className="btn btn-primary btn-lg-aps" onClick={() => signalerEngagement(id, 'clic_telephone')}>
                <i className="fa-solid fa-phone" /> Appeler
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => ouvrir('examens')}>
                <i className="fa-solid fa-vials" /> Examens
              </button>
            </div>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: '1.5rem' }}>
        <div className="container-aps">
          <div className="row g-4">
            <div className="col-lg-8">
              <div className="aps-tabs">
                {onglets.map((o) => (
                  <button key={o.cle} type="button" className={onglet === o.cle ? 'active' : ''} onClick={() => ouvrir(o.cle)}>{o.libelle}</button>
                ))}
              </div>
              {onglet === 'infos' && <PanneauInfos labo={labo} />}
              {onglet === 'examens' && <PanneauExamens labo={labo} examens={examens.examens} categories={examens.categories} />}
              {onglet === 'centres' && <PanneauCentres labo={labo} centres={centres} />}
              {onglet === 'avis' && <PanneauAvis labo={labo} />}
              {onglet === 'galerie' && <PanneauGalerie medias={medias} />}
            </div>
            <div className="col-lg-4">
              <CarteContact labo={labo} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
