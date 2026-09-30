// src/pages/FraisAgregateur.jsx
//
// Politique de fonds v2 §1-2 — frais d'agrégateur par agrégateur et par type,
// versionnés. Aucune valeur par défaut : une carte « Non configuré » bloque
// les paiements de cet agrégateur côté serveur (erreur explicite voulue).
import { useCallback, useEffect, useMemo, useState } from 'react';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { creerFraisAgregateur, listerFraisAgregateur } from '../services/fondsService';
import { dateHeure, fcfa, pourcent, pourcentDepuisTaux, tauxDepuisPourcent } from '../utils/fonds';

const AGREGATEURS = [
  { valeur: 'stripe', libelle: 'Stripe', sous: 'Carte bancaire' },
  { valeur: 'campay', libelle: 'CamPay', sous: 'Mobile Money' },
];
const TYPES = [
  { valeur: 'envoi', libelle: 'Frais d’envoi', aide: 'À la charge du patient, ajoutés aux honoraires.' },
  { valeur: 'remboursement', libelle: 'Frais de remboursement', aide: 'Déduits des honoraires lors d’un remboursement.' },
];
const EXEMPLE_HONORAIRES = 15000; // illustration uniquement

export default function FraisAgregateur() {
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [cible, setCible] = useState(null); // { agregateur, type_frais }
  const [form, setForm] = useState({ libelle: '', taux: '', montant_fixe: '' });
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setLignes((await listerFraisAgregateur()) || []);
    } catch (err) {
      setErreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const active = (agregateur, type_frais) =>
    lignes.find((l) => l.actif && l.agregateur === agregateur && l.type_frais === type_frais);

  const manquants = useMemo(
    () => AGREGATEURS.map((a) => ({ ...a, absents: TYPES.filter((t) => !active(a.valeur, t.valeur)) })).filter((a) => a.absents.length),
    [lignes] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const ouvrir = (agregateur, type_frais) => {
    const a = active(agregateur, type_frais);
    setCible({ agregateur, type_frais });
    setErreurForm(null);
    setForm({
      libelle: a?.libelle ?? '',
      taux: a ? pourcentDepuisTaux(a.taux) : '',
      montant_fixe: a ? String(Number(a.montant_fixe)) : '',
    });
  };

  // Aperçu indicatif de la formule (le serveur reste la référence).
  const tauxSaisi = tauxDepuisPourcent(form.taux || '0');
  const fixeSaisi = Number(String(form.montant_fixe || '0').replace(',', '.'));
  const apercu = tauxSaisi !== null && Number.isFinite(fixeSaisi) ? Math.round(EXEMPLE_HONORAIRES * tauxSaisi + fixeSaisi) : null;

  const soumettre = async (e) => {
    e.preventDefault();
    const taux = tauxDepuisPourcent(form.taux === '' ? '0' : form.taux);
    const fixe = form.montant_fixe === '' ? 0 : Number(String(form.montant_fixe).replace(',', '.'));
    if (!form.libelle.trim()) return setErreurForm('Le libellé est obligatoire.');
    if (taux === null) return setErreurForm('Taux invalide : entre 0 et 100 %, deux décimales au maximum.');
    if (!Number.isFinite(fixe) || fixe < 0) return setErreurForm('Le montant fixe doit être positif ou nul.');
    if (!window.confirm('Activer ce barème ? Les prochains calculs (paiements, remboursements) l’utiliseront.')) return;
    setEnvoi(true);
    setErreurForm(null);
    try {
      await creerFraisAgregateur({ ...cible, libelle: form.libelle.trim(), taux, montant_fixe: fixe });
      setMessage('Nouveau barème activé.');
      setCible(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.'); // 409 concurrent : « Réessayez. »
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Finance <span className="sep">/</span> Frais d’agrégateur</div>
          <h1>Frais d’agrégateur</h1>
        </div>
        <button className="btn btn-light" onClick={charger} disabled={chargement}><i className="fa-solid fa-rotate me-2"></i>Actualiser</button>
      </div>

      <p className="aps-text-muted">
        Frais = honoraires × taux + montant fixe. Le patient paie honoraires + frais d’envoi ; un remboursement vaut
        honoraires − frais de remboursement (CamPay : estimation, les frais réels du retrait sont saisis à la clôture).
      </p>

      {message && <div className="alert alert-success" role="status">{message}</div>}
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!chargement && manquants.map((a) => (
        <div key={a.valeur} className="alert alert-warning">
          <strong>Paiements {a.libelle} bloqués :</strong> il manque {a.absents.map((t) => t.libelle.toLowerCase()).join(' et ')}.
        </div>
      ))}

      <div className="row g-3">
        {AGREGATEURS.map((a) => TYPES.map((t) => {
          const l = active(a.valeur, t.valeur);
          return (
            <div className="col-md-6" key={`${a.valeur}-${t.valeur}`}>
              <div className="aps-card p-3 h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="aps-text-muted small">{a.libelle} · {a.sous}</div>
                    <h2 className="h6 mb-1">{t.libelle}</h2>
                  </div>
                  {l ? <span className="aps-badge is-success">Actif</span> : <span className="aps-badge is-danger">Non configuré</span>}
                </div>
                <p className="small aps-text-muted">{t.aide}</p>
                {l ? (
                  <>
                    <div className="fs-4 fw-semibold">{pourcent(l.taux)}{Number(l.montant_fixe) > 0 && <> + {fcfa(l.montant_fixe)}</>}</div>
                    <div className="small aps-text-muted">{l.libelle} · depuis le {dateHeure(l.date_debut_validite)}</div>
                  </>
                ) : (
                  <div className="small text-danger">Aucune ligne active.</div>
                )}
                <button className="btn btn-sm btn-primary mt-3" onClick={() => ouvrir(a.valeur, t.valeur)}>{l ? 'Modifier' : 'Définir'}</button>
              </div>
            </div>
          );
        }))}
      </div>

      <div className="aps-card mt-4 p-3">
        <h2 className="h6">Historique des versions</h2>
        <div className="aps-table-wrap">
          <table className="table aps-table mb-0">
            <thead><tr><th>Depuis</th><th>Agrégateur</th><th>Type</th><th>Taux</th><th>Fixe</th><th>Libellé</th><th>État</th></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.frais_agregateur_id}>
                  <td>{dateHeure(l.date_debut_validite)}</td>
                  <td>{l.agregateur}</td>
                  <td>{l.type_frais}</td>
                  <td>{pourcent(l.taux)}</td>
                  <td>{fcfa(l.montant_fixe)}</td>
                  <td>{l.libelle}</td>
                  <td>{l.actif ? <span className="aps-badge is-success">Actif</span> : <span className="aps-badge is-neutral">Remplacé</span>}</td>
                </tr>
              ))}
              {!chargement && lignes.length === 0 && <tr><td colSpan={7} className="aps-text-muted">Aucune ligne saisie.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <FondsModal
        titre={cible ? `${cible.agregateur === 'stripe' ? 'Stripe' : 'CamPay'} — frais ${cible.type_frais === 'envoi' ? 'd’envoi' : 'de remboursement'}` : ''}
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-frais" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Activer
            </button>
          </>
        }
      >
        <form id="form-frais" onSubmit={soumettre}>
          {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
          <label className="form-label" htmlFor="frais-libelle">Libellé</label>
          <input id="frais-libelle" className="form-control mb-3" maxLength={100} value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })} disabled={envoi} />
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label" htmlFor="frais-taux">Taux (%)</label>
              <input id="frais-taux" className="form-control" inputMode="decimal" placeholder="ex. 2,5" value={form.taux}
                onChange={(e) => setForm({ ...form, taux: e.target.value })} disabled={envoi} />
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="frais-fixe">Montant fixe (FCFA)</label>
              <input id="frais-fixe" className="form-control" inputMode="decimal" placeholder="0" value={form.montant_fixe}
                onChange={(e) => setForm({ ...form, montant_fixe: e.target.value })} disabled={envoi} />
            </div>
          </div>
          <small className="aps-text-muted d-block mt-3">
            Laisser vide = 0. Un barème à 0 doit être saisi volontairement.
            {apercu !== null && <> Exemple indicatif sur {fcfa(EXEMPLE_HONORAIRES)} : <strong>{fcfa(apercu)}</strong>.</>}
          </small>
        </form>
      </FondsModal>
    </main>
  );
}
