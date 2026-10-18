// accepter-rdv-modal.jsx
//
// Carte « Accepter le rendez-vous » (espace MÉDECIN) : pour un RDV PHYSIQUE
// payé (« confirme »), le médecin saisit le lieu de la consultation. Le lieu
// est obligatoire ; le patient reçoit une notification avec la date et le
// lieu. Rouverte sur un RDV déjà accepté, elle sert à changer le lieu (le
// patient est alors renotifié).
//
// Erreurs (POST /rendez-vous/:id/accepter) : 400 lieu absent / trop long ou
// téléconsultation · 403 autre médecin · 409 non payé ou statut incompatible.
// Le message du serveur est affiché tel quel.
//
// Réutilise les styles de la modale de détail (.rdv-modal-*, portail-medecin.css).
import { useEffect, useState } from "react";
import { accepterRendezVous } from "./../../../services/medecinService";
import { LIEU_RDV_LONGUEUR_MAX } from "./../../../utils/rdv";

/**
 * @param {Object} props
 * @param {Object} props.rdv - rendez-vous à accepter (rdv_id requis, lieu_rdv éventuel)
 * @param {string} [props.patientNom]
 * @param {() => void} props.onClose
 * @param {(resultat: { message: string, deja_accepte: boolean, rendez_vous: Object }) => void} props.onAccepte
 */
const FormulaireAccepter = ({ rdv, patientNom, onClose, onAccepte }) => {
  const modification = Boolean(rdv.accepte_le);
  const [lieu, setLieu] = useState(rdv.lieu_rdv || "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !enCours) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enCours, onClose]);

  const lieuValide = lieu.trim().length > 0;

  const soumettre = async (e) => {
    e.preventDefault();
    if (!lieuValide || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      onAccepte(await accepterRendezVous(rdv.rdv_id, lieu.trim()));
    } catch (err) {
      setErreur(err?.message || "Impossible d'accepter le rendez-vous.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="rdv-modal-overlay" onClick={enCours ? undefined : onClose}>
      <form
        className="rdv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accepter-rdv-title"
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

        <h3 id="accepter-rdv-title" style={{ paddingRight: "2rem" }}>
          {modification ? "Modifier le lieu du rendez-vous" : "Accepter le rendez-vous"}
        </h3>
        <p className="mb-3">
          {modification
            ? `Saisissez le nouveau lieu : ${patientNom || "le patient"} sera prévenu du changement.`
            : `Indiquez où aura lieu la consultation : ${patientNom || "le patient"} recevra une notification avec la date et le lieu.`}
        </p>

        <label htmlFor="accepter-rdv-lieu" className="form-label fw-semibold">
          Lieu du rendez-vous <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="accepter-rdv-lieu"
          className="form-control mb-1"
          rows={3}
          value={lieu}
          onChange={(e) => setLieu(e.target.value)}
          maxLength={LIEU_RDV_LONGUEUR_MAX}
          placeholder="Ex. : Cabinet médical Bonapriso, rue des Palmiers, 2e étage, Douala"
          disabled={enCours}
          required
          autoFocus
        />
        <div className="text-faint mb-3" style={{ fontSize: ".8rem" }}>
          Adresse, bâtiment, étage, repère… ({lieu.length}/{LIEU_RDV_LONGUEUR_MAX})
        </div>

        {erreur && (
          <div className="alert alert-danger py-2 mb-3" role="alert">
            <i className="fa-solid fa-circle-exclamation me-2"></i>
            {erreur}
          </div>
        )}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-ghost btn-sm-aps" onClick={onClose} disabled={enCours}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary btn-sm-aps" disabled={!lieuValide || enCours}>
            {enCours && <span className="spinner-border spinner-border-sm me-1"></span>}
            {modification ? "Enregistrer" : "Accepter"}
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object|null} props.rdv
 * @param {string} [props.patientNom]
 * @param {() => void} props.onClose
 * @param {(resultat: Object) => void} props.onAccepte
 */
const AccepterRdvModal = ({ open, rdv, ...reste }) => {
  if (!open || !rdv) return null;
  // `key` : formulaire remonté (état vierge) à chaque ouverture / changement de RDV.
  return <FormulaireAccepter key={rdv.rdv_id} rdv={rdv} {...reste} />;
};

export default AccepterRdvModal;
