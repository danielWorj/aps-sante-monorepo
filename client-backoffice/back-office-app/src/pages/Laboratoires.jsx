// src/pages/Laboratoires.jsx
//
// Administration des laboratoires d'analyses — même design system et même
// logique que Pharmacie.jsx (cartes, KPI, filtres, fiche détail, création
// avec compte agent et mot de passe temporaire affiché une seule fois),
// branchée sur laboratoireService.js (GET /admin/laboratoires : tous
// statuts, pièces justificatives, agents ; admin limité à son pays).
//
// En plus de Pharmacie.jsx : publication / retrait en un clic
// (PATCH /admin/laboratoires/:id/statut) et onglet « Contenus » (examens,
// centres de prélèvement, médias) pour corriger une fiche.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, estRole } from '../context/AuthContext';
import { useConfirmation, useToast } from '../components/feedback';
import {
  STATUTS_VERIFICATION_LABORATOIRE,
  changerStatutLaboratoire,
  creerLaboratoire,
  listerLaboratoiresAdmin,
  listerMediasLaboratoire,
  listerPays,
  listerVilles,
  modifierLaboratoire,
  obtenirGestionLaboratoire,
  supprimerCentreLaboratoire,
  supprimerExamenLaboratoire,
  supprimerLaboratoire,
  supprimerMediaLaboratoire,
} from '../services/laboratoireService';

const STATUT_META = {
  publie: { libelle: 'Publié', badge: 'is-success', icone: 'fa-circle-check' },
  en_cours: { libelle: 'En vérification', badge: 'is-warning', icone: 'fa-hourglass-half' },
  non_publie: { libelle: 'Non publié', badge: 'is-danger', icone: 'fa-circle-xmark' },
};

const FORMULAIRE_VIDE = {
  nom: '', description: '', pays_id: '', ville_id: '', localisation: '', telephone: '', email: '', agrement: '',
  statut_verification: 'publie', latitude: '', longitude: '',
  fonction: '', agent_nom: '', agent_prenom: '', agent_email: '', agent_telephone: '',
  image_laboratoire: null, piece_identite: null, document_agrement: null,
};

const FILTRES_VIDES = { recherche: '', statut_verification: '', pays_id: '', ville_id: '' };
const TAILLES_PAGE = [9, 18, 36];
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STYLE = `
  .labo-carte-img { height: 150px; object-fit: cover; background: var(--aps-primary-100, #EAF4FD); }
  .labo-carte-ph { height: 150px; display:flex; align-items:center; justify-content:center; font-size: 34px;
    background: var(--aps-primary-100, #EAF4FD); color: var(--aps-primary, #1C8FE0); }
  .labo-compteurs { display:flex; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--aps-text-500, #6B7280); }
  .labo-info-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  .labo-info-label { font-size: 11.5px; color: var(--aps-text-500, #6B7280); text-transform: uppercase; letter-spacing: .02em; }
  .labo-info-valeur { font-size: 14px; font-weight: 500; word-break: break-word; }
  .labo-piece { display:block; width:100%; height: 340px; border: 1px solid var(--aps-border, #E7EAF0); border-radius: 8px; background:#fff; }
  .labo-medias { display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .labo-medias figure { margin:0; position: relative; border:1px solid var(--aps-border, #E7EAF0); border-radius: 8px; overflow: hidden; }
  .labo-medias img, .labo-medias video { width:100%; height: 90px; object-fit: cover; display:block; }
  .labo-medias button { position:absolute; top:4px; right:4px; }
  @media (max-width: 640px) { .labo-info-grid { grid-template-columns: 1fr; } }
`;

function Modale({ titre, onFermer, taille = 'modal-lg', pied, children }) {
  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1} onClick={onFermer}>
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${taille}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{titre}</h5>
              {onFermer && <button type="button" className="btn-close" onClick={onFermer}></button>}
            </div>
            <div className="modal-body">{children}</div>
            {pied && <div className="modal-footer">{pied}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <div className="labo-info-label">{label}</div>
      <div className="labo-info-valeur">{children || '—'}</div>
    </div>
  );
}

/* ---------------------------- Fiche détail ---------------------------- */

function FicheDetail({ labo, peutSupprimer, onFermer, onModifier, onStatut, onSupprimer }) {
  const confirmer = useConfirmation();
  const toast = useToast();
  const [onglet, setOnglet] = useState('infos');
  const [contenus, setContenus] = useState(null);
  const [erreurContenus, setErreurContenus] = useState(null);
  const statut = STATUT_META[labo.statut_verification] ?? STATUT_META.non_publie;

  const chargerContenus = useCallback(
    () => Promise.all([obtenirGestionLaboratoire(labo.laboratoire_id), listerMediasLaboratoire(labo.laboratoire_id)])
      .then(([g, m]) => {
        setContenus({ examens: g.examens ?? [], centres: g.centres ?? [], medias: m.medias ?? [] });
        setErreurContenus(null);
      })
      .catch((err) => setErreurContenus(err.message || 'Contenus indisponibles.')),
    [labo.laboratoire_id]
  );

  useEffect(() => {
    if (onglet === 'contenus' && !contenus) chargerContenus();
  }, [onglet, contenus, chargerContenus]);

  const supprimerContenu = async (type, element) => {
    const libelles = { examen: "l'examen", centre: 'le centre', media: 'le média' };
    const ok = await confirmer({
      titre: `Supprimer ${libelles[type]}`,
      message: 'Cette suppression est définitive.',
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      if (type === 'examen') await supprimerExamenLaboratoire(element.examen_id);
      if (type === 'centre') await supprimerCentreLaboratoire(element.centre_id);
      if (type === 'media') await supprimerMediaLaboratoire(element.media_id);
      toast.succes('Élément supprimé.');
      chargerContenus();
    } catch (err) {
      toast.erreur(err.message || 'Suppression impossible.');
    }
  };

  const pied = (
    <>
      {labo.statut_verification !== 'publie' && (
        <button type="button" className="btn btn-success" onClick={() => onStatut(labo, 'publie')}>
          <i className="fa-solid fa-circle-check me-1"></i> Publier
        </button>
      )}
      {labo.statut_verification === 'publie' && (
        <button type="button" className="btn btn-outline-danger" onClick={() => onStatut(labo, 'non_publie')}>
          <i className="fa-solid fa-eye-slash me-1"></i> Retirer de l&apos;annuaire
        </button>
      )}
      {labo.statut_verification === 'non_publie' && (
        <button type="button" className="btn btn-outline-warning" onClick={() => onStatut(labo, 'en_cours')}>
          <i className="fa-solid fa-hourglass-half me-1"></i> Remettre en vérification
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={() => onModifier(labo)}>
        <i className="fa-solid fa-pen me-1"></i> Modifier
      </button>
      {peutSupprimer && (
        <button type="button" className="btn btn-light text-danger" onClick={() => onSupprimer(labo)} title="Supprimer">
          <i className="fa-solid fa-trash"></i>
        </button>
      )}
      <button type="button" className="btn btn-light" onClick={onFermer}>Fermer</button>
    </>
  );

  return (
    <Modale titre={labo.nom} onFermer={onFermer} pied={pied} taille="modal-xl">
      <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
        {labo.image_url
          ? <img src={labo.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />
          : <div className="labo-carte-ph" style={{ width: 64, height: 64, borderRadius: 12, fontSize: 22 }}><i className="fa-solid fa-flask-vial"></i></div>}
        <div className="flex-grow-1">
          <div className="aps-text-muted" style={{ fontSize: 13 }}>
            <i className="fa-solid fa-location-dot me-1"></i>
            {[labo.localisation, labo.ville?.nom, labo.pays?.nom].filter(Boolean).join(', ')}
          </div>
          <span className={`aps-badge ${statut.badge} mt-1`}><i className={`fa-solid ${statut.icone}`}></i> {statut.libelle}</span>
        </div>
        <div className="labo-compteurs">
          <span><i className="fa-solid fa-vials me-1"></i>{labo.nb_examens ?? 0} examens</span>
          <span><i className="fa-solid fa-house-medical me-1"></i>{labo.nb_centres ?? 0} centres</span>
          <span><i className="fa-solid fa-star me-1"></i>{labo.note_moyenne ?? '—'} ({labo.nb_avis ?? 0} avis)</span>
        </div>
      </div>

      <div className="aps-tabs mb-3">
        {[
          ['infos', 'fa-circle-info', 'Informations'],
          ['pieces', 'fa-folder-open', 'Pièces justificatives'],
          ['agents', 'fa-user-shield', `Agents (${labo.agents?.length ?? 0})`],
          ['contenus', 'fa-layer-group', 'Contenus'],
        ].map(([cle, icone, libelle]) => (
          <button key={cle} type="button" className={onglet === cle ? 'is-active' : ''} onClick={() => setOnglet(cle)}>
            <i className={`fa-solid ${icone}`}></i> {libelle}
          </button>
        ))}
      </div>

      {onglet === 'infos' && (
        <>
          <div className="labo-info-grid mb-3">
            <Info label="Téléphone">{labo.telephone}</Info>
            <Info label="E-mail">{labo.email}</Info>
            <Info label="N° d'agrément">{labo.agrement}</Info>
            <Info label="Adresse">{labo.localisation}</Info>
            <Info label="Position GPS">
              {labo.geolocalisation
                ? `${labo.geolocalisation.latitude.toFixed(5)}, ${labo.geolocalisation.longitude.toFixed(5)}`
                : 'Non renseignée'}
            </Info>
            <Info label="Inscrit le">{labo.date_creation ? new Date(labo.date_creation).toLocaleDateString('fr-FR') : '—'}</Info>
          </div>
          <div className="labo-info-label mb-1">Présentation</div>
          <p style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{labo.description || <span className="aps-text-muted">Aucune présentation.</span>}</p>
        </>
      )}

      {onglet === 'pieces' && (
        <div className="row g-3">
          {[
            ['Agrément officiel', labo.document_agrement_url],
            ["CNI du responsable", labo.piece_identite_url],
          ].map(([libelle, url]) => (
            <div className="col-md-6" key={libelle}>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <strong style={{ fontSize: 13 }}>{libelle}</strong>
                {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Ouvrir <i className="fa-solid fa-up-right-from-square"></i></a>}
              </div>
              {url ? <object data={url} aria-label={libelle} className="labo-piece">
                <a href={url} target="_blank" rel="noreferrer">Ouvrir le fichier</a>
              </object> : <div className="aps-text-muted">Aucun fichier.</div>}
            </div>
          ))}
        </div>
      )}

      {onglet === 'agents' && (
        labo.agents?.length ? (
          <div className="table-responsive">
            <table className="aps-table table mb-0">
              <thead><tr><th>Agent</th><th>Fonction</th><th>E-mail</th><th>Téléphone</th></tr></thead>
              <tbody>
                {labo.agents.map((a) => (
                  <tr key={a.agent_id}>
                    <td>{a.utilisateur?.prenom} {a.utilisateur?.nom}</td>
                    <td>{a.fonction}</td>
                    <td>{a.utilisateur?.email}</td>
                    <td>{a.utilisateur?.telephone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="aps-text-muted">Aucun agent rattaché.</div>
      )}

      {onglet === 'contenus' && (
        <>
          {erreurContenus && <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurContenus}</div></div>}
          {!contenus && !erreurContenus && <div className="aps-text-muted">Chargement…</div>}
          {contenus && (
            <div className="d-flex flex-column gap-4">
              <section>
                <h6 className="mb-2"><i className="fa-solid fa-vials me-1"></i> Examens ({contenus.examens.length})</h6>
                {contenus.examens.length ? (
                  <div className="table-responsive">
                    <table className="aps-table table mb-0">
                      <thead><tr><th>Examen</th><th>Catégorie</th><th>Prix</th><th>Délai</th><th>Disponible</th><th></th></tr></thead>
                      <tbody>
                        {contenus.examens.map((e) => (
                          <tr key={e.examen_id}>
                            <td>{e.nom}</td>
                            <td>{e.categorie || '—'}</td>
                            <td>{e.prix === null ? 'Sur demande' : `${e.prix.toLocaleString('fr-FR')} ${labo.devise ?? ''}`}</td>
                            <td>{e.delai_resultat || '—'}</td>
                            <td>{e.disponible ? 'Oui' : 'Non'}</td>
                            <td className="text-end">
                              <button type="button" className="btn btn-sm btn-light" title="Supprimer" onClick={() => supprimerContenu('examen', e)}>
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucun examen.</div>}
              </section>
              <section>
                <h6 className="mb-2"><i className="fa-solid fa-house-medical me-1"></i> Centres de prélèvement ({contenus.centres.length})</h6>
                {contenus.centres.length ? (
                  <div className="table-responsive">
                    <table className="aps-table table mb-0">
                      <thead><tr><th>Centre</th><th>Adresse</th><th>Téléphone</th><th>Horaires</th><th></th></tr></thead>
                      <tbody>
                        {contenus.centres.map((c) => (
                          <tr key={c.centre_id}>
                            <td>{c.nom}</td>
                            <td>{[c.localisation, c.ville?.nom].filter(Boolean).join(', ')}</td>
                            <td>{c.telephone || '—'}</td>
                            <td>{c.horaires || '—'}</td>
                            <td className="text-end">
                              <button type="button" className="btn btn-sm btn-light" title="Supprimer" onClick={() => supprimerContenu('centre', c)}>
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucun centre.</div>}
              </section>
              <section>
                <h6 className="mb-2"><i className="fa-solid fa-photo-film me-1"></i> Médias ({contenus.medias.length})</h6>
                {contenus.medias.length ? (
                  <div className="labo-medias">
                    {contenus.medias.map((m) => (
                      <figure key={m.media_id}>
                        {m.type === 'video'
                          ? <video src={m.url} poster={m.vignette_url} controls preload="none" />
                          : <a href={m.url} target="_blank" rel="noreferrer"><img src={m.vignette_url} alt={m.titre || ''} /></a>}
                        <button type="button" className="btn btn-sm btn-light" title="Supprimer" onClick={() => supprimerContenu('media', m)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </figure>
                    ))}
                  </div>
                ) : <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucun média.</div>}
              </section>
            </div>
          )}
        </>
      )}
    </Modale>
  );
}

/* ---------------------------- Formulaire ---------------------------- */

function FormulaireLaboratoire({ initial, pays, onFermer, onEnregistre }) {
  const edition = Boolean(initial?.laboratoire_id);
  const [form, setForm] = useState(() => (edition ? {
    ...FORMULAIRE_VIDE,
    nom: initial.nom ?? '', description: initial.description ?? '', pays_id: initial.pays_id ?? '',
    ville_id: initial.ville_id ?? '', localisation: initial.localisation ?? '', telephone: initial.telephone ?? '',
    email: initial.email ?? '', agrement: initial.agrement ?? '', statut_verification: initial.statut_verification,
    latitude: initial.geolocalisation?.latitude ?? '', longitude: initial.geolocalisation?.longitude ?? '',
  } : FORMULAIRE_VIDE));
  const [villes, setVilles] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (form.pays_id) listerVilles(form.pays_id).then(setVilles).catch(() => setVilles([]));
  }, [form.pays_id]);
  const villesDuPays = form.pays_id ? villes.filter((v) => !v.pays_id || v.pays_id === form.pays_id) : [];

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value, ...(champ === 'pays_id' ? { ville_id: '' } : {}) }));
  const fichier = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.files?.[0] ?? null }));

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (!REGEX_EMAIL.test(form.email.trim())) return setErreur('E-mail du laboratoire invalide.');
    if ((form.latitude === '') !== (form.longitude === '')) return setErreur('Latitude et longitude vont ensemble.');
    if (!edition) {
      const manquants = [];
      if (!form.fonction.trim()) manquants.push("fonction de l'agent");
      if (!form.agent_nom.trim()) manquants.push("nom de l'agent");
      if (!form.agent_prenom.trim()) manquants.push("prénom de l'agent");
      if (!form.agent_telephone.trim()) manquants.push("téléphone de l'agent");
      if (!REGEX_EMAIL.test(form.agent_email.trim())) manquants.push("e-mail valide de l'agent");
      if (!form.image_laboratoire) manquants.push('logo / photo');
      if (!form.piece_identite) manquants.push('CNI du responsable');
      if (!form.document_agrement) manquants.push('agrément');
      if (manquants.length) return setErreur(`Manquant : ${manquants.join(', ')}.`);
    }
    setEnvoi(true);
    const { latitude, longitude, ...reste } = form;
    const donnees = {
      ...reste,
      ...(latitude !== '' && longitude !== '' ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
    };
    if (edition) {
      ['fonction', 'agent_nom', 'agent_prenom', 'agent_email', 'agent_telephone'].forEach((c) => delete donnees[c]);
    }
    try {
      const reponse = edition ? await modifierLaboratoire(initial.laboratoire_id, donnees) : await creerLaboratoire(donnees);
      onEnregistre(edition ? null : reponse.agent);
    } catch (err) {
      setErreur(err.message || "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
    return undefined;
  };

  const champ = (libelle, nom, props = {}, col = 'col-md-6') => (
    <div className={col}>
      <label className="form-label">{libelle}{props.required && <span className="text-danger"> *</span>}</label>
      <input className="form-control" value={form[nom]} onChange={maj(nom)} {...props} />
    </div>
  );

  const champFichier = (libelle, nom, accept, actuel) => (
    <div className="col-md-4">
      <label className="form-label">{libelle}{!edition && <span className="text-danger"> *</span>}</label>
      <input type="file" className="form-control" accept={accept} onChange={fichier(nom)} />
      {actuel && <a href={actuel} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>Voir le fichier actuel</a>}
    </div>
  );

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1} onClick={onFermer}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" onClick={(e) => e.stopPropagation()}>
          <form className="modal-content" onSubmit={soumettre}>
            <div className="modal-header">
              <h5 className="modal-title">{edition ? 'Modifier le laboratoire' : 'Nouveau laboratoire'}</h5>
              <button type="button" className="btn-close" onClick={onFermer}></button>
            </div>
            <div className="modal-body">
              {erreur && <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>}
              <div className="row g-3">
                {champ('Nom du laboratoire', 'nom', { required: true, maxLength: 200 }, 'col-md-8')}
                <div className="col-md-4">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={form.statut_verification} onChange={maj('statut_verification')}>
                    {STATUTS_VERIFICATION_LABORATOIRE.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">Description</label>
                  <textarea className="form-control" rows={3} value={form.description} onChange={maj('description')} />
                </div>
                {champ('Téléphone', 'telephone', { required: true, type: 'tel', maxLength: 20 }, 'col-md-4')}
                {champ('E-mail', 'email', { required: true, type: 'email', maxLength: 255 }, 'col-md-4')}
                {champ("N° d'agrément", 'agrement', { required: true, maxLength: 100 }, 'col-md-4')}
                <div className="col-md-6">
                  <label className="form-label">Pays<span className="text-danger"> *</span></label>
                  <select className="form-select" required value={form.pays_id} onChange={maj('pays_id')}>
                    <option value="" disabled>Choisir…</option>
                    {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Ville<span className="text-danger"> *</span></label>
                  <select className="form-select" required value={form.ville_id} onChange={maj('ville_id')} disabled={!form.pays_id}>
                    <option value="" disabled>Choisir…</option>
                    {villesDuPays.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                  </select>
                </div>
                {champ('Adresse (quartier, rue, repère)', 'localisation', { required: true, maxLength: 255 }, 'col-12')}
                {champ('Latitude', 'latitude', { type: 'number', step: 'any' })}
                {champ('Longitude', 'longitude', { type: 'number', step: 'any' })}

                {!edition && (
                  <>
                    <div className="col-12">
                      <hr />
                      <div className="aps-text-muted" style={{ fontSize: 13 }}>
                        Un compte est créé pour l&apos;agent qui gérera le laboratoire. Un mot de passe temporaire lui
                        sera généré ; il devra le changer à sa première connexion.
                      </div>
                    </div>
                    {champ("Nom de l'agent", 'agent_nom', { required: true })}
                    {champ("Prénom de l'agent", 'agent_prenom', { required: true })}
                    {champ("Téléphone de l'agent", 'agent_telephone', { required: true, type: 'tel' })}
                    {champ("E-mail de l'agent", 'agent_email', { required: true, type: 'email' })}
                    {champ('Fonction', 'fonction', { required: true, placeholder: 'Ex. Biologiste responsable, Directeur…' }, 'col-12')}
                  </>
                )}

                <div className="col-12">
                  <hr />
                  <div className="aps-text-muted" style={{ fontSize: 13 }}>
                    Pièces justificatives {edition ? '(laisser vide pour conserver le fichier actuel)' : '(obligatoires)'}
                  </div>
                </div>
                {champFichier('Logo / photo', 'image_laboratoire', 'image/jpeg,image/png,image/webp', initial?.image_url)}
                {champFichier('CNI du responsable', 'piece_identite', 'image/jpeg,image/png,image/webp,application/pdf', initial?.piece_identite_url)}
                {champFichier('Agrément officiel', 'document_agrement', 'image/jpeg,image/png,image/webp,application/pdf', initial?.document_agrement_url)}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-light" onClick={onFermer}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={envoi}>
                {envoi ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Créer le laboratoire'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

/* ---------------------------- Page ---------------------------- */

export default function Laboratoires() {
  const { user } = useAuth();
  const peutSupprimer = Boolean(estRole(user, 'superadmin'));
  const confirmer = useConfirmation();
  const toast = useToast();

  const [labos, setLabos] = useState([]);
  const [tous, setTous] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [filtresAppliques, setFiltresAppliques] = useState(FILTRES_VIDES);
  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(TAILLES_PAGE[0]);
  const [selection, setSelection] = useState(null);
  const [formulaire, setFormulaire] = useState(null); // null | {} (création) | labo (édition)
  const [compteAgent, setCompteAgent] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [filtresListe, complete] = await Promise.all([
        listerLaboratoiresAdmin(filtresAppliques),
        listerLaboratoiresAdmin({}),
      ]);
      setLabos(filtresListe);
      setTous(complete);
      setErreur(null);
      setPage(1);
      return filtresListe;
    } catch (err) {
      setErreur(err.message || 'Impossible de charger les laboratoires.');
      return [];
    } finally {
      setChargement(false);
    }
  }, [filtresAppliques]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { listerPays().then(setPays).catch(() => setPays([])); }, []);
  useEffect(() => {
    if (filtres.pays_id) listerVilles(filtres.pays_id).then(setVillesFiltre).catch(() => setVillesFiltre([]));
  }, [filtres.pays_id]);
  const villesDuFiltre = filtres.pays_id ? villesFiltre.filter((v) => !v.pays_id || v.pays_id === filtres.pays_id) : [];
  const appliquer = (valeurs) => { setChargement(true); setFiltresAppliques(valeurs); };

  const kpi = useMemo(() => ({
    total: tous.length,
    publie: tous.filter((l) => l.statut_verification === 'publie').length,
    enCours: tous.filter((l) => l.statut_verification === 'en_cours').length,
    avisEnAttente: tous.reduce((s, l) => s + (l.nb_avis_en_attente ?? 0), 0),
  }), [tous]);

  const nbPages = Math.max(1, Math.ceil(labos.length / parPage));
  const pageCourante = Math.min(page, nbPages);
  const visibles = labos.slice((pageCourante - 1) * parPage, pageCourante * parPage);

  const modifierFiltre = (champ, valeur) =>
    setFiltres((f) => ({ ...f, [champ]: valeur, ...(champ === 'pays_id' ? { ville_id: '' } : {}) }));

  const rafraichirSelection = (liste, id) => setSelection((s) => (s ? liste.find((l) => l.laboratoire_id === id) ?? null : s));

  const changerStatut = async (labo, statut) => {
    const libelles = { publie: 'Publier ce laboratoire', non_publie: "Retirer ce laboratoire de l'annuaire", en_cours: 'Remettre en vérification' };
    const ok = await confirmer({
      titre: libelles[statut],
      message: statut === 'publie'
        ? `« ${labo.nom} » sera visible dans l'annuaire public. Vérifiez l'agrément et la CNI avant de publier.`
        : `« ${labo.nom} » ne sera plus visible du public.`,
      labelConfirmer: 'Confirmer',
      variante: statut === 'publie' ? 'primaire' : 'avertissement',
    });
    if (!ok) return;
    try {
      await changerStatutLaboratoire(labo.laboratoire_id, statut);
      toast.succes('Statut mis à jour.');
      const liste = await charger();
      rafraichirSelection(liste, labo.laboratoire_id);
    } catch (err) {
      toast.erreur(err.message || 'Changement de statut impossible.');
    }
  };

  const supprimer = async (labo) => {
    const ok = await confirmer({
      titre: 'Supprimer ce laboratoire',
      message: `« ${labo.nom} », ses examens, centres, médias, avis et statistiques seront supprimés définitivement. Les comptes des agents sont conservés.`,
      labelConfirmer: 'Supprimer définitivement',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerLaboratoire(labo.laboratoire_id);
      toast.succes('Laboratoire supprimé.');
      setSelection(null);
      charger();
    } catch (err) {
      toast.erreur(err.message || 'Suppression impossible.');
    }
  };

  const apresEnregistrement = async (agent) => {
    const id = formulaire?.laboratoire_id;
    setFormulaire(null);
    toast.succes(id ? 'Laboratoire mis à jour.' : 'Laboratoire créé.');
    if (agent?.mot_de_passe_temporaire) setCompteAgent(agent);
    const liste = await charger();
    if (id) rafraichirSelection(liste, id);
  };

  const exporterCsv = () => {
    const entetes = ['Nom', 'Statut', 'Téléphone', 'E-mail', 'Agrément', 'Adresse', 'Ville', 'Pays', 'Examens', 'Centres', 'Note'];
    const lignes = labos.map((l) => [
      l.nom, STATUT_META[l.statut_verification]?.libelle, l.telephone, l.email, l.agrement, l.localisation,
      l.ville?.nom, l.pays?.nom, l.nb_examens, l.nb_centres, l.note_moyenne ?? '',
    ]);
    const csv = [entetes, ...lignes].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    lien.download = 'laboratoires.csv';
    lien.click();
    URL.revokeObjectURL(lien.href);
  };

  return (
    <>
      <style>{STYLE}</style>
      <main className="aps-content">
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <span>Tableau de bord</span><span className="sep">/</span>
              <span>Annuaire &amp; Utilisateurs</span><span className="sep">/</span>
              <span>Laboratoires</span>
            </nav>
            <h1>Laboratoires d&apos;analyses</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Vérification, publication et suivi des laboratoires référencés.
            </p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light" type="button" onClick={exporterCsv}>
              <i className="fa-solid fa-file-export me-1"></i> Exporter
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setFormulaire({})}>
              <i className="fa-solid fa-plus me-1"></i> Nouveau laboratoire
            </button>
          </div>
        </div>

        <div className="row g-3 mb-4">
          {[
            ['fa-flask-vial', 'is-primary', 'Laboratoires enregistrés', kpi.total],
            ['fa-circle-check', 'is-success', 'Publiés', kpi.publie],
            ['fa-hourglass-half', 'is-warning', 'À vérifier', kpi.enCours],
            ['fa-star-half-stroke', 'is-danger', 'Avis à modérer', kpi.avisEnAttente],
          ].map(([icone, couleur, libelle, valeur]) => (
            <div className="col-6 col-lg-3" key={libelle}>
              <div className="aps-kpi">
                <div className="aps-kpi__top">
                  <div className={`aps-kpi__icon ${couleur}`}><i className={`fa-solid ${icone}`}></i></div>
                </div>
                <div className="aps-kpi__label">{libelle}</div>
                <div className="aps-kpi__value">{valeur.toLocaleString('fr-FR')}</div>
              </div>
            </div>
          ))}
        </div>

        {kpi.enCours > 0 && (
          <div className="aps-notice is-warning mb-4">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>
              <strong>{kpi.enCours} laboratoire{kpi.enCours > 1 ? 's' : ''} en attente de vérification.</strong>{' '}
              Contrôlez l&apos;agrément et la CNI du responsable avant publication.
            </div>
          </div>
        )}

        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <form className="row g-3 align-items-end" onSubmit={(e) => { e.preventDefault(); appliquer(filtres); }}>
              <div className="col-md-4">
                <label className="form-label">Rechercher</label>
                <input type="search" className="form-control" placeholder="Nom, agrément, e-mail…"
                  value={filtres.recherche} onChange={(e) => modifierFiltre('recherche', e.target.value)} />
              </div>
              <div className="col-md-2">
                <label className="form-label">Statut</label>
                <select className="form-select" value={filtres.statut_verification} onChange={(e) => modifierFiltre('statut_verification', e.target.value)}>
                  <option value="">Tous</option>
                  {STATUTS_VERIFICATION_LABORATOIRE.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Pays</label>
                <select className="form-select" value={filtres.pays_id} onChange={(e) => modifierFiltre('pays_id', e.target.value)}>
                  <option value="">Tous</option>
                  {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Ville</label>
                <select className="form-select" value={filtres.ville_id} disabled={!filtres.pays_id} onChange={(e) => modifierFiltre('ville_id', e.target.value)}>
                  <option value="">Toutes</option>
                  {villesDuFiltre.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                </select>
              </div>
              <div className="col-md-2 d-flex gap-2">
                <button className="btn btn-outline-primary flex-grow-1" type="submit">Filtrer</button>
                <button className="btn btn-light" type="button" title="Réinitialiser"
                  onClick={() => { setFiltres(FILTRES_VIDES); appliquer(FILTRES_VIDES); }}>
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </form>
          </div>
        </div>

        {erreur && <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>}

        <div className="aps-text-muted mb-3" style={{ fontSize: 13 }}>
          {chargement ? 'Chargement…' : `${labos.length} laboratoire${labos.length > 1 ? 's' : ''}`}
        </div>

        <div className="row g-3">
          {!chargement && !visibles.length && (
            <div className="col-12">
              <div className="aps-card"><div className="aps-card__body text-center aps-text-muted py-5">Aucun laboratoire ne correspond à ces critères.</div></div>
            </div>
          )}
          {visibles.map((l) => {
            const statut = STATUT_META[l.statut_verification] ?? STATUT_META.non_publie;
            return (
              <div className="col-md-6 col-xl-4" key={l.laboratoire_id}>
                <div className="card h-100 shadow-sm">
                  {l.image_url
                    ? <img src={l.image_url} className="card-img-top labo-carte-img" alt={l.nom} />
                    : <div className="labo-carte-ph"><i className="fa-solid fa-flask-vial"></i></div>}
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex align-items-start justify-content-between mb-1 gap-2">
                      <h5 className="card-title mb-0" style={{ fontSize: 16 }}>{l.nom}</h5>
                      <span className={`aps-badge ${statut.badge}`}><i className="fa-solid fa-circle"></i> {statut.libelle}</span>
                    </div>
                    <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                      <i className="fa-solid fa-location-dot me-1"></i>{[l.ville?.nom, l.pays?.nom].filter(Boolean).join(' · ')}
                      <span className="mx-2">·</span><i className="fa-solid fa-file-contract me-1"></i>{l.agrement}
                    </p>
                    <div className="labo-compteurs mb-3">
                      <span><i className="fa-solid fa-vials me-1"></i>{l.nb_examens}</span>
                      <span><i className="fa-solid fa-house-medical me-1"></i>{l.nb_centres}</span>
                      <span><i className="fa-solid fa-star me-1"></i>{l.note_moyenne ?? '—'} ({l.nb_avis})</span>
                      {l.nb_avis_en_attente > 0 && <span className="text-warning"><i className="fa-solid fa-comment-dots me-1"></i>{l.nb_avis_en_attente} à modérer</span>}
                    </div>
                    <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--aps-border)' }}>
                      <button className={`btn btn-sm flex-grow-1 ${l.statut_verification === 'en_cours' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSelection(l)}>
                        <i className={`fa-solid ${l.statut_verification === 'en_cours' ? 'fa-file-signature' : 'fa-eye'} me-1`}></i>
                        {l.statut_verification === 'en_cours' ? 'Examiner' : 'Voir'}
                      </button>
                      <button className="btn btn-sm btn-light" title="Modifier" onClick={() => setFormulaire(l)}><i className="fa-solid fa-pen"></i></button>
                      {peutSupprimer && (
                        <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => supprimer(l)}><i className="fa-solid fa-trash"></i></button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {labos.length > 0 && (
          <div className="aps-card mt-3">
            <div className="aps-pagination">
              <div>Page <strong>{pageCourante}</strong> sur <strong>{nbPages}</strong></div>
              <div className="pages">
                <button type="button" disabled={pageCourante <= 1} onClick={() => setPage(pageCourante - 1)}><i className="fa-solid fa-chevron-left"></i></button>
                {Array.from({ length: nbPages }, (_, i) => i + 1).map((n) => (
                  <button type="button" key={n} className={n === pageCourante ? 'is-active' : ''} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button type="button" disabled={pageCourante >= nbPages} onClick={() => setPage(pageCourante + 1)}><i className="fa-solid fa-chevron-right"></i></button>
              </div>
              <div className="d-flex gap-2 align-items-center">
                <span>Par page :</span>
                <select className="form-select form-select-sm" style={{ width: 'auto' }} value={parPage}
                  onChange={(e) => { setParPage(Number(e.target.value)); setPage(1); }}>
                  {TAILLES_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </main>

      {selection && (
        <FicheDetail
          labo={selection}
          peutSupprimer={peutSupprimer}
          onFermer={() => setSelection(null)}
          onModifier={(l) => { setSelection(null); setFormulaire(l); }}
          onStatut={changerStatut}
          onSupprimer={supprimer}
        />
      )}

      {formulaire && (
        <FormulaireLaboratoire initial={formulaire} pays={pays} onFermer={() => setFormulaire(null)} onEnregistre={apresEnregistrement} />
      )}

      {compteAgent && (
        <Modale
          titre={<><i className="fa-solid fa-user-shield me-2 text-success"></i>Compte agent créé</>}
          taille=""
          pied={(
            <>
              {navigator?.clipboard && (
                <button type="button" className="btn btn-outline-primary"
                  onClick={() => navigator.clipboard.writeText(compteAgent.mot_de_passe_temporaire || '').then(() => toast.succes('Mot de passe copié.'))}>
                  <i className="fa-solid fa-copy me-1"></i> Copier le mot de passe
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setCompteAgent(null)}>J&apos;ai noté le mot de passe, fermer</button>
            </>
          )}
        >
          <div className="aps-notice is-warning mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>Ce mot de passe ne sera plus jamais affiché. Communiquez-le à l&apos;agent par un canal sûr — il devra le changer à sa première connexion.</div>
          </div>
          <dl className="row mb-0" style={{ fontSize: 14 }}>
            <dt className="col-5 aps-text-muted">Agent</dt>
            <dd className="col-7">{compteAgent.utilisateur?.prenom} {compteAgent.utilisateur?.nom}</dd>
            <dt className="col-5 aps-text-muted">Identifiant</dt>
            <dd className="col-7">{compteAgent.utilisateur?.email}</dd>
            <dt className="col-5 aps-text-muted">Mot de passe temporaire</dt>
            <dd className="col-7"><code style={{ fontSize: 15 }}>{compteAgent.mot_de_passe_temporaire}</code></dd>
          </dl>
        </Modale>
      )}
    </>
  );
}
