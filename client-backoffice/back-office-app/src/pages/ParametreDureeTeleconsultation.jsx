// src/pages/ParametreDureeTeleconsultation.jsx
//
// Téléconsultation — durée MAXIMALE d'un appel (en MINUTES), PAR PAYS
// D'EXERCICE du médecin.
//
// Même présentation que ParametreDelaiConfirmation :
//   - Jamais d'update : « Définir / Modifier » crée une nouvelle version active
//     et désactive l'ancienne (transaction côté serveur). L'historique est conservé.
//   - Valeur par défaut : un pays sans durée active applique `minutes_par_defaut`
//     (30 min, renvoyé par le serveur).
//   - La durée est figée sur l'appel dès que médecin et patient sont présents :
//     modifier la durée ne touche que les appels qui commencent ensuite.
//
// Droits : lecture et modification ouvertes à admin + superadmin.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { listerPays } from '../services/referentielService';
import {
  creerParametreDureeTeleconsultation,
  listerParametresDureeTeleconsultation,
} from '../services/agendaService';
import { dateHeure } from '../utils/fonds';

const LIBELLE_MODELE = 'Durée des téléconsultations';

function minutesLisibles(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m)) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${m} min (${h} h ${String(m % 60).padStart(2, '0')})` : `${m} min (${h} h)`;
}

export default function ParametreDureeTeleconsultation() {
  const [pays, setPays] = useState([]);
  const [lignes, setLignes] = useState([]);
  const [bornes, setBornes] = useState({ defaut: 30, min: 5, max: 240, alerte: 5 });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const toast = useToast();
  const [cible, setCible] = useState(null); // pays en cours de paramétrage
  const [form, setForm] = useState({ libelle: '', minutes: '' });
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [historiqueId, setHistoriqueId] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [p, d] = await Promise.all([listerPays(), listerParametresDureeTeleconsultation()]);
      setPays(p || []);
      setLignes(d?.parametres_duree_teleconsultation || []);
      setBornes({
        defaut: d?.minutes_par_defaut ?? 30,
        min: d?.minutes_min ?? 5,
        max: d?.minutes_max ?? 240,
        alerte: d?.alerte_avant_fin_minutes ?? 5,
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
    setForm({ libelle: a?.libelle ?? LIBELLE_MODELE, minutes: String(a ? a.minutes : bornes.defaut) });
  };

  const soumettre = async (e) => {
    e.preventDefault();
    const texte = String(form.minutes ?? '').trim();
    const minutes = /^\d+$/.test(texte) ? Number(texte) : null;
    if (!form.libelle.trim()) return setErreurForm('Le libellé est obligatoire.');
    if (minutes === null || minutes < bornes.min || minutes > bornes.max) {
      return setErreurForm(`Durée invalide : un nombre entier de minutes entre ${bornes.min} et ${bornes.max}.`);
    }
    setEnvoi(true);
    setErreurForm(null);
    try {
      await creerParametreDureeTeleconsultation({
        pays_id: cible.pays_id,
        libelle: form.libelle.trim(),
        minutes,
      });
      toast.succes(`Nouvelle durée de ${minutesLisibles(minutes)} activée pour ${cible.nom}. Elle s’applique aux téléconsultations qui commencent à partir de maintenant.`, { duree: 7000 });
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
            Back-office <span className="sep">/</span> Mise en relation <span className="sep">/</span> Durée des téléconsultations
          </div>
          <h1>Durée des téléconsultations</h1>
        </div>
        <button className="btn btn-light" onClick={charger} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Durée maximale d’une téléconsultation, dans le pays d’exercice du médecin. Le compte à rebours démarre
        quand le médecin et le patient sont tous les deux dans l’appel ; ils sont alertés {bornes.alerte} minutes
        avant la fin, puis l’appel est coupé automatiquement et la consultation est clôturée.
      </p>
      <p className="aps-text-muted">
        La durée est figée au début de chaque appel : une modification n’affecte que les appels suivants. Sans
        valeur définie pour un pays, {minutesLisibles(bornes.defaut)} s’appliquent.
      </p>

      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!chargement && !erreur && sansLigne.length > 0 && (
        <div className="alert alert-info" role="note">
          <strong>{sansLigne.length} pays sur la valeur par défaut ({minutesLisibles(bornes.defaut)}) :</strong>{' '}
          {sansLigne.map((p) => p.nom).join(', ')}.
        </div>
      )}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Pays</th><th>Durée active</th><th>Libellé</th><th>Depuis</th>
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
                        ? <strong>{minutesLisibles(a.minutes)}</strong>
                        : <span className="aps-badge is-neutral">{minutesLisibles(bornes.defaut)} (par défaut)</span>}
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
            <thead><tr><th>Depuis</th><th>Durée</th><th>Libellé</th><th>État</th></tr></thead>
            <tbody>
              {historique.map((l) => (
                <tr key={l.parametre_duree_teleconsultation_id}>
                  <td>{dateHeure(l.date_debut_validite)}</td>
                  <td>{minutesLisibles(l.minutes)}</td>
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
        titre={cible ? `Durée des téléconsultations — ${cible.nom}` : ''}
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" form="form-duree-teleconsultation" type="submit" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Activer
            </button>
          </>
        }
      >
        <form id="form-duree-teleconsultation" onSubmit={soumettre}>
          {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
          <label className="form-label" htmlFor="duree-tele-libelle">Libellé</label>
          <input
            id="duree-tele-libelle"
            className="form-control mb-3"
            maxLength={100}
            value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            disabled={envoi}
          />
          <label className="form-label" htmlFor="duree-tele-minutes">Durée (minutes)</label>
          <input
            id="duree-tele-minutes"
            className="form-control"
            type="number"
            inputMode="numeric"
            step={1}
            min={bornes.min}
            max={bornes.max}
            placeholder={`ex. ${bornes.defaut}`}
            value={form.minutes}
            onChange={(e) => setForm({ ...form, minutes: e.target.value })}
            disabled={envoi}
          />
          <small className="aps-text-muted d-block mt-2">
            Entier de {bornes.min} à {bornes.max} minutes. Crée une nouvelle version active ; l’ancienne est
            conservée dans l’historique.
          </small>
        </form>
      </FondsModal>
    </main>
  );
}
