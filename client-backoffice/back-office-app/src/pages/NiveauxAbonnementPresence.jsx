// src/pages/NiveauxAbonnementPresence.jsx
//
// Niveaux d'abonnement de présence d'un type d'acteur (pharmacies, centres
// de santé, médecins) — même écran que NiveauxAbonnementAssurance.jsx.
// Chaque case cochée est une donnée de la fiche ENVOYÉE au public pour les
// abonnés de ce niveau (le serveur décide, voir lib/droitsPresence.js) :
//   - actif = vendable ; décocher n'enlève RIEN aux abonnés en cours ;
//   - un rang supérieur inclut tous les avantages des rangs inférieurs ;
//   - pas de prix ici : il vit dans « Tarifs & paramètres » ;
//   - l'abonnement n'apporte AUCUN avantage de classement.
import { useCallback, useEffect, useState } from 'react';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import {
  TYPES_PRESENCE,
  TOUS_DRAPEAUX,
  drapeauxDuType,
  listerNiveaux,
  creerNiveau,
  modifierNiveau,
} from '../services/abonnementPresenceService';

const VIDE = {
  code: '',
  libelle: '',
  rang: '',
  actif: true,
  ...Object.fromEntries(TOUS_DRAPEAUX.map(([cle]) => [cle, false])),
  max_photos: '',
  max_gestionnaires: '',
};

const quotaVersForm = (v) => (v === null || v === undefined ? '' : String(v));
const quotaVersApi = (v) => (v === '' ? null : Number(v));

export default function NiveauxAbonnementPresence({ type }) {
  const config = TYPES_PRESENCE[type];
  const [appliques, reserves] = drapeauxDuType(type);
  const [niveaux, setNiveaux] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(null);
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  // Pas de setState synchrone : appelée depuis un effet (react-hooks/set-state-in-effect).
  const charger = useCallback(
    () =>
      listerNiveaux(type)
        .then((n) => { setNiveaux(n); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'))
        .finally(() => setChargement(false)),
    [type]
  );
  useEffect(() => { charger(); }, [charger]);

  const ouvrir = (n) => {
    setErreurForm(null);
    setForm(
      n
        ? { ...VIDE, ...n, rang: String(n.rang), max_photos: quotaVersForm(n.max_photos), max_gestionnaires: quotaVersForm(n.max_gestionnaires) }
        : {
            ...VIDE,
            ...Object.fromEntries(appliques.map(([cle]) => [cle, true])),
            rang: String((niveaux.at(-1)?.rang ?? 0) + 1),
          }
    );
  };

  const maj = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    const donnees = {
      code: form.code.trim(),
      libelle: form.libelle.trim(),
      rang: Number(form.rang),
      actif: form.actif,
      ...Object.fromEntries(TOUS_DRAPEAUX.map(([cle]) => [cle, !!form[cle]])),
      max_photos: quotaVersApi(form.max_photos),
      max_gestionnaires: quotaVersApi(form.max_gestionnaires),
    };
    try {
      if (form.niveau_id) {
        await modifierNiveau(type, form.niveau_id, donnees);
        setMessage(`Niveau « ${donnees.libelle} » mis à jour.`);
      } else {
        await creerNiveau(type, donnees);
        setMessage(`Niveau « ${donnees.libelle} » créé.`);
      }
      setForm(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const caseACocher = ([cle, libelle]) => (
    <div className="form-check" key={cle}>
      <input id={`niv-${cle}`} type="checkbox" className="form-check-input" checked={!!form[cle]}
        onChange={(e) => maj(cle, e.target.checked)} />
      <label className="form-check-label" htmlFor={`niv-${cle}`}>{libelle}</label>
    </div>
  );

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> {config.libelle} <span className="sep">/</span> Niveaux d&apos;abonnement</div>
          <h1>Niveaux d&apos;abonnement — {config.libelle}</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => { setChargement(true); charger(); }} disabled={chargement}><i className="fa-solid fa-rotate me-2"></i>Actualiser</button>
          <button className="btn btn-primary" onClick={() => ouvrir(null)}><i className="fa-solid fa-plus me-2"></i>Nouveau niveau</button>
        </div>
      </div>

      <div className="alert alert-info">
        Chaque case cochée est une donnée <strong>envoyée au public</strong> pour les fiches abonnées à ce niveau.
        {' '}{config.note} Un niveau de rang supérieur doit inclure tous les avantages des rangs inférieurs.
        L&apos;abonnement n&apos;influence jamais le classement des fiches.
      </div>
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr><th>Rang</th><th>Niveau</th><th>Données publiées</th><th>Vente</th><th className="text-end">Actions</th></tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={5}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : niveaux.length === 0 ? (
                <tr><td colSpan={5}><div className="aps-empty-mini">Aucun niveau. Créez au moins un niveau avant de saisir des tarifs.</div></td></tr>
              ) : niveaux.map((n) => (
                <tr key={n.niveau_id}>
                  <td>{n.rang}</td>
                  <td><strong>{n.libelle}</strong><div className="small aps-text-muted">{n.code}</div></td>
                  <td className="small">
                    {appliques.filter(([cle]) => n[cle]).map(([, l]) => l).join(' · ') || '—'}
                    {reserves.some(([cle]) => n[cle]) && (
                      <div className="aps-text-muted">Réservés : {reserves.filter(([cle]) => n[cle]).map(([, l]) => l).join(', ')}</div>
                    )}
                  </td>
                  <td><span className={`aps-badge ${n.actif ? 'is-success' : 'is-neutral'}`}>{n.actif ? 'En vente' : 'Retiré de la vente'}</span></td>
                  <td className="text-end"><button className="btn btn-sm btn-light" onClick={() => ouvrir(n)}><i className="fa-solid fa-pen"></i></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FondsModal
        titre={form?.niveau_id ? 'Modifier le niveau' : 'Nouveau niveau'}
        ouvert={!!form}
        occupe={envoi}
        onFermer={() => setForm(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-niveau-presence" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer
            </button>
          </>
        }
      >
        {form && (
          <form id="form-niveau-presence" onSubmit={enregistrer}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
            <div className="row g-2 mb-3">
              <div className="col-4">
                <label className="form-label" htmlFor="niv-code">Code</label>
                <input id="niv-code" className="form-control" required value={form.code} placeholder="standard"
                  onChange={(e) => maj('code', e.target.value)} />
              </div>
              <div className="col-5">
                <label className="form-label" htmlFor="niv-libelle">Libellé</label>
                <input id="niv-libelle" className="form-control" required value={form.libelle}
                  onChange={(e) => maj('libelle', e.target.value)} />
              </div>
              <div className="col-3">
                <label className="form-label" htmlFor="niv-rang">Rang</label>
                <input id="niv-rang" type="number" min="1" step="1" className="form-control" required value={form.rang}
                  onChange={(e) => maj('rang', e.target.value)} />
              </div>
            </div>
            <div className="form-check form-switch mb-3">
              <input id="niv-actif" type="checkbox" className="form-check-input" checked={form.actif}
                onChange={(e) => maj('actif', e.target.checked)} />
              <label className="form-check-label" htmlFor="niv-actif">En vente (n&apos;affecte pas les abonnés en cours)</label>
            </div>

            <h6>Données envoyées au public</h6>
            {appliques.map(caseACocher)}
            <h6 className="mt-3">Réservés <small className="aps-text-muted">(stockés, sans effet pour l&apos;instant)</small></h6>
            {reserves.map(caseACocher)}

            <h6 className="mt-3">Quotas <small className="aps-text-muted">(réservés ; vide = illimité)</small></h6>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label" htmlFor="niv-photos">Photos</label>
                <input id="niv-photos" type="number" min="0" step="1" className="form-control" value={form.max_photos}
                  placeholder="illimité" onChange={(e) => maj('max_photos', e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label" htmlFor="niv-gest">Gestionnaires</label>
                <input id="niv-gest" type="number" min="0" step="1" className="form-control" value={form.max_gestionnaires}
                  placeholder="illimité" onChange={(e) => maj('max_gestionnaires', e.target.value)} />
              </div>
            </div>
          </form>
        )}
      </FondsModal>
    </main>
  );
}
