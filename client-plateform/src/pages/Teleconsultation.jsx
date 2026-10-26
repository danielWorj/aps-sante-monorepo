// src/pages/Teleconsultation.jsx
//
// Page d'arrivée du lien "rejoindre la visio" côté PATIENT (voir
// pages/RendezVous.jsx, étape 3 de confirmation :
//   <Link to={`/portail/consultation/${rendezVousCree.rdv_id}`}>
// ).
//
// ⚠️ Côté MÉDECIN, le bouton "Démarrer la visio" du portail
// (components/portails/components/medecin-rdv.jsx) NE navigue PAS ici :
// il appelle ouvrirVisio(rdv), qui monte <VisioModal /> par-dessus la
// page (voir visio-modal.jsx) — un choix volontaire pour que le
// médecin reste dans son contexte "Rendez-vous". Les deux chemins
// convergent malgré tout vers la même session : VisioModal et cette
// page délèguent tous deux à <ConsultationRoom rdvId={...} />, qui
// obtient un roomName déterministe (`rdv-${rdv_id}`) auprès du serveur
// — médecin et patient atterrissent donc bien dans le même salon Jitsi,
// simplement via deux habillages différents. Si un jour le comportement
// médecin doit aussi passer par cette route plein écran, remplacer
// l'appel à ouvrirVisio(rdv) par un navigate(`/portail/consultation/${rdv.rdv_id}`)
// dans medecin-rdv.jsx.
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
// D8 (politique de fonds v2) : un RDV au statut « cree » est NON PAYÉ. Le médecin
// n'a alors aucun accès : GET /rendez-vous/:id ne lui renvoie que
// { rdv_id, date_creneau, statut, non_paye: true } (donc ni type_rdv, ni patient) et
// POST /visio/token répond 409 RDV_NON_PAYE. Le RDV n'est plus « confirmé par le
// médecin » : il devient confirmé par le paiement. Cette page affiche donc « en
// attente de paiement » (et non « pas encore confirmé par le médecin ») et teste
// l'état non payé AVANT le type de RDV, absent de la projection minimale.
//
// ⚠️ Hypothèse (à confirmer côté back-office) : useAuth().user.role vaut
// 'medecin' pour un compte médecin (cf. RendezVous.jsx, ligne
// `user?.role !== 'patient'`) — utilisé ici uniquement pour savoir quel
// nom afficher comme "vous" / "interlocuteur" ; ne conditionne aucune
// autorisation réelle (déjà gérée par le serveur).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { obtenirRendezVous } from "../services/medecinService";
import { estRdvNonPaye, estErreurRdvNonPaye, visioLancee, INTERVALLE_ATTENTE_VISIO_MS } from "../utils/rdv";
import { useAuth } from "../context/AuthContext";
import ConsultationRoom from "../components/visio/ConsultationRoom";
import ClotureConsultation from "../components/visio/ClotureConsultation";
import { obtenirBilanVisio } from "../services/visioService";
import "../assets/styles/teleconsultation.css";

// Doit rester synchronisé avec STATUTS_AUTORISES_VISIO côté serveur
// (server/src/controllers/visio.controller.js) — dupliqué ici
// uniquement pour donner un message adapté avant même d'appeler
// /visio/token (le serveur reste la seule source de vérité : en cas de
// désync, c'est son 400 qui prévaut, remonté par ConsultationRoom).
const STATUTS_AUTORISES_VISIO = ["confirme", "en_attente_presence"];

const MESSAGE_RDV_NON_PAYE_PATIENT =
  "Ce rendez-vous est en attente de paiement : la téléconsultation sera accessible dès que votre paiement sera confirmé.";
const MESSAGE_RDV_NON_PAYE_MEDECIN =
  "Ce rendez-vous est en attente de paiement du patient : la visio sera accessible une fois le paiement confirmé.";

const MESSAGE_STATUT_INDISPONIBLE = {
  cree: MESSAGE_RDV_NON_PAYE_PATIENT,
  honore: "Cette téléconsultation a déjà eu lieu.",
  non_honore: "Ce rendez-vous a été marqué comme non honoré.",
  annule: "Ce rendez-vous a été annulé.",
  conteste: "Ce rendez-vous fait l'objet d'une contestation — contactez le support.",
  a_reprogrammer:
    "Ce rendez-vous est à reprogrammer (les deux parties étaient absentes). Convenez d'une nouvelle date depuis la page de vos rendez-vous.",
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
  // ?rejoindre=1 : le patient a décroché l'appel entrant (AppelVisioEntrant),
  // on entre directement dans la salle si la visio est lancée.
  const [parametres] = useSearchParams();
  const rejoindreDirect = parametres.get("rejoindre") === "1";

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

        // D8 : RDV non payé -> pas d'accès à la visio (et, pour le médecin, aucune
        // autre donnée que la projection minimale : on ne teste pas type_rdv).
        if (estRdvNonPaye(donnees)) {
          setMessageErreur(user?.role === "medecin" ? MESSAGE_RDV_NON_PAYE_MEDECIN : MESSAGE_RDV_NON_PAYE_PATIENT);
          setPhase("indisponible");
          return;
        }

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
        setPhase(
          rejoindreDirect && user?.role !== "medecin" && visioLancee(donnees) ? "session" : "attente"
        );
      })
      .catch((err) => {
        if (annule) return;
        // Filet de sécurité D8 : un 409 RDV_NON_PAYE n'est pas une panne.
        if (estErreurRdvNonPaye(err)) {
          setMessageErreur(err.data?.message || MESSAGE_RDV_NON_PAYE_MEDECIN);
          setPhase("indisponible");
          return;
        }
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
  }, [id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const peutRejoindre = estLeMedecin || visioLancee(rdv);

  // PATIENT en salle d'attente : relecture du RDV jusqu'à ce que le médecin
  // lance la visio (le bouton « Rejoindre » s'active alors).
  useEffect(() => {
    if (estLeMedecin || phase !== "attente" || visioLancee(rdv)) return undefined;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        setRdv(await obtenirRendezVous(id));
      } catch {
        // Silencieux : nouvel essai au prochain tour.
      }
    }, INTERVALLE_ATTENTE_VISIO_MS);
    return () => clearInterval(t);
  }, [estLeMedecin, phase, rdv, id]);

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
    navigate(estLeMedecin ? "/portail/medecin-rdv" : "/portail/patient-rdv", { replace: true });
  }, [navigate, estLeMedecin]);

  // Fin de consultation : une seule fois par appel (videoConferenceLeft et
  // readyToClose peuvent se suivre). La carte de clôture prend le relais.
  const apiRef = useRef(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const gererFinAppel = useCallback(() => {
    if (phaseRef.current !== "session") return;
    phaseRef.current = "terminee";
    apiRef.current = null;
    setPhase("terminee");
  }, []);

  // PATIENT : l'autre participant est sorti — si le médecin a terminé
  // l'appel, on raccroche proprement (sinon il s'est peut-être juste
  // déconnecté : on reste dans la salle).
  const verifierClotureMedecin = useCallback(async () => {
    if (estLeMedecin || phaseRef.current !== "session") return;
    try {
      const bilan = await obtenirBilanVisio(id);
      if (!(bilan.visio_cloturee || bilan.termine) || phaseRef.current !== "session") return;
      try {
        apiRef.current?.executeCommand("hangup");
      } catch {
        // l'appel est déjà terminé
      }
      setTimeout(gererFinAppel, 2000);
    } catch {
      // Silencieux : nouvel essai au prochain départ d'un participant.
    }
  }, [estLeMedecin, id, gererFinAppel]);

  // Filet de sécurité côté patient : un départ du médecin manqué par Jitsi
  // le laisserait seul dans la salle, on relit donc le bilan pendant l'appel.
  useEffect(() => {
    if (estLeMedecin || phase !== "session") return undefined;
    const t = setInterval(verifierClotureMedecin, 20_000);
    return () => clearInterval(t);
  }, [estLeMedecin, phase, verifierClotureMedecin]);

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
        <ClotureConsultation
          rdvId={rdv.rdv_id}
          role={estLeMedecin ? "medecin" : "patient"}
          onFermer={retourPortail}
          onRejoindre={estLeMedecin ? undefined : () => setPhase("session")}
        />
      </div>
    );
  }

  if (phase === "session") {
    return (
      <div className="tc-session">
        <ConsultationRoom
          rdvId={rdv.rdv_id}
          onApi={(api) => {
            apiRef.current = api;
          }}
          onCallEnded={gererFinAppel}
          // La clôture du médecin peut suivre de peu son départ : relectures.
          onParticipantLeft={() => [0, 3000, 8000].forEach((d) => setTimeout(verifierClotureMedecin, d))}
        />
      </div>
    );
  }

  // phase === "attente" : salle d'attente avant de rejoindre (on ne
  // monte <ConsultationRoom /> — donc on ne sollicite caméra/micro —
  // qu'après un geste explicite de l'utilisateur).
  return (
    <div className="tc-salle-attente">
      <div className="tc-carte">
        <div className="tc-carte-bandeau">
          <div className="tc-avatar">{interlocuteur?.initiales}</div>
          <div>
            <span className="tc-surtitre">Téléconsultation</span>
            <h1 className="tc-titre">{interlocuteur?.nom}</h1>
          </div>
        </div>
        <div className="tc-carte-corps">
          <div className="tc-infos">
            <div className="tc-info">
              <i className="fa-regular fa-calendar" />
              <span>{formaterCreneau(rdv.date_creneau)}</span>
            </div>
            {rdv.motif && (
              <div className="tc-info is-motif">
                <i className="fa-solid fa-comment-medical" />
                <span>« {rdv.motif} »</span>
              </div>
            )}
          </div>
          <ul className="tc-verifs">
            <li><i className="fa-solid fa-wifi" /> Une connexion internet stable</li>
            <li><i className="fa-solid fa-video" /> Caméra et micro autorisés dans le navigateur</li>
            <li><i className="fa-solid fa-volume-low" /> Un endroit calme et bien éclairé</li>
          </ul>
          <div className="tc-actions">
            <button type="button" className="tcc-btn is-secondaire" onClick={retourPortail}>
              Plus tard
            </button>
            <button
              type="button"
              className={`tcc-btn ${peutRejoindre ? "" : "is-attente"}`}
              disabled={!peutRejoindre}
              onClick={() => setPhase("session")}
            >
              <i className="fa-solid fa-video" />{" "}
              {peutRejoindre ? "Rejoindre la consultation" : "En attente du médecin"}
            </button>
          </div>
          {!peutRejoindre && (
            <p className="tc-securite">
              <i className="fa-solid fa-circle-info" />
              Le bouton s&apos;activera dès que le médecin aura lancé la visio.
            </p>
          )}
          <p className="tc-securite">
            <i className="fa-solid fa-shield-halved" />
            Salle sécurisée, accessible uniquement à vous deux. Rien n&apos;est enregistré.
          </p>
        </div>
      </div>
    </div>
  );
}
