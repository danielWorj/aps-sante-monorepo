// src/pages/ParametreDelaiLiberation.jsx
//
// Libération différée des fonds — délai T (en HEURES) pendant lequel les fonds
// d'un RDV terminé restent en séquestre, PAR PAYS D'EXERCICE du médecin.
//
// Même principe que TauxParPays (commissions, amende), mais page dédiée : ce
// composant est spécifique aux pourcentages, on ne le détourne pas.
//   - Jamais d'update : « Définir / Modifier » crée une nouvelle version active
//     et désactive l'ancienne (transaction côté serveur). L'historique est conservé.
//   - Aucune valeur par défaut : un pays sans T actif est signalé en alerte, car
//     les médecins de ce pays ne peuvent alors pas terminer leurs consultations.
//   - T est figé sur chaque RDV à la validation : modifier T ne touche que les
//     consultations terminées ensuite.
//
// Droits : GET ouvert à admin + superadmin ; POST réservé au SUPERADMIN. Les
// simples admins ont donc la page en lecture seule (aucun bouton d'édition).
import { useCallback, useEffect, useMemo, useState } from 'react';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { estRole, useAuth } from '../context/AuthContext';
import { listerPays } from '../services/referentielService';
import {
  creerParametreDelaiLiberation,
  listerParametresDelaiLiberation,
} from '../services/fondsService';
import {
  DELAI_LIBERATION_MAX_H,
  DELAI_LIBERATION_MIN_H,
  dateHeure,
  heuresDepuisSaisie,
  heuresLisibles,
} from '../utils/fonds';

const LIBELLE_MODELE = 'Délai de libération des fonds';

export default function ParametreDelaiLiberation() {
  const { user } = useAuth();
  const peutEditer = estRole(user, 'superadmin');

  const [pays, setPays] = useState([]);
  const [lignes, setLignes] = useState([]);
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
      const [p, l] = await Promise.all([listerPays(), listerParametresDelaiLiberation()]);
      setPays(p || []);
      setLignes(l || []);
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
    setForm({ libelle: a?.libelle ?? LIBELLE_MODELE, heures: a ? String(a.heures) : '' });
  };

  const soumettre = async (e) => {
    e.preventDefault();
    const heures = heuresDepuisSaisie(form.heures);
    if (!form.libelle.trim()) return setErreurForm('Le libellé est obligatoire.');
    if (heures === null) {
      return setErreurForm(
        `Délai invalide : un nombre entier d’heures entre ${DELAI_LIBERATION_MIN_H} et ${DELAI_LIBERATION_MAX_H}.`
      );
    }
    setEnvoi(true);
    setErreurForm(null);
    try {
      await creerParametreDelaiLiberation({
        pays_id: cible.pays_id,
        libelle: form.libelle.trim(),
        heures,
      });
      setMessage({
        type: 'success',
        texte: `Nouveau délai de ${heuresLisibles(heures)} activé pour ${cible.nom}. Il ne s’applique qu’aux consultations terminées à partir de maintenant.`,
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
            Back-office <span className="sep">/</span> Finance <span className="sep">/</span> Délai de libération (T)
          </div>
          <h1>Délai de libération des fonds</h1>
        </div>
        <button className="btn btn-light" onClick={charger} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Nombre d’heures pendant lesquelles les fonds restent en séquestre après la fin d’une consultation
        (code validé ou visio clôturée). Valeur appliquée au pays d’exercice du médecin.
      </p>
      <p className="aps-text-muted">
        Le délai est figé sur chaque rendez-vous au moment où la consultation est terminée : une modification
        n’affecte que les consultations terminées ensuite. Pendant ce délai, le patient peut encore contester.
      </p>

      {!peutEditer && (
        <div className="alert alert-info" role="note">
          Lecture seule : seul un super administrateur peut modifier le délai de libération.
        </div>
      )}

      {message && <div className={`alert alert-${message.type} mb-3`} role="status">{message.texte}</div>}
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!chargement && !erreur && sansLigne.length > 0 && (
        <div className="alert alert-danger" role="alert">
          <strong>{sansLigne.length} pays sans délai actif :</strong> {sansLigne.map((p) => p.nom).join(', ')}.
          {' '}Sans délai actif, les médecins de ces pays ne peuvent pas terminer leurs consultations.
        </div>
      )}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Pays</th><th>Délai T actif</th><th>Libellé</th><th>Depuis</th>
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
                      {a ? <strong>{heuresLisibles(a.heures)}</strong> : <span className="aps-badge is-danger">Non défini</span>}
                    </td>
                    <td>{a?.libelle ?? '—'}</td>
                    <td>{a ? dateHeure(a.date_debut_validite) : '—'}</td>
                    <td className="text-end">
                      <div className="aps-row-actions">
                        {peutEditer && (
                          <button className="btn btn-sm btn-primary" onClick={() => ouvrir(p)}>
                            {a ? 'Modifier' : 'Définir'}
                          </button>
                        )}
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
            <thead><tr><th>Depuis</th><th>Délai T</th><th>Libellé</th><th>État</th></tr></thead>
            <tbody>
              {historique.map((l) => (
                <tr key={l.parametre_delai_id ?? `${l.pays_id}-${l.date_debut_validite}`}>
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
              {historique.length === 0 && <tr><td colSpan={4} className="aps-text-muted">Aucune version.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <FondsModal
        titre={cible ? `Délai de libération — ${cible.nom}` : ''}
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" form="form-delai-liberation" type="submit" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Activer
            </button>
          </>
        }
      >
        <form id="form-delai-liberation" onSubmit={soumettre}>
          {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
          <label className="form-label" htmlFor="delai-libelle">Libellé</label>
          <input
            id="delai-libelle"
            className="form-control mb-3"
            maxLength={100}
            value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            disabled={envoi}
          />
          <label className="form-label" htmlFor="delai-heures">Délai T (heures)</label>
          <input
            id="delai-heures"
            className="form-control"
            type="number"
            inputMode="numeric"
            step={1}
            min={DELAI_LIBERATION_MIN_H}
            max={DELAI_LIBERATION_MAX_H}
            placeholder="ex. 48"
            value={form.heures}
            onChange={(e) => setForm({ ...form, heures: e.target.value })}
            disabled={envoi}
          />
          <small className="aps-text-muted d-block mt-2">
            Entier de {DELAI_LIBERATION_MIN_H} à {DELAI_LIBERATION_MAX_H} h (30 jours). 0 = libération au prochain
            passage du cron (~5 min). Crée une nouvelle version active ; l’ancienne est conservée dans l’historique.
          </small>
        </form>
      </FondsModal>
    </main>
  );
}