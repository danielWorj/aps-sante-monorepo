// creationLaboratoire.jsx — « Inscrire mon laboratoire » (5 étapes).
//
// Même parcours que creationPharmacie.jsx (form-shell, stepper, upload-box
// de creer-medecin.css) et même contrat serveur que POST /laboratoires :
//   fiche  : nom, description, telephone, email, agrement, pays_id, ville_id,
//            localisation (+ latitude / longitude facultatives)
//   agent  : responsable_moi (fiche rattachée au compte connecté) OU compte
//            d'une autre personne : agent_nom, agent_prenom, agent_telephone,
//            agent_email — fonction dans les deux cas
//   pièces : image_laboratoire, piece_identite (CNI), document_agrement
// La fiche est visible dans l'annuaire après vérification par ApSa.
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../../assets/styles/creer-medecin.css';
import { creerLaboratoire } from '../../services/laboratoireService';
import { listerPays, listerVilles } from '../../services/geoService';
import { useGeolocation } from '../../hooks/useGeolocation';
import GoogleMapPicker from '../maps/GoogleMapPicker';
import { useAuth } from '../../context/AuthContext';

const ETAPES = ['Laboratoire', 'Localisation', 'Responsable', 'Justificatifs', 'Confirmation'];
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INITIAL = {
  nom: '', description: '', telephone: '', email: '', agrement: '', pays_id: '', ville_id: '', localisation: '',
  latitude: '', longitude: '',
  responsable_moi: true, fonction: '', agent_nom: '', agent_prenom: '', agent_email: '', agent_telephone: '',
  image_laboratoire: null, piece_identite: null, document_agrement: null,
  acceptCGU: false,
};

function ZoneFichier({ libelle, nom, accept, aide, valeur, onChange }) {
  return (
    <div className="col-md-4">
      <label className="form-label-aps">{libelle} <span className="required-mark">*</span></label>
      <div className={`upload-box ${valeur ? 'has-file' : ''}`}>
        <input type="file" accept={accept} onChange={(e) => onChange(nom, e.target.files?.[0] || null)} aria-label={libelle} />
        <i className="fa-solid fa-cloud-arrow-up"></i>
        <strong>Glissez le fichier ici</strong>
        <span className="upload-default-text">{aide}</span>
        <span className="upload-filename">{valeur?.name}</span>
        <button type="button" className="upload-remove" onClick={() => onChange(nom, null)} aria-label="Retirer le fichier">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
}

export default function CreationLaboratoire() {
  const { user, rafraichirEspaces } = useAuth();
  const location = useLocation();
  const [etape, setEtape] = useState(1);
  const [form, setForm] = useState(INITIAL);
  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [erreurEtape, setErreurEtape] = useState(null);
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [copie, setCopie] = useState(null);
  const { position, loading: geoEnCours, error: geoErreur, demanderPosition } = useGeolocation();

  useEffect(() => {
    listerPays().then((d) => setPays(d.pays || [])).catch(() => setErreurEnvoi('Impossible de charger la liste des pays. Rechargez la page.'));
  }, []);

  useEffect(() => {
    if (!form.pays_id) return undefined;
    let annule = false;
    listerVilles(form.pays_id).then((d) => { if (!annule) setVilles(d.villes || []); }).catch(() => { if (!annule) setVilles([]); });
    return () => { annule = true; };
  }, [form.pays_id]);

  useEffect(() => {
    if (position) setForm((f) => ({ ...f, latitude: position.latitude, longitude: position.longitude }));
  }, [position]);

  const maj = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value, ...(name === 'pays_id' ? { ville_id: '' } : {}) }));
  };
  const majFichier = (nom, fichier) => setForm((f) => ({ ...f, [nom]: fichier }));

  const valider = (n) => {
    switch (n) {
      case 1:
        if (!form.nom.trim()) return 'Le nom du laboratoire est obligatoire.';
        if (!form.telephone.trim()) return 'Le téléphone est obligatoire.';
        if (!REGEX_EMAIL.test(form.email.trim())) return "L'e-mail du laboratoire n'est pas valide.";
        if (!form.agrement.trim()) return "Le numéro d'agrément est obligatoire.";
        if (!form.pays_id || !form.ville_id) return 'Le pays et la ville sont obligatoires.';
        if (!form.localisation.trim()) return "L'adresse est obligatoire.";
        return null;
      case 2:
        if ((form.latitude === '') !== (form.longitude === '')) return 'Latitude et longitude vont ensemble.';
        return null;
      case 3:
        if (!form.fonction.trim()) return 'La fonction du responsable est obligatoire.';
        if (form.responsable_moi) return null;
        if (!form.agent_nom.trim() || !form.agent_prenom.trim()) return 'Le nom et le prénom du responsable sont obligatoires.';
        if (!form.agent_telephone.trim()) return 'Le téléphone du responsable est obligatoire.';
        if (!REGEX_EMAIL.test(form.agent_email.trim())) return "L'e-mail du responsable n'est pas valide.";
        return null;
      case 4:
        if (!form.image_laboratoire) return 'Le logo ou la photo du laboratoire est obligatoire.';
        if (!form.piece_identite) return 'La CNI du responsable est obligatoire.';
        if (!form.document_agrement) return "Le document d'agrément est obligatoire.";
        return null;
      case 5:
        return form.acceptCGU ? null : 'Vous devez accepter les CGU et la politique de confidentialité.';
      default:
        return null;
    }
  };

  const suivant = () => {
    const err = valider(etape);
    setErreurEtape(err);
    if (!err) setEtape((e) => Math.min(ETAPES.length, e + 1));
  };

  const envoyer = async (e) => {
    e.preventDefault();
    for (let n = 1; n <= ETAPES.length; n++) {
      const err = valider(n);
      if (err) { setEtape(n); setErreurEtape(err); return; }
    }
    setErreurEtape(null);
    setErreurEnvoi(null);
    setEnvoi(true);
    try {
      const r = await creerLaboratoire({
        accepte_cgu: form.acceptCGU,
        nom: form.nom.trim(),
        description: form.description.trim() || undefined,
        telephone: form.telephone.trim(),
        email: form.email.trim(),
        agrement: form.agrement.trim(),
        pays_id: form.pays_id,
        ville_id: form.ville_id,
        localisation: form.localisation.trim(),
        latitude: form.latitude === '' ? undefined : Number(form.latitude),
        longitude: form.longitude === '' ? undefined : Number(form.longitude),
        responsable_moi: form.responsable_moi ? 'true' : undefined,
        fonction: form.fonction.trim(),
        ...(!form.responsable_moi && {
          agent_nom: form.agent_nom.trim(),
          agent_prenom: form.agent_prenom.trim(),
          agent_email: form.agent_email.trim(),
          agent_telephone: form.agent_telephone.trim(),
        }),
        image_laboratoire: form.image_laboratoire,
        piece_identite: form.piece_identite,
        document_agrement: form.document_agrement,
      });
      if (r.agent?.rattache_au_compte) rafraichirEspaces();
      setResultat(r);
    } catch (err) {
      setErreurEnvoi(err.message || "Une erreur est survenue lors de l'envoi. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  const copier = (cle, valeur) => {
    navigator.clipboard?.writeText(valeur);
    setCopie(cle);
    setTimeout(() => setCopie(null), 1500);
  };

  if (!user) {
    return (
      <section style={{ padding: '3.5rem 0' }}>
        <div className="container-aps">
          <div className="confirm-card">
            <h3 className="confirm-title">Inscrire mon laboratoire</h3>
            <p className="confirm-subtitle">
              Connectez-vous (ou créez votre compte) pour référencer votre laboratoire : la fiche sera rattachée
              à votre compte et vous la gérerez depuis votre portail.
            </p>
            <Link to="/login" state={{ from: location.pathname }} className="confirm-cta">
              Se connecter <i className="fa-solid fa-arrow-right"></i>
            </Link>
            <div className="confirm-hint"><Link to="/creer-patient">Créer un compte</Link></div>
          </div>
        </div>
      </section>
    );
  }

  if (resultat) {
    const mdp = resultat.agent?.mot_de_passe_temporaire;
    return (
      <section style={{ padding: '3.5rem 0' }}>
        <div className="container-aps">
          <div className="confirm-card">
            <div className="confirm-check-wrap">
              <div className="confirm-check-ring"></div>
              <div className="confirm-check-ring"></div>
              <div className="confirm-check-circle"><i className="fa-solid fa-check"></i></div>
            </div>
            <h3 className="confirm-title">Laboratoire déclaré</h3>
            <p className="confirm-subtitle">
              {resultat.message} La fiche sera visible dans l&apos;annuaire après vérification de vos justificatifs par ApSa.
            </p>
            {mdp && (
              <div className="confirm-credentials">
                <div className="confirm-credentials-title">
                  <i className="fa-solid fa-shield-halved"></i> Identifiants du responsable — à transmettre par un canal sûr
                </div>
                {[['email', 'fa-envelope', 'Identifiant', resultat.agent.utilisateur?.email], ['mdp', 'fa-key', 'Mot de passe temporaire', mdp]].map(([cle, icone, libelle, valeur]) => (
                  <div className="cred-row" key={cle}>
                    <div className="cred-icon"><i className={`fa-solid ${icone}`}></i></div>
                    <div className="cred-body">
                      <span className="cred-label">{libelle}</span>
                      <span className="cred-value">{cle === 'mdp' ? <code>{valeur}</code> : valeur}</span>
                    </div>
                    <button type="button" className={`cred-copy ${copie === cle ? 'copied' : ''}`} onClick={() => copier(cle, valeur)} aria-label={`Copier ${libelle.toLowerCase()}`}>
                      <i className={`fa-solid ${copie === cle ? 'fa-check' : 'fa-clipboard'}`}></i>
                    </button>
                  </div>
                ))}
                <p style={{ marginTop: '.75rem', marginBottom: 0, fontSize: '.85rem' }}>
                  Ce mot de passe ne sera plus jamais affiché. Il devra être changé à la première connexion.
                </p>
              </div>
            )}
            {resultat.agent?.rattache_au_compte ? (
              <Link to="/choisir-espace" className="confirm-cta">Ouvrir mon espace laboratoire <i className="fa-solid fa-arrow-right"></i></Link>
            ) : (
              <Link to="/laboratoires" className="confirm-cta">Retour à l&apos;annuaire <i className="fa-solid fa-arrow-right"></i></Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const paysChoisi = pays.find((p) => p.pays_id === form.pays_id);
  const villesDuPays = form.pays_id ? villes : [];

  return (
    <main>
      <section style={{ padding: '2.5rem 0' }}>
        <div className="container-aps">
          <div className="form-shell">
            <div className="form-shell-grid">
              <aside className="form-side">
                <h4>Inscrire votre laboratoire en 5 étapes</h4>
                <p>Votre fiche est mise en ligne dès la vérification de votre agrément et de vos justificatifs.</p>
                <ul className="form-side-list">
                  {[
                    ['fa-flask-vial', 'Laboratoire', 'Nom, contacts, agrément et adresse'],
                    ['fa-location-dot', 'Localisation', 'Facultatif — position sur la carte'],
                    ['fa-id-badge', 'Responsable', 'La personne qui gère la fiche'],
                    ['fa-file-circle-check', 'Justificatifs', 'Logo, CNI du responsable, agrément'],
                    ['fa-circle-check', 'Confirmation', 'Envoi de votre demande'],
                  ].map(([icone, titre, texte]) => (
                    <li key={titre}><i className={`fa-solid ${icone}`}></i><div><strong>{titre}</strong><span className="form-side-desc">{texte}</span></div></li>
                  ))}
                </ul>
              </aside>

              <div className="form-main">
                <div className="form-header">
                  <span className="eyebrow">Espace professionnel</span>
                  <h1>Inscrire mon laboratoire</h1>
                  <p>Après validation, vous publierez vos examens, vos centres de prélèvement et vos photos depuis votre portail.</p>
                </div>

                <div className="stepper">
                  {ETAPES.map((libelle, i) => (
                    <React.Fragment key={libelle}>
                      <div className={`step ${i + 1 === etape ? 'is-active' : i + 1 < etape ? 'is-done' : ''}`}>
                        <div className="step-circle">{i + 1}</div>
                        <div className="step-label">{libelle}</div>
                      </div>
                      {i < ETAPES.length - 1 && <div className="step-line"></div>}
                    </React.Fragment>
                  ))}
                </div>

                {erreurEnvoi && <div className="alert alert-danger" role="alert">{erreurEnvoi}</div>}

                <form onSubmit={envoyer}>
                  {etape === 1 && (
                    <div className="form-page active">
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-nom">Nom du laboratoire <span className="required-mark">*</span></label>
                          <input id="lb-nom" className="form-control" name="nom" maxLength={200} value={form.nom} onChange={maj} placeholder="Ex. Laboratoire Bio-Santé" />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-agr">N° d&apos;agrément <span className="required-mark">*</span></label>
                          <input id="lb-agr" className="form-control" name="agrement" maxLength={100} value={form.agrement} onChange={maj} placeholder="Délivré par l'autorité sanitaire" />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-tel">Téléphone <span className="required-mark">*</span></label>
                          <input id="lb-tel" type="tel" className="form-control" name="telephone" maxLength={20} value={form.telephone} onChange={maj} placeholder="+237600000000" />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-email">E-mail <span className="required-mark">*</span></label>
                          <input id="lb-email" type="email" className="form-control" name="email" maxLength={255} value={form.email} onChange={maj} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-pays">Pays <span className="required-mark">*</span></label>
                          <select id="lb-pays" className="form-select" name="pays_id" value={form.pays_id} onChange={maj}>
                            <option value="">Sélectionner…</option>
                            {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-ville">Ville <span className="required-mark">*</span></label>
                          <select id="lb-ville" className="form-select" name="ville_id" value={form.ville_id} onChange={maj} disabled={!form.pays_id}>
                            <option value="">{form.pays_id ? 'Sélectionner…' : "Choisissez d'abord un pays"}</option>
                            {villesDuPays.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                          </select>
                        </div>
                        <div className="col-12">
                          <label className="form-label-aps" htmlFor="lb-adr">Adresse <span className="required-mark">*</span></label>
                          <input id="lb-adr" className="form-control" name="localisation" maxLength={255} value={form.localisation} onChange={maj} placeholder="Quartier, rue, point de repère" />
                        </div>
                        <div className="col-12">
                          <label className="form-label-aps" htmlFor="lb-desc">Présentation</label>
                          <textarea id="lb-desc" className="form-control" rows={3} name="description" value={form.description} onChange={maj}
                            placeholder="Spécialités, équipements, horaires, prélèvements à domicile…" />
                        </div>
                      </div>
                    </div>
                  )}

                  {etape === 2 && (
                    <div className="form-page active">
                      <p className="form-hint" style={{ marginBottom: '1rem' }}>
                        Facultatif : positionnez le laboratoire sur la carte pour proposer l&apos;itinéraire aux patients.
                      </p>
                      <button type="button" className="btn btn-outline-primary btn-sm-aps mb-3" onClick={demanderPosition} disabled={geoEnCours}>
                        <i className="fa-solid fa-location-crosshairs" /> {geoEnCours ? 'Localisation en cours…' : 'Utiliser ma position actuelle'}
                      </button>
                      {geoErreur && <p className="minimal-note mb-3"><i className="fa-solid fa-triangle-exclamation" /> {geoErreur}</p>}
                      <GoogleMapPicker
                        latitude={form.latitude === '' ? null : Number(form.latitude)}
                        longitude={form.longitude === '' ? null : Number(form.longitude)}
                        onPositionChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
                        region={paysChoisi?.code_iso2?.toLowerCase()}
                      />
                      {form.latitude !== '' && (
                        <button type="button" className="btn btn-link btn-sm p-0 mt-2" onClick={() => setForm((f) => ({ ...f, latitude: '', longitude: '' }))}>
                          Effacer la localisation
                        </button>
                      )}
                    </div>
                  )}

                  {etape === 3 && (
                    <div className="form-page active">
                      <div className="form-check mb-3" style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                        <input className="form-check-input" type="checkbox" id="lb-moi" name="responsable_moi" checked={form.responsable_moi} onChange={maj} />
                        <label className="form-check-label" htmlFor="lb-moi">
                          <strong>Je suis le responsable de ce laboratoire.</strong>
                          <span className="form-hint" style={{ display: 'block', margin: 0 }}>
                            La fiche sera rattachée à mon compte ({user.prenom} {user.nom}) : je la retrouverai dans « Changer d’espace ».
                            Décochez pour créer le compte d’une autre personne.
                          </span>
                        </label>
                      </div>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label-aps" htmlFor="lb-fonction">Fonction <span className="required-mark">*</span></label>
                          <input id="lb-fonction" className="form-control" name="fonction" value={form.fonction} onChange={maj} placeholder="Ex. Biologiste responsable, Directeur" />
                        </div>
                        {!form.responsable_moi && (
                          <>
                            <div className="col-md-6">
                              <label className="form-label-aps" htmlFor="lb-anom">Nom <span className="required-mark">*</span></label>
                              <input id="lb-anom" className="form-control" name="agent_nom" value={form.agent_nom} onChange={maj} />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label-aps" htmlFor="lb-aprenom">Prénom <span className="required-mark">*</span></label>
                              <input id="lb-aprenom" className="form-control" name="agent_prenom" value={form.agent_prenom} onChange={maj} />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label-aps" htmlFor="lb-atel">Téléphone <span className="required-mark">*</span></label>
                              <input id="lb-atel" type="tel" className="form-control" name="agent_telephone" value={form.agent_telephone} onChange={maj} />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label-aps" htmlFor="lb-aemail">E-mail <span className="required-mark">*</span></label>
                              <input id="lb-aemail" type="email" className="form-control" name="agent_email" value={form.agent_email} onChange={maj} />
                            </div>
                            <div className="col-12">
                              <p className="form-hint mb-0">Un compte est créé pour cette personne ; son mot de passe temporaire s&apos;affichera à la fin.</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {etape === 4 && (
                    <div className="form-page active">
                      <div className="row g-3">
                        <ZoneFichier libelle="Logo / photo" nom="image_laboratoire" accept="image/png, image/jpeg, image/webp" aide="JPG, PNG, WEBP — 5 Mo max" valeur={form.image_laboratoire} onChange={majFichier} />
                        <ZoneFichier libelle="CNI du responsable" nom="piece_identite" accept=".pdf, image/png, image/jpeg" aide="PDF, JPG — 5 Mo max" valeur={form.piece_identite} onChange={majFichier} />
                        <ZoneFichier libelle="Agrément officiel" nom="document_agrement" accept=".pdf, image/png, image/jpeg" aide="PDF, JPG — 5 Mo max" valeur={form.document_agrement} onChange={majFichier} />
                      </div>
                      <p className="form-hint mt-3">La CNI et l&apos;agrément ne sont jamais affichés au public : ils servent uniquement à la vérification.</p>
                    </div>
                  )}

                  {etape === 5 && (
                    <div className="form-page active">
                      <div className="form-check mb-4">
                        <input className="form-check-input" type="checkbox" name="acceptCGU" id="lb-cgu" checked={form.acceptCGU} onChange={maj} />
                        <label className="form-check-label" htmlFor="lb-cgu">
                          J&apos;accepte les <a href="/cgu" target="_blank" rel="noopener noreferrer">Conditions générales d&apos;utilisation</a> et la <a href="/confidentialite" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>.
                        </label>
                      </div>
                    </div>
                  )}

                  {erreurEtape && <div className="alert alert-danger" role="alert">{erreurEtape}</div>}

                  <div className="form-nav-actions">
                    {etape > 1 ? (
                      <button type="button" className="btn btn-outline-primary" onClick={() => { setErreurEtape(null); setEtape((e) => e - 1); }} disabled={envoi}>
                        <i className="fa-solid fa-arrow-left"></i> Retour
                      </button>
                    ) : <div></div>}
                    {etape < ETAPES.length ? (
                      <button type="button" className="btn btn-primary" onClick={suivant}>Continuer <i className="fa-solid fa-arrow-right"></i></button>
                    ) : (
                      <button type="submit" className="btn btn-primary" disabled={envoi}>
                        {envoi ? 'Envoi en cours…' : <>Envoyer ma demande <i className="fa-solid fa-paper-plane"></i></>}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
