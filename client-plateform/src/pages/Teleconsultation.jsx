// src/pages/Teleconsultation.jsx
//
// Page d'arrivée du bouton "Démarrer la visio" du portail médecin (voir
// components/portails/components/medecin-rdv.jsx :
//   onClick={() => navigate(`/portail/consultation/${rdv.rdv_id}`)}
// ).
//
// Route : /portail/consultation/:id — déclarée dans router.jsx comme
// enfant DIRECT de <RequireAuth /> (donc protégée : redirection
// automatique vers /login si non connecté, voir routes/RequireAuth.jsx),
// mais volontairement SORTIE de <PortailLayout /> : un appel vidéo
// occupe tout l'écran, la navbar/sidebar/footer du portail n'ont pas
// leur place ici (cf. patch router.jsx fourni avec cette page).
//
// Accès : ouvert au médecin ET au patient du rendez-vous. L'autorisation
// fine (bon médecin/bon patient du rdv, sinon 403/404) est déjà
// appliquée deux fois côté serveur :
//   - GET /rendez-vous/:id     -> rendezVous.controller.js#obtenirRendezVous
//   - POST /visio/token        -> visio.controller.js#obtenirTokenVisio
// Cette page ne réimplémente donc pas ce contrôle : elle affiche l'état
// du rendez-vous (garde-fous UX : mauvais type, mauvais statut, rdv
// introuvable/refusé), une "salle d'attente" avant de solliciter
// caméra/micro, puis délègue la session Jitsi elle-même au composant
// existant <ConsultationRoom /> (components/visio/ConsultationRoom.jsx),
// qui gère déjà l'appel à POST /visio/token et le rendu de
// @jitsi/react-sdk.
//
// ⚠️ Dépendance à ajouter avant de tester : @jitsi/react-sdk est déjà
// importé par ConsultationRoom.jsx mais absent de
// client-plateform/package.json.
//   npm install @jitsi/react-sdk --workspace client-plateform
//
// ⚠️ Hypothèse (à confirmer côté back-office) : useAuth().user.role vaut
// 'medecin' pour un compte médecin (cf. RendezVous.jsx, ligne
// `user?.role !== 'patient'`) — utilisé ici uniquement pour savoir quel
// nom afficher comme "vous" / "interlocuteur" ; ne conditionne aucune
// autorisation réelle (déjà gérée par le serveur).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { obtenirRendezVous } from "../services/medecinService";
import { useAuth } from "../context/AuthContext";
import ConsultationRoom from "../components/visio/ConsultationRoom";
import "../assets/styles/teleconsultation.css";

// Doit rester synchronisé avec STATUTS_AUTORISES_VISIO côté serveur
// (server/src/controllers/visio.controller.js) — dupliqué ici
// uniquement pour donner un message adapté avant même d'appeler
// /visio/token (le serveur reste la seule source de vérité : en cas de
// désync, c'est son 400 qui prévaut, remonté par ConsultationRoom).
const STATUTS_AUTORISES_VISIO = ["confirme", "en_attente_presence"];

const MESSAGE_STATUT_INDISPONIBLE = {
  cree: "Ce rendez-vous n'est pas encore confirmé par le médecin.",
  honore: "Cette téléconsultation a déjà eu lieu.",
  non_honore: "Ce rendez-vous a été marqué comme non honoré.",
  annule: "Ce rendez-vous a été annulé.",
  conteste: "Ce rendez-vous fait l'objet d'une contestation — contactez le support.",
};

function extraireInitiales(nom, prenom) {
  const a = (prenom || "").trim().charAt(0);
  const b = (nom || "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

function formaterCreneau(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const jour = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

export default function Teleconsultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // 'chargement' | 'erreur' | 'indisponible' | 'attente' | 'session' | 'terminee'
  const [phase, setPhase] = useState("chargement");
  const [rdv, setRdv] = useState(null);
  const [messageErreur, setMessageErreur] = useState("");

  useEffect(() => {
    let annule = false;

    setPhase("chargement");
    setRdv(null);
    setMessageErreur("");

    obtenirRendezVous(id)
      .then((donnees) => {
        if (annule) return;
        setRdv(donnees);

        if (donnees.type_rdv !== "teleconsultation") {
          setMessageErreur("Ce rendez-vous est une consultation physique, pas une téléconsultation.");
          setPhase("indisponible");
          return;
        }
        if (!STATUTS_AUTORISES_VISIO.includes(donnees.statut)) {
          setMessageErreur(
            MESSAGE_STATUT_INDISPONIBLE[donnees.statut] ||
              "La visio n'est pas disponible pour ce rendez-vous."
          );
          setPhase("indisponible");
          return;
        }
        setPhase("attente");
      })
      .catch((err) => {
        if (annule) return;
        setMessageErreur(
          err?.status === 404 || err?.status === 403
            ? "Rendez-vous introuvable, ou vous n'êtes pas autorisé à y accéder."
            : "Impossible de charger ce rendez-vous pour le moment."
        );
        setPhase("erreur");
      });

    return () => {
      annule = true;
    };
  }, [id]);

  // Confirmation avant de fermer/rafraîchir l'onglet pendant un appel en
  // cours, pour éviter une coupure accidentelle (ex. Ctrl+W involontaire).
  useEffect(() => {
    if (phase !== "session") return undefined;
    const avertir = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [phase]);

  const estLeMedecin = user?.role === "medecin";

  const interlocuteur = useMemo(() => {
    if (!rdv) return null;
    const cible = estLeMedecin ? rdv.patient?.utilisateur : rdv.medecin?.utilisateur;
    if (!cible) return { nom: "Interlocuteur", initiales: "?" };
    const nomComplet = estLeMedecin
      ? `${cible.prenom || ""} ${cible.nom || ""}`.trim()
      : `Dr ${cible.prenom || ""} ${cible.nom || ""}`.trim();
    return { nom: nomComplet || "Interlocuteur", initiales: extraireInitiales(cible.nom, cible.prenom) };
  }, [rdv, estLeMedecin]);

  const retourPortail = useCallback(() => {
    navigate(estLeMedecin ? "/portail/medecin-rdv" : "/", { replace: true });
  }, [navigate, estLeMedecin]);

  const gererFinAppel = useCallback(() => {
    setPhase("terminee");
  }, []);

  // ── Rendu ────────────────────────────────────────────────────────

  if (phase === "chargement") {
    return (
      <div className="tc-etat-plein-ecran">
        <span className="spinner-border text-primary mb-3" role="status" aria-hidden="true" />
        <p>Chargement du rendez-vous…</p>
      </div>
    );
  }

  if (phase === "erreur" || phase === "indisponible") {
    return (
      <div className="tc-etat-plein-ecran">
        <i
          className={`fa-solid ${phase === "erreur" ? "fa-triangle-exclamation" : "fa-circle-info"} tc-etat-icone`}
        />
        <p className="tc-etat-message">{messageErreur}</p>
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={retourPortail}>
          <i className="fa-solid fa-arrow-left" /> Retour
        </button>
      </div>
    );
  }

  if (phase === "terminee") {
    return (
      <div className="tc-etat-plein-ecran">
        <i className="fa-solid fa-circle-check tc-etat-icone tc-etat-icone-succes" />
        <p className="tc-etat-message">La téléconsultation est terminée.</p>
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={retourPortail}>
          <i className="fa-solid fa-arrow-left" /> Retour à mes rendez-vous
        </button>
      </div>
    );
  }

  if (phase === "session") {
    return (
      <div className="tc-session">
        <ConsultationRoom rdvId={rdv.rdv_id} onCallEnded={gererFinAppel} />
      </div>
    );
  }

  // phase === "attente" : salle d'attente avant de rejoindre (on ne
  // monte <ConsultationRoom /> — donc on ne sollicite caméra/micro —
  // qu'après un geste explicite de l'utilisateur).
  return (
    <div className="tc-salle-attente">
      <div className="tc-carte">
        <div className="tc-avatar">{interlocuteur?.initiales}</div>
        <h1 className="tc-titre">Téléconsultation avec {interlocuteur?.nom}</h1>
        <p className="tc-creneau">
          <i className="fa-regular fa-calendar" /> {formaterCreneau(rdv.date_creneau)}
        </p>
        {rdv.motif && <p className="tc-motif">« {rdv.motif} »</p>}
        <p className="tc-note">
          Vérifiez votre caméra et votre micro avant de rejoindre. La consultation
          démarrera dans une salle sécurisée, accessible uniquement à vous deux.
        </p>
        <div className="tc-actions">
          <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={retourPortail}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setPhase("session")}>
            <i className="fa-solid fa-video" /> Rejoindre la consultation
          </button>
        </div>
      </div>
    </div>
  );
}