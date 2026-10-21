// components/visio/ClotureConsultation.jsx
//
// Carte affichée à la fin d'une téléconsultation (modale visio du portail et
// page plein écran /portail/consultation/:id).
//
//   - MÉDECIN : sa sortie clôt la consultation (POST /visio/:id/cloture) ; la
//     carte le remercie et lui indique dans combien d'heures il sera payé
//     (délai T du pays, paramétré au back-office).
//   - PATIENT : la carte attend la clôture du médecin (quelques secondes de
//     relecture du bilan), puis propose de noter le médecin, de laisser un
//     avis et, si besoin, de déclarer un litige (contestation pendant T).
//
// Le serveur reste l'arbitre : la carte n'affiche que ce que le bilan permet.
import { useCallback, useEffect, useRef, useState } from "react";
import { cloturerVisio, obtenirBilanVisio } from "../../services/visioService";
import { deposerAvisMedecin, COMMENTAIRE_AVIS_MAX } from "../../services/reputationMedecinService";
import { contesterRendezVous } from "../../services/fondsService";
import { SaisieEtoiles } from "../avis/Etoiles";
import "../../assets/styles/teleconsultation.css";

// Le médecin clôt en quittant : le patient relit le bilan pendant ~20 s.
const ESSAIS_ATTENTE = 8;
const INTERVALLE_ATTENTE_MS = 2500;

const MESSAGES_NON_TERMINEE_MEDECIN = {
  presences_incompletes:
    "La présence des deux participants n'a pas pu être confirmée par la visio. La consultation sera vérifiée automatiquement et votre paiement suivra les règles habituelles.",
  parametre_delai_absent:
    "La fin de consultation n'a pas pu être enregistrée : le délai de versement n'est pas encore paramétré pour votre pays. L'équipe APS Santé a été alertée.",
  statut_incompatible: "Ce rendez-vous n'est plus dans un état permettant de clôturer la consultation.",
};

function formaterDateHeure(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function libelleHeures(h) {
  return `${h} heure${h > 1 ? "s" : ""}`;
}

/**
 * @param {object} props
 * @param {string} props.rdvId
 * @param {"medecin"|"patient"} props.role
 * @param {() => void} props.onFermer
 * @param {() => void} [props.onRejoindre] - proposé au patient si le médecin n'a pas clôturé
 */
export default function ClotureConsultation({ rdvId, role, onFermer, onRejoindre }) {
  const [bilan, setBilan] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [attente, setAttente] = useState(true);
  const monte = useRef(true);

  // Aucun setState avant le premier await : appelée depuis l'effet de montage.
  const charger = useCallback(async () => {
    try {
      let b = await cloturerVisio(rdvId);
      for (let i = 0; role === "patient" && !b.visio_cloturee && b.raison_non_terminee === "en_attente_medecin" && i < ESSAIS_ATTENTE; i += 1) {
        await new Promise((r) => setTimeout(r, INTERVALLE_ATTENTE_MS));
        if (!monte.current) return;
        b = await obtenirBilanVisio(rdvId);
      }
      if (monte.current) setBilan(b);
    } catch (err) {
      if (monte.current) setErreur(err?.message || "Impossible de récupérer le bilan de la consultation.");
    } finally {
      if (monte.current) setAttente(false);
    }
  }, [rdvId, role]);

  useEffect(() => {
    monte.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- état posé seulement après un await
    charger();
    return () => {
      monte.current = false;
    };
  }, [charger]);

  return (
    <div className="tcc-voile" role="dialog" aria-modal="true" aria-labelledby="tcc-titre">
      <div className="tcc-carte">
        {attente ? (
          <div className="tcc-attente">
            <span className="tcc-spinner" aria-hidden="true" />
            <p id="tcc-titre">
              {role === "medecin" ? "Clôture de la consultation…" : "Fin de la consultation…"}
            </p>
          </div>
        ) : erreur ? (
          <>
            <div className="tcc-pastille is-alerte"><i className="fa-solid fa-triangle-exclamation" /></div>
            <h2 id="tcc-titre" className="tcc-titre">Bilan indisponible</h2>
            <p className="tcc-texte">{erreur}</p>
            <div className="tcc-actions">
              <button type="button" className="tcc-btn is-secondaire" onClick={onFermer}>Fermer</button>
              <button
                type="button"
                className="tcc-btn"
                onClick={() => {
                  setErreur(null);
                  setAttente(true);
                  charger();
                }}
              >
                Réessayer
              </button>
            </div>
          </>
        ) : role === "medecin" ? (
          <BilanMedecin bilan={bilan} onFermer={onFermer} />
        ) : (
          <BilanPatient bilan={bilan} onFermer={onFermer} onRejoindre={onRejoindre} />
        )}
      </div>
    </div>
  );
}

function BilanMedecin({ bilan, onFermer }) {
  const patient = [bilan.interlocuteur?.prenom, bilan.interlocuteur?.nom].filter(Boolean).join(" ");
  const heures = bilan.delai_liberation_heures;

  return (
    <>
      <div className="tcc-pastille"><i className="fa-solid fa-hand-holding-medical" /></div>
      <h2 id="tcc-titre" className="tcc-titre">Merci, Docteur !</h2>
      <p className="tcc-texte">
        Votre téléconsultation{patient ? <> avec <strong>{patient}</strong></> : null} est terminée.
        Merci pour votre engagement auprès de vos patients.
      </p>

      {bilan.termine ? (
        <div className="tcc-encart">
          <i className="fa-solid fa-wallet" />
          <div>
            {heures != null ? (
              <>
                <strong>Vous recevrez votre paiement dans {libelleHeures(heures)}.</strong>
                {bilan.date_liberation && <span>Versement prévu le {formaterDateHeure(bilan.date_liberation)}.</span>}
              </>
            ) : (
              <strong>Votre paiement sera versé à l&apos;issue du délai de vérification.</strong>
            )}
            <span className="tcc-encart-note">
              Ce délai permet au patient de signaler un éventuel problème ; sans litige, les fonds sont
              versés automatiquement dans votre portefeuille.
            </span>
          </div>
        </div>
      ) : (
        <div className="tcc-encart is-neutre">
          <i className="fa-solid fa-circle-info" />
          <div>
            <span>
              {MESSAGES_NON_TERMINEE_MEDECIN[bilan.raison_non_terminee] ||
                "La fin de consultation n'a pas pu être enregistrée pour le moment."}
            </span>
          </div>
        </div>
      )}

      <div className="tcc-actions">
        <button type="button" className="tcc-btn" onClick={onFermer}>
          <i className="fa-solid fa-calendar-check" /> Retour à mes rendez-vous
        </button>
      </div>
    </>
  );
}

function BilanPatient({ bilan, onFermer, onRejoindre }) {
  const m = bilan.interlocuteur || {};
  const nomMedecin = `Dr ${[m.prenom, m.nom].filter(Boolean).join(" ")}`.trim();

  // Le médecin a terminé l'appel mais la consultation reste à valider
  // (présences non confirmées par la visio…) : pas de « Rejoindre ».
  if (!bilan.termine && bilan.visio_cloturee) {
    return (
      <>
        <div className="tcc-pastille"><i className="fa-solid fa-circle-check" /></div>
        <h2 id="tcc-titre" className="tcc-titre">Consultation terminée</h2>
        <p className="tcc-texte">
          {nomMedecin} a mis fin à la téléconsultation. Merci de votre confiance.
        </p>
        <div className="tcc-encart is-neutre">
          <i className="fa-solid fa-circle-info" />
          <div>
            <span>
              La consultation est en cours de vérification. Vous pourrez noter le médecin depuis vos
              rendez-vous dès qu&apos;elle sera validée.
            </span>
          </div>
        </div>
        <div className="tcc-actions">
          <button type="button" className="tcc-btn" onClick={onFermer}>Fermer</button>
        </div>
      </>
    );
  }

  if (!bilan.termine) {
    return (
      <>
        <div className="tcc-pastille is-neutre"><i className="fa-solid fa-video-slash" /></div>
        <h2 id="tcc-titre" className="tcc-titre">Vous avez quitté la consultation</h2>
        <p className="tcc-texte">
          {nomMedecin} n&apos;a pas encore clôturé la téléconsultation. Si vous avez été déconnecté,
          vous pouvez la rejoindre à nouveau.
        </p>
        <p className="tcc-texte-discret">
          Vous pourrez noter le médecin depuis vos rendez-vous une fois la consultation clôturée.
        </p>
        <div className="tcc-actions">
          <button type="button" className="tcc-btn is-secondaire" onClick={onFermer}>Fermer</button>
          {onRejoindre && (
            <button type="button" className="tcc-btn" onClick={onRejoindre}>
              <i className="fa-solid fa-video" /> Rejoindre à nouveau
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tcc-pastille"><i className="fa-solid fa-circle-check" /></div>
      <h2 id="tcc-titre" className="tcc-titre">Consultation terminée</h2>
      <p className="tcc-texte">
        Comment s&apos;est passée votre téléconsultation avec <strong>{nomMedecin}</strong>
        {m.specialite ? <> ({m.specialite})</> : null} ?
      </p>

      {bilan.avis?.possible ? (
        <FormulaireAvis rdvId={bilan.rdv_id} />
      ) : bilan.avis?.deja_depose ? (
        <div className="tcc-encart is-neutre">
          <i className="fa-solid fa-star" />
          <div><span>Vous avez déjà donné votre avis sur cette consultation. Merci !</span></div>
        </div>
      ) : null}

      {bilan.contestation?.possible && <DeclarerLitige rdvId={bilan.rdv_id} dateLiberation={bilan.date_liberation} />}

      <div className="tcc-actions">
        <button type="button" className="tcc-btn is-secondaire" onClick={onFermer}>Fermer</button>
      </div>
    </>
  );
}

function FormulaireAvis({ rdvId }) {
  const [note, setNote] = useState(null);
  const [commentaire, setCommentaire] = useState("");
  const [anonyme, setAnonyme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [envoye, setEnvoye] = useState(false);

  if (envoye) {
    return (
      <div className="tcc-encart">
        <i className="fa-solid fa-heart" />
        <div>
          <strong>Merci pour votre avis !</strong>
          <span>Il est désormais visible sur la fiche du médecin.</span>
        </div>
      </div>
    );
  }

  const envoyer = async (e) => {
    e.preventDefault();
    if (!note || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      await deposerAvisMedecin({ rdv_id: rdvId, note, commentaire: commentaire.trim(), anonyme });
      setEnvoye(true);
    } catch (err) {
      setErreur(err?.message || "Impossible d'envoyer votre avis.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form className="tcc-avis" onSubmit={envoyer}>
      <div className="tcc-etoiles">
        <SaisieEtoiles valeur={note} onChange={setNote} nom="tcc-note" libelle="Note du médecin" disabled={enCours} />
      </div>
      <label htmlFor="tcc-commentaire" className="tcc-label">
        Votre avis <span>(facultatif)</span>
      </label>
      <textarea
        id="tcc-commentaire"
        className="form-control"
        rows={3}
        maxLength={COMMENTAIRE_AVIS_MAX}
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Écoute, explications, ponctualité… Évitez les informations médicales personnelles."
        disabled={enCours}
      />
      <div className="form-check mt-2">
        <input
          className="form-check-input"
          type="checkbox"
          id="tcc-anonyme"
          checked={anonyme}
          onChange={(e) => setAnonyme(e.target.checked)}
          disabled={enCours}
        />
        <label className="form-check-label" htmlFor="tcc-anonyme">
          Publier sous « Patient vérifié »
        </label>
      </div>
      {erreur && <div className="tcc-erreur" role="alert">{erreur}</div>}
      <button type="submit" className="tcc-btn is-plein" disabled={!note || enCours}>
        {enCours ? <span className="spinner-border spinner-border-sm" /> : <i className="fa-solid fa-star" />}
        Publier ma note
      </button>
    </form>
  );
}

function DeclarerLitige({ rdvId, dateLiberation }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [declare, setDeclare] = useState(false);

  if (declare) {
    return (
      <div className="tcc-litige is-declare">
        <i className="fa-solid fa-flag" />
        <span>Litige déclaré. Les fonds restent bloqués et notre équipe vous recontactera.</span>
      </div>
    );
  }

  const confirmer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await contesterRendezVous(rdvId);
      setDeclare(true);
    } catch (err) {
      setErreur(err?.message || "Impossible de déclarer le litige pour le moment.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="tcc-litige">
      {!ouvert ? (
        <button type="button" className="tcc-lien" onClick={() => setOuvert(true)}>
          <i className="fa-solid fa-flag" /> Un problème avec cette consultation ? Déclarer un litige
        </button>
      ) : (
        <div role="alertdialog" aria-label="Confirmer le litige">
          <p>
            Le paiement du médecin sera bloqué{dateLiberation ? <> (versement prévu le {formaterDateHeure(dateLiberation)})</> : null}{" "}
            jusqu&apos;au traitement du litige par APS Santé. Cette action est définitive.
          </p>
          {erreur && <div className="tcc-erreur" role="alert">{erreur}</div>}
          <div className="tcc-actions is-gauche">
            <button type="button" className="tcc-btn is-secondaire" onClick={() => setOuvert(false)} disabled={enCours}>
              Annuler
            </button>
            <button type="button" className="tcc-btn is-alerte" onClick={confirmer} disabled={enCours}>
              {enCours && <span className="spinner-border spinner-border-sm" />} Confirmer le litige
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
