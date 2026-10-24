// changer-type-rdv-modal.jsx
//
// Carte « Changer le type du rendez-vous » (espace MÉDECIN) : pour un RDV payé
// (« confirme ») pas encore commencé, le médecin le transforme en
// téléconsultation ou en consultation physique. Le patient est notifié. Un RDV
// redevenu physique doit ensuite être accepté avec un lieu.
//
// Erreurs (POST /rendez-vous/:id/type) : 400 téléconsultation non activée ·
// 403 autre médecin · 409 non payé, statut incompatible ou consultation
// commencée. Le message du serveur est affiché tel quel.
//
// Réutilise les styles de la modale de détail (.rdv-modal-*, portail-medecin.css).
import { useEffect, useState } from "react";
import { changerTypeRendezVous } from "./../../../services/medecinService";

const OPTIONS = [
  {
    valeur: "physique",
    titre: "Consultation physique",
    icone: "fa-stethoscope",
    aide: "Vous préciserez ensuite le lieu de la consultation.",
  },
  {
    valeur: "teleconsultation",
    titre: "Téléconsultation",
    icone: "fa-video",
    aide: "Le lieu éventuel est retiré ; la consultation se fait en visio.",
  },
];

const FormulaireChangerType = ({ rdv, patientNom, onClose, onChange }) => {
  const [type, setType] = useState(rdv.type_rdv === "physique" ? "teleconsultation" : "physique");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !enCours) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enCours, onClose]);

  const modifie = type !== rdv.type_rdv;

  const soumettre = async (e) => {
    e.preventDefault();
    if (!modifie || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      onChange(await changerTypeRendezVous(rdv.rdv_id, type));
    } catch (err) {
      setErreur(err?.message || "Impossible de changer le type du rendez-vous.");
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
        aria-labelledby="changer-type-rdv-title"
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

        <h3 id="changer-type-rdv-title" style={{ paddingRight: "2rem" }}>
          Changer le type du rendez-vous
        </h3>
        <p className="mb-3">
          {patientNom || "Le patient"} sera prévenu du changement. Le tarif ne change pas.
        </p>

        <div className="d-flex flex-column gap-2 mb-3" role="radiogroup" aria-label="Type de rendez-vous">
          {OPTIONS.map((o) => (
            <label
              key={o.valeur}
              className="d-flex align-items-start gap-2 p-2"
              style={{
                border: `1px solid ${type === o.valeur ? "var(--primary)" : "var(--line)"}`,
                borderRadius: 10,
                cursor: enCours ? "default" : "pointer",
              }}
            >
              <input
                type="radio"
                name="type_rdv"
                className="form-check-input mt-1"
                value={o.valeur}
                checked={type === o.valeur}
                onChange={() => setType(o.valeur)}
                disabled={enCours}
              />
              <span>
                <span className="fw-semibold">
                  <i className={`fa-solid ${o.icone} me-1`}></i> {o.titre}
                  {rdv.type_rdv === o.valeur && <span className="text-faint fw-normal"> (actuel)</span>}
                </span>
                <span className="d-block text-faint" style={{ fontSize: ".8rem" }}>
                  {o.aide}
                </span>
              </span>
            </label>
          ))}
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
          <button type="submit" className="btn btn-primary btn-sm-aps" disabled={!modifie || enCours}>
            {enCours && <span className="spinner-border spinner-border-sm me-1"></span>}
            Enregistrer
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
 * @param {(resultat: { message: string, inchange: boolean, rendez_vous: Object }) => void} props.onChange
 */
const ChangerTypeRdvModal = ({ open, rdv, ...reste }) => {
  if (!open || !rdv) return null;
  return <FormulaireChangerType key={rdv.rdv_id} rdv={rdv} {...reste} />;
};

export default ChangerTypeRdvModal;
