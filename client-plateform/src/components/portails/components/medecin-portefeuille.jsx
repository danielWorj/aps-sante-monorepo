// src/components/portails/components/medecin-portefeuille.jsx
//
// Section « Portefeuille & retraits » du profil médecin (ancre #portefeuille, ciblée par la
// sidebar). Le solde et le statut des retraits viennent TOUJOURS du serveur : le client n'en
// calcule ni n'en confirme rien.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { listerMesRetraits, demanderRetrait } from '../../../services/retraitService';

const STATUTS = {
  en_attente_validation: { label: 'En attente de validation', classe: 'chip-st-attente', icone: 'fa-hourglass-half' },
  en_cours: { label: 'Envoi en cours', classe: 'chip-st-paye', icone: 'fa-paper-plane' },
  reussie: { label: 'Effectué', classe: 'chip-st-confirme', icone: 'fa-circle-check' },
  echouee: { label: 'Échoué (recrédité)', classe: 'chip-st-annule', icone: 'fa-circle-xmark' },
  rejetee: { label: 'Rejeté (recrédité)', classe: 'chip-st-annule', icone: 'fa-ban' },
};
const ACTIFS = ['en_attente_validation', 'en_cours'];

const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;
const dateCourte = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const masquer = (num) => (num ? `${num.slice(0, 5)}••••${num.slice(-2)}` : '');

export default function MedecinPortefeuille({ medecinId, mobileMoneys = [], onSoldeChange }) {
  const { hash } = useLocation();
  const racine = useRef(null);
  const [donnees, setDonnees] = useState(null); // { solde, retraits, limites }
  const [erreurChargement, setErreurChargement] = useState(null);
  const [mobileMoneyId, setMobileMoneyId] = useState(mobileMoneys[0]?.id || '');
  const [montant, setMontant] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState(null); // { type: 'succes' | 'erreur', texte }

  const charger = useCallback(async () => {
    try {
      const d = await listerMesRetraits(medecinId);
      setDonnees(d);
      setErreurChargement(null);
      onSoldeChange?.(d.solde);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger votre portefeuille.');
    }
  }, [medecinId, onSoldeChange]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!mobileMoneyId && mobileMoneys[0]?.id) setMobileMoneyId(mobileMoneys[0].id);
  }, [mobileMoneys, mobileMoneyId]);

  // Ancre #portefeuille : la section apparaît après le chargement asynchrone du profil.
  useEffect(() => {
    if (hash === '#portefeuille' && racine.current) racine.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, donnees]);

  // Tant qu'un retrait est actif, on rafraîchit régulièrement (le serveur/CamPay tranchent).
  const aUnRetraitActif = donnees?.retraits?.some((r) => ACTIFS.includes(r.statut));
  useEffect(() => {
    if (!aUnRetraitActif) return undefined;
    const id = setInterval(charger, 15000);
    return () => clearInterval(id);
  }, [aUnRetraitActif, charger]);

  const limites = donnees?.limites;
  const montantNombre = Number(montant);
  const montantValide =
    Number.isInteger(montantNombre) &&
    montantNombre >= (limites?.montant_min ?? 1) &&
    montantNombre <= (limites?.montant_max ?? Infinity) &&
    montantNombre <= (donnees?.solde ?? 0);

  const soumettre = async (e) => {
    e.preventDefault();
    if (envoi || !montantValide || !mobileMoneyId) return;
    setEnvoi(true);
    setRetour(null);
    try {
      await demanderRetrait(medecinId, { mobileMoneyId, montant: montantNombre });
      setMontant('');
      setRetour({ type: 'succes', texte: 'Demande enregistrée. Le montant est réservé ; elle sera traitée après validation.' });
      await charger();
    } catch (err) {
      setRetour({ type: 'erreur', texte: err.message || 'La demande a échoué.' });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="info-card" id="portefeuille" ref={racine}>
      <h3><i className="fa-solid fa-sack-dollar"></i> Portefeuille &amp; retraits</h3>

      {erreurChargement && (
        <div className="alert alert-danger" role="alert">{erreurChargement}</div>
      )}
      {!donnees && !erreurChargement && (
        <div className="text-muted"><span className="spinner-border spinner-border-sm me-2" role="status" />Chargement…</div>
      )}

      {donnees && (
        <>
          <div className="wallet-solde">
            <span className="wallet-solde-label">Solde disponible</span>
            <strong className="wallet-solde-valeur">{fcfa(donnees.solde)}</strong>
          </div>

          {mobileMoneys.length === 0 ? (
            <div className="note-box">
              <i className="fa-solid fa-circle-info"></i>
              <span>Aucun numéro Mobile Money configuré : contactez l'administration ApSa pour pouvoir retirer vos honoraires.</span>
            </div>
          ) : (
            <form onSubmit={soumettre} className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label" htmlFor="retrait-numero">Envoyer vers</label>
                <select id="retrait-numero" className="form-select" value={mobileMoneyId}
                  onChange={(e) => setMobileMoneyId(e.target.value)} disabled={envoi}>
                  {mobileMoneys.map((mm) => (
                    <option key={mm.id} value={mm.id}>
                      {mm.type_mobile_money?.libelle || 'Mobile Money'} — {mm.numero} ({mm.titulaire})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="retrait-montant">Montant (FCFA)</label>
                <input id="retrait-montant" className="form-control" type="number" inputMode="numeric" step="1"
                  min={limites?.montant_min} max={Math.min(limites?.montant_max ?? Infinity, donnees.solde)}
                  value={montant} onChange={(e) => setMontant(e.target.value)} disabled={envoi} placeholder="ex. 25000" />
              </div>
              <div className="col-md-3">
                <button type="submit" className="btn btn-primary w-100" disabled={envoi || !montantValide}>
                  {envoi ? <span className="spinner-border spinner-border-sm" role="status" /> : 'Demander le retrait'}
                </button>
              </div>
              <div className="col-12">
                <small className="text-muted">
                  Minimum {fcfa(limites?.montant_min)} · maximum {fcfa(limites?.montant_max)} par demande.
                  Une seule demande peut être en cours à la fois.
                </small>
              </div>
            </form>
          )}

          {retour && (
            <div className={`alert ${retour.type === 'succes' ? 'alert-success' : 'alert-danger'} mt-3 mb-0`} role="status">
              {retour.texte}
            </div>
          )}

          <h4 className="h6 text-muted mt-4 mb-2">Mes retraits</h4>
          {donnees.retraits.length === 0 ? (
            <p className="text-muted mb-0">Aucun retrait pour le moment.</p>
          ) : (
            <ul className="retrait-liste">
              {donnees.retraits.map((r) => {
                const st = STATUTS[r.statut] || { label: r.statut, classe: 'chip-st-termine', icone: 'fa-circle' };
                return (
                  <li key={r.demande_retrait_id} className="retrait-ligne">
                    <div>
                      <strong>{fcfa(r.montant)}</strong>
                      <span className="text-muted"> → {masquer(r.numero)}</span>
                      <div className="retrait-date">{dateCourte(r.date_creation)}</div>
                      {r.statut === 'rejetee' && r.motif_rejet && (
                        <div className="retrait-motif">Motif : {r.motif_rejet}</div>
                      )}
                    </div>
                    <span className={`chip ${st.classe}`}><i className={`fa-solid ${st.icone}`}></i> {st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}