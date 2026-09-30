// reprogrammation-panel.jsx
//
// Politique de fonds v2 §5 — reprogrammation d'un RDV « a_reprogrammer ».
//   - patient OU médecin propose un créneau LIBRE de l'agenda du médecin, futur ;
//   - l'AUTRE partie accepte (et inversement) ; une nouvelle proposition remplace
//     la précédente ; le délai de 48 h ne se prolonge jamais ;
//   - à l'acceptation : RDV « confirme » sur le nouveau créneau, aucun nouveau paiement.
// Le serveur valide tout (créneau libre, futur, auteur) : ici, affichage et saisie.
import React, { useEffect, useMemo, useState } from 'react';
import { listerCreneauxAgenda } from '../../../services/medecinService';
import { accepterReprogrammation, proposerReprogrammation } from '../../../services/fondsService';
import {
  creneauVersISO, dateHeure, echeanceReprogrammation, libelleHeure, libelleJour, tempsRestant,
} from '../../../utils/fonds';

const jourISO = (d) => d.toISOString().slice(0, 10);

/** @param {{ rdv: object, role: 'patient'|'medecin', onChange?: () => void }} props */
export default function ReprogrammationPanel({ rdv, role, onChange }) {
  const echeance = echeanceReprogrammation(rdv);
  const [maintenant, setMaintenant] = useState(Date.now());
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const [creneaux, setCreneaux] = useState([]);
  const [choix, setChoix] = useState('');
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState(null); // { type, texte }

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const restant = echeance ? tempsRestant(echeance, maintenant) : null;
  const expire = !!restant?.expire;
  const aProposition = !!(rdv.nouvelle_date_proposee && rdv.proposee_par);
  const jeSuisAuteur = aProposition && rdv.proposee_par === role;
  const jePeuxAccepter = aProposition && !jeSuisAuteur;
  const autrePartie = role === 'patient' ? 'le médecin' : 'le patient';

  // Créneaux libres des 30 prochains jours, futurs uniquement.
  const chargerCreneaux = async () => {
    setChargement(true);
    setRetour(null);
    try {
      const debut = new Date();
      const fin = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      const liste = await listerCreneauxAgenda(rdv.medecin_id, {
        date_debut: jourISO(debut), date_fin: jourISO(fin), statut: 'disponible',
      });
      setCreneaux(
        (liste || [])
          .map((c) => ({ c, iso: creneauVersISO(c) }))
          .filter(({ iso }) => new Date(iso).getTime() > Date.now())
          .sort((a, b) => a.iso.localeCompare(b.iso))
      );
    } catch (err) {
      setRetour({ type: 'danger', texte: err.message || 'Impossible de charger les créneaux.' });
    } finally {
      setChargement(false);
    }
  };

  const ouvrirSelecteur = () => { setSelecteurOuvert(true); setChoix(''); chargerCreneaux(); };

  const parJour = useMemo(() => {
    const m = new Map();
    creneaux.forEach(({ c, iso }) => {
      const k = libelleJour(c);
      m.set(k, [...(m.get(k) || []), { c, iso }]);
    });
    return [...m.entries()];
  }, [creneaux]);

  const proposer = async () => {
    if (!choix || envoi) return;
    setEnvoi(true);
    setRetour(null);
    try {
      await proposerReprogrammation(rdv.rdv_id, choix);
      setSelecteurOuvert(false);
      setRetour({ type: 'success', texte: `Proposition envoyée : ${autrePartie} doit maintenant l’accepter.` });
      onChange?.();
    } catch (err) {
      setRetour({ type: 'danger', texte: err.message || 'Proposition impossible.' });
      if (err.status === 409) chargerCreneaux(); // créneau pris entre-temps
    } finally {
      setEnvoi(false);
    }
  };

  const accepter = async () => {
    if (envoi) return;
    setEnvoi(true);
    setRetour(null);
    try {
      await accepterReprogrammation(rdv.rdv_id, rdv.nouvelle_date_proposee);
      setRetour({ type: 'success', texte: 'Nouvelle date acceptée : rendez-vous confirmé, aucun nouveau paiement.' });
      onChange?.();
    } catch (err) {
      setRetour({ type: 'danger', texte: err.message || 'Acceptation impossible.' }); // 409 : proposition modifiée, relire
      if (err.status === 409) onChange?.();
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="alert alert-warning" role="region" aria-label="Reprogrammation du rendez-vous">
      <h4 className="h6 mb-2"><i className="fa-solid fa-calendar-xmark me-2"></i>Rendez-vous à reprogrammer</h4>
      <p className="mb-2 small">
        Aucune des deux parties n’était présente. Vos fonds restent en séquestre : convenez d’une nouvelle date
        {echeance && <> avant le <strong>{dateHeure(echeance)}</strong> ({expire ? restant.texte : <>il reste <strong>{restant.texte}</strong></>})</>}.
        Sans accord dans ce délai, le patient est remboursé automatiquement (honoraires moins frais et commission APS).
      </p>

      {expire ? (
        <p className="mb-0 small"><strong>Le délai est dépassé</strong> : le remboursement automatique va être déclenché.</p>
      ) : (
        <>
          {jePeuxAccepter && (
            <div className="mb-2">
              <span className="me-2">Nouvelle date proposée par {autrePartie} : <strong>{dateHeure(rdv.nouvelle_date_proposee)}</strong></span>
              <button type="button" className="btn btn-primary btn-sm-aps" onClick={accepter} disabled={envoi}>
                {envoi && <span className="spinner-border spinner-border-sm me-1" />}Accepter cette date
              </button>
            </div>
          )}
          {jeSuisAuteur && (
            <p className="small mb-2">
              Vous avez proposé <strong>{dateHeure(rdv.nouvelle_date_proposee)}</strong> : en attente de l’acceptation de {autrePartie}.
            </p>
          )}

          {!selecteurOuvert ? (
            <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={ouvrirSelecteur} disabled={envoi}>
              {aProposition ? 'Proposer une autre date' : 'Proposer une nouvelle date'}
            </button>
          ) : (
            <div className="mt-2">
              {chargement ? (
                <small><span className="spinner-border spinner-border-sm me-1" />Chargement des créneaux libres…</small>
              ) : creneaux.length === 0 ? (
                <small>Aucun créneau libre sur les 30 prochains jours.</small>
              ) : (
                <select className="form-select mb-2" value={choix} onChange={(e) => setChoix(e.target.value)} disabled={envoi}
                  aria-label="Créneau proposé">
                  <option value="">— Choisir un créneau libre —</option>
                  {parJour.map(([jour, liste]) => (
                    <optgroup key={jour} label={jour}>
                      {liste.map(({ c, iso }) => <option key={iso} value={iso}>{libelleHeure(c)}</option>)}
                    </optgroup>
                  ))}
                </select>
              )}
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-primary btn-sm-aps" onClick={proposer} disabled={!choix || envoi}>
                  {envoi && <span className="spinner-border spinner-border-sm me-1" />}Envoyer la proposition
                </button>
                <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => setSelecteurOuvert(false)} disabled={envoi}>Fermer</button>
              </div>
            </div>
          )}
        </>
      )}

      {retour && <div className={`mt-2 small text-${retour.type === 'success' ? 'success' : 'danger'}`} role="status">{retour.texte}</div>}
    </div>
  );
}
