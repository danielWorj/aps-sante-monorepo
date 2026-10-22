// src/pages/DocumentsLegaux.jsx
// Rédaction des documents légaux affichés sur le site public : CGU
// (/cgu) et politique de confidentialité (/confidentialite). L'application
// mobile ouvre ces mêmes pages web.
//
// Cycle d'une version : brouillon (modifiable) → publiée (en vigueur, la
// précédente est archivée) → archivée. Une version publiée n'est plus
// modifiable : les comptes inscrits l'ont acceptée telle quelle. Pour
// corriger le texte, on crée une nouvelle version, pré-remplie avec la
// dernière.
import { useCallback, useEffect, useState } from 'react';
import { useConfirmation, useToast } from '../components/feedback';
import EditeurDocumentLegal from '../components/EditeurDocumentLegal';
import './../assets/style/Referentiel.css';
import './../assets/style/documentsLegaux.css';
import {
  creerBrouillon,
  enregistrerBrouillon,
  listerAcceptations,
  listerVersions,
  obtenirVersion,
  publierVersion,
  supprimerBrouillon,
} from '../services/documentLegalService';

const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://azasante.com').replace(/\/$/, '');

const TYPES = [
  { cle: 'cgu', libelle: 'Conditions générales', chemin: '/cgu', icone: 'fa-solid fa-file-contract' },
  { cle: 'confidentialite', libelle: 'Confidentialité', chemin: '/confidentialite', icone: 'fa-solid fa-user-shield' },
];

const STATUTS = {
  brouillon: { libelle: 'Brouillon', badge: 'is-warning' },
  publiee: { libelle: 'En vigueur', badge: 'is-success' },
  archivee: { libelle: 'Archivée', badge: 'is-neutral' },
};

const CONTEXTES = {
  inscription_patient: 'Inscription patient',
  inscription_medecin: 'Inscription médecin',
  creation_pharmacie: 'Création de pharmacie',
  creation_structure: 'Création de structure',
  creation_assurance: "Création d'assurance",
  creation_laboratoire: 'Création de laboratoire',
  reservation_publicite: 'Réservation de publicité',
};

const date = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const dateHeure = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function DocumentsLegaux() {
  const toast = useToast();
  const confirmer = useConfirmation();

  const [type, setType] = useState('cgu');
  const [versions, setVersions] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(null);
  // Brouillon en cours d'édition (valeurs locales non encore enregistrées).
  const [saisie, setSaisie] = useState(null);
  const [modifie, setModifie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [apercu, setApercu] = useState(false);

  const infoType = TYPES.find((t) => t.cle === type);
  const brouillonExistant = versions?.find((v) => v.statut === 'brouillon');

  const chargerVersions = useCallback(
    () =>
      listerVersions(type)
        .then((d) => { setVersions(d.versions); setErreur(null); return d.versions; })
        .catch((err) => { setErreur(err.message || 'Chargement impossible.'); return []; }),
    [type]
  );

  const ouvrirVersion = useCallback(async (id) => {
    try {
      const v = await obtenirVersion(id);
      setSelection(v);
      setSaisie(v.statut === 'brouillon'
        ? { titre: v.titre, resume_modifications: v.resume_modifications || '', contenu_html: v.contenu_html }
        : null);
      setModifie(false);
      setApercu(false);
    } catch (err) {
      toast.erreur(err.message || 'Ouverture impossible.');
    }
  }, [toast]);

  // Changement d'onglet : ouvre le brouillon s'il existe, sinon la version en vigueur.
  useEffect(() => {
    let annule = false;
    chargerVersions().then((liste) => {
      if (annule || !liste.length) return;
      const cible = liste.find((v) => v.statut === 'brouillon') || liste.find((v) => v.statut === 'publiee') || liste[0];
      ouvrirVersion(cible.version_document_legal_id);
    });
    return () => { annule = true; };
  }, [chargerVersions, ouvrirVersion]);

  // Quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!modifie) return undefined;
    const avertir = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [modifie]);

  async function abandonnerModifications() {
    if (!modifie) return true;
    return confirmer({
      titre: 'Modifications non enregistrées',
      message: 'Les changements apportés au brouillon seront perdus.',
      labelConfirmer: 'Abandonner les changements',
      variante: 'avertissement',
    });
  }

  async function changerType(cle) {
    if (cle === type || !(await abandonnerModifications())) return;
    setModifie(false);
    setVersions(null);
    setSelection(null);
    setSaisie(null);
    setType(cle);
  }

  async function choisirVersion(id) {
    if (id === selection?.version_document_legal_id || !(await abandonnerModifications())) return;
    ouvrirVersion(id);
  }

  async function nouvelleVersion() {
    if (brouillonExistant) return choisirVersion(brouillonExistant.version_document_legal_id);
    setEnvoi(true);
    try {
      const v = await creerBrouillon(type);
      toast.succes(v.numero === 1
        ? 'Brouillon créé avec un plan d’articles : remplacez chaque « [À compléter] ».'
        : `Version ${v.numero} créée à partir de la version précédente.`);
      await chargerVersions();
      await ouvrirVersion(v.version_document_legal_id);
    } catch (err) {
      toast.erreur(err.message || 'Création impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  const majSaisie = (champ) => (valeur) => {
    setSaisie((s) => ({ ...s, [champ]: valeur }));
    setModifie(true);
  };

  async function enregistrer({ silencieux = false } = {}) {
    if (!selection || !saisie) return null;
    setEnvoi(true);
    try {
      const v = await enregistrerBrouillon(selection.version_document_legal_id, saisie);
      setSelection(v);
      // Le serveur nettoie le HTML : on reprend sa version pour l'aperçu,
      // sans recharger l'éditeur (la saisie en cours reste intacte).
      setSaisie((s) => ({ ...s, titre: v.titre, resume_modifications: v.resume_modifications || '' }));
      setModifie(false);
      if (!silencieux) toast.succes('Brouillon enregistré.');
      await chargerVersions();
      return v;
    } catch (err) {
      toast.erreur(err.message || 'Enregistrement impossible.');
      return null;
    } finally {
      setEnvoi(false);
    }
  }

  async function publier() {
    if (modifie && !(await enregistrer({ silencieux: true }))) return;
    const enVigueur = versions?.find((v) => v.statut === 'publiee');
    const ok = await confirmer({
      titre: `Publier la version ${selection.numero}`,
      message: enVigueur
        ? `Elle entre en vigueur immédiatement sur le site et remplace la version ${enVigueur.numero}, qui sera archivée. Les prochaines inscriptions accepteront cette version. Le texte ne pourra plus être modifié.`
        : 'Elle entre en vigueur immédiatement sur le site. Les prochaines inscriptions accepteront cette version. Le texte ne pourra plus être modifié.',
      labelConfirmer: 'Publier',
    });
    if (!ok) return;
    setEnvoi(true);
    try {
      const r = await publierVersion(selection.version_document_legal_id);
      toast.succes(r.message);
      await chargerVersions();
      await ouvrirVersion(selection.version_document_legal_id);
    } catch (err) {
      toast.erreur(err.message || 'Publication impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer() {
    const ok = await confirmer({
      titre: 'Supprimer le brouillon',
      message: `La version ${selection.numero} (brouillon) sera supprimée définitivement.`,
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    setEnvoi(true);
    try {
      await supprimerBrouillon(selection.version_document_legal_id);
      toast.succes('Brouillon supprimé.');
      setModifie(false);
      setSelection(null);
      setSaisie(null);
      const liste = await chargerVersions();
      const enVigueur = liste.find((v) => v.statut === 'publiee');
      if (enVigueur) ouvrirVersion(enVigueur.version_document_legal_id);
    } catch (err) {
      toast.erreur(err.message || 'Suppression impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  const estBrouillon = selection?.statut === 'brouillon';

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Support <span className="sep">/</span> Documents légaux</div>
          <h1>Documents légaux</h1>
        </div>
        <a className="btn btn-light" href={`${SITE_URL}${infoType.chemin}`} target="_blank" rel="noreferrer">
          <i className="fa-solid fa-arrow-up-right-from-square me-2"></i>Voir sur le site
        </a>
      </div>

      <p className="aps-text-muted">
        Rédigez le texte ici : le site le met en forme automatiquement (sommaire, titres, couleurs).
        L&apos;application mobile ouvre la page du site. Chaque publication crée une version datée ;
        les comptes inscrits sont rattachés à la version qu&apos;ils ont acceptée.
      </p>
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      <div className="aps-card mb-3">
        <div className="aps-tabs px-2 pt-1">
          {TYPES.map((t) => (
            <button key={t.cle} className={type === t.cle ? 'is-active' : ''} onClick={() => changerType(t.cle)}>
              <i className={t.icone}></i>{t.libelle}
            </button>
          ))}
        </div>
      </div>

      <div className="row g-3">
        {/* ─────────── Versions ─────────── */}
        <div className="col-12 col-xl-4">
          <div className="aps-card">
            <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <strong>Versions</strong>
              <button className="btn btn-sm btn-primary" disabled={envoi || !versions} onClick={nouvelleVersion}>
                {brouillonExistant
                  ? <><i className="fa-solid fa-pen me-1"></i>Reprendre le brouillon</>
                  : <><i className="fa-solid fa-plus me-1"></i>Nouvelle version</>}
              </button>
            </div>
            {!versions && !erreur ? (
              <div className="aps-empty-mini p-3">Chargement…</div>
            ) : versions?.length === 0 ? (
              <div className="p-3 aps-text-muted">
                Aucun texte pour l&apos;instant : le site affiche « document pas encore publié ».
                Créez une première version pour démarrer à partir d&apos;un plan d&apos;articles.
              </div>
            ) : (
              <ul className="dl-versions">
                {versions?.map((v) => (
                  <li key={v.version_document_legal_id}>
                    <button
                      type="button"
                      className={selection?.version_document_legal_id === v.version_document_legal_id ? 'is-active' : ''}
                      onClick={() => choisirVersion(v.version_document_legal_id)}
                    >
                      <span className="dl-versions-ligne">
                        <strong>Version {v.numero}</strong>
                        <span className={`aps-badge ${STATUTS[v.statut].badge}`}>{STATUTS[v.statut].libelle}</span>
                      </span>
                      <span className="aps-text-muted dl-versions-meta">
                        {v.statut === 'brouillon'
                          ? `Modifié le ${dateHeure(v.date_modification)}`
                          : `Publiée le ${date(v.date_publication)}${v.date_archivage ? ` · archivée le ${date(v.date_archivage)}` : ''}`}
                        {v.statut !== 'brouillon' && ` · ${v.nombre_acceptations} acceptation${v.nombre_acceptations > 1 ? 's' : ''}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ─────────── Version sélectionnée ─────────── */}
        <div className="col-12 col-xl-8">
          {selection && (
            <div className="aps-card p-3">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                <div>
                  <h5 className="mb-1">
                    Version {selection.numero}{' '}
                    <span className={`aps-badge ${STATUTS[selection.statut].badge} ms-1`}>{STATUTS[selection.statut].libelle}</span>
                    {modifie && <span className="aps-badge is-info ms-2">Non enregistré</span>}
                  </h5>
                  <div className="aps-text-muted" style={{ fontSize: 13 }}>
                    {estBrouillon
                      ? `Créée le ${dateHeure(selection.date_creation)}`
                      : `En vigueur du ${date(selection.date_publication)}${selection.date_archivage ? ` au ${date(selection.date_archivage)}` : ''}`}
                  </div>
                </div>
                {estBrouillon && (
                  <div className="d-flex flex-wrap gap-2">
                    <button className="btn btn-sm btn-light" onClick={() => setApercu((a) => !a)}>
                      <i className={`fa-solid ${apercu ? 'fa-pen' : 'fa-eye'} me-1`}></i>{apercu ? 'Modifier' : 'Aperçu'}
                    </button>
                    <button className="btn btn-sm btn-light" disabled={envoi || !modifie} onClick={() => enregistrer()}>
                      <i className="fa-solid fa-floppy-disk me-1"></i>Enregistrer
                    </button>
                    <button className="btn btn-sm btn-success" disabled={envoi} onClick={publier}>
                      <i className="fa-solid fa-check me-1"></i>Publier
                    </button>
                    <button className="btn btn-sm btn-outline-danger" disabled={envoi} onClick={supprimer} title="Supprimer le brouillon">
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                )}
              </div>

              {estBrouillon && saisie ? (
                <>
                  <label className="form-label" htmlFor="dl-titre">Titre de la page</label>
                  <input id="dl-titre" className="form-control mb-3" maxLength={200} value={saisie.titre}
                    onChange={(e) => majSaisie('titre')(e.target.value)} />

                  <label className="form-label" htmlFor="dl-resume">
                    Ce qui change {selection.numero > 1 ? '(obligatoire pour publier)' : '(facultatif)'}
                  </label>
                  <textarea id="dl-resume" className="form-control mb-3" rows={2} maxLength={2000}
                    placeholder="Ex. : précisions sur le remboursement des téléconsultations (article 5)."
                    value={saisie.resume_modifications} onChange={(e) => majSaisie('resume_modifications')(e.target.value)} />

                  <div className={apercu ? 'd-none' : ''}>
                    <EditeurDocumentLegal
                      key={selection.version_document_legal_id}
                      contenu={saisie.contenu_html}
                      onChange={majSaisie('contenu_html')}
                    />
                    <div className="aps-text-muted mt-2" style={{ fontSize: 12 }}>
                      « Article » = titre principal (il apparaît dans le sommaire du site). Les liens vers le site
                      peuvent être relatifs, par exemple /contact.
                    </div>
                  </div>
                  {apercu && (
                    <div className="dl-apercu">
                      <h2 className="dl-apercu-titre">{saisie.titre}</h2>
                      <div className="doc-legal-texte" dangerouslySetInnerHTML={{ __html: saisie.contenu_html }} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {selection.resume_modifications && (
                    <div className="alert alert-light border mb-3">
                      <strong>Ce qui change :</strong> {selection.resume_modifications}
                    </div>
                  )}
                  <div className="dl-apercu">
                    <h2 className="dl-apercu-titre">{selection.titre}</h2>
                    <div className="doc-legal-texte" dangerouslySetInnerHTML={{ __html: selection.contenu_html }} />
                  </div>
                  <Acceptations version={selection} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Comptes ayant accepté une version publiée ou archivée. */
function Acceptations({ version }) {
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const id = version.version_document_legal_id;

  useEffect(() => {
    const minuteur = setTimeout(() => {
      listerAcceptations(id, { recherche, page })
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'));
    }, 300);
    return () => clearTimeout(minuteur);
  }, [id, recherche, page]);

  const liste = donnees?.acceptations || [];
  const pagination = donnees?.pagination;

  return (
    <div className="mt-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <strong>Acceptations{pagination ? ` (${pagination.total})` : ''}</strong>
        <div className="aps-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Nom, e-mail ou téléphone…" value={recherche}
            onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
        </div>
      </div>
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      <div className="aps-table-wrap">
        <table className="table aps-table">
          <thead>
            <tr><th>Date</th><th>Compte</th><th>Parcours</th><th>Adresse IP</th></tr>
          </thead>
          <tbody>
            {!donnees && !erreur ? (
              <tr><td colSpan={4}><div className="aps-empty-mini">Chargement…</div></td></tr>
            ) : liste.length === 0 ? (
              <tr><td colSpan={4}><div className="aps-empty-mini">Aucune acceptation enregistrée.</div></td></tr>
            ) : liste.map((a) => (
              <tr key={a.acceptation_document_legal_id}>
                <td style={{ whiteSpace: 'nowrap' }}>{dateHeure(a.date_acceptation)}</td>
                <td>
                  <span className="cell-title">{a.utilisateur.prenom} {a.utilisateur.nom}</span>
                  <div className="aps-text-muted" style={{ fontSize: 12 }}>
                    {a.utilisateur.email || a.utilisateur.telephone} · {a.utilisateur.role?.libelle}
                  </div>
                </td>
                <td>{CONTEXTES[a.contexte] || a.contexte}</td>
                <td className="aps-text-muted">{a.adresse_ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && pagination.pages > 1 && (
        <div className="d-flex justify-content-between align-items-center pt-2">
          <span className="aps-text-muted">Page {pagination.page} / {pagination.pages}</span>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-light" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
            <button className="btn btn-sm btn-light" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
          </div>
        </div>
      )}
    </div>
  );
}
