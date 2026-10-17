// src/pages/ParametreDelaiConfirmation.jsx
//
// Agenda — délai H (en HEURES) pendant lequel une demande de rendez-vous non
// encore confirmée (statut « cree », pas encore payée) garde son créneau
// réservé, PAR PAYS D'EXERCICE du médecin.
//
// Même présentation que ParametreDelaiLiberation :
//   - Jamais d'update : « Définir / Modifier » crée une nouvelle version active
//     et désactive l'ancienne (transaction côté serveur). L'historique est conservé.
//   - Valeur par défaut : un pays sans délai actif applique 4 h (renvoyé par le
//     serveur dans `heures_par_defaut`) — signalé, mais pas bloquant.
//   - H est figé sur chaque RDV à sa création : modifier H ne touche que les
//     demandes faites ensuite.
//
// Droits : lecture et modification ouvertes à admin + superadmin.
import { useCallback, useEffect, useMemo, useState } from 'react';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { listerPays } from '../services/referentielService';
import {
  creerParametreDelaiConfirmation,
  listerParametresDelaiConfirmation,
} from '../services/agendaService';
import { dateHeure } from '../utils/fonds';

const LIBELLE_MODELE = 'Délai de confirmation des rendez-vous';

function heuresLisibles(heures) {
  const h = Number(heures);
  if (!Number.isFinite(h)) return '—';
  return h >= 24 && h % 24 === 0 ? `${h} h (${h / 24} j)` : `${h} h`;
}

export default function ParametreDelaiConfirmation() {
  const [pays, setPays] = useState([]);
  const [lignes, setLignes] = useState([]);
  const [bornes, setBornes] = useState({ defaut: 4, min: 1, max: 720 });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [cible, setCible] = useState(null); // pays en cours de paramétrage
  const [form, setForm] = useState({ libelle: '', heures: '' });
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [historiqueId, setHistoriqueId] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [p, d] = await Promise.all([listerPays(), listerParametresDelaiConfirmation()]);
      setPays(p || []);
      setLignes(d?.parametres_delai_confirmation || []);
      setBornes({
        defaut: d?.heures_par_defaut ?? 4,
        min: d?.heures_min ?? 1,
        max: d?.heures_max ?? 720,
      });
    } catch (err) {
      setErreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const actives = useMemo(
    () => new Map(lignes.filter((l) => l.actif).map((l) => [l.pays_id, l])),
    [lignes]
  );
  const historique = useMemo(
    () => lignes.filter((l) => l.pays_id === historiqueId),
    [lignes, historiqueId]
  );
  const sansLigne = pays.filter((p) => !actives.has(p.pays_id));

  const ouvrir = (p) => {
    const a = actives.get(p.pays_id);
    setCible(p);
    setErreurForm(null);
    setForm({ libelle: a?.libelle ?? LIBELLE_MODELE, heures: String(a ? a.heures : bornes.defaut) });
  };

  const soumettre = async (e) => {
    e.preventDefault();
    const texte = String(form.heures ?? '').trim();
    const heures = /^\d+$/.test(texte) ? Number(texte) : null;
    if (!form.libelle.trim()) return setErreurForm('Le libellé est obligatoire.');
    if (heures === null || heures < bornes.min || heures > bornes.max) {
      return setErreurForm(`Délai invalide : un nombre entier d’heures entre ${bornes.min} et ${bornes.max}.`);
    }
    setEnvoi(true);
    setErreurForm(null);
    try {
      await creerParametreDelaiConfirmation({
        pays_id: cible.pays_id,
        libelle: form.libelle.trim(),
        heures,
      });
      setMessage({
        type: 'success',
        texte: `Nouveau délai de ${heuresLisibles(heures)} activé pour ${cible.nom}. Il s’applique aux demandes de rendez-vous faites à partir de maintenant.`,
      });
      setCible(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Mise en relation <span className="sep">/</span> Délai de confirmation
          </div>
          <h1>Délai de confirmation des rendez-vous</h1>
        </div>
        <button className="btn btn-light" onClick={charger} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Quand un patient demande un rendez-vous, le créneau est retiré de l’agenda du médecin le temps que la
        demande soit confirmée (paiement). Si elle n’est pas confirmée dans ce délai — ou avant l’heure du
        créneau si elle arrive plus tôt — le rendez-vous est annulé automatiquement et le créneau redevient
        disponible. Valeur appliquée au pays d’exercice du médecin.
      </p>
      <p className="aps-text-muted">
        Le délai est figé sur chaque demande au moment où elle est faite : une modification n’affecte que les
        demandes suivantes. Sans valeur définie pour un pays, {heuresLisibles(bornes.defaut)} s’appliquent.
      </p>

      {message && <div className={`alert alert-${message.type} mb-3`} role="status">{message.texte}</div>}
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!chargement && !erreur && sansLigne.length > 0 && (
        <div className="alert alert-info" role="note">
          <strong>{sansLigne.length} pays sur la valeur par défaut ({heuresLisibles(bornes.defaut)}) :</strong>{' '}
          {sansLigne.map((p) => p.nom).join(', ')}.
        </div>
      )}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Pays</th><th>Délai actif</th><th>Libellé</th><th>Depuis</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={5}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : pays.map((p) => {
                const a = actives.get(p.pays_id);
                return (
                  <tr key={p.pays_id}>
                    <td>
                      <span className="cell-title">{p.nom}</span>{' '}
                      <small className="aps-text-muted">{p.code_iso2}</small>
                    </td>
                    <td>
                      {a
                        ? <strong>{heuresLisibles(a.heures)}</strong>
                        : <span className="aps-badge is-neutral">{heuresLisibles(bornes.defaut)} (par défaut)</span>}
                    </td>
                    <td>{a?.libelle ?? '—'}</td>
                    <td>{a ? dateHeure(a.date_debut_validite) : '—'}</td>
                    <td className="text-end">
                      <div className="aps-row-actions">
                        <button className="btn btn-sm btn-primary" onClick={() => ouvrir(p)}>
                          {a ? 'Modifier' : 'Définir'}
                        </button>
                        <button
                          className="btn btn-sm btn-light"
                          onClick={() => setHistoriqueId(historiqueId === p.pays_id ? null : p.pays_id)}
                        >
                          Historique
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!chargement && pays.length === 0 && (
                <tr><td colSpan={5} className="aps-text-muted">Aucun pays.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {historiqueId && (
        <div className="aps-card mt-3 p-3">
          <h2 className="h6">Historique — {pays.find((p) => p.pays_id === historiqueId)?.nom}</h2>
          <table className="table aps-table mb-0">
            <thead><tr><th>Depuis</th><th>Délai</th><th>Libellé</th><th>État</th></tr></thead>
            <tbody>
              {historique.map((l) => (
                <tr key={l.parametre_delai_confirmation_id}>
                  <td>{dateHeure(l.date_debut_validite)}</td>
                  <td>{heuresLisibles(l.heures)}</td>
                  <td>{l.libelle}</td>
                  <td>
                    {l.actif
                      ? <span className="aps-badge is-success">Actif</span>
                      : <span className="aps-badge is-neutral">Remplacé</span>}
                  </td>
                </tr>
              ))}
              {historique.length === 0 && (
                <tr><td colSpan={4} className="aps-text-muted">Aucune version : valeur par défaut appliquée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <FondsModal
        titre={cible ? `Délai de confirmation — ${cible.nom}` : ''}
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" form="form-delai-confirmation" type="submit" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Activer
            </button>
          </>
        }
      >
        <form id="form-delai-confirmation" onSubmit={soumettre}>
          {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
          <label className="form-label" htmlFor="delai-conf-libelle">Libellé</label>
          <input
            id="delai-conf-libelle"
            className="form-control mb-3"
            maxLength={100}
            value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            disabled={envoi}
          />
          <label className="form-label" htmlFor="delai-conf-heures">Délai (heures)</label>
          <input
            id="delai-conf-heures"
            className="form-control"
            type="number"
            inputMode="numeric"
            step={1}
            min={bornes.min}
            max={bornes.max}
            placeholder={`ex. ${bornes.defaut}`}
            value={form.heures}
            onChange={(e) => setForm({ ...form, heures: e.target.value })}
            disabled={envoi}
          />
          <small className="aps-text-muted d-block mt-2">
            Entier de {bornes.min} à {bornes.max} h. Le contrôle a lieu toutes les 5 minutes environ. Crée une
            nouvelle version active ; l’ancienne est conservée dans l’historique.
          </small>
        </form>
      </FondsModal>
    </main>
  );
}
