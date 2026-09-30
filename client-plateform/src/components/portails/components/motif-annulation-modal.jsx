// motif-annulation-modal.jsx
//
// Modale « Annuler le rendez-vous » : confirmation + choix OBLIGATOIRE du
// motif d'annulation (et commentaire facultatif).
//
// Le serveur refuse (400) toute annulation sans `motif_annulation` (voir
// annulerRendezVous dans server/src/controllers/rendezVous.controller.js) :
// le motif pilote le traitement financier (remboursement, frais). Cette
// modale remplace l'ancien window.confirm(), qui n'en collectait aucun.
//
// Politique de fonds v2 (§3-§4) : la prop `avertissement` permet d'afficher,
// AVANT confirmation, la conséquence financière de l'annulation (voir
// avertissement-annulation.jsx). Elle est purement indicative : le serveur
// applique la règle et le résultat réel est affiché après l'annulation.
//
// Réutilise les styles de la modale de détail (.rdv-modal-*, portail-medecin.css).
import React, { useEffect, useState } from "react";

const LONGUEUR_MAX_COMMENTAIRE = 1000; // limite côté serveur

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {string} props.titre
 * @param {string} props.message
 * @param {React.ReactNode} [props.avertissement] - conséquence financière affichée entre le message et le motif
 * @param {string} props.labelConfirmer
 * @param {Array<{valeur: string, libelle: string}>} props.motifs
 * @param {boolean} [props.enCours] - appel réseau en cours (désactive les boutons)
 * @param {() => void} props.onClose
 * @param {(choix: { motif: string, commentaire: string }) => void} props.onConfirm
 */
const MotifAnnulationModal = ({
  open,
  titre,
  message,
  avertissement,
  labelConfirmer,
  motifs,
  enCours = false,
  onClose,
  onConfirm,
}) => {
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");

  // Réinitialise le formulaire à chaque ouverture.
  useEffect(() => {
    if (open) {
      setMotif("");
      setCommentaire("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !enCours) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, enCours, onClose]);

  if (!open) return null;

  const soumettre = (e) => {
    e.preventDefault();
    if (!motif || enCours) return;
    onConfirm({ motif, commentaire: commentaire.trim() });
  };

  return (
    <div className="rdv-modal-overlay" onClick={enCours ? undefined : onClose}>
      <form
        className="rdv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="motif-annulation-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={soumettre}
      >
        <button
          type="button"
          className="rdv-modal-close"
          onClick={onClose}
          disabled={enCours}
          aria-label="Fermer"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <h3 id="motif-annulation-title" style={{ paddingRight: "2rem" }}>
          {titre}
        </h3>
        <p className="mb-3">{message}</p>
        {avertissement && <div className="mb-3">{avertissement}</div>}

        <label htmlFor="motif-annulation-select" className="form-label fw-semibold">
          Motif de l&apos;annulation <span aria-hidden="true">*</span>
        </label>
        <select
          id="motif-annulation-select"
          className="form-select mb-3"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          required
          disabled={enCours}
        >
          <option value="">— Choisir un motif —</option>
          {motifs.map((m) => (
            <option key={m.valeur} value={m.valeur}>
              {m.libelle}
            </option>
          ))}
        </select>

        <label htmlFor="motif-annulation-commentaire" className="form-label">
          Commentaire (facultatif)
        </label>
        <textarea
          id="motif-annulation-commentaire"
          className="form-control mb-3"
          rows={3}
          maxLength={LONGUEUR_MAX_COMMENTAIRE}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          disabled={enCours}
        />

        <div className="d-flex gap-2 justify-content-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm-aps"
            onClick={onClose}
            disabled={enCours}
          >
            Retour
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm-aps"
            disabled={!motif || enCours}
          >
            {enCours && <span className="spinner-border spinner-border-sm me-1"></span>}
            {labelConfirmer}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MotifAnnulationModal;