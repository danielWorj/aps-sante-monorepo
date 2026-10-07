// contestation-rdv.jsx
//
// Bloc « Fonds en attente de libération » de la fiche d'un RDV (espace PATIENT).
//
// Une fois la fin de consultation constatée (code saisi par le médecin), les fonds
// restent en séquestre jusqu'à `liberation_prevue_le` (termine_le + T). Pendant ce
// délai le patient peut CONTESTER : le RDV passe « conteste », le cron de libération
// l'ignore et les fonds restent bloqués (voir GUIDE_PAR_PHASES_CODE_FIN_CONSULTATION_
// ET_LIBERATION_DIFFEREE.md, règle 6 et point ouvert 2).
//
// La contestation est irréversible côté patient : on demande donc une confirmation
// explicite en deux temps. Le serveur reste l'arbitre (statut, rôle) ; le client
// affiche simplement son message d'erreur.
import { useState } from "react";
import { contesterRendezVous } from "./../../../services/fondsService";
import { formaterDateLiberation } from "./../../../utils/rdv";

/**
 * @param {Object} props
 * @param {Object} props.rdv - RDV dont les fonds sont en attente (rdv_id, liberation_prevue_le)
 * @param {(rdvId: string) => void} props.onContestation - appelée après un succès
 *   (le parent ferme la fiche, met à jour la liste et affiche le toast)
 */
const ContestationRdv = ({ rdv, onContestation }) => {
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const contester = async () => {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      await contesterRendezVous(rdv.rdv_id);
      onContestation?.(rdv.rdv_id);
    } catch (err) {
      setErreur(err?.message || "Impossible de contester ce rendez-vous pour le moment.");
      setConfirmation(false);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="note-box" style={{ display: "block" }}>
      <div className="d-flex gap-2">
        <i className="fa-solid fa-hourglass-half mt-1"></i>
        <span>
          Consultation terminée. Les fonds seront libérés au médecin le{" "}
          <strong>{formaterDateLiberation(rdv.liberation_prevue_le)}</strong>. Si la
          consultation ne s&apos;est pas déroulée correctement, vous pouvez encore la
          contester avant cette date.
        </span>
      </div>

      {erreur && (
        <div className="alert alert-danger mt-2 mb-0" role="alert">
          {erreur}
        </div>
      )}

      {!confirmation ? (
        <div className="mt-2">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm-aps"
            onClick={() => setConfirmation(true)}
          >
            <i className="fa-solid fa-flag"></i> Contester la consultation
          </button>
        </div>
      ) : (
        <div className="mt-2" role="alertdialog" aria-label="Confirmer la contestation">
          <div className="small mb-2">
            <i className="fa-solid fa-triangle-exclamation me-1"></i>
            Les fonds resteront bloqués en séquestre et ne seront pas versés au médecin
            tant que le litige n&apos;est pas traité. Cette action est définitive.
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm-aps"
              onClick={contester}
              disabled={enCours}
            >
              {enCours ? (
                <span className="spinner-border spinner-border-sm me-1" role="status"></span>
              ) : (
                <i className="fa-solid fa-flag"></i>
              )}{" "}
              Confirmer la contestation
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm-aps"
              onClick={() => setConfirmation(false)}
              disabled={enCours}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContestationRdv;