// src/components/TauxParPays.jsx
//
// Écran d'administration d'un taux versionné PAR PAYS (commission médecin CM,
// commission patient CP, amende médecin). Jamais d'update : « Définir » crée une nouvelle version
// active et désactive l'ancienne (transaction côté serveur). Aucune valeur
// par défaut : un pays sans ligne active est signalé.
//
// Props facultatives (ajoutées pour l'écran à deux onglets CM / CP) :
//   - onglets        : nœud affiché sous l'en-tête (barre d'onglets) ;
//   - note           : nœud affiché sous l'introduction (ex. rappel « 0 % est valide ») ;
//   - graviteAbsent  : 'warning' (défaut) | 'danger' — niveau de l'alerte « pays sans taux ».
import { useCallback, useEffect, useMemo, useState } from 'react';
import './../assets/style/Referentiel.css';
import { listerPays } from '../services/referentielService';
import FondsModal from './FondsModal';
import { dateHeure, pourcent, pourcentDepuisTaux, tauxDepuisPourcent } from '../utils/fonds';

export default function TauxParPays({
  titre, fil, intro, alerteAbsent, libelleModele, lister, creer,
  onglets = null, note = null, graviteAbsent = 'warning',
}) {
  const [pays, setPays] = useState([]);
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [cible, setCible] = useState(null); // pays en cours de paramétrage
  const [form, setForm] = useState({ libelle: '', taux: '' });
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [historiqueId, setHistoriqueId] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [p, l] = await Promise.all([listerPays(), lister()]);
      setPays(p || []);
      setLignes(l || []);
    } catch (err) {
      setErreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [lister]);

  useEffect(() => { charger(); }, [charger]);

  const actives = useMemo(() => new Map(lignes.filter((l) => l.actif).map((l) => [l.pays_id, l])), [lignes]);
  const historique = useMemo(
    () => lignes.filter((l) => l.pays_id === historiqueId),
    [lignes, historiqueId]
  );
  const sansLigne = pays.filter((p) => !actives.has(p.pays_id));

  const ouvrir = (p) => {
    const a = actives.get(p.pays_id);
    setCible(p);
    setErreurForm(null);
    setForm({ libelle: a?.libelle ?? libelleModele, taux: a ? pourcentDepuisTaux(a.taux) : '' });
  };

  const soumettre = async (e) => {
    e.preventDefault();
    const taux = tauxDepuisPourcent(form.taux);
    if (!form.libelle.trim()) return setErreurForm('Le libellé est obligatoire.');
    if (taux === null) return setErreurForm('Taux invalide : entre 0 et 100 %, deux décimales au maximum.');
    setEnvoi(true);
    setErreurForm(null);
    try {
      await creer({ pays_id: cible.pays_id, libelle: form.libelle.trim(), taux });
      setMessage({ type: 'success', texte: `Nouveau taux de ${pourcent(taux)} activé pour ${cible.nom}.` });
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
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Finance <span className="sep">/</span> {fil}</div>
          <h1>{titre}</h1>
        </div>
        <button className="btn btn-light" onClick={charger} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      {onglets}

      <p className="aps-text-muted">{intro}</p>
      {note}

      {message && <div className={`alert alert-${message.type} mb-3`} role="status">{message.texte}</div>}
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!chargement && sansLigne.length > 0 && (
        <div className={`alert alert-${graviteAbsent}`} role="alert">
          <strong>{sansLigne.length} pays sans taux actif :</strong> {sansLigne.map((p) => p.nom).join(', ')}. {alerteAbsent}
        </div>
      )}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr><th>Pays</th><th>Taux actif</th><th>Libellé</th><th>Depuis</th><th className="text-end">Actions</th></tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={5}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : pays.map((p) => {
                const a = actives.get(p.pays_id);
                return (
                  <tr key={p.pays_id}>
                    <td><span className="cell-title">{p.nom}</span> <small className="aps-text-muted">{p.code_iso2}</small></td>
                    <td>{a ? <strong>{pourcent(a.taux)}</strong> : <span className="aps-badge is-danger">Non défini</span>}</td>
                    <td>{a?.libelle ?? '—'}</td>
                    <td>{a ? dateHeure(a.date_debut_validite) : '—'}</td>
                    <td className="text-end">
                      <div className="aps-row-actions">
                        <button className="btn btn-sm btn-primary" onClick={() => ouvrir(p)}>{a ? 'Modifier' : 'Définir'}</button>
                        <button className="btn btn-sm btn-light" onClick={() => setHistoriqueId(historiqueId === p.pays_id ? null : p.pays_id)}>
                          Historique
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {historiqueId && (
        <div className="aps-card mt-3 p-3">
          <h2 className="h6">Historique — {pays.find((p) => p.pays_id === historiqueId)?.nom}</h2>
          <table className="table aps-table mb-0">
            <thead><tr><th>Depuis</th><th>Taux</th><th>Libellé</th><th>État</th></tr></thead>
            <tbody>
              {historique.map((l) => (
                <tr key={`${l.pays_id}-${l.date_debut_validite}`}>
                  <td>{dateHeure(l.date_debut_validite)}</td>
                  <td>{pourcent(l.taux)}</td>
                  <td>{l.libelle}</td>
                  <td>{l.actif ? <span className="aps-badge is-success">Actif</span> : <span className="aps-badge is-neutral">Remplacé</span>}</td>
                </tr>
              ))}
              {historique.length === 0 && <tr><td colSpan={4} className="aps-text-muted">Aucune version.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <FondsModal
        titre={cible ? `${titre} — ${cible.nom}` : ''}
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" form="form-taux-pays" type="submit" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Activer
            </button>
          </>
        }
      >
        <form id="form-taux-pays" onSubmit={soumettre}>
          {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
          <label className="form-label" htmlFor="taux-libelle">Libellé</label>
          <input id="taux-libelle" className="form-control mb-3" maxLength={100} value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })} disabled={envoi} />
          <label className="form-label" htmlFor="taux-valeur">Taux (%)</label>
          <input id="taux-valeur" className="form-control" inputMode="decimal" placeholder="ex. 10 ou 2,5" value={form.taux}
            onChange={(e) => setForm({ ...form, taux: e.target.value })} disabled={envoi} />
          <small className="aps-text-muted d-block mt-2">
            Crée une nouvelle version active ; l’ancienne est conservée dans l’historique.
          </small>
        </form>
      </FondsModal>
    </main>
  );
}