// src/components/Annonces.jsx
//
// Gestion des annonces (module autonome, cf. schema.prisma modèle
// Annonce — sans relation vers un autre module métier, même esprit
// que MobileApk). Consomme exclusivement `annonceService.js` :
// listerAnnonces / obtenirAnnonce / creerAnnonce / modifierAnnonce /
// activerAnnonce / desactiverAnnonce / supprimerAnnonce.
//
// Droits (confirmés par annonce.controller.js / annonce.routes.js — le
// serveur reste la seule source de vérité, le front ne fait que
// masquer les actions non pertinentes) :
//   - GET  /annonces, GET /annonces/:id           → PUBLIQUE, aucun
//     token requis (mais cette page back-office reste réservée aux
//     comptes admin/superadmin côté navigation/menu).
//   - POST /annonces, PUT/PATCH/DELETE /annonces/* → réservé à
//     admin/superadmin.
//
// Champs réels du modèle Annonce (voir annonce.controller.js) :
//   annonce { id, libelle (obligatoire), description (optionnel),
//     file_url (optionnel — visuel image ou flyer PDF, jamais l'URL
//     brute stockée en base, voir avecUrlFichier côté serveur),
//     date_creation (auto), jour_validite (obligatoire, Int, nombre de
//     jours), statut (Boolean, défaut true), expiree (calculé à la
//     volée côté serveur à partir de date_creation + jour_validite,
//     PAS stocké en base — voir estAnnonceExpiree) }.
//
// statut n'est jamais envoyé à la création (le contrôleur ne le lit
// pas) : toute nouvelle annonce démarre active — on utilise ensuite
// activerAnnonce/desactiverAnnonce (actions explicites, isolées côté
// serveur) plutôt que de repasser par modifierAnnonce({ statut }) pour
// ce cas précis, même si les deux chemins restent équivalents côté
// API.
//
// `fichier` (FormData) est optionnel aussi bien à la création qu'en
// modification : une annonce peut être purement textuelle. En
// modification, ne pas re-sélectionner de fichier laisse file_url
// inchangé côté serveur (voir construireFormDataAnnonce).
//
// Reprend le patron "Modal piloté par état React" de
// RendezVous.jsx / Ordonnance.jsx / ForfaitPublicitaire.jsx.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerAnnonces,
  creerAnnonce,
  modifierAnnonce,
  activerAnnonce,
  desactiverAnnonce,
  supprimerAnnonce,
} from '../services/annonceService';
import './../assets/style/annonces.css'; // styles spécifiques à ce module

/* ────────────────────────── Aides rôle ────────────────────────── */

function extraireChampCandidat(objetUtilisateur, cles) {
  if (!objetUtilisateur || typeof objetUtilisateur !== 'object') return null;
  for (const cle of cles) {
    const valeur = cle.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), objetUtilisateur);
    if (valeur !== undefined && valeur !== null && valeur !== '') return valeur;
  }
  return null;
}

function extraireNomRole(objetUtilisateur) {
  const candidat = extraireChampCandidat(objetUtilisateur, [
    'role',
    'role.nom',
    'role.libelle',
    'role_nom',
    'type_compte',
    'utilisateur.role',
    'roles.0',
    'roles.0.nom',
  ]);
  return typeof candidat === 'string' ? candidat.trim().toLowerCase() : null;
}

/* ────────────────────────── Constantes / limites ────────────────────────── */

// Bornes de saisie purement front (UX) — le contrôleur ne rejette que
// jour_validite <= 0 et libelle vide ; ces limites ne sont qu'un
// garde-fou, pas une règle de sécurité serveur.
const DESCRIPTION_LONGUEUR_MAX = 1000;
const JOUR_VALIDITE_MAX = 3650; // ~10 ans, garde-fou de saisie
const TAILLE_FICHIER_MAX_OCTETS = 10 * 1024 * 1024; // 10 Mo, alignement UX avec upload.middleware.js
const TYPES_FICHIER_ACCEPTES = 'image/png,image/jpeg,image/webp,application/pdf';

const FORM_CREATION_VIDE = { libelle: '', description: '', jour_validite: '30', fichier: null };
const FORM_EDITION_VIDE = { libelle: '', description: '', jour_validite: '', fichier: null };

/* ────────────────────────── Aides d'affichage ────────────────────────── */

function formaterDate(valeur) {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formaterDateHeure(valeur) {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function apercuTexte(texte, longueur = 90) {
  if (!texte) return '—';
  const propre = String(texte).replace(/\s+/g, ' ').trim();
  return propre.length > longueur ? `${propre.slice(0, longueur)}…` : propre;
}

// date_creation + jour_validite : purement informatif côté front, le
// serveur reste la seule source de vérité pour `expiree` (renvoyé
// directement par l'API, jamais recalculé ici).
function dateExpirationEstimee(annonce) {
  if (!annonce?.date_creation || !annonce?.jour_validite) return null;
  const d = new Date(annonce.date_creation);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(annonce.jour_validite));
  return d;
}

function typeFichier(url) {
  if (!url) return null;
  const propre = url.split('?')[0].toLowerCase();
  if (propre.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|webp|gif)$/.test(propre)) return 'image';
  return 'autre';
}

function metaFichier(url) {
  const type = typeFichier(url);
  if (type === 'pdf') return { icone: 'fa-file-pdf', libelle: 'Flyer (PDF)', couleur: '#dc2626' };
  if (type === 'image') return { icone: 'fa-image', libelle: 'Visuel', couleur: '#0ea5e9' };
  return { icone: 'fa-paperclip', libelle: 'Fichier', couleur: '#6b7280' };
}

function formaterTailleOctets(octets) {
  if (!octets && octets !== 0) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

// Statut affiché = combinaison de `statut` (actif/désactivé, piloté
// par l'admin) et `expiree` (calculé côté serveur) : une annonce
// expirée reste affichée comme "Expirée" même si `statut` est encore
// true, faute d'avoir été désactivée manuellement.
function metaStatutAffiche(annonce) {
  if (annonce.expiree) return { badge: 'is-muted', icone: 'fa-clock', libelle: 'Expirée' };
  if (annonce.statut) return { badge: 'is-success', icone: 'fa-circle-check', libelle: 'Active' };
  return { badge: 'is-muted', icone: 'fa-ban', libelle: 'Désactivée' };
}

/* ────────────────────────── Modale générique ────────────────────────── */

function Modal({ id, title, isOpen, onClose, children, footer, large }) {
  if (!isOpen) return null;
  return (
    <>
      <div className="modal fade show d-block" id={id} tabIndex="-1" role="dialog">
        <div className={`modal-dialog${large ? ' modal-lg' : ''}`}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">{footer}</div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose}></div>
    </>
  );
}

/* ────────────────────────── Champ fichier réutilisable ────────────────────────── */

function ChampFichier({ fichier, urlExistante, onChange, erreur }) {
  const inputRef = useRef(null);

  function gererSelection(e) {
    const f = e.target.files?.[0] || null;
    if (f && f.size > TAILLE_FICHIER_MAX_OCTETS) {
      onChange(null, `Le fichier dépasse la taille maximale autorisée (${formaterTailleOctets(TAILLE_FICHIER_MAX_OCTETS)}).`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    onChange(f, null);
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-sm btn-light" onClick={() => inputRef.current?.click()}>
          <i className="fa-solid fa-upload me-1"></i>
          {fichier || urlExistante ? 'Remplacer le fichier' : 'Choisir un fichier'}
        </button>
        {fichier && (
          <span className="aps-text-muted" style={{ fontSize: 13 }}>
            <i className="fa-solid fa-paperclip me-1"></i>
            {fichier.name} ({formaterTailleOctets(fichier.size)})
          </span>
        )}
        {!fichier && urlExistante && (
          <a href={urlExistante} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
            <i className={`fa-solid ${metaFichier(urlExistante).icone} me-1`}></i>
            Fichier actuel
          </a>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={TYPES_FICHIER_ACCEPTES}
          className="d-none"
          onChange={gererSelection}
        />
      </div>
      <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
        Image (PNG, JPEG, WEBP) ou PDF, {formaterTailleOctets(TAILLE_FICHIER_MAX_OCTETS)} maximum. Optionnel — une
        annonce peut être purement textuelle.
      </div>
      {erreur && (
        <div className="aps-text-muted mt-1" style={{ fontSize: 12, color: '#dc2626' }}>
          {erreur}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Composant principal ────────────────────────── */

export default function Annonces() {
  const { user, status } = useAuth();
  const role = extraireNomRole(user);
  const estAdmin = role === 'admin' || role === 'superadmin';

  /* ─── Chargement des données ─────────────────────────────────── */

  const [annonces, setAnnonces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  const [filtreStatut, setFiltreStatut] = useState(''); // '' | 'actives' | 'desactivees' | 'expirees'
  const [recherche, setRecherche] = useState('');

  const chargerAnnonces = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      // Liste complète : le filtrage statut/expiration/recherche se
      // fait ensuite côté client (voir `lignesTable`), pour permettre
      // de basculer entre les vues sans refaire d'appel réseau.
      const liste = await listerAnnonces();
      setAnnonces(liste);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les annonces.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    chargerAnnonces();
  }, [status, chargerAnnonces]);

  const lignesTable = useMemo(() => {
    let liste = annonces;
    if (filtreStatut === 'actives') {
      liste = liste.filter((a) => a.statut && !a.expiree);
    } else if (filtreStatut === 'desactivees') {
      liste = liste.filter((a) => !a.statut);
    } else if (filtreStatut === 'expirees') {
      liste = liste.filter((a) => a.expiree);
    }
    const q = recherche.trim().toLowerCase();
    if (q) {
      liste = liste.filter(
        (a) => (a.libelle || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q)
      );
    }
    return [...liste].sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));
  }, [annonces, filtreStatut, recherche]);

  const compteurs = useMemo(() => {
    const base = { total: annonces.length, actives: 0, expirees: 0, desactivees: 0 };
    annonces.forEach((a) => {
      if (a.expiree) base.expirees += 1;
      else if (a.statut) base.actives += 1;
      else base.desactivees += 1;
    });
    return base;
  }, [annonces]);

  /* ─── Modale création (admin uniquement) ─────────────────────── */

  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [formCreation, setFormCreation] = useState(FORM_CREATION_VIDE);
  const [erreurFichierCreation, setErreurFichierCreation] = useState(null);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreurCreation, setErreurCreation] = useState(null);

  function ouvrirCreation() {
    setFormCreation(FORM_CREATION_VIDE);
    setErreurFichierCreation(null);
    setErreurCreation(null);
    setModalCreationOuverte(true);
  }

  async function soumettreCreation() {
    setErreurCreation(null);

    const libelle = formCreation.libelle.trim();
    const jourValidite = Number(formCreation.jour_validite);

    if (!libelle) {
      setErreurCreation('Le libellé est requis.');
      return;
    }
    if (!Number.isInteger(jourValidite) || jourValidite <= 0) {
      setErreurCreation('La durée de validité doit être un nombre entier de jours supérieur à 0.');
      return;
    }
    if (jourValidite > JOUR_VALIDITE_MAX) {
      setErreurCreation(`La durée de validité est trop élevée (${JOUR_VALIDITE_MAX} jours maximum).`);
      return;
    }
    if (formCreation.description.length > DESCRIPTION_LONGUEUR_MAX) {
      setErreurCreation(`La description est trop longue (${DESCRIPTION_LONGUEUR_MAX} caractères maximum).`);
      return;
    }

    setCreationEnCours(true);
    try {
      await creerAnnonce({
        libelle,
        description: formCreation.description.trim() || undefined,
        jour_validite: jourValidite,
        fichier: formCreation.fichier || undefined,
      });
      setModalCreationOuverte(false);
      await chargerAnnonces();
    } catch (err) {
      setErreurCreation(err.message || "Une erreur est survenue lors de la création de l'annonce.");
    } finally {
      setCreationEnCours(false);
    }
  }

  /* ─── Modale détail / édition ─────────────────────────────────── */

  const [modalDetailOuverte, setModalDetailOuverte] = useState(false);
  const [annonceActive, setAnnonceActive] = useState(null);
  const [modeEdition, setModeEdition] = useState(false);
  const [formEdition, setFormEdition] = useState(FORM_EDITION_VIDE);
  const [erreurFichierEdition, setErreurFichierEdition] = useState(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [erreurEdition, setErreurEdition] = useState(null);
  const [basculeStatutEnCours, setBasculeStatutEnCours] = useState(false);

  function ouvrirDetail(annonce) {
    setAnnonceActive(annonce);
    setModeEdition(false);
    setFormEdition({
      libelle: annonce.libelle || '',
      description: annonce.description || '',
      jour_validite: String(annonce.jour_validite ?? ''),
      fichier: null,
    });
    setErreurFichierEdition(null);
    setErreurEdition(null);
    setModalDetailOuverte(true);
  }

  async function enregistrerEdition() {
    if (!annonceActive) return;
    setErreurEdition(null);

    const libelle = formEdition.libelle.trim();
    const jourValidite = Number(formEdition.jour_validite);

    if (!libelle) {
      setErreurEdition('Le libellé ne peut pas être vide.');
      return;
    }
    if (!Number.isInteger(jourValidite) || jourValidite <= 0) {
      setErreurEdition('La durée de validité doit être un nombre entier de jours supérieur à 0.');
      return;
    }
    if (jourValidite > JOUR_VALIDITE_MAX) {
      setErreurEdition(`La durée de validité est trop élevée (${JOUR_VALIDITE_MAX} jours maximum).`);
      return;
    }
    if (formEdition.description.length > DESCRIPTION_LONGUEUR_MAX) {
      setErreurEdition(`La description est trop longue (${DESCRIPTION_LONGUEUR_MAX} caractères maximum).`);
      return;
    }

    const donnees = {};
    if (libelle !== annonceActive.libelle) donnees.libelle = libelle;
    if (formEdition.description.trim() !== (annonceActive.description || '')) {
      // Chaîne vide volontaire : efface la description côté serveur
      // (voir commentaire modifierAnnonce dans annonceService.js).
      donnees.description = formEdition.description.trim();
    }
    if (jourValidite !== annonceActive.jour_validite) donnees.jour_validite = jourValidite;
    if (formEdition.fichier) donnees.fichier = formEdition.fichier;

    if (Object.keys(donnees).length === 0) {
      setModeEdition(false);
      return;
    }

    setEnregistrementEnCours(true);
    try {
      const misAJour = await modifierAnnonce(annonceActive.id, donnees);
      setAnnonceActive(misAJour);
      setModeEdition(false);
      await chargerAnnonces();
    } catch (err) {
      setErreurEdition(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  async function basculerStatut(annonce) {
    setBasculeStatutEnCours(true);
    setErreurEdition(null);
    try {
      const misAJour = annonce.statut ? await desactiverAnnonce(annonce.id) : await activerAnnonce(annonce.id);
      if (annonceActive && annonceActive.id === annonce.id) setAnnonceActive(misAJour);
      await chargerAnnonces();
    } catch (err) {
      const message = err.message || "Impossible de changer le statut de l'annonce.";
      if (annonceActive && annonceActive.id === annonce.id) setErreurEdition(message);
      else setErreurChargement(message);
    } finally {
      setBasculeStatutEnCours(false);
    }
  }

  /* ─── Suppression physique (admin uniquement) ────────────────── */

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(annonce) {
    setDeleteError(null);
    setPendingDelete(annonce);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerAnnonce(pendingDelete.id);
      setPendingDelete(null);
      setModalDetailOuverte(false);
      await chargerAnnonces();
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer cette annonce.');
    } finally {
      setDeleteSaving(false);
    }
  }

  /* ─── Rendu ───────────────────────────────────────────────────── */

  if (status === 'loading') {
    return (
      <main className="aps-content">
        <div className="text-center py-5">
          <i className="fa-solid fa-spinner fa-spin"></i>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="aps-content annonces-page">
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Annonces</span>
            </nav>
            <h1>Annonces</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Bandeaux d'information affichés côté application (visuel image ou flyer PDF, avec ou sans texte).
            </p>
          </div>
          {estAdmin && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouvelle annonce
            </button>
          )}
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary">
                  <i className="fa-solid fa-bullhorn"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Total</div>
              <div className="aps-kpi__value">{compteurs.total.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success">
                  <i className="fa-solid fa-circle-check"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Actives</div>
              <div className="aps-kpi__value">{compteurs.actives.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning">
                  <i className="fa-solid fa-clock"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Expirées</div>
              <div className="aps-kpi__value">{compteurs.expirees.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-info">
                  <i className="fa-solid fa-ban"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Désactivées</div>
              <div className="aps-kpi__value">{compteurs.desactivees.toLocaleString('fr-FR')}</div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerAnnonces}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label">Statut</label>
                <select className="form-select" value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
                  <option value="">Toutes</option>
                  <option value="actives">Actives</option>
                  <option value="desactivees">Désactivées</option>
                  <option value="expirees">Expirées</option>
                </select>
              </div>
              <div className="col-md-9">
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    placeholder="Libellé, description…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                  {recherche && (
                    <button
                      type="button"
                      className="aps-search__clear"
                      aria-label="Effacer la recherche"
                      onClick={() => setRecherche('')}
                      style={{ border: 'none', background: 'transparent', color: 'inherit', opacity: 0.6, cursor: 'pointer' }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="aps-card">
          <div className="aps-card__body p-0">
            {loading ? (
              <div className="text-center py-5">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
            ) : lignesTable.length === 0 ? (
              <div className="text-center aps-text-muted py-5">Aucune annonce ne correspond à ces critères.</div>
            ) : (
              <div className="table-responsive">
                <table className="table aps-table mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Annonce</th>
                      <th>Fichier</th>
                      <th>Créée le</th>
                      <th>Validité</th>
                      <th>Statut</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTable.map((annonce) => {
                      const meta = metaStatutAffiche(annonce);
                      const fichier = metaFichier(annonce.file_url);
                      const expiration = dateExpirationEstimee(annonce);
                      return (
                        <tr key={annonce.id}>
                          <td style={{ maxWidth: 320 }}>
                            <div className="fw-semibold">{annonce.libelle}</div>
                            <div className="aps-text-muted" style={{ fontSize: 12.5 }}>
                              {apercuTexte(annonce.description)}
                            </div>
                          </td>
                          <td>
                            {annonce.file_url ? (
                              <a href={annonce.file_url} target="_blank" rel="noopener noreferrer">
                                <i className={`fa-solid ${fichier.icone} me-1`} style={{ color: fichier.couleur }}></i>
                                {fichier.libelle}
                              </a>
                            ) : (
                              <span className="aps-text-muted">—</span>
                            )}
                          </td>
                          <td>{formaterDate(annonce.date_creation)}</td>
                          <td>
                            {annonce.jour_validite} j
                            {expiration && (
                              <div className="aps-text-muted" style={{ fontSize: 12 }}>
                                jusqu'au {formaterDate(expiration)}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`aps-badge ${meta.badge}`}>
                              <i className={`fa-solid ${meta.icone}`}></i> {meta.libelle}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="d-flex gap-1 justify-content-end">
                              <button className="btn btn-sm btn-light" title="Voir / modifier" onClick={() => ouvrirDetail(annonce)}>
                                <i className="fa-solid fa-eye"></i>
                              </button>
                              {estAdmin && !annonce.expiree && (
                                <button
                                  className="btn btn-sm btn-light"
                                  title={annonce.statut ? 'Désactiver' : 'Activer'}
                                  disabled={basculeStatutEnCours}
                                  onClick={() => basculerStatut(annonce)}
                                >
                                  <i className={`fa-solid ${annonce.statut ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                                </button>
                              )}
                              {estAdmin && (
                                <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => askDelete(annonce)}>
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ===================== MODAL CRÉATION (admin) ===================== */}
      <Modal
        id="modalCreationAnnonce"
        title="Nouvelle annonce"
        isOpen={modalCreationOuverte}
        onClose={() => setModalCreationOuverte(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalCreationOuverte(false)} disabled={creationEnCours}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={soumettreCreation} disabled={creationEnCours}>
              {creationEnCours ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Création…
                </>
              ) : (
                "Créer l'annonce"
              )}
            </button>
          </>
        }
      >
        {erreurCreation && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurCreation}</div>
          </div>
        )}

        <div className="mb-3">
          <label className="form-label">
            Libellé <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className="form-control"
            maxLength={255}
            placeholder="Ex. : Nouvelle campagne de vaccination gratuite"
            value={formCreation.libelle}
            onChange={(e) => setFormCreation((f) => ({ ...f, libelle: e.target.value }))}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Durée de validité (jours) <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={JOUR_VALIDITE_MAX}
            className="form-control"
            style={{ maxWidth: 160 }}
            value={formCreation.jour_validite}
            onChange={(e) => setFormCreation((f) => ({ ...f, jour_validite: e.target.value }))}
          />
          <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
            L'annonce sera automatiquement considérée comme expirée après ce délai à compter de sa création.
          </div>
        </div>

        <div className="mb-1">
          <label className="form-label d-flex justify-content-between">
            <span>Description (optionnel)</span>
            <span className="aps-text-muted" style={{ fontSize: 12 }}>
              {formCreation.description.length}/{DESCRIPTION_LONGUEUR_MAX}
            </span>
          </label>
          <textarea
            className="form-control"
            rows={4}
            maxLength={DESCRIPTION_LONGUEUR_MAX}
            placeholder="Détails complémentaires affichés avec l'annonce…"
            value={formCreation.description}
            onChange={(e) => setFormCreation((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="mb-1 mt-3">
          <label className="form-label">Visuel ou flyer (optionnel)</label>
          <ChampFichier
            fichier={formCreation.fichier}
            urlExistante={null}
            erreur={erreurFichierCreation}
            onChange={(f, erreur) => {
              setFormCreation((prev) => ({ ...prev, fichier: f }));
              setErreurFichierCreation(erreur);
            }}
          />
        </div>
      </Modal>

      {/* ===================== MODAL DÉTAIL / ÉDITION ===================== */}
      <Modal
        id="modalDetailAnnonce"
        large
        title={modeEdition ? "Modifier l'annonce" : "Détail de l'annonce"}
        isOpen={modalDetailOuverte}
        onClose={() => setModalDetailOuverte(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalDetailOuverte(false)} disabled={enregistrementEnCours}>
              Fermer
            </button>
            {annonceActive && estAdmin && (
              <button className="btn btn-outline-danger" onClick={() => askDelete(annonceActive)} disabled={enregistrementEnCours}>
                <i className="fa-solid fa-trash me-1"></i>Supprimer
              </button>
            )}
            {annonceActive && estAdmin && !annonceActive.expiree && !modeEdition && (
              <button
                className="btn btn-outline-secondary"
                onClick={() => basculerStatut(annonceActive)}
                disabled={basculeStatutEnCours}
              >
                <i className={`fa-solid ${annonceActive.statut ? 'fa-toggle-on' : 'fa-toggle-off'} me-1`}></i>
                {annonceActive.statut ? 'Désactiver' : 'Activer'}
              </button>
            )}
            {annonceActive && estAdmin && !modeEdition && (
              <button className="btn btn-primary" onClick={() => setModeEdition(true)}>
                <i className="fa-solid fa-pen me-1"></i>Modifier
              </button>
            )}
            {modeEdition && (
              <button className="btn btn-primary" onClick={enregistrerEdition} disabled={enregistrementEnCours}>
                {enregistrementEnCours ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                  </>
                ) : (
                  'Enregistrer les modifications'
                )}
              </button>
            )}
          </>
        }
      >
        {erreurEdition && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurEdition}</div>
          </div>
        )}

        {annonceActive && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-8">
                <label className="form-label">Libellé</label>
                {modeEdition ? (
                  <input
                    type="text"
                    className="form-control"
                    maxLength={255}
                    value={formEdition.libelle}
                    onChange={(e) => setFormEdition((f) => ({ ...f, libelle: e.target.value }))}
                  />
                ) : (
                  <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                    {annonceActive.libelle}
                  </div>
                )}
              </div>
              <div className="col-md-4">
                <label className="form-label">Statut</label>
                <div>
                  <span className={`aps-badge ${metaStatutAffiche(annonceActive).badge}`}>
                    <i className={`fa-solid ${metaStatutAffiche(annonceActive).icone}`}></i>{' '}
                    {metaStatutAffiche(annonceActive).libelle}
                  </span>
                </div>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <label className="form-label">Créée le</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  {formaterDateHeure(annonceActive.date_creation)}
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label">Durée de validité (jours)</label>
                {modeEdition ? (
                  <input
                    type="number"
                    min={1}
                    max={JOUR_VALIDITE_MAX}
                    className="form-control"
                    value={formEdition.jour_validite}
                    onChange={(e) => setFormEdition((f) => ({ ...f, jour_validite: e.target.value }))}
                  />
                ) : (
                  <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                    {annonceActive.jour_validite} j
                  </div>
                )}
              </div>
              <div className="col-md-4">
                <label className="form-label">Expiration estimée</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  {formaterDate(dateExpirationEstimee(annonceActive)) || '—'}
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Visuel ou flyer</label>
              {modeEdition ? (
                <ChampFichier
                  fichier={formEdition.fichier}
                  urlExistante={annonceActive.file_url}
                  erreur={erreurFichierEdition}
                  onChange={(f, erreur) => {
                    setFormEdition((prev) => ({ ...prev, fichier: f }));
                    setErreurFichierEdition(erreur);
                  }}
                />
              ) : annonceActive.file_url ? (
                <div>
                  <a href={annonceActive.file_url} target="_blank" rel="noopener noreferrer">
                    <i
                      className={`fa-solid ${metaFichier(annonceActive.file_url).icone} me-1`}
                      style={{ color: metaFichier(annonceActive.file_url).couleur }}
                    ></i>
                    {metaFichier(annonceActive.file_url).libelle} — ouvrir
                  </a>
                  {typeFichier(annonceActive.file_url) === 'image' && (
                    <div className="mt-2">
                      <img
                        src={annonceActive.file_url}
                        alt={annonceActive.libelle}
                        style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="aps-text-muted" style={{ fontSize: 13 }}>
                  Aucun fichier — annonce purement textuelle.
                </div>
              )}
            </div>

            <div className="mb-1">
              <label className="form-label d-flex justify-content-between">
                <span>Description</span>
                {modeEdition && (
                  <span className="aps-text-muted" style={{ fontSize: 12 }}>
                    {formEdition.description.length}/{DESCRIPTION_LONGUEUR_MAX}
                  </span>
                )}
              </label>
              {modeEdition ? (
                <textarea
                  className="form-control"
                  rows={5}
                  maxLength={DESCRIPTION_LONGUEUR_MAX}
                  placeholder="Aucune description renseignée…"
                  value={formEdition.description}
                  onChange={(e) => setFormEdition((f) => ({ ...f, description: e.target.value }))}
                />
              ) : (
                <div className="aps-card" style={{ padding: 12, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>
                  {annonceActive.description || '—'}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDeleteAnnonce"
        title="Confirmer la suppression"
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setPendingDelete(null)} disabled={deleteSaving}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={deleteSaving}>
              {deleteSaving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Suppression…
                </>
              ) : (
                'Supprimer'
              )}
            </button>
          </>
        }
      >
        <div className="aps-notice is-danger">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            Supprimer définitivement l'annonce « {pendingDelete?.libelle} » ? Action irréversible — le fichier associé
            sera également retiré du stockage.
          </div>
        </div>
        {deleteError && (
          <div className="aps-notice is-danger mt-3">
            <i className="fa-solid fa-circle-xmark"></i>
            <div>{deleteError}</div>
          </div>
        )}
      </Modal>
    </>
  );
}