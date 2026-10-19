// src/pages/WhatsApp.jsx
//
// WhatsApp — numéro(s) expéditeur d'APS Santé et suivi des envois.
//
//   - Numéros : un seul actif à la fois ; c'est lui qu'utilisent TOUS les
//     messages WhatsApp de la plateforme. Ajout, modification, activation et
//     suppression réservés au superadmin ; un numéro qui a déjà envoyé des
//     messages ne se supprime pas (on le désactive).
//   - Le jeton d'accès Meta n'est jamais saisi ici : il vit dans la variable
//     d'environnement WHATSAPP_ACCESS_TOKEN du serveur (seule sa présence est affichée).
//   - « Vérifier » interroge Meta et compare le numéro affiché chez Meta au numéro saisi.
//   - Message de test + journal des envois (renvoi manuel d'un échec).
//   - Messages : textes des notifications (publicité acceptée / rejetée /
//     payée…) avec variables {nom} ; envoyés en texte libre ou via un modèle
//     Meta approuvé dont le corps reçoit le texte en {{1}}.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirmation, useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { useAuth } from '../context/AuthContext';
import {
  activerNumeroWhatsapp,
  creerNumeroWhatsapp,
  desactiverNumeroWhatsapp,
  envoyerMessageTestWhatsapp,
  listerMessagesWhatsapp,
  listerModelesMessagesWhatsapp,
  listerNumerosWhatsapp,
  modifierModeleMessageWhatsapp,
  modifierNumeroWhatsapp,
  obtenirConfigurationWhatsapp,
  renvoyerMessageWhatsapp,
  supprimerNumeroWhatsapp,
  verifierNumeroWhatsapp,
} from '../services/whatsappService';
import { dateHeure } from '../utils/fonds';

const FORM_VIDE = { libelle: '', numero: '', phone_number_id: '', waba_id: '', actif: false };
const TAILLE_PAGE = 25;

const STATUTS = {
  envoye: { libelle: 'Envoyé', classe: 'is-success' },
  echec: { libelle: 'Échec', classe: 'is-danger' },
  en_attente: { libelle: 'En cours', classe: 'is-warning' },
};

const numeroLisible = (n) => (n ? `+${n}` : '—');

function resumeContenu(m) {
  if (m.type === 'texte') {
    const t = m.contenu?.texte ?? '';
    return t.length > 60 ? `${t.slice(0, 60)}…` : t;
  }
  return `Modèle « ${m.contenu?.nom} » (${m.contenu?.langue})`;
}

export default function WhatsApp() {
  const confirmer = useConfirmation();
  const toast = useToast();
  const { user } = useAuth();
  const estSuperadmin = user?.role === 'superadmin';

  const [config, setConfig] = useState(null);
  const [numeros, setNumeros] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [occupeId, setOccupeId] = useState(null); // ligne en cours d'action

  // Modale ajout / modification
  const [edition, setEdition] = useState(null); // null | { numero_whatsapp_id? }
  const [form, setForm] = useState(FORM_VIDE);
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  // Message de test
  const [test, setTest] = useState({ destinataire: '', mode: 'modele', texte: '', nom: 'hello_world', langue: 'en_US', parametres: '' });
  const [resultatTest, setResultatTest] = useState(null);
  const [envoiTest, setEnvoiTest] = useState(false);

  // Messages éditables
  const [modeles, setModeles] = useState([]);
  const [brouillons, setBrouillons] = useState({}); // code -> champs en cours d'édition
  const [enregistrement, setEnregistrement] = useState(null);

  // Journal
  const [journal, setJournal] = useState({ total: 0, messages: [] });
  const [filtres, setFiltres] = useState({ statut: '', recherche: '' });
  const [page, setPage] = useState(1);
  const [chargementJournal, setChargementJournal] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [c, n] = await Promise.all([obtenirConfigurationWhatsapp(), listerNumerosWhatsapp()]);
      setConfig(c?.configuration ?? null);
      setNumeros(n?.numeros_whatsapp ?? []);
    } catch (err) {
      setErreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  const chargerJournal = useCallback(async () => {
    setChargementJournal(true);
    try {
      const j = await listerMessagesWhatsapp({ ...filtres, page, taille: TAILLE_PAGE });
      setJournal({ total: j?.total ?? 0, messages: j?.messages ?? [] });
    } catch (err) {
      toast.erreur(err.message || 'Journal indisponible.');
    } finally {
      setChargementJournal(false);
    }
  }, [filtres, page, toast]);

  const chargerModeles = useCallback(async () => {
    try {
      const r = await listerModelesMessagesWhatsapp();
      const liste = r?.modeles ?? [];
      setModeles(liste);
      setBrouillons(Object.fromEntries(liste.map((m) => [m.code, {
        texte: m.texte, nom_modele_meta: m.nom_modele_meta ?? '', langue: m.langue, actif: m.actif,
      }])));
    } catch (err) {
      toast.erreur(err.message || 'Messages indisponibles.');
    }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { chargerModeles(); }, [chargerModeles]);
  useEffect(() => { chargerJournal(); }, [chargerJournal]);

  const actif = useMemo(() => numeros.find((n) => n.actif) ?? null, [numeros]);
  const pages = Math.max(1, Math.ceil(journal.total / TAILLE_PAGE));

  /* ------------------------------ Numéros ------------------------------ */

  const ouvrirAjout = () => {
    setEdition({});
    setForm({ ...FORM_VIDE, actif: !actif });
    setErreurForm(null);
  };

  const ouvrirModification = (n) => {
    setEdition({ numero_whatsapp_id: n.numero_whatsapp_id });
    setForm({ libelle: n.libelle, numero: `+${n.numero}`, phone_number_id: n.phone_number_id, waba_id: n.waba_id ?? '', actif: n.actif });
    setErreurForm(null);
  };

  const soumettre = async (e) => {
    e.preventDefault();
    if (!form.libelle.trim() || !form.numero.trim() || !form.phone_number_id.trim()) {
      return setErreurForm('Libellé, numéro et phone_number_id sont obligatoires.');
    }
    setEnvoi(true);
    setErreurForm(null);
    const corps = {
      libelle: form.libelle.trim(),
      numero: form.numero.trim(),
      phone_number_id: form.phone_number_id.trim(),
      waba_id: form.waba_id.trim(),
    };
    try {
      if (edition.numero_whatsapp_id) {
        await modifierNumeroWhatsapp(edition.numero_whatsapp_id, corps);
        toast.succes('Numéro modifié.');
      } else {
        await creerNumeroWhatsapp({ ...corps, actif: form.actif });
        toast.succes(form.actif ? 'Numéro enregistré et activé.' : 'Numéro enregistré (inactif).');
      }
      setEdition(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const agir = async (n, action) => {
    const confirmation = {
      supprimer: {
        titre: 'Supprimer le numéro',
        message: `Le numéro ${numeroLisible(n.numero)} sera supprimé définitivement.`,
        labelConfirmer: 'Supprimer',
        variante: 'danger',
      },
      desactiver: {
        titre: 'Désactiver le numéro',
        message: 'Plus aucun message WhatsApp ne partira tant qu’aucun numéro n’est actif.',
        labelConfirmer: 'Désactiver',
        variante: 'danger',
      },
      activer: actif && {
        titre: 'Changer de numéro actif',
        message: `Tous les messages partiront désormais de ${numeroLisible(n.numero)} au lieu de ${numeroLisible(actif.numero)}.`,
        labelConfirmer: 'Activer',
        variante: 'avertissement',
      },
    }[action];
    if (confirmation && !(await confirmer(confirmation))) return;

    setOccupeId(n.numero_whatsapp_id);
    try {
      if (action === 'verifier') {
        const { verification } = await verifierNumeroWhatsapp(n.numero_whatsapp_id);
        const m = verification.meta ?? {};
        if (verification.correspond) {
          toast.succes(`Numéro reconnu par Meta : ${m.display_phone_number} — « ${m.verified_name} » (qualité : ${m.quality_rating ?? '—'}).`);
        } else {
          toast.avertissement(`Meta associe ce phone_number_id à ${m.display_phone_number || 'un autre numéro'}, pas à ${numeroLisible(n.numero)}. Corrigez le numéro ou l’identifiant.`, { duree: 9000 });
        }
        return;
      }
      const r = action === 'activer'
        ? await activerNumeroWhatsapp(n.numero_whatsapp_id)
        : action === 'desactiver'
          ? await desactiverNumeroWhatsapp(n.numero_whatsapp_id)
          : await supprimerNumeroWhatsapp(n.numero_whatsapp_id);
      toast.succes(r?.message ?? 'Fait.');
      await charger();
    } catch (err) {
      toast.erreur(err.message || 'Action impossible.');
    } finally {
      setOccupeId(null);
    }
  };

  /* ------------------------------ Messages ------------------------------ */

  const majBrouillon = (code, champs) => setBrouillons((b) => ({ ...b, [code]: { ...b[code], ...champs } }));

  const enregistrerModele = async (code) => {
    setEnregistrement(code);
    try {
      const r = await modifierModeleMessageWhatsapp(code, brouillons[code]);
      toast.succes(r?.message ?? 'Message enregistré.');
      await chargerModeles();
    } catch (err) {
      toast.erreur(err.message || 'Enregistrement impossible.');
    } finally {
      setEnregistrement(null);
    }
  };

  /* ------------------------------ Test ------------------------------ */

  const envoyerTest = async (e) => {
    e.preventDefault();
    setEnvoiTest(true);
    setResultatTest(null);
    const corps = test.mode === 'texte'
      ? { destinataire: test.destinataire, texte: test.texte }
      : {
          destinataire: test.destinataire,
          modele: {
            nom: test.nom.trim(),
            langue: test.langue.trim() || 'fr',
            parametres: test.parametres.split('\n').map((p) => p.trim()).filter(Boolean),
          },
        };
    try {
      const r = await envoyerMessageTestWhatsapp(corps);
      setResultatTest({ ok: true, texte: `${r.message} Identifiant : ${r.resultat?.identifiant_fournisseur}` });
    } catch (err) {
      const code = err.data?.code ? ` (code ${err.data.code})` : '';
      setResultatTest({ ok: false, texte: `${err.message}${code}` });
    } finally {
      setEnvoiTest(false);
      chargerJournal();
    }
  };

  const renvoyer = async (m) => {
    setOccupeId(m.message_whatsapp_id);
    try {
      const r = await renvoyerMessageWhatsapp(m.message_whatsapp_id);
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
            Back-office <span className="sep">/</span> Configuration <span className="sep">/</span> WhatsApp
          </div>
          <h1>WhatsApp</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => { charger(); chargerJournal(); }} disabled={chargement}>
            <i className="fa-solid fa-rotate me-2"></i>Actualiser
          </button>
          {estSuperadmin && (
            <button className="btn btn-primary" onClick={ouvrirAjout}>
              <i className="fa-solid fa-plus me-2"></i>Ajouter un numéro
            </button>
          )}
        </div>
      </div>

      <p className="aps-text-muted">
        Tous les messages WhatsApp envoyés par la plateforme partent du <strong>numéro actif</strong> (un seul à la
        fois). Le numéro doit être enregistré dans WhatsApp Business (Meta) ; son <em>phone_number_id</em> se trouve
        dans Meta for Developers &gt; WhatsApp &gt; Configuration de l’API.
      </p>

      {erreur && <div className="alert alert-danger">{erreur}</div>}

      {!chargement && config && !config.jeton_configure && (
        <div className="alert alert-warning">
          <strong>Jeton d’accès absent :</strong> la variable <code>WHATSAPP_ACCESS_TOKEN</code> n’est pas définie sur
          le serveur. Aucun message ne peut partir tant qu’elle n’est pas renseignée.
        </div>
      )}
      {!chargement && !actif && (
        <div className="alert alert-warning">
          <strong>Aucun numéro actif :</strong> les messages sont journalisés en échec puis relancés automatiquement
          (pendant {config?.relance_fenetre_heures ?? 24} h) dès qu’un numéro est activé.
        </div>
      )}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Libellé</th><th>Numéro</th><th>phone_number_id</th><th>État</th><th>Messages</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={6}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : numeros.map((n) => {
                const occupe = occupeId === n.numero_whatsapp_id;
                return (
                  <tr key={n.numero_whatsapp_id}>
                    <td>
                      <span className="cell-title">{n.libelle}</span>
                      {n.waba_id && <small className="aps-text-muted d-block">WABA {n.waba_id}</small>}
                    </td>
                    <td><strong>{numeroLisible(n.numero)}</strong></td>
                    <td><code>{n.phone_number_id}</code></td>
                    <td>
                      {n.actif
                        ? <span className="aps-badge is-success">Actif</span>
                        : <span className="aps-badge is-neutral">Inactif</span>}
                    </td>
                    <td>{n.nombre_messages}</td>
                    <td className="text-end">
                      <div className="aps-row-actions">
                        <button className="btn btn-sm btn-light" onClick={() => agir(n, 'verifier')} disabled={occupe}>
                          {occupe ? <span className="spinner-border spinner-border-sm" /> : 'Vérifier'}
                        </button>
                        {estSuperadmin && (
                          <>
                            {n.actif ? (
                              <button className="btn btn-sm btn-outline-warning" onClick={() => agir(n, 'desactiver')} disabled={occupe}>Désactiver</button>
                            ) : (
                              <button className="btn btn-sm btn-primary" onClick={() => agir(n, 'activer')} disabled={occupe}>Activer</button>
                            )}
                            <button className="btn btn-sm btn-light" onClick={() => ouvrirModification(n)} disabled={occupe}>Modifier</button>
                            {!n.actif && n.nombre_messages === 0 && (
                              <button className="btn btn-sm btn-outline-danger" onClick={() => agir(n, 'supprimer')} disabled={occupe}>Supprimer</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!chargement && numeros.length === 0 && (
                <tr><td colSpan={6} className="aps-text-muted">Aucun numéro enregistré.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------ Message de test ------------------------------ */}
      <div className="aps-card mt-3 p-3">
        <h2 className="h6">Envoyer un message de test</h2>
        <p className="aps-text-muted small mb-3">
          Un texte libre n’arrive que si le destinataire a écrit au numéro dans les dernières 24 h. Pour un premier
          essai, utilisez un modèle approuvé (le modèle <code>hello_world</code> en <code>en_US</code> existe sur tout
          nouveau compte).
        </p>
        <form onSubmit={envoyerTest} className="row g-2 align-items-end">
          <div className="col-md-3">
            <label className="form-label" htmlFor="wa-test-dest">Destinataire</label>
            <input id="wa-test-dest" className="form-control" placeholder="+237 6XX XX XX XX" value={test.destinataire}
              onChange={(e) => setTest({ ...test, destinataire: e.target.value })} disabled={envoiTest} required />
          </div>
          <div className="col-md-2">
            <label className="form-label" htmlFor="wa-test-mode">Type</label>
            <select id="wa-test-mode" className="form-select" value={test.mode}
              onChange={(e) => setTest({ ...test, mode: e.target.value })} disabled={envoiTest}>
              <option value="modele">Modèle</option>
              <option value="texte">Texte libre</option>
            </select>
          </div>
          {test.mode === 'texte' ? (
            <div className="col-md-5">
              <label className="form-label" htmlFor="wa-test-texte">Texte</label>
              <input id="wa-test-texte" className="form-control" maxLength={4096} value={test.texte}
                onChange={(e) => setTest({ ...test, texte: e.target.value })} disabled={envoiTest} required />
            </div>
          ) : (
            <>
              <div className="col-md-2">
                <label className="form-label" htmlFor="wa-test-nom">Modèle</label>
                <input id="wa-test-nom" className="form-control" value={test.nom}
                  onChange={(e) => setTest({ ...test, nom: e.target.value })} disabled={envoiTest} required />
              </div>
              <div className="col-md-1">
                <label className="form-label" htmlFor="wa-test-langue">Langue</label>
                <input id="wa-test-langue" className="form-control" value={test.langue}
                  onChange={(e) => setTest({ ...test, langue: e.target.value })} disabled={envoiTest} />
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="wa-test-params">Paramètres (1 par ligne)</label>
                <textarea id="wa-test-params" className="form-control" rows={1} value={test.parametres}
                  onChange={(e) => setTest({ ...test, parametres: e.target.value })} disabled={envoiTest} />
              </div>
            </>
          )}
          <div className="col-md-2">
            <button className="btn btn-primary w-100" type="submit" disabled={envoiTest || !actif}>
              {envoiTest && <span className="spinner-border spinner-border-sm me-2" />}Envoyer
            </button>
          </div>
        </form>
        {resultatTest && (
          <div className={`alert alert-${resultatTest.ok ? 'success' : 'danger'} mt-3 mb-0`}>{resultatTest.texte}</div>
        )}
      </div>

      {/* ------------------------------ Messages ------------------------------ */}
      <div className="aps-card mt-3 p-3">
        <h2 className="h6">Messages envoyés aux utilisateurs</h2>
        <p className="aps-text-muted small mb-3">
          Les mots entre accolades (ex. <code>{'{titre}'}</code>) sont remplacés à l’envoi. Sans modèle Meta, le
          message part en texte libre et n’arrive que si le destinataire a écrit dans les dernières 24 h. Pour
          joindre n’importe qui, faites approuver chez Meta un modèle dont le corps contient une seule variable
          (ex. <code>APS Santé : {'{{1}}'}</code>) et indiquez son nom ici.
        </p>
        {modeles.length === 0 && <div className="aps-text-muted small">Aucun message configuré.</div>}
        {modeles.map((m) => {
          const b = brouillons[m.code] ?? {};
          const occupe = enregistrement === m.code;
          return (
            <div key={m.code} className="border rounded p-3 mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>{m.libelle} <code className="ms-1 small">{m.code}</code></strong>
                <div className="form-check form-switch mb-0">
                  <input id={`mod-actif-${m.code}`} className="form-check-input" type="checkbox" checked={!!b.actif}
                    onChange={(e) => majBrouillon(m.code, { actif: e.target.checked })} disabled={occupe} />
                  <label className="form-check-label small" htmlFor={`mod-actif-${m.code}`}>Envoi activé</label>
                </div>
              </div>
              <label className="form-label small" htmlFor={`mod-texte-${m.code}`}>Texte</label>
              <textarea id={`mod-texte-${m.code}`} className="form-control mb-2" rows={4} maxLength={1000} value={b.texte ?? ''}
                onChange={(e) => majBrouillon(m.code, { texte: e.target.value })} disabled={occupe} />
              <div className="small aps-text-muted mb-2">
                Variables : {(m.variables ?? []).map((v) => (
                  <button key={v} type="button" className="btn btn-sm btn-light py-0 px-1 me-1 mb-1"
                    onClick={() => majBrouillon(m.code, { texte: `${b.texte ?? ''}{${v}}` })} disabled={occupe}>
                    {`{${v}}`}
                  </button>
                ))}
              </div>
              <div className="row g-2 align-items-end">
                <div className="col-md-5">
                  <label className="form-label small" htmlFor={`mod-meta-${m.code}`}>Modèle Meta (facultatif)</label>
                  <input id={`mod-meta-${m.code}`} className="form-control form-control-sm" placeholder="ex. notification_aps"
                    value={b.nom_modele_meta ?? ''} onChange={(e) => majBrouillon(m.code, { nom_modele_meta: e.target.value })} disabled={occupe} />
                </div>
                <div className="col-md-2">
                  <label className="form-label small" htmlFor={`mod-langue-${m.code}`}>Langue</label>
                  <input id={`mod-langue-${m.code}`} className="form-control form-control-sm" value={b.langue ?? 'fr'}
                    onChange={(e) => majBrouillon(m.code, { langue: e.target.value })} disabled={occupe} />
                </div>
                <div className="col-md-5 text-end">
                  <small className="aps-text-muted me-2">Modifié le {dateHeure(m.date_mise_a_jour)}</small>
                  <button className="btn btn-sm btn-primary" onClick={() => enregistrerModele(m.code)} disabled={occupe}>
                    {occupe && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------------ Journal ------------------------------ */}
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
              <tr><th>Date</th><th>Destinataire</th><th>Origine</th><th>Contenu</th><th>Statut</th><th>Tentatives</th><th></th></tr>
            </thead>
            <tbody>
              {chargementJournal ? (
                <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : journal.messages.map((m) => {
                const s = STATUTS[m.statut] ?? { libelle: m.statut, classe: 'is-neutral' };
                return (
                  <tr key={m.message_whatsapp_id}>
                    <td>{dateHeure(m.date_creation)}</td>
                    <td>
                      {numeroLisible(m.destinataire)}
                      {m.utilisateur && <small className="aps-text-muted d-block">{m.utilisateur.prenom} {m.utilisateur.nom}</small>}
                    </td>
                    <td><code>{m.origine}</code></td>
                    <td>{resumeContenu(m)}</td>
                    <td>
                      <span className={`aps-badge ${s.classe}`}>{s.libelle}</span>
                      {m.erreur && <small className="d-block text-danger">{m.erreur}{m.erreur_code ? ` (${m.erreur_code})` : ''}</small>}
                    </td>
                    <td>{m.tentatives}</td>
                    <td className="text-end">
                      {m.statut === 'echec' && (
                        <button className="btn btn-sm btn-light" onClick={() => renvoyer(m)} disabled={occupeId === m.message_whatsapp_id}>
                          Renvoyer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!chargementJournal && journal.messages.length === 0 && (
                <tr><td colSpan={7} className="aps-text-muted">Aucun message.</td></tr>
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

      <FondsModal
        titre={edition?.numero_whatsapp_id ? 'Modifier le numéro WhatsApp' : 'Ajouter un numéro WhatsApp'}
        ouvert={!!edition}
        occupe={envoi}
        onFermer={() => setEdition(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setEdition(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" form="form-numero-whatsapp" type="submit" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer
            </button>
          </>
        }
      >
        <form id="form-numero-whatsapp" onSubmit={soumettre}>
          {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
          <label className="form-label" htmlFor="wa-libelle">Libellé</label>
          <input id="wa-libelle" className="form-control mb-3" maxLength={100} placeholder="ex. Numéro principal APS Santé"
            value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} disabled={envoi} />
          <label className="form-label" htmlFor="wa-numero">Numéro (format international)</label>
          <input id="wa-numero" className="form-control mb-3" placeholder="+237 6XX XX XX XX" inputMode="tel"
            value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} disabled={envoi} />
          <label className="form-label" htmlFor="wa-pnid">phone_number_id (Meta)</label>
          <input id="wa-pnid" className="form-control mb-3" inputMode="numeric" placeholder="ex. 106540352242922"
            value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} disabled={envoi} />
          <label className="form-label" htmlFor="wa-waba">Identifiant du compte WhatsApp Business (facultatif)</label>
          <input id="wa-waba" className="form-control mb-3" inputMode="numeric"
            value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} disabled={envoi} />
          {!edition?.numero_whatsapp_id && (
            <div className="form-check">
              <input id="wa-actif" className="form-check-input" type="checkbox" checked={form.actif}
                onChange={(e) => setForm({ ...form, actif: e.target.checked })} disabled={envoi} />
              <label className="form-check-label" htmlFor="wa-actif">
                Activer immédiatement{actif ? ` (remplace ${numeroLisible(actif.numero)})` : ''}
              </label>
            </div>
          )}
          <small className="aps-text-muted d-block mt-2">
            Le jeton d’accès Meta n’est pas saisi ici : il est configuré sur le serveur (WHATSAPP_ACCESS_TOKEN).
          </small>
        </form>
      </FondsModal>
    </main>
  );
}
