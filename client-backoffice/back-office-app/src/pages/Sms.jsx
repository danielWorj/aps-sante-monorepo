// src/pages/Sms.jsx
//
// SMS (Twilio) — état de la configuration, SMS de test et journal des envois.
//
//   - Les identifiants Twilio ne sont jamais saisis ici : ils vivent dans les
//     variables d'environnement du serveur (TWILIO_*) ; seule leur présence
//     est affichée.
//   - Mode test (SMS_MODE=test) : rien n'est envoyé ni facturé, le texte
//     s'affiche dans la console du serveur. Passer SMS_MODE=reel en production.
//   - Codes de vérification : texte masqué au journal, jamais renvoyables
//     (l'utilisateur en redemande un).
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import { envoyerSmsTest, listerMessagesSms, obtenirConfigurationSms, renvoyerMessageSms } from '../services/smsService';
import { dateHeure } from '../utils/fonds';

const TAILLE_PAGE = 25;

const STATUTS = {
  delivre: { libelle: 'Délivré', classe: 'is-success' },
  envoye: { libelle: 'Envoyé', classe: 'is-success' },
  simule: { libelle: 'Simulé (test)', classe: 'is-neutral' },
  echec: { libelle: 'Échec', classe: 'is-danger' },
  en_attente: { libelle: 'En cours', classe: 'is-warning' },
};

const resume = (t) => (t.length > 70 ? `${t.slice(0, 70)}…` : t);

export default function Sms() {
  const toast = useToast();

  const [config, setConfig] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [occupeId, setOccupeId] = useState(null);

  const [test, setTest] = useState({ destinataire: '', texte: 'Test SMS APS Santé.' });
  const [resultatTest, setResultatTest] = useState(null);
  const [envoiTest, setEnvoiTest] = useState(false);

  const [journal, setJournal] = useState({ total: 0, messages: [] });
  const [filtres, setFiltres] = useState({ statut: '', recherche: '' });
  const [page, setPage] = useState(1);
  const [chargementJournal, setChargementJournal] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const c = await obtenirConfigurationSms();
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
      const j = await listerMessagesSms({ ...filtres, page, taille: TAILLE_PAGE });
      setJournal({ total: j?.total ?? 0, messages: j?.messages ?? [] });
    } catch (err) {
      toast.erreur(err.message || 'Journal indisponible.');
    } finally {
      setChargementJournal(false);
    }
  }, [filtres, page, toast]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { chargerJournal(); }, [chargerJournal]);

  const pages = Math.max(1, Math.ceil(journal.total / TAILLE_PAGE));
  const twilio = config?.twilio;

  const envoyerTest = async (e) => {
    e.preventDefault();
    setEnvoiTest(true);
    setResultatTest(null);
    try {
      const r = await envoyerSmsTest(test);
      setResultatTest({ ok: true, texte: r.resultat?.identifiant_fournisseur ? `${r.message} Identifiant : ${r.resultat.identifiant_fournisseur}` : r.message });
    } catch (err) {
      const code = err.data?.code ? ` (code ${err.data.code})` : '';
      setResultatTest({ ok: false, texte: `${err.message}${code}` });
    } finally {
      setEnvoiTest(false);
      chargerJournal();
    }
  };

  const renvoyer = async (m) => {
    setOccupeId(m.message_sms_id);
    try {
      const r = await renvoyerMessageSms(m.message_sms_id);
      toast.succes(r.message);
    } catch (err) {
      toast.erreur(err.message || 'Renvoi impossible.');
    } finally {
      setOccupeId(null);
      chargerJournal();
    }
  };

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Configuration <span className="sep">/</span> SMS
          </div>
          <h1>SMS</h1>
        </div>
        <button className="btn btn-light" onClick={() => { charger(); chargerJournal(); }} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Les SMS (codes de vérification, notifications) partent par <strong>Twilio</strong>. Les identifiants se
        configurent dans les variables d’environnement du serveur (<code>TWILIO_*</code>, <code>SMS_*</code>).
      </p>

      {erreur && <div className="alert alert-danger">{erreur}</div>}

      {config && (
        <>
          {config.mode === 'test' && (
            <div className="alert alert-info">
              <strong>Mode test :</strong> aucun SMS n’est envoyé ni facturé ; leur texte s’affiche dans la console du
              serveur. Passez <code>SMS_MODE=reel</code> pour envoyer réellement.
            </div>
          )}
          {config.mode === 'reel' && !twilio?.compte_configure && (
            <div className="alert alert-warning">
              <strong>Twilio non configuré :</strong> renseignez <code>TWILIO_ACCOUNT_SID</code> et{' '}
              <code>TWILIO_AUTH_TOKEN</code> sur le serveur.
            </div>
          )}
          {config.mode === 'reel' && !twilio?.expediteur && (
            <div className="alert alert-warning">
              <strong>Expéditeur absent :</strong> renseignez <code>TWILIO_MESSAGING_SERVICE_SID</code> ou{' '}
              <code>TWILIO_FROM</code>.
            </div>
          )}

          <div className="aps-card p-3">
            <h2 className="h6">Configuration</h2>
            <dl className="row mb-0 small">
              <dt className="col-sm-4">Mode</dt>
              <dd className="col-sm-8">{config.mode === 'reel' ? 'Réel (envoi Twilio)' : 'Test (simulation)'}</dd>
              <dt className="col-sm-4">Compte Twilio</dt>
              <dd className="col-sm-8">{twilio?.compte_configure ? 'Configuré' : 'Non configuré'}</dd>
              <dt className="col-sm-4">Expéditeur</dt>
              <dd className="col-sm-8">
                {twilio?.expediteur
                  ? `${twilio.expediteur.type === 'messaging_service' ? 'Messaging Service' : 'From'} : ${twilio.expediteur.valeur}`
                  : '—'}
              </dd>
              <dt className="col-sm-4">Rappel de statut (remise)</dt>
              <dd className="col-sm-8">{twilio?.rappel_statut ? 'Activé' : 'Non configuré (statut « Envoyé » seulement)'}</dd>
              <dt className="col-sm-4">Pays autorisés</dt>
              <dd className="col-sm-8">{config.pays_autorises.join(', ') || 'Aucun'}</dd>
              <dt className="col-sm-4">Relance des échecs</dt>
              <dd className="col-sm-8">
                {config.relance_max_tentatives} tentatives sur {config.relance_fenetre_heures} h
              </dd>
            </dl>
          </div>
        </>
      )}

      <div className="aps-card mt-3 p-3">
        <h2 className="h6">Envoyer un SMS de test</h2>
        <form className="row g-2 align-items-end" onSubmit={envoyerTest}>
          <div className="col-md-4">
            <label className="form-label small" htmlFor="sms-dest">Destinataire (format international)</label>
            <input id="sms-dest" className="form-control" inputMode="tel" placeholder="+237 6XX XX XX XX" required
              value={test.destinataire} onChange={(e) => setTest({ ...test, destinataire: e.target.value })} disabled={envoiTest} />
          </div>
          <div className="col-md-6">
            <label className="form-label small" htmlFor="sms-texte">Texte</label>
            <input id="sms-texte" className="form-control" maxLength={1600} required
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
        <div className="d-flex flex-wrap gap-2 align-items-end justify-content-between mb-2">
          <h2 className="h6 mb-0">Journal des envois <small className="aps-text-muted">({journal.total})</small></h2>
          <div className="d-flex gap-2">
            <select className="form-select form-select-sm" value={filtres.statut} aria-label="Statut"
              onChange={(e) => { setPage(1); setFiltres({ ...filtres, statut: e.target.value }); }}>
              <option value="">Tous les statuts</option>
              {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
            </select>
            <input className="form-control form-control-sm" placeholder="Numéro destinataire" aria-label="Recherche"
              value={filtres.recherche}
              onChange={(e) => { setPage(1); setFiltres({ ...filtres, recherche: e.target.value }); }} />
          </div>
        </div>
        <div className="aps-table-wrap">
          <table className="table aps-table mb-0">
            <thead>
              <tr><th>Date</th><th>Destinataire</th><th>Origine</th><th>Texte</th><th>Statut</th><th>Tentatives</th><th></th></tr>
            </thead>
            <tbody>
              {chargementJournal ? (
                <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : journal.messages.map((m) => {
                const s = STATUTS[m.statut] ?? { libelle: m.statut, classe: 'is-neutral' };
                return (
                  <tr key={m.message_sms_id}>
                    <td>{dateHeure(m.date_creation)}</td>
                    <td>
                      +{m.destinataire}
                      {m.utilisateur && <small className="aps-text-muted d-block">{m.utilisateur.prenom} {m.utilisateur.nom}</small>}
                    </td>
                    <td><code>{m.origine}</code></td>
                    <td>{resume(m.texte)}</td>
                    <td>
                      <span className={`aps-badge ${s.classe}`}>{s.libelle}</span>
                      {m.erreur && <small className="d-block text-danger">{m.erreur}{m.erreur_code ? ` (${m.erreur_code})` : ''}</small>}
                    </td>
                    <td>{m.tentatives}</td>
                    <td className="text-end">
                      {m.statut === 'echec' && m.origine !== 'code_verification' && (
                        <button className="btn btn-sm btn-light" onClick={() => renvoyer(m)} disabled={occupeId === m.message_sms_id}>
                          Renvoyer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!chargementJournal && journal.messages.length === 0 && (
                <tr><td colSpan={7} className="aps-text-muted">Aucun SMS.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
            <button className="btn btn-sm btn-light" onClick={() => setPage(page - 1)} disabled={page <= 1}>Précédent</button>
            <small className="aps-text-muted">Page {page} / {pages}</small>
            <button className="btn btn-sm btn-light" onClick={() => setPage(page + 1)} disabled={page >= pages}>Suivant</button>
          </div>
        )}
      </div>
    </main>
  );
}
