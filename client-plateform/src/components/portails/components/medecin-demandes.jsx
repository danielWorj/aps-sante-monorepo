// medecin-demandes.jsx
//
// RDV ALÉATOIRE — espace médecin (« Demandes patients »).
//
// Le médecin voit les demandes des patients de SA spécialité dans SA ville
// (téléconsultations seulement s'il l'a activée). Il répond s'il est
// disponible au jour et à l'heure fixés par le patient : il ne saisit ni
// tarif ni horaire, c'est son profil qui est présenté (tarif indicatif,
// note…), avec un mot facultatif. Le patient choisit ensuite parmi les
// médecins qui ont répondu.
//
// D8 : l'identité du patient n'apparaît jamais ici. Si le patient retient ce
// médecin, le rendez-vous lui est communiqué une fois PAYÉ (notification
// « Nouveau rendez-vous confirmé », onglet Rendez-vous).
import { useCallback, useEffect, useState } from "react";
import PortailSidebar from "./../layouts/portail-sidebar";
import { useConfirmation, useToast } from "../../feedback";
import { useAuth } from "./../../../context/AuthContext";
import {
  STATUTS_OFFRE,
  listerOffresMedecin,
  repondreOffre,
  retirerReponse,
} from "./../../../services/offreRdvService";

const TYPE_RDV_LABEL = {
  physique: "Consultation physique",
  teleconsultation: "Téléconsultation",
};

const STATUT_REPONSE = {
  proposee: { label: "Réponse envoyée", chip: "chip-st-paye", icone: "fa-paper-plane" },
  retiree: { label: "Réponse retirée", chip: "chip-st-termine", icone: "fa-rotate-left" },
  retenue: { label: "Vous avez été retenu", chip: "chip-st-confirme", icone: "fa-user-check" },
};

const dateLongue = (iso) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function MedecinDemandes() {
  const { user, status } = useAuth();
  const estMedecin = status === "authenticated" && user?.role === "medecin";

  const [vue, setVue] = useState("ouvertes");
  const [offres, setOffres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [actionEnCours, setActionEnCours] = useState(null);
  const [messages, setMessages] = useState({}); // offre_id -> mot au patient
  const toast = useToast();
  const confirmer = useConfirmation();


  const charger = useCallback(async (v) => {
    try {
      const liste = await listerOffresMedecin(v);
      setOffres(liste);
      setErreur(null);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les demandes.");
      setOffres([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (!estMedecin) return undefined;
    // Chargement inline (setState seulement après l'await), annulé au démontage.
    let actif = true;
    const tick = async () => {
      try {
        const liste = await listerOffresMedecin(vue);
        if (actif) {
          setOffres(liste);
          setErreur(null);
        }
      } catch (err) {
        if (actif) {
          setErreur(err.message || "Impossible de charger les demandes.");
          setOffres([]);
        }
      } finally {
        if (actif) setChargement(false);
      }
    };
    tick();
    const id = setInterval(() => {
      if (!document.hidden) tick();
    }, 60000);
    return () => {
      actif = false;
      clearInterval(id);
    };
  }, [estMedecin, vue]);

  const changerVue = (v) => {
    if (v === vue) return;
    setChargement(true);
    setVue(v);
  };

  const repondre = async (offre) => {
    setActionEnCours(offre.offre_id);
    try {
      await repondreOffre(offre.offre_id, messages[offre.offre_id]?.trim());
      toast.succes("Réponse envoyée : le patient voit votre profil et votre tarif.");
      charger(vue);
    } catch (err) {
      toast.erreur(err.message || "Réponse impossible.");
      charger(vue);
    } finally {
      setActionEnCours(null);
    }
  };

  const retirer = async (offre) => {
    const ok = await confirmer({
      titre: "Retirer votre réponse",
      message: "Le patient ne pourra plus vous choisir pour cette demande.",
      labelConfirmer: "Retirer",
      variante: "danger",
    });
    if (!ok) return;
    setActionEnCours(offre.offre_id);
    try {
      await retirerReponse(offre.offre_id);
      toast.succes("Réponse retirée.");
      charger(vue);
    } catch (err) {
      toast.erreur(err.message || "Retrait impossible.");
    } finally {
      setActionEnCours(null);
    }
  };

  if (!estMedecin) {
    return (
      <div className="container-aps">
        <div className="aps-empty-state">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>Cet espace est réservé aux comptes médecin.</div>
        </div>
      </div>
    );
  }

  const renderOffre = (o) => {
    const rep = o.ma_reponse;
    const stRep = rep ? STATUT_REPONSE[rep.statut] : null;
    const stOffre = STATUTS_OFFRE[o.statut];
    const peutRepondre = o.statut === "ouverte" && (!rep || rep.statut === "retiree");
    const peutRetirer = o.statut === "ouverte" && rep?.statut === "proposee";
    return (
      <article key={o.offre_id} className="info-card offre-card">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">
              <i className="fa-regular fa-calendar"></i> {dateLongue(o.date_souhaitee)}
            </h3>
            <div className="rdv-meta">
              <span>
                <i className={`fa-solid ${o.type_rdv === "teleconsultation" ? "fa-video" : "fa-stethoscope"}`}></i>{" "}
                {TYPE_RDV_LABEL[o.type_rdv]}
              </span>
              <span>
                <i className="fa-solid fa-location-dot"></i> {o.ville?.nom}
              </span>
              <span>{o.specialite?.nom}</span>
              {o.nombre_reponses != null && (
                <span>
                  <i className="fa-solid fa-user-doctor"></i> {o.nombre_reponses} réponse{o.nombre_reponses > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          {stRep ? (
            <span className={`chip ${stRep.chip}`}>
              <i className={`fa-solid ${stRep.icone}`}></i> {stRep.label}
            </span>
          ) : (
            o.statut !== "ouverte" &&
            stOffre && <span className={`chip ${stOffre.chip}`}>{stOffre.label}</span>
          )}
        </div>
        {o.motif && <p className="small mt-2 mb-0">Motif : {o.motif}</p>}

        {vue === "mes_reponses" && rep?.statut === "retenue" && (
          <p className="text-faint small mt-2 mb-0">
            <i className="fa-solid fa-circle-info"></i> Le patient vous a choisi. Le rendez-vous apparaîtra dans vos
            rendez-vous dès qu'il sera payé.
          </p>
        )}
        {vue === "mes_reponses" && rep?.statut === "proposee" && o.statut === "attribuee" && !o.attribuee_a_moi && (
          <p className="text-faint small mt-2 mb-0">Le patient a choisi un autre médecin.</p>
        )}

        {peutRepondre && (
          <div className="mt-3">
            <label className="form-label small" htmlFor={`msg-${o.offre_id}`}>Un mot au patient (facultatif)</label>
            <input
              id={`msg-${o.offre_id}`}
              className="form-control form-control-sm"
              maxLength={500}
              placeholder="Ex. disponible, consultation au cabinet de Bonapriso"
              value={messages[o.offre_id] ?? ""}
              onChange={(e) => setMessages((m) => ({ ...m, [o.offre_id]: e.target.value }))}
            />
            <div className="d-flex justify-content-between align-items-center mt-2 gap-2 flex-wrap">
              <span className="text-faint" style={{ fontSize: ".75rem" }}>
                Votre tarif et votre profil seront présentés au patient. En répondant, vous vous engagez à être
                disponible à cette heure.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm-aps"
                disabled={actionEnCours !== null}
                onClick={() => repondre(o)}
              >
                {actionEnCours === o.offre_id ? "Envoi…" : "Je suis disponible"}
              </button>
            </div>
          </div>
        )}
        {peutRetirer && (
          <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
            {rep.message ? <span className="small text-faint">Votre mot : « {rep.message} »</span> : <span />}
            <button
              type="button"
              className="btn btn-ghost btn-sm-aps"
              disabled={actionEnCours !== null}
              onClick={() => retirer(o)}
            >
              <i className="fa-solid fa-rotate-left"></i> Retirer ma réponse
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <header className="portail-head">
              <div>
                <span className="eyebrow">Espace médecin</span>
                <h1>Demandes patients</h1>
                <p>
                  Des patients de votre ville cherchent un médecin de votre spécialité à une date précise. Répondez si
                  vous êtes disponible : le patient choisit parmi les médecins qui ont répondu.
                </p>
              </div>
            </header>

            {erreur && (
              <div className="alert alert-danger d-flex align-items-center" role="alert">
                <i className="fa-solid fa-circle-exclamation me-2"></i>
                <div className="flex-grow-1">{erreur}</div>
                <button className="btn btn-sm btn-outline-danger" onClick={() => charger(vue)}>Réessayer</button>
              </div>
            )}

            <div className="info-card">
              <div className="aps-tabs">
                <button className={vue === "ouvertes" ? "active" : ""} onClick={() => changerVue("ouvertes")}>
                  Demandes ouvertes
                </button>
                <button className={vue === "mes_reponses" ? "active" : ""} onClick={() => changerVue("mes_reponses")}>
                  Mes réponses
                </button>
              </div>

              {chargement ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Chargement…</span>
                  </div>
                </div>
              ) : offres.length === 0 ? (
                <div className="aps-empty-state">
                  <i className="fa-solid fa-inbox"></i>
                  <div>
                    {vue === "ouvertes"
                      ? "Aucune demande ouverte pour votre spécialité dans votre ville."
                      : "Vous n'avez répondu à aucune demande."}
                  </div>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3 mt-3">{offres.map(renderOffre)}</div>
              )}
            </div>
          </main>
          <PortailSidebar />
        </div>
      </div>

    </>
  );
}
