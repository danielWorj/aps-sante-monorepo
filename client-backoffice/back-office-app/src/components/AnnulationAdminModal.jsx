// src/components/AnnulationAdminModal.jsx
//
// Annulation par un admin (politique de fonds v2 §4) : au nom de qui
// (`initiateur`, obligatoire), motif fermé, commentaire facultatif, et rappel
// de la conséquence financière AVANT confirmation (matrice D3 : CP et CM
// séparées). L'avertissement est indicatif ; le serveur applique la règle et
// renvoie le détail réel. Un RDV non payé (« cree ») ne peut pas être annulé
// « au nom du médecin » (409 RDV_NON_PAYE) : ce choix est masqué.
import { useEffect, useState } from 'react';
import FondsModal from './FondsModal';
import {
  CONSEQUENCE_DEUX_ABSENTS_SANS_REPROGRAMMATION,
  MOTIFS_ANNULATION,
  consequenceAnnulation,
  estTardif,
} from '../utils/fonds';

export default function AnnulationAdminModal({ rdv, occupe, erreur, onFermer, onConfirmer }) {
  const [initiateur, setInitiateur] = useState('');
  const [motif, setMotif] = useState('');
  const [commentaire, setCommentaire] = useState('');

  useEffect(() => {
    if (rdv) { setInitiateur(rdv.statut === 'cree' ? 'patient' : ''); setMotif(''); setCommentaire(''); }
  }, [rdv]);

  const enReprogrammation = rdv?.statut === 'a_reprogrammer';
  const tardif = rdv ? estTardif(rdv.date_creneau) : false;
  const nonPaye = rdv?.statut === 'cree';
  const initiateursProposes = nonPaye ? [['patient', 'Le patient']] : [['patient', 'Le patient'], ['medecin', 'Le médecin']];

  return (
    <FondsModal
      titre="Annuler le rendez-vous"
      ouvert={!!rdv}
      occupe={occupe}
      onFermer={onFermer}
      pied={
        <>
          <button className="btn btn-light" onClick={onFermer} disabled={occupe}>Retour</button>
          <button className="btn btn-danger" disabled={occupe || !motif || (!enReprogrammation && !initiateur)}
            onClick={() => onConfirmer({ initiateur: initiateur || 'patient', motif, commentaire: commentaire.trim() })}>
            {occupe && <span className="spinner-border spinner-border-sm me-2" />}Confirmer l’annulation
          </button>
        </>
      }
    >
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      {enReprogrammation ? (
        <div className="alert alert-info">
          {CONSEQUENCE_DEUX_ABSENTS_SANS_REPROGRAMMATION}
        </div>
      ) : (
        <>
          <label className="form-label fw-semibold">Annulation au nom de <span aria-hidden="true">*</span></label>
          <div className="mb-3">
            {initiateursProposes.map(([v, l]) => (
              <div className="form-check form-check-inline" key={v}>
                <input className="form-check-input" type="radio" id={`init-${v}`} name="initiateur" value={v}
                  checked={initiateur === v} onChange={() => setInitiateur(v)} disabled={occupe} />
                <label className="form-check-label" htmlFor={`init-${v}`}>{l}</label>
              </div>
            ))}
          </div>
          {initiateur && <div className="alert alert-warning small">{consequenceAnnulation(initiateur, tardif, { nonPaye })}</div>}
        </>
      )}

      <label className="form-label fw-semibold" htmlFor="annul-motif">Motif <span aria-hidden="true">*</span></label>
      <select id="annul-motif" className="form-select mb-3" value={motif} onChange={(e) => setMotif(e.target.value)} disabled={occupe}>
        <option value="">— Choisir un motif —</option>
        {MOTIFS_ANNULATION.map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
      </select>

      <label className="form-label" htmlFor="annul-commentaire">Commentaire (facultatif)</label>
      <textarea id="annul-commentaire" className="form-control" rows={3} maxLength={1000}
        value={commentaire} onChange={(e) => setCommentaire(e.target.value)} disabled={occupe} />
    </FondsModal>
  );
}