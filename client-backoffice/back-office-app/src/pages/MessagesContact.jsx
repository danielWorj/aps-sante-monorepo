// src/pages/MessagesContact.jsx
// Boîte de réception du formulaire public « Contactez-nous » du site web :
// filtre par statut, recherche, lecture du message, réponse directe
// (e-mail / WhatsApp / appel) et suivi (nouveau → en cours → traité,
// note interne).
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import { listerMessagesContact, modifierMessageContact } from '../services/contactService';

const STATUTS = [
  { cle: 'nouveau', libelle: 'Nouveaux', badge: 'is-info' },
  { cle: 'en_cours', libelle: 'En cours', badge: 'is-warning' },
  { cle: 'traite', libelle: 'Traités', badge: 'is-success' },
];
const LIBELLE_STATUT = { nouveau: 'Nouveau', en_cours: 'En cours', traite: 'Traité' };
const BADGE_STATUT = Object.fromEntries(STATUTS.map((s) => [s.cle, s.badge]));

const PROFILS = {
  patient: 'Patient', professionnel: 'Professionnel de santé', structure: 'Structure de santé',
  pharmacie: 'Pharmacie', assurance: 'Assureur / courtier', annonceur: 'Annonceur', autre: 'Autre',
};
const SUJETS = {
  question: 'Question générale', rendez_vous: 'Rendez-vous / téléconsultation', paiement: 'Paiement / remboursement',
  partenariat: 'Référencement / partenariat', publicite: 'Publicité', technique: 'Problème technique',
  donnees: 'Données personnelles', autre: 'Autre',
};

const dateHeure = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const numeroWhatsapp = (tel) => String(tel || '').replace(/\D/g, '');

export default function MessagesContact() {
  const toast = useToast();
  const [statut, setStatut] = useState('nouveau');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(null);
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [tentative, setTentative] = useState(0);

  // Recherche différée (300 ms).
  const charger = useCallback(
    () =>
      listerMessagesContact({ statut, recherche, page })
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.')),
    [statut, recherche, page]
  );
  useEffect(() => {
    const minuteur = setTimeout(charger, 300);
    return () => clearTimeout(minuteur);
  }, [charger, tentative]);

  const ouvrir = (m) => { setSelection(m); setNote(m.note_interne || ''); };

  async function enregistrer(changements, messageSucces) {
    if (!selection) return;
    setEnvoi(true);
    try {
      const maj = await modifierMessageContact(selection.message_contact_id, changements);
      setSelection(maj);
      setNote(maj.note_interne || '');
      toast.succes(messageSucces);
      await charger();
    } catch (err) {
      toast.erreur(err.message || 'Mise à jour impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  const messages = donnees?.messages || [];
  const pagination = donnees?.pagination;
  const parStatut = donnees?.par_statut || {};

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Support <span className="sep">/</span> Messages de contact</div>
          <h1>Messages de contact</h1>
        </div>
        <button className="btn btn-light" onClick={() => setTentative((t) => t + 1)}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Messages envoyés depuis la page publique « Contactez-nous ». Objectif affiché aux visiteurs : réponse sous 48 heures ouvrées.
      </p>
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      <div className="row g-3">
        <div className={selection ? 'col-12 col-xl-7' : 'col-12'}>
          <div className="aps-card">
            <div className="aps-tabs px-2 pt-1">
              {STATUTS.map((s) => (
                <button key={s.cle} className={statut === s.cle ? 'is-active' : ''}
                  onClick={() => { setStatut(s.cle); setPage(1); setSelection(null); }}>
                  {s.libelle}
                  <span className={`aps-badge ${s.badge} ms-2`}>{parStatut[s.cle] ?? 0}</span>
                </button>
              ))}
              <button className={statut === '' ? 'is-active' : ''} onClick={() => { setStatut(''); setPage(1); setSelection(null); }}>
                Tous
              </button>
            </div>
            <div className="aps-toolbar">
              <div className="aps-search">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input type="text" placeholder="Nom, e-mail, téléphone ou contenu…" value={recherche}
                  onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
              </div>
            </div>
            <div className="aps-table-wrap">
              <table className="table aps-table">
                <thead>
                  <tr><th>Reçu le</th><th>Expéditeur</th><th>Objet</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {!donnees && !erreur ? (
                    <tr><td colSpan={4}><div className="aps-empty-mini">Chargement…</div></td></tr>
                  ) : messages.length === 0 ? (
                    <tr><td colSpan={4}><div className="aps-empty-mini">Aucun message.</div></td></tr>
                  ) : messages.map((m) => (
                    <tr key={m.message_contact_id} onClick={() => ouvrir(m)} style={{ cursor: 'pointer' }}
                      className={selection?.message_contact_id === m.message_contact_id ? 'table-active' : undefined}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateHeure(m.date_creation)}</td>
                      <td>
                        <span className="cell-title">{m.nom}</span>
                        <div className="aps-text-muted" style={{ fontSize: 12 }}>{PROFILS[m.profil] || m.profil}</div>
                      </td>
                      <td>
                        {SUJETS[m.sujet] || m.sujet}
                        <div className="aps-text-muted text-truncate" style={{ fontSize: 12, maxWidth: 320 }}>{m.message}</div>
                      </td>
                      <td><span className={`aps-badge ${BADGE_STATUT[m.statut]}`}>{LIBELLE_STATUT[m.statut]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.pages > 1 && (
              <div className="d-flex justify-content-between align-items-center p-3">
                <span className="aps-text-muted">Page {pagination.page} / {pagination.pages} · {pagination.total} messages</span>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-light" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
                  <button className="btn btn-sm btn-light" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {selection && (
          <div className="col-12 col-xl-5">
            <div className="aps-card p-3">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <h5 className="mb-1">{selection.nom}</h5>
                  <div className="aps-text-muted" style={{ fontSize: 13 }}>
                    {PROFILS[selection.profil] || selection.profil} · {dateHeure(selection.date_creation)}
                    {selection.utilisateur_id && <> · <span className="aps-badge is-neutral">Compte ApSa</span></>}
                  </div>
                </div>
                <button className="btn-close" aria-label="Fermer" onClick={() => setSelection(null)}></button>
              </div>

              <div className="mt-3">
                <span className={`aps-badge ${BADGE_STATUT[selection.statut]}`}>{LIBELLE_STATUT[selection.statut]}</span>
                <strong className="ms-2">{SUJETS[selection.sujet] || selection.sujet}</strong>
              </div>
              <div className="mt-3 p-3 rounded" style={{ background: 'var(--aps-bg-subtle, #f8f9fb)', whiteSpace: 'pre-wrap' }}>
                {selection.message}
              </div>

              <div className="d-flex flex-wrap gap-2 mt-3">
                {selection.email && (
                  <a className="btn btn-sm btn-outline-primary"
                    href={`mailto:${selection.email}?subject=${encodeURIComponent(`ApSa — ${SUJETS[selection.sujet] || 'Votre message'}`)}`}>
                    <i className="fa-regular fa-envelope me-1"></i>{selection.email}
                  </a>
                )}
                {selection.telephone && (
                  <>
                    <a className="btn btn-sm btn-outline-success" href={`https://wa.me/${numeroWhatsapp(selection.telephone)}`} target="_blank" rel="noreferrer">
                      <i className="fa-brands fa-whatsapp me-1"></i>WhatsApp
                    </a>
                    <a className="btn btn-sm btn-light" href={`tel:${selection.telephone.replace(/\s/g, '')}`}>
                      <i className="fa-solid fa-phone me-1"></i>{selection.telephone}
                    </a>
                  </>
                )}
              </div>

              <label className="form-label mt-3" htmlFor="note-interne">Note interne</label>
              <textarea id="note-interne" className="form-control" rows={3} maxLength={2000} value={note}
                onChange={(e) => setNote(e.target.value)} placeholder="Suivi, réponse apportée… (non visible par l'expéditeur)" />

              <div className="d-flex flex-wrap gap-2 mt-3">
                <button className="btn btn-sm btn-light" disabled={envoi || note === (selection.note_interne || '')}
                  onClick={() => enregistrer({ note_interne: note }, 'Note enregistrée.')}>
                  <i className="fa-solid fa-floppy-disk me-1"></i>Enregistrer la note
                </button>
                {selection.statut !== 'en_cours' && (
                  <button className="btn btn-sm btn-warning" disabled={envoi}
                    onClick={() => enregistrer({ statut: 'en_cours', note_interne: note }, 'Message pris en charge.')}>
                    <i className="fa-solid fa-hourglass-half me-1"></i>Prendre en charge
                  </button>
                )}
                {selection.statut !== 'traite' && (
                  <button className="btn btn-sm btn-success" disabled={envoi}
                    onClick={() => enregistrer({ statut: 'traite', note_interne: note }, 'Message marqué comme traité.')}>
                    <i className="fa-solid fa-check me-1"></i>Marquer traité
                  </button>
                )}
                {selection.statut === 'traite' && (
                  <button className="btn btn-sm btn-light" disabled={envoi}
                    onClick={() => enregistrer({ statut: 'en_cours' }, 'Message rouvert.')}>
                    <i className="fa-solid fa-rotate-left me-1"></i>Rouvrir
                  </button>
                )}
              </div>
              {selection.date_traitement && (
                <div className="aps-text-muted mt-2" style={{ fontSize: 12 }}>Traité le {dateHeure(selection.date_traitement)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
