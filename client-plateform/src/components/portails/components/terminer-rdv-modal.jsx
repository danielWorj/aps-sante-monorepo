// terminer-rdv-modal.jsx
//
// Carte « Terminer la consultation » (espace MÉDECIN) : le médecin saisit le
// code de consultation que le patient lui communique à la fin du rendez-vous
// physique. Elle remplace l'ancien contrôle de présence (code + QR) à l'accueil.
//
// Règles (voir GUIDE_PAR_PHASES_CODE_FIN_CONSULTATION_ET_LIBERATION_DIFFEREE.md,
// phases 2 et 5A) :
//   - le code n'est JAMAIS fourni au médecin par l'API : il le reçoit de vive
//     voix du patient, à la fin de la consultation ;
//   - succès : la fin est constatée, les fonds restent en séquestre T heures
//     (`liberation_prevue_le`), puis le cron les libère ;
//   - le client n'invente rien : message, tentatives restantes et délai de
//     verrouillage viennent du serveur.
//
// Erreurs gérées (POST /rendez-vous/:id/terminer) :
//   400 format / type de RDV · 403 code incorrect (+ tentatives_restantes)
//   409 non payé, statut, séquestre ou T non paramétré
//   429 saisie verrouillée (+ reessayer_dans_secondes)
//
// Réutilise les styles de la modale de détail (.rdv-modal-*, portail-medecin.css).
import { useEffect, useState } from "react";
import { terminerRendezVous } from "./../../../services/medecinService";
import {
  CODE_CONSULTATION_LONGUEUR_MAX,
  CODE_CONSULTATION_LONGUEUR_MIN,
} from "./../../../utils/rdv";

// Alphabet du serveur (sans 0/O/1/I) — voir server/src/lib/codeConsultation.js.
// On ne FILTRE pas la saisie dessus (anciens RDV : code de 8 caractères
// potentiellement hors alphabet) : on retire seulement ce qui n'est jamais
// valide (espaces, ponctuation) et on passe en majuscules.
function nettoyerSaisie(valeur) {
  return valeur
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_CONSULTATION_LONGUEUR_MAX);
}

function formaterDuree(secondes) {
  const s = Math.max(0, Math.ceil(secondes));
  const min = Math.floor(s / 60);
  const reste = s % 60;
  if (min === 0) return `${reste} s`;
  return `${min} min ${String(reste).padStart(2, "0")} s`;
}

/**
 * @param {Object} props
 * @param {Object} props.rdv - rendez-vous à terminer (rdv_id requis)
 * @param {string} [props.patientNom] - nom affiché dans le texte d'aide
 * @param {() => void} props.onClose
 * @param {(resultat: { message: string, rendez_vous: Object, termine_le: string,
 *   liberation_prevue_le: string, deja_constate?: boolean }) => void} props.onTermine
 *   appelée après un succès (le parent ferme la modale, rafraîchit et affiche le toast)
 */
const FormulaireTerminer = ({ rdv, patientNom, onClose, onTermine }) => {
  const [code, setCode] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null); // { message, tentativesRestantes? }
  const [verrouJusqua, setVerrouJusqua] = useState(null); // timestamp ms | null
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !enCours) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enCours, onClose]);

  // Compte à rebours du verrouillage (429) : tick chaque seconde, jusqu'à échéance.
  useEffect(() => {
    if (!verrouJusqua) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      setMaintenant(now);
      if (now >= verrouJusqua) {
        setVerrouJusqua(null);
        setErreur(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [verrouJusqua]);

  const verrouille = verrouJusqua !== null && maintenant < verrouJusqua;
  const secondesRestantes = verrouille ? (verrouJusqua - maintenant) / 1000 : 0;
  const codeComplet = code.length >= CODE_CONSULTATION_LONGUEUR_MIN;

  const soumettre = async (e) => {
    e.preventDefault();
    if (!codeComplet || enCours || verrouille) return;
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await terminerRendezVous(rdv.rdv_id, code);
      onTermine(resultat);
    } catch (err) {
      const data = err?.data || {};
      if (err?.status === 429) {
        const secondes = Number(data.reessayer_dans_secondes);
        if (Number.isFinite(secondes) && secondes > 0) {
          const now = Date.now();
          setMaintenant(now);
          setVerrouJusqua(now + secondes * 1000);
        }
        setErreur({
          message:
            data.message ||
            "Trop de tentatives : la saisie du code est temporairement verrouillée.",
        });
      } else if (err?.status === 403 && data.tentatives_restantes !== undefined) {
        setErreur({
          message: data.message || "Code incorrect.",
          tentativesRestantes: data.tentatives_restantes,
        });
        setCode("");
      } else {
        // 400 (format / téléconsultation), 409 (non payé, T non paramétré...),
        // autres : le message du serveur est déjà explicite.
        setErreur({ message: err?.message || "Impossible de terminer la consultation." });
      }
    } finally {
      setEnCours(false);
    }
  };

  const desactive = enCours || verrouille;

  return (
    <div className="rdv-modal-overlay" onClick={enCours ? undefined : onClose}>
      <form
        className="rdv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminer-rdv-title"
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

        <h3 id="terminer-rdv-title" style={{ paddingRight: "2rem" }}>
          Terminer la consultation
        </h3>
        <p className="mb-3">
          Demandez {patientNom ? `à ${patientNom} ` : "au patient "}son code de
          consultation et saisissez-le pour clôturer le rendez-vous.
        </p>

        <label htmlFor="terminer-rdv-code" className="form-label fw-semibold">
          Code de consultation <span aria-hidden="true">*</span>
        </label>
        <input
          id="terminer-rdv-code"
          type="text"
          className="form-control mb-2"
          value={code}
          onChange={(e) => setCode(nettoyerSaisie(e.target.value))}
          maxLength={CODE_CONSULTATION_LONGUEUR_MAX}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          disabled={desactive}
          autoFocus
          aria-describedby="terminer-rdv-aide"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "1.5rem",
            letterSpacing: "0.4em",
            textAlign: "center",
            textTransform: "uppercase",
          }}
        />
        <div id="terminer-rdv-aide" className="text-faint mb-3" style={{ fontSize: ".8rem" }}>
          {CODE_CONSULTATION_LONGUEUR_MIN} caractères (lettres et chiffres).
        </div>

        {erreur && (
          <div className="alert alert-danger py-2 mb-3" role="alert">
            <i className="fa-solid fa-circle-exclamation me-2"></i>
            {erreur.message}
            {erreur.tentativesRestantes !== undefined && (
              <>
                {" "}
                <strong>
                  {erreur.tentativesRestantes} tentative
                  {erreur.tentativesRestantes > 1 ? "s" : ""} restante
                  {erreur.tentativesRestantes > 1 ? "s" : ""}.
                </strong>
              </>
            )}
            {verrouille && (
              <>
                {" "}
                Réessayez dans <strong>{formaterDuree(secondesRestantes)}</strong>.
              </>
            )}
          </div>
        )}

        <div className="d-flex gap-2 justify-content-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm-aps"
            onClick={onClose}
            disabled={enCours}
          >
            Annuler
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm-aps"
            disabled={!codeComplet || desactive}
          >
            {enCours && <span className="spinner-border spinner-border-sm me-1"></span>}
            Valider
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object|null} props.rdv - rendez-vous à terminer (rdv_id requis)
 * @param {string} [props.patientNom]
 * @param {() => void} props.onClose
 * @param {(resultat: Object) => void} props.onTermine
 */
const TerminerRdvModal = ({ open, rdv, ...reste }) => {
  if (!open || !rdv) return null;
  // `key` : le formulaire est remonté (état vierge) à chaque ouverture / changement de RDV.
  return <FormulaireTerminer key={rdv.rdv_id} rdv={rdv} {...reste} />;
};

export default TerminerRdvModal;