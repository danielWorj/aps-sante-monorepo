// src/components/GestionApk.jsx
//
// Gestion des APK mobiles (table `mobile_apk`, cf. schema.prisma) :
//
//   model MobileApk {
//     id String @id @default(uuid()) @db.Uuid
//     libelle      String    @db.VarChar(255)
//     description  String?   @db.Text
//     file_url     String    @db.Text
//     status       Boolean   @default(true)
//     date_upload  DateTime  @default(now())
//     @@map("mobile_apk")
//   }
//
// Consomme le service dédié `gestionapkService.js` (existant, calqué sur
// medecinService.js, branché sur gestionapk.controller.js /
// gestionapk.routes.js — endpoints CONFIRMÉS, plus une hypothèse) :
//   - listerApks(filtres)        → GET    /api/apks   { status?, search?, skip?, take? }
//   - creerApk(donnees)          → POST   /api/apks   (multipart ; la clé
//                                   fichier attendue par multer est `file`,
//                                   PAS `fichier` ni `file_url` — voir
//                                   CHAMP_FICHIER_APK dans gestionapkService.js
//                                   et req.file dans gestionapk.controller.js)
//   - modifierApk(id, donnees)   → PUT    /api/apks/:id (idem ; `file`
//                                   optionnel : absent = on conserve
//                                   l'ancien file_url, voir le contrôleur)
//   - supprimerApk(id)           → DELETE /api/apks/:id
//   - obtenirUrlTelechargementApk(apk) → construit l'URL ABSOLUE de
//                                   téléchargement à partir du chemin
//                                   relatif renvoyé par le serveur
//                                   (apk.file_url = "/api/apks/download/
//                                   {id}/{nomFichier}", public, sans
//                                   token — voir gestionapk.controller.js,
//                                   construireUrlTelechargement).
//
// Le state interne du formulaire garde le nom `fichier` (lisible côté
// UI) ; seule la clé envoyée à creerApk/modifierApk est `file` (voir
// soumettreFormulaire ci-dessous) pour matcher CHAMP_FICHIER_APK.
//
// Droits : cette page est réservée au SUPERADMIN (gestion des
// binaires distribués aux utilisateurs de l'app mobile — surface
// sensible). Le front masque tout si le rôle ne correspond pas, mais
// le serveur reste la seule source de vérité sur les permissions
// (403 attendu pour tout autre rôle).
//
// Reprend le patron "Modal piloté par état React" de
// RendezVous.jsx / Ordonnance.jsx / Medecin.jsx.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth, estRole } from '../context/AuthContext';
// ⚠️ Le vrai service existant côté front est gestionapkService.js (calqué
// sur medecinService.js, branché sur gestionapk.controller.js / routes
// /api/apks…) — apkService.js n'existe pas, c'était une hypothèse
// d'un commentaire antérieur. On importe donc gestionapkService.js, avec
// les vrais noms de fonctions qu'il expose : creerApk / listerApks /
// modifierApk / supprimerApk (identiques à ce qu'attendait déjà ce
// composant) + obtenirUrlTelechargementApk, indispensable pour
// construire une URL de téléchargement absolue à partir du chemin
// relatif renvoyé par le contrôleur (file_url = "/api/apks/download/
// {id}/{nomFichier}", voir gestionapk.controller.js,
// construireUrlTelechargement).
import {
  listerApks,
  creerApk,
  modifierApk,
  supprimerApk,
  obtenirUrlTelechargementApk,
} from '../services/gestionapkService';
import './../assets/style/GestionApk.css';

/* ────────────────────────── Contraintes de saisie ────────────────────────── */

// Non confirmées par un contrôleur réel — bornes raisonnables reprises
// du reste du back-office (cf. MOTIF_RENDEZ_VOUS_LONGUEUR_MAX dans
// medecinService.js) en attendant une validation serveur documentée.
const LIBELLE_LONGUEUR_MAX = 255;
const DESCRIPTION_LONGUEUR_MAX = 2000;

// Extensions acceptées par le sélecteur de fichier.
// ⚠️ BUG CORRIGÉ : ".aab" figurait ici alors que le backend
// (upload_apk.middleware.js / gestionapk.controller.js) n'accepte
// QUE l'extension ".apk" — tout envoi d'un .aab échouait donc
// systématiquement (400, "Extension de fichier non autorisée"),
// après sélection via un sélecteur qui pourtant le proposait. On
// retire .aab : un .aab n'est de toute façon pas installable par
// téléchargement direct sur un téléphone (il faut passer par
// bundletool / le Play Store), ce qui ne correspond pas à l'usage de
// ce module ("Installation directe, sans passer par un store", voir
// client-plateform/src/pages/Home.jsx).
const EXTENSIONS_FICHIER_ACCEPTEES = '.apk,application/vnd.android.package-archive';

/* ────────────────────────── Aides d'affichage ────────────────────────── */

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

// Le nom de fichier n'est pas stocké séparément en base : on le
// déduit du dernier segment de file_url pour l'affichage (le lien de
// téléchargement, lui, utilise toujours l'URL complète).
function nomFichierDepuisUrl(url) {
  if (!url) return '—';
  try {
    const chemin = new URL(url, window.location.origin).pathname;
    const segment = chemin.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : url;
  } catch {
    const segment = String(url).split('/').filter(Boolean).pop();
    return segment || url;
  }
}

function formaterTaille(octets) {
  if (!octets && octets !== 0) return null;
  const unites = ['o', 'Ko', 'Mo', 'Go'];
  let valeur = octets;
  let i = 0;
  while (valeur >= 1024 && i < unites.length - 1) {
    valeur /= 1024;
    i += 1;
  }
  return `${valeur.toFixed(valeur >= 10 || i === 0 ? 0 : 1)} ${unites[i]}`;
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

const FORM_VIDE = { apk_id: '', libelle: '', description: '', status: true, fichier: null };

export default function GestionApk() {
  const { user, status: statusAuth } = useAuth();
  const estSuperadmin = estRole(user, 'superadmin');

  /* ─── Chargement des données ─────────────────────────────────── */

  const [apks, setApks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  const [filtreStatut, setFiltreStatut] = useState('');
  const [recherche, setRecherche] = useState('');

  const chargerApks = useCallback(async () => {
    if (!estSuperadmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErreurChargement(null);
    try {
      const filtres = {};
      if (filtreStatut) filtres.status = filtreStatut === 'actif';
      const liste = await listerApks(filtres);
      setApks(liste.apks ?? []);
    } catch (err) {
      const messageAuth =
        err.status === 401
          ? 'Votre session a expiré. Reconnectez-vous pour continuer.'
          : err.message || 'Impossible de charger la liste des APK.';
      setErreurChargement(messageAuth);
    } finally {
      setLoading(false);
    }
  }, [estSuperadmin, filtreStatut]);

  useEffect(() => {
    if (statusAuth === 'loading') return;
    chargerApks();
  }, [statusAuth, chargerApks]);

  const lignesTable = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return apks;
    return apks.filter(
      (a) =>
        (a.libelle || '').toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        nomFichierDepuisUrl(a.file_url).toLowerCase().includes(q)
    );
  }, [apks, recherche]);

  const compteurs = useMemo(() => {
    const base = { total: apks.length, actifs: 0, inactifs: 0, dernierUpload: null };
    apks.forEach((a) => {
      if (a.status) base.actifs += 1;
      else base.inactifs += 1;
      const d = new Date(a.date_upload).getTime();
      if (!Number.isNaN(d) && (base.dernierUpload === null || d > base.dernierUpload)) {
        base.dernierUpload = d;
      }
    });
    return base;
  }, [apks]);

  /* ─── Modale création / édition ─────────────────────────────────── */

  const [modalFormOuverte, setModalFormOuverte] = useState(false);
  const [formulaire, setFormulaire] = useState(FORM_VIDE);
  const [apkExistant, setApkExistant] = useState(null); // pour connaître l'ancien file_url en édition
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);
  // Pourcentage (0-100) de progression du téléversement du fichier APK,
  // ou null quand aucun envoi n'est en cours. Alimenté par le callback
  // onProgress transmis à creerApk/modifierApk (voir gestionapkService.js,
  // apiFetchUpload basé sur XMLHttpRequest — fetch() ne permettant pas
  // de suivre la progression d'un envoi).
  const [progressionUpload, setProgressionUpload] = useState(null);

  function ouvrirCreation() {
    if (!estSuperadmin) return;
    setFormulaire(FORM_VIDE);
    setApkExistant(null);
    setErreurFormulaire(null);
    setModalFormOuverte(true);
  }

  function ouvrirEdition(apk) {
    if (!estSuperadmin) return;
    setFormulaire({
      apk_id: apk.id,
      libelle: apk.libelle || '',
      description: apk.description || '',
      status: !!apk.status,
      fichier: null,
    });
    setApkExistant(apk);
    setErreurFormulaire(null);
    setModalFormOuverte(true);
  }

  function fermerModalForm() {
    setModalFormOuverte(false);
    setErreurFormulaire(null);
    setProgressionUpload(null);
  }

  function modifierChampFormulaire(champ, valeur) {
    setFormulaire((f) => ({ ...f, [champ]: valeur }));
  }

  function modifierFichierFormulaire(fichier) {
    setFormulaire((f) => ({ ...f, fichier: fichier ?? null }));
  }

  async function soumettreFormulaire(evenement) {
    evenement.preventDefault();
    setErreurFormulaire(null);

    const enCreation = !formulaire.apk_id;

    if (!formulaire.libelle.trim()) {
      setErreurFormulaire('Le libellé est requis.');
      return;
    }
    if (formulaire.libelle.length > LIBELLE_LONGUEUR_MAX) {
      setErreurFormulaire(`Le libellé est trop long (${LIBELLE_LONGUEUR_MAX} caractères maximum).`);
      return;
    }
    if (formulaire.description.length > DESCRIPTION_LONGUEUR_MAX) {
      setErreurFormulaire(`La description est trop longue (${DESCRIPTION_LONGUEUR_MAX} caractères maximum).`);
      return;
    }
    if (enCreation && !formulaire.fichier) {
      setErreurFormulaire("Le fichier de l'application (APK) est requis.");
      return;
    }

    setEnregistrementEnCours(true);
    // 0 plutôt que null dès le lancement : affiche la barre à 0% tout de
    // suite (le premier évènement de progression XHR peut mettre un
    // instant à arriver, notamment sur un gros fichier / réseau lent).
    setProgressionUpload(0);
    try {
      const donnees = {
        libelle: formulaire.libelle.trim(),
        description: formulaire.description.trim() || undefined,
        status: formulaire.status,
        // ⚠️ La clé DOIT être `file` (pas `fichier`) : c'est la seule
        // clé que construireFormDataApk (gestionapkService.js,
        // CHAMP_FICHIER_APK) extrait comme un vrai fichier vers le
        // FormData multipart — et donc la seule que multer reconnaît
        // côté serveur (req.file, voir gestionapk.controller.js). Le
        // state du formulaire garde le nom `fichier` (lisible côté
        // UI), seule la clé envoyée au service change ici.
        // Absent en édition si l'admin ne remplace pas le fichier :
        // le contrôleur conserve alors l'ancien file_url tel quel.
        ...(formulaire.fichier ? { file: formulaire.fichier } : {}),
      };

      if (enCreation) {
        const cree = await creerApk(donnees, setProgressionUpload);
        setApks((prev) => [cree, ...prev]);
      } else {
        const misAJour = await modifierApk(formulaire.apk_id, donnees, setProgressionUpload);
        setApks((prev) => prev.map((a) => (a.id === misAJour.id ? misAJour : a)));
      }
      setModalFormOuverte(false);
    } catch (err) {
      setErreurFormulaire(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnregistrementEnCours(false);
      setProgressionUpload(null);
    }
  }

  /* ─── Bascule rapide du statut (actif / inactif) ─────────────────── */

  const [apkEnBascule, setApkEnBascule] = useState(null);

  async function basculerStatut(apk) {
    setErreurChargement(null);
    setApkEnBascule(apk.id);
    try {
      const misAJour = await modifierApk(apk.id, { status: !apk.status });
      setApks((prev) => prev.map((a) => (a.id === misAJour.id ? misAJour : a)));
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de changer le statut de cet APK.');
    } finally {
      setApkEnBascule(null);
    }
  }

  /* ─── Suppression ─────────────────────────────────────────────── */

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(apk) {
    setDeleteError(null);
    setPendingDelete(apk);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerApk(pendingDelete.id);
      setApks((prev) => prev.filter((a) => a.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer cet APK.');
    } finally {
      setDeleteSaving(false);
    }
  }

  /* ─── Rendu ───────────────────────────────────────────────────── */

  if (statusAuth === 'loading') {
    return (
      <main className="aps-content">
        <div className="text-center py-5">
          <i className="fa-solid fa-spinner fa-spin"></i>
        </div>
      </main>
    );
  }

  if (!estSuperadmin) {
    return (
      <main className="aps-content apk-page">
        <div className="aps-notice is-danger">
          <i className="fa-solid fa-lock"></i>
          <div>Cette section est réservée au super administrateur.</div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="aps-content apk-page">
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Application mobile</span>
              <span className="sep">/</span>
              <span>APK</span>
            </nav>
            <h1>Gestion des APK</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Versions de l'application mobile distribuées aux utilisateurs.
            </p>
          </div>
          <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
            <i className="fa-solid fa-cloud-arrow-up me-1"></i> Mettre en ligne un APK
          </button>
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary">
                  <i className="fa-solid fa-mobile-screen-button"></i>
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
              <div className="aps-kpi__label">Actifs</div>
              <div className="aps-kpi__value">{compteurs.actifs.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning">
                  <i className="fa-solid fa-ban"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Inactifs</div>
              <div className="aps-kpi__value">{compteurs.inactifs.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary">
                  <i className="fa-solid fa-clock-rotate-left"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Dernier envoi</div>
              <div className="aps-kpi__value" style={{ fontSize: 14 }}>
                {compteurs.dernierUpload ? formaterDateHeure(compteurs.dernierUpload) : '—'}
              </div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerApks}>
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
                  <option value="">Tous</option>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
              <div className="col-md-9">
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    placeholder="Libellé, description, nom de fichier…"
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
              <div className="text-center aps-text-muted py-5">Aucun APK ne correspond à ces critères.</div>
            ) : (
              <div className="table-responsive">
                <table className="table aps-table mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Libellé</th>
                      <th>Description</th>
                      <th>Fichier</th>
                      <th>Statut</th>
                      <th>Date d'envoi</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTable.map((apk) => (
                      <tr key={apk.id} className={!apk.status ? 'apk-row-inactive' : ''}>
                        <td className="cell-title">{apk.libelle}</td>
                        <td style={{ maxWidth: 260 }}>{apercuTexte(apk.description)}</td>
                        <td>
                          <a
                            href={obtenirUrlTelechargementApk(apk)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="apk-file-chip"
                            title="Télécharger ce fichier"
                          >
                            <i className="fa-solid fa-file-arrow-down me-1"></i>
                            {nomFichierDepuisUrl(apk.file_url)}
                          </a>
                          {apk.taille_octets != null && (
                            <div className="aps-text-muted mt-1" style={{ fontSize: 11 }}>
                              {formaterTaille(apk.taille_octets)}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`aps-badge ${apk.status ? 'is-success' : 'is-neutral'}`}>
                            <i className={`fa-solid ${apk.status ? 'fa-circle-check' : 'fa-circle-minus'}`}></i>{' '}
                            {apk.status ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td>{formaterDateHeure(apk.date_upload)}</td>
                        <td className="text-end">
                          <div className="d-flex gap-1 justify-content-end">
                            <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEdition(apk)}>
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-light"
                              title={apk.status ? 'Désactiver' : 'Activer'}
                              onClick={() => basculerStatut(apk)}
                              disabled={apkEnBascule === apk.id}
                            >
                              {apkEnBascule === apk.id ? (
                                <i className="fa-solid fa-spinner fa-spin"></i>
                              ) : (
                                <i className={`fa-solid ${apk.status ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                              )}
                            </button>
                            <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => askDelete(apk)}>
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ===================== MODAL CRÉATION / ÉDITION ===================== */}
      <Modal
        id="modalFormApk"
        title={formulaire.apk_id ? "Modifier l'APK" : 'Mettre en ligne un nouvel APK'}
        isOpen={modalFormOuverte}
        onClose={fermerModalForm}
        footer={
          <>
            <button className="btn btn-light" onClick={fermerModalForm} disabled={enregistrementEnCours}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={soumettreFormulaire} disabled={enregistrementEnCours}>
              {enregistrementEnCours ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                </>
              ) : formulaire.apk_id ? (
                'Enregistrer les modifications'
              ) : (
                'Mettre en ligne'
              )}
            </button>
          </>
        }
      >
        {erreurFormulaire && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurFormulaire}</div>
          </div>
        )}

        <form onSubmit={soumettreFormulaire}>
          <div className="mb-3">
            <label className="form-label">
              Libellé <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex. : Version 2.4.0 — Android"
              maxLength={LIBELLE_LONGUEUR_MAX}
              value={formulaire.libelle}
              onChange={(e) => modifierChampFormulaire('libelle', e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label d-flex justify-content-between">
              <span>Description (optionnel)</span>
              <span className="aps-text-muted" style={{ fontSize: 12 }}>
                {formulaire.description.length}/{DESCRIPTION_LONGUEUR_MAX}
              </span>
            </label>
            <textarea
              className="form-control"
              rows={4}
              maxLength={DESCRIPTION_LONGUEUR_MAX}
              placeholder="Notes de version, changements notables…"
              value={formulaire.description}
              onChange={(e) => modifierChampFormulaire('description', e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">
              Fichier APK {!formulaire.apk_id && <span className="text-danger">*</span>}
            </label>
            <input
              type="file"
              className="form-control"
              accept={EXTENSIONS_FICHIER_ACCEPTEES}
              onChange={(e) => modifierFichierFormulaire(e.target.files?.[0])}
            />
            {formulaire.apk_id && apkExistant && (
              <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
                {formulaire.fichier ? (
                  <>Remplace : <span className="apk-file-chip-inline">{nomFichierDepuisUrl(apkExistant.file_url)}</span></>
                ) : (
                  <>Fichier actuel : <span className="apk-file-chip-inline">{nomFichierDepuisUrl(apkExistant.file_url)}</span> — laisser vide pour le conserver.</>
                )}
              </div>
            )}
          </div>

          {enregistrementEnCours && progressionUpload !== null && (
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="aps-text-muted" style={{ fontSize: 12 }}>
                  <i className="fa-solid fa-cloud-arrow-up me-1"></i>
                  Téléversement en cours…
                </span>
                <span className="aps-text-muted" style={{ fontSize: 12 }}>{progressionUpload}%</span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label="Progression du téléversement de l'APK"
                aria-valuenow={progressionUpload}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ height: 8 }}
              >
                <div
                  className={`progress-bar${progressionUpload < 100 ? ' progress-bar-striped progress-bar-animated' : ' bg-success'}`}
                  style={{ width: `${progressionUpload}%` }}
                ></div>
              </div>
              {progressionUpload >= 100 && (
                <div className="aps-text-muted mt-1" style={{ fontSize: 11 }}>
                  Fichier envoyé, finalisation en cours…
                </div>
              )}
            </div>
          )}

          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="apkStatutActif"
              checked={formulaire.status}
              onChange={(e) => modifierChampFormulaire('status', e.target.checked)}
            />
            <label className="form-check-label" htmlFor="apkStatutActif">
              Actif (visible / téléchargeable par l'application mobile)
            </label>
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDeleteApk"
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
            Supprimer définitivement « {pendingDelete?.libelle} » ? Cette action est irréversible ; si cette version
            est encore utilisée par des appareils, préférez la désactiver plutôt que la supprimer.
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