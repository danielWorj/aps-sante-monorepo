// src/pages/Email.jsx
//
// E-mail (SMTP / IMAP) — état de la configuration, e-mail de test, journal
// des envois et boîte de réception.
//
//   - Les paramètres des serveurs ne sont jamais saisis ici : ils vivent dans
//     les variables d'environnement du serveur (SMTP_*, IMAP_*) ; seule leur
//     présence est affichée.
//   - Réception : le serveur relève la boîte IMAP toutes les 5 minutes
//     (« Relever maintenant » pour forcer). Une réponse à un e-mail d'APS
//     Santé est reliée à l'e-mail d'origine. Le HTML reçu n'est jamais
//     affiché (seul le texte) : aucun contenu externe n'est chargé.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import {
  envoyerEmailTest,
  listerEmailsRecus,
  listerMessagesEmail,
  marquerEmailRecu,
  obtenirConfigurationEmail,
  obtenirEmailRecu,
  releverEmailsRecus,
  renvoyerMessageEmail,
  verifierSmtp,
} from '../services/emailService';
import { dateHeure } from '../utils/fonds';

const TAILLE_PAGE = 25;

const STATUTS = {
  envoye: { libelle: 'Envoyé', classe: 'is-success' },
  echec: { libelle: 'Échec', classe: 'is-danger' },
  en_attente: { libelle: 'En cours', classe: 'is-warning' },
};

const resume = (t, n = 70) => (t && t.length > n ? `${t.slice(0, n)}…` : t || '');

function Pagination({ page, pages, setPage }) {
  if (pages <= 1) return null;
  return (
    <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
      <button className="btn btn-sm btn-light" onClick={() => setPage(page - 1)} disabled={page <= 1}>Précédent</button>
      <small className="aps-text-muted">Page {page} / {pages}</small>
      <button className="btn btn-sm btn-light" onClick={() => setPage(page + 1)} disabled={page >= pages}>Suivant</button>
    </div>
  );
}

export default function Email() {
  const toast = useToast();

  const [config, setConfig] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [verification, setVerification] = useState(false);
  const [onglet, setOnglet] = useState('envois');

  const [test, setTest] = useState({ destinataire: '', sujet: 'Test e-mail APS Santé', texte: 'Ceci est un e-mail de test.' });
  const [resultatTest, setResultatTest] = useState(null);
  const [envoiTest, setEnvoiTest] = useState(false);

  // Journal des envois
  const [journal, setJournal] = useState({ total: 0, messages: [] });
  const [filtres, setFiltres] = useState({ statut: '', recherche: '' });
  const [page, setPage] = useState(1);
  const [chargementJournal, setChargementJournal] = useState(true);
  const [occupeId, setOccupeId] = useState(null);

  // Boîte de réception
  const [boite, setBoite] = useState({ total: 0, non_lus: 0, emails: [] });
  const [filtresBoite, setFiltresBoite] = useState({ lu: '', recherche: '' });
  const [pageBoite, setPageBoite] = useState(1);
  const [chargementBoite, setChargementBoite] = useState(true);
  const [releve, setReleve] = useState(false);
  const [ouvert, setOuvert] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const c = await obtenirConfigurationEmail();
      setConfig(c?.configuration ?? null);
    } catch (err) {
      setErreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  const chargerJournal = useCallback(async () => {
    setChargementJournal(true);
    try {
      const j = await listerMessagesEmail({ ...filtres, page, taille: TAILLE_PAGE });
      setJournal({ total: j?.total ?? 0, messages: j?.messages ?? [] });
    } catch (err) {
      toast.erreur(err.message || 'Journal indisponible.');
    } finally {
      setChargementJournal(false);
    }
  }, [filtres, page, toast]);

  const chargerBoite = useCallback(async () => {
    setChargementBoite(true);
    try {
      const b = await listerEmailsRecus({ ...filtresBoite, page: pageBoite, taille: TAILLE_PAGE });
      setBoite({ total: b?.total ?? 0, non_lus: b?.non_lus ?? 0, emails: b?.emails ?? [] });
    } catch (err) {
      toast.erreur(err.message || 'Boîte de réception indisponible.');
    } finally {
      setChargementBoite(false);
    }
  }, [filtresBoite, pageBoite, toast]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { chargerJournal(); }, [chargerJournal]);
  useEffect(() => { chargerBoite(); }, [chargerBoite]);

  const smtp = config?.smtp;
  const imap = config?.imap;

  const verifier = async () => {
    setVerification(true);
    try {
      const r = await verifierSmtp();
      toast.succes(r.message);
    } catch (err) {
      toast.erreur(err.message || 'Connexion SMTP impossible.');
    } finally {
      setVerification(false);
    }
  };

  const envoyerTest = async (e) => {
    e.preventDefault();
    setEnvoiTest(true);
    setResultatTest(null);
    try {
      const r = await envoyerEmailTest(test);
      setResultatTest({ ok: true, texte: r.message });
    } catch (err) {
      const code = err.data?.code ? ` (code ${err.data.code})` : '';
      setResultatTest({ ok: false, texte: `${err.message}${code}` });
    } finally {
      setEnvoiTest(false);
      chargerJournal();
    }
  };

  const renvoyer = async (m) => {
    setOccupeId(m.message_email_id);
    try {
      const r = await renvoyerMessageEmail(m.message_email_id);
      toast.succes(r.message);
    } catch (err) {
      toast.erreur(err.message || 'Renvoi impossible.');
    } finally {
      setOccupeId(null);
      chargerJournal();
    }
  };

  const relever = async () => {
    setReleve(true);
    try {
      const r = await releverEmailsRecus();
      toast.succes(r.message);
      chargerBoite();
    } catch (err) {
      toast.erreur(err.message || 'Relève impossible.');
    } finally {
      setReleve(false);
    }
  };

  const ouvrir = async (e) => {
    if (ouvert?.email_recu_id === e.email_recu_id) return setOuvert(null);
    try {
      const r = await obtenirEmailRecu(e.email_recu_id);
      setOuvert(r.email);
      if (!e.lu) {
        await marquerEmailRecu(e.email_recu_id, true);
        setBoite((b) => ({
          ...b,
          non_lus: Math.max(0, b.non_lus - 1),
          emails: b.emails.map((x) => (x.email_recu_id === e.email_recu_id ? { ...x, lu: true } : x)),
        }));
      }
    } catch (err) {
      toast.erreur(err.message || 'E-mail indisponible.');
    }
    return undefined;
  };

  const basculerLu = async (e) => {
    try {
      await marquerEmailRecu(e.email_recu_id, !e.lu);
      chargerBoite();
    } catch (err) {
      toast.erreur(err.message || 'Mise à jour impossible.');
    }
  };

  const pages = Math.max(1, Math.ceil(journal.total / TAILLE_PAGE));
  const pagesBoite = Math.max(1, Math.ceil(boite.total / TAILLE_PAGE));

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Configuration <span className="sep">/</span> E-mail
          </div>
          <h1>E-mail</h1>
        </div>
        <button className="btn btn-light" onClick={() => { charger(); chargerJournal(); chargerBoite(); }} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Les e-mails partent par <strong>SMTP</strong> et la boîte de réception est relevée par <strong>IMAP</strong>.
        Les paramètres se configurent dans les variables d’environnement du serveur (<code>SMTP_*</code>,{' '}
        <code>IMAP_*</code>).
      </p>

      {erreur && <div className="alert alert-danger">{erreur}</div>}

      {config && (
        <>
          {!smtp?.configure && (
            <div className="alert alert-warning">
              <strong>SMTP non configuré :</strong> renseignez <code>SMTP_HOST</code>, <code>SMTP_PORT</code>,{' '}
              <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> et <code>SMTP_FROM</code> sur le serveur. Les e-mails
              sont journalisés en échec et renvoyés automatiquement une fois la configuration posée.
            </div>
          )}

          <div className="row g-3">
            <div className="col-md-6">
              <div className="aps-card p-3 h-100">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h2 className="h6 mb-0">Envoi (SMTP)</h2>
                  <button className="btn btn-sm btn-light" onClick={verifier} disabled={verification || !smtp?.configure}>
                    {verification && <span className="spinner-border spinner-border-sm me-2" />}Tester la connexion
                  </button>
                </div>
                <dl className="row mb-0 small">
                  <dt className="col-sm-5">État</dt>
                  <dd className="col-sm-7">
                    <span className={`aps-badge ${smtp?.configure ? 'is-success' : 'is-danger'}`}>
                      {smtp?.configure ? 'Configuré' : 'Non configuré'}
                    </span>
                  </dd>
                  <dt className="col-sm-5">Serveur</dt>
                  <dd className="col-sm-7">{smtp?.serveur ?? '—'}</dd>
                  <dt className="col-sm-5">Authentification</dt>
                  <dd className="col-sm-7">{smtp?.authentification ? 'Identifiants renseignés' : 'Aucune'}</dd>
                  <dt className="col-sm-5">Expéditeur</dt>
                  <dd className="col-sm-7">{smtp?.expediteur ?? '—'}</dd>
                  <dt className="col-sm-5">Répondre à</dt>
                  <dd className="col-sm-7">{smtp?.repondre_a ?? '— (expéditeur)'}</dd>
                  <dt className="col-sm-5">Relance des échecs</dt>
                  <dd className="col-sm-7">{config.relance_max_tentatives} tentatives sur {config.relance_fenetre_heures} h</dd>
                </dl>
              </div>
            </div>
            <div className="col-md-6">
              <div className="aps-card p-3 h-100">
                <h2 className="h6">Réception (IMAP)</h2>
                <dl className="row mb-0 small">
                  <dt className="col-sm-5">État</dt>
                  <dd className="col-sm-7">
                    <span className={`aps-badge ${imap?.configure ? 'is-success' : 'is-neutral'}`}>
                      {imap?.configure ? 'Relève active (5 min)' : 'Désactivée'}
                    </span>
                  </dd>
                  <dt className="col-sm-5">Serveur</dt>
                  <dd className="col-sm-7">{imap?.serveur ?? '—'}</dd>
                  <dt className="col-sm-5">Compte</dt>
                  <dd className="col-sm-7">{imap?.compte ?? '—'}</dd>
                  <dt className="col-sm-5">Dossier</dt>
                  <dd className="col-sm-7">{imap?.dossier}</dd>
                </dl>
                {!imap?.configure && (
                  <small className="aps-text-muted d-block mt-2">
                    Renseignez <code>IMAP_HOST</code> (identifiants par défaut : ceux du SMTP) pour recevoir les
                    réponses des destinataires.
                  </small>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="aps-card mt-3 p-3">
        <h2 className="h6">Envoyer un e-mail de test</h2>
        <form className="row g-2 align-items-end" onSubmit={envoyerTest}>
          <div className="col-md-3">
            <label className="form-label small" htmlFor="email-dest">Destinataire</label>
            <input id="email-dest" type="email" className="form-control" placeholder="nom@exemple.com" required
              value={test.destinataire} onChange={(e) => setTest({ ...test, destinataire: e.target.value })} disabled={envoiTest} />
          </div>
          <div className="col-md-3">
            <label className="form-label small" htmlFor="email-sujet">Objet</label>
            <input id="email-sujet" className="form-control" maxLength={255} required
              value={test.sujet} onChange={(e) => setTest({ ...test, sujet: e.target.value })} disabled={envoiTest} />
          </div>
          <div className="col-md-4">
            <label className="form-label small" htmlFor="email-texte">Texte</label>
            <input id="email-texte" className="form-control" required
              value={test.texte} onChange={(e) => setTest({ ...test, texte: e.target.value })} disabled={envoiTest} />
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary w-100" type="submit" disabled={envoiTest}>
              {envoiTest && <span className="spinner-border spinner-border-sm me-2" />}Envoyer
            </button>
          </div>
        </form>
        {resultatTest && (
          <div className={`alert mt-2 mb-0 ${resultatTest.ok ? 'alert-success' : 'alert-danger'}`}>{resultatTest.texte}</div>
        )}
      </div>

      <div className="aps-card mt-3 p-3">
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button type="button" className={`nav-link${onglet === 'envois' ? ' active' : ''}`} onClick={() => setOnglet('envois')}>
              Envois <small className="aps-text-muted">({journal.total})</small>
            </button>
          </li>
          <li className="nav-item">
            <button type="button" className={`nav-link${onglet === 'recus' ? ' active' : ''}`} onClick={() => setOnglet('recus')}>
              Boîte de réception{boite.non_lus > 0 && <span className="aps-badge is-warning ms-2">{boite.non_lus} non lu(s)</span>}
            </button>
          </li>
        </ul>

        {onglet === 'envois' ? (
          <>
            <div className="d-flex flex-wrap gap-2 justify-content-end mb-2">
              <select className="form-select form-select-sm w-auto" value={filtres.statut} aria-label="Statut"
                onChange={(e) => { setPage(1); setFiltres({ ...filtres, statut: e.target.value }); }}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
              </select>
              <input className="form-control form-control-sm w-auto" placeholder="Adresse destinataire" aria-label="Recherche"
                value={filtres.recherche}
                onChange={(e) => { setPage(1); setFiltres({ ...filtres, recherche: e.target.value }); }} />
            </div>
            <div className="aps-table-wrap">
              <table className="table aps-table mb-0">
                <thead>
                  <tr><th>Date</th><th>Destinataire</th><th>Origine</th><th>Objet</th><th>Statut</th><th>Tentatives</th><th></th></tr>
                </thead>
                <tbody>
                  {chargementJournal ? (
                    <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
                  ) : journal.messages.map((m) => {
                    const s = STATUTS[m.statut] ?? { libelle: m.statut, classe: 'is-neutral' };
                    return (
                      <tr key={m.message_email_id}>
                        <td>{dateHeure(m.date_creation)}</td>
                        <td>
                          {m.destinataire}
                          {m.utilisateur && <small className="aps-text-muted d-block">{m.utilisateur.prenom} {m.utilisateur.nom}</small>}
                        </td>
                        <td><code>{m.origine}</code></td>
                        <td title={m.texte}>{resume(m.sujet)}</td>
                        <td>
                          <span className={`aps-badge ${s.classe}`}>{s.libelle}</span>
                          {m.erreur && <small className="d-block text-danger">{m.erreur}{m.erreur_code ? ` (${m.erreur_code})` : ''}</small>}
                        </td>
                        <td>{m.tentatives}</td>
                        <td className="text-end">
                          {m.statut === 'echec' && (
                            <button className="btn btn-sm btn-light" onClick={() => renvoyer(m)} disabled={occupeId === m.message_email_id}>
                              Renvoyer
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!chargementJournal && journal.messages.length === 0 && (
                    <tr><td colSpan={7} className="aps-text-muted">Aucun e-mail envoyé.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pages} setPage={setPage} />
          </>
        ) : (
          <>
            <div className="d-flex flex-wrap gap-2 justify-content-between mb-2">
              <button className="btn btn-sm btn-light" onClick={relever} disabled={releve || !imap?.configure}>
                {releve ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="fa-solid fa-inbox me-2" />}
                Relever maintenant
              </button>
              <div className="d-flex gap-2">
                <select className="form-select form-select-sm w-auto" value={filtresBoite.lu} aria-label="Lecture"
                  onChange={(e) => { setPageBoite(1); setFiltresBoite({ ...filtresBoite, lu: e.target.value }); }}>
                  <option value="">Tous</option>
                  <option value="false">Non lus</option>
                  <option value="true">Lus</option>
                </select>
                <input className="form-control form-control-sm w-auto" placeholder="Expéditeur ou objet" aria-label="Recherche"
                  value={filtresBoite.recherche}
                  onChange={(e) => { setPageBoite(1); setFiltresBoite({ ...filtresBoite, recherche: e.target.value }); }} />
              </div>
            </div>
            <div className="aps-table-wrap">
              <table className="table aps-table mb-0">
                <thead>
                  <tr><th>Reçu le</th><th>Expéditeur</th><th>Objet</th><th>En réponse à</th><th></th></tr>
                </thead>
                <tbody>
                  {chargementBoite ? (
                    <tr><td colSpan={5}><div className="aps-empty-mini">Chargement…</div></td></tr>
                  ) : boite.emails.map((e) => (
                    <tr key={e.email_recu_id} style={{ cursor: 'pointer', fontWeight: e.lu ? 400 : 600 }} onClick={() => ouvrir(e)}>
                      <td>{dateHeure(e.date_reception)}</td>
                      <td>
                        {e.expediteur_nom || e.expediteur}
                        {e.expediteur_nom && <small className="aps-text-muted d-block">{e.expediteur}</small>}
                      </td>
                      <td>{resume(e.sujet)}</td>
                      <td>{e.message_email ? <code>{e.message_email.origine}</code> : '—'}</td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-light" onClick={(ev) => { ev.stopPropagation(); basculerLu(e); }}>
                          {e.lu ? 'Marquer non lu' : 'Marquer lu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!chargementBoite && boite.emails.length === 0 && (
                    <tr><td colSpan={5} className="aps-text-muted">Aucun e-mail reçu.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={pageBoite} pages={pagesBoite} setPage={setPageBoite} />

            {ouvert && (
              <div className="aps-card mt-3 p-3">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <h3 className="h6 mb-1">{ouvert.sujet}</h3>
                    <small className="aps-text-muted">
                      De {ouvert.expediteur_nom ? `${ouvert.expediteur_nom} <${ouvert.expediteur}>` : ouvert.expediteur}
                      {' · '}{dateHeure(ouvert.date_reception)}
                    </small>
                    {ouvert.message_email && (
                      <small className="aps-text-muted d-block">
                        Réponse à « {ouvert.message_email.sujet} » envoyé à {ouvert.message_email.destinataire}
                      </small>
                    )}
                  </div>
                  <div className="d-flex gap-2">
                    <a className="btn btn-sm btn-primary" href={`mailto:${ouvert.expediteur}?subject=${encodeURIComponent(`Re: ${ouvert.sujet}`)}`}>
                      <i className="fa-solid fa-reply me-1" />Répondre
                    </a>
                    <button className="btn btn-sm btn-light" onClick={() => setOuvert(null)} aria-label="Fermer">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                </div>
                <pre className="mt-3 mb-0 small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {ouvert.texte || '(Aucun contenu texte : e-mail au format HTML uniquement.)'}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
