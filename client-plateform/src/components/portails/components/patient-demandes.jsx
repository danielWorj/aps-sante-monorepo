// patient-demandes.jsx
//
// RDV ALÉATOIRE — espace patient (« Demande rapide »).
//
// Le patient ne choisit pas de médecin : il indique la spécialité, sa ville,
// le jour ET l'heure souhaités, le type de consultation et (facultatif) le
// motif. La demande est signalée à tous les médecins de cette spécialité
// dans cette ville. Chaque médecin disponible répond avec son profil (tarif
// indicatif, note, téléconsultation…). Le patient compare, ouvre le profil
// s'il le souhaite, puis clique « Valider ce médecin » : le rendez-vous est
// créé et le paiement s'ouvre aussitôt (même parcours que pour un RDV pris
// dans l'agenda : sans paiement dans le délai, il est annulé et la demande
// redevient ouverte).
//
// DEMANDE DIRECTE (médecin sans créneau libre, envoyée depuis la page de
// prise de RDV) : « en attente du médecin » pendant 24 h, puis s'il refuse ou
// ne répond pas, le patient choisit : changer de médecin (la demande est
// retirée, l'annuaire s'ouvre sur la même spécialité et la même ville) ou
// recevoir les candidatures des autres médecins (la demande devient une
// demande rapide classique).
//
// Le client n'invente aucun montant : il affiche le tarif indicatif renvoyé
// par le serveur ; le total (frais et commission) est celui du devis de
// paiement (ChoixMoyenPaiement).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PatientPortailSidebar from "./../layouts/patient.portail-sidebar";
import ChoixMoyenPaiement from "./../../paiement/ChoixMoyenPaiement";
import PaiementMobileMoney from "./../../paiement/PaiementMobileMoney";
import { useAuth } from "./../../../context/AuthContext";
import { useConfirmation, useToast } from "../../feedback";
import { listerSpecialites } from "./../../../services/medecinService";
import { listerVilles } from "./../../../services/geoService";
import {
  STATUTS_OFFRE,
  annulerOffre,
  dateOffreLisible,
  diffuserDemande,
  listerMesOffres,
  partiesDateOffre,
  publierOffre,
  validerMedecin,
} from "./../../../services/offreRdvService";
import { montantDevise } from "./../../../utils/fonds";

const TYPE_RDV_LABEL = {
  physique: "Consultation physique",
  teleconsultation: "Téléconsultation",
};

/** AAAA-MM-JJ local (valeur d'un <input type="date">). */
function jourLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nomMedecin(m) {
  const u = m?.utilisateur;
  return u ? `Dr ${u.prenom ?? ""} ${u.nom ?? ""}`.trim() : "Médecin";
}

function initiales(m) {
  const u = m?.utilisateur;
  return `${u?.prenom?.[0] ?? ""}${u?.nom?.[0] ?? ""}`.toUpperCase() || "Dr";
}

// Statuts d'une demande encore « en cours » pour le patient.
const STATUTS_EN_COURS = ["ouverte", "attribuee", "en_attente_medecin", "refusee"];

const FORMULAIRE_VIDE = { specialite_id: "", ville_id: "", type_rdv: "physique", jour: "", heure: "", motif: "" };

/**
 * Formulaire pré-rempli depuis l'URL : l'annuaire public (bandeau « Demande
 * rapide ») transmet la spécialité et la ville déjà filtrées.
 */
function formulaireInitial(params) {
  const type = params.get("type_rdv");
  return {
    ...FORMULAIRE_VIDE,
    specialite_id: params.get("specialite_id") || "",
    ville_id: params.get("ville_id") || "",
    type_rdv: type === "teleconsultation" ? type : "physique",
  };
}

export default function PatientDemandes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, status } = useAuth();
  const estPatient = status === "authenticated" && user?.role === "patient";

  const [specialites, setSpecialites] = useState([]);
  const [villes, setVilles] = useState([]);
  const [form, setForm] = useState(() => formulaireInitial(searchParams));
  const [envoi, setEnvoi] = useState(false);
  const [erreurForm, setErreurForm] = useState(null);
  // Formulaire de publication dans une modale ; ouverte d'emblée si l'URL
  // transmet une spécialité ou une ville (lien depuis l'annuaire).
  const [modaleOuverte, setModaleOuverte] = useState(
    () => Boolean(searchParams.get("specialite_id") || searchParams.get("ville_id"))
  );

  const [offres, setOffres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [actionEnCours, setActionEnCours] = useState(null);
  const toast = useToast();
  const confirmer = useConfirmation();

  // Paiement juste après « Valider ce médecin ».
  const [choixRdvId, setChoixRdvId] = useState(null);
  const [momoRdvId, setMomoRdvId] = useState(null);


  const charger = useCallback(async () => {
    try {
      const liste = await listerMesOffres();
      setOffres(liste);
      setErreur(null);
    } catch (err) {
      setErreur(err.message || "Impossible de charger vos demandes.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (!estPatient) return undefined;
    // Chargement inline (setState seulement après l'await), annulé au démontage.
    let actif = true;
    const tick = async () => {
      try {
        const liste = await listerMesOffres();
        if (actif) {
          setOffres(liste);
          setErreur(null);
        }
      } catch (err) {
        if (actif) setErreur(err.message || "Impossible de charger vos demandes.");
      } finally {
        if (actif) setChargement(false);
      }
    };
    tick();
    // Les réponses des médecins arrivent au fil de l'eau : rafraîchissement léger.
    const id = setInterval(() => {
      if (!document.hidden) tick();
    }, 60000);
    return () => {
      actif = false;
      clearInterval(id);
    };
  }, [estPatient]);

  useEffect(() => {
    if (!estPatient) return;
    listerSpecialites().then((s) => setSpecialites(s || [])).catch(() => setSpecialites([]));
    listerVilles(user?.pays_id)
      .then((d) => {
        const liste = d?.villes || [];
        setVilles(liste);
        // Ville transmise par l'annuaire mais hors du pays du patient : on la retire.
        setForm((f) => (f.ville_id && !liste.some((v) => v.ville_id === f.ville_id) ? { ...f, ville_id: "" } : f));
      })
      .catch(() => setVilles([]));
  }, [estPatient, user?.pays_id]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const ouvrirModale = () => {
    setErreurForm(null);
    setModaleOuverte(true);
  };

  // Fermeture : Échap, clic sur le fond, la croix ou « Annuler » (pas
  // pendant l'envoi). La saisie est conservée jusqu'à la publication.
  const fermerModale = useCallback(() => {
    if (!envoi) setModaleOuverte(false);
  }, [envoi]);

  useEffect(() => {
    if (!modaleOuverte) return undefined;
    const surTouche = (e) => {
      if (e.key === "Escape") fermerModale();
    };
    document.addEventListener("keydown", surTouche);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = overflow;
    };
  }, [modaleOuverte, fermerModale]);

  const publier = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    const { specialite_id, ville_id, type_rdv, jour, heure, motif } = form;
    if (!specialite_id || !ville_id || !jour || !heure) {
      setErreurForm("Choisissez la spécialité, la ville, le jour et l'heure.");
      return;
    }
    setEnvoi(true);
    try {
      // Jour et heure de la ville choisie (fuseau de son pays), convertis par
      // le serveur : le délai minimum (2 h) y est aussi vérifié.
      const data = await publierOffre({
        specialite_id,
        ville_id,
        type_rdv,
        jour,
        heure,
        motif: motif.trim() || null,
      });
      setForm(FORMULAIRE_VIDE);
      setModaleOuverte(false);
      toast.succes(
        data.medecins_notifies > 0
          ? `Demande publiée : ${data.medecins_notifies} médecin(s) prévenu(s).`
          : "Demande publiée. Aucun médecin n'est encore inscrit pour ces critères : elle reste visible jusqu'à l'heure choisie."
      );
      charger();
    } catch (err) {
      setErreurForm(err.message || "Publication impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async (offre) => {
    const ok = await confirmer({
      titre: "Retirer la demande",
      message: "Les médecins ne pourront plus y répondre.",
      labelConfirmer: "Retirer",
      variante: "danger",
    });
    if (!ok) return;
    setActionEnCours(offre.offre_id);
    try {
      await annulerOffre(offre.offre_id);
      toast.succes("Demande retirée.");
      charger();
    } catch (err) {
      toast.erreur(err.message || "Annulation impossible.");
    } finally {
      setActionEnCours(null);
    }
  };

  const valider = async (offre, reponse) => {
    const nom = nomMedecin(reponse.medecin);
    const ok = await confirmer({
      titre: "Valider ce médecin",
      message: `${nom}, le ${dateOffreLisible(offre)}.\nVous passerez ensuite au paiement.`,
      labelConfirmer: "Valider et payer",
    });
    if (!ok) return;
    setActionEnCours(reponse.reponse_id);
    try {
      const data = await validerMedecin(offre.offre_id, reponse.reponse_id);
      await charger();
      setChoixRdvId(data.rendez_vous.rdv_id);
    } catch (err) {
      toast.erreur(err.message || "Validation impossible.");
      charger();
    } finally {
      setActionEnCours(null);
    }
  };

  // Demande directe refusée : « Changer de médecin » retire la demande et
  // ouvre l'annuaire sur la même spécialité et la même ville.
  const changerDeMedecin = async (offre) => {
    setActionEnCours(offre.offre_id);
    try {
      await annulerOffre(offre.offre_id);
      const params = new URLSearchParams();
      if (offre.specialite_id) params.set("specialite_id", offre.specialite_id);
      if (offre.ville_id) params.set("ville_exercice_id", offre.ville_id);
      if (offre.pays_id) params.set("pays_exercice_id", offre.pays_id);
      navigate(`/medecin?${params.toString()}`);
    } catch (err) {
      toast.erreur(err.message || "Action impossible.");
      charger();
    } finally {
      setActionEnCours(null);
    }
  };

  // Demande directe refusée : « Recevoir d'autres candidatures » la propose
  // aux autres médecins de la spécialité dans la ville.
  const diffuser = async (offre) => {
    setActionEnCours(offre.offre_id);
    try {
      const data = await diffuserDemande(offre.offre_id);
      toast.succes(
        data.medecins_notifies > 0
          ? `Demande proposée à ${data.medecins_notifies} autre(s) médecin(s) : leurs réponses apparaîtront ici.`
          : "Demande proposée aux autres médecins : leurs réponses apparaîtront ici."
      );
      charger();
    } catch (err) {
      toast.erreur(err.message || "Action impossible.");
    } finally {
      setActionEnCours(null);
    }
  };

  const [enCours, terminees] = useMemo(() => {
    const a = [];
    const b = [];
    for (const o of offres) (STATUTS_EN_COURS.includes(o.statut) ? a : b).push(o);
    return [a, b];
  }, [offres]);

  if (!estPatient) {
    return (
      <div className="container-aps">
        <div className="aps-empty-state">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>Cet espace est réservé aux comptes patient.</div>
        </div>
      </div>
    );
  }

  const renderReponse = (offre, r) => {
    const m = r.medecin;
    const retenue = r.statut === "retenue";
    return (
      <div key={r.reponse_id} className={`offre-reponse ${retenue ? "is-retenue" : ""}`}>
        <div className="offre-reponse-avatar">
          {m.photo_url ? <img src={m.photo_url} alt="" /> : <span>{initiales(m)}</span>}
        </div>
        <div className="offre-reponse-body">
          <strong>{nomMedecin(m)}</strong>
          <div className="text-faint small">
            {m.specialite?.nom}
            {m.ville_exercice?.nom ? ` · ${m.ville_exercice.nom}` : ""}
            {m.note_moyenne != null && (
              <>
                {" · "}
                <i className="fa-solid fa-star text-warning"></i> {m.note_moyenne} ({m.total_avis})
              </>
            )}
          </div>
          {r.message && <p className="offre-reponse-message">« {r.message} »</p>}
          <Link to={`/profil/${m.medecin_id}`} target="_blank" rel="noreferrer" className="small">
            Voir le profil <i className="fa-solid fa-arrow-up-right-from-square"></i>
          </Link>
        </div>
        <div className="offre-reponse-actions">
          <div className="offre-tarif">{montantDevise(m.tarif_indicatif)}</div>
          <div className="text-faint" style={{ fontSize: ".72rem" }}>honoraires, hors frais</div>
          {offre.statut === "ouverte" && (
            <button
              type="button"
              className="btn btn-primary btn-sm-aps mt-2"
              disabled={actionEnCours !== null}
              onClick={() => valider(offre, r)}
            >
              {actionEnCours === r.reponse_id ? "Validation…" : "Valider ce médecin"}
            </button>
          )}
          {retenue && (
            <span className="chip chip-st-confirme mt-2">
              <i className="fa-solid fa-user-check"></i> Retenu
            </span>
          )}
        </div>
      </div>
    );
  };

  // Statut : pastille neutre + point de couleur (pas d'aplat coloré).
  const TON_STATUT = {
    ouverte: "attente",
    attribuee: "ok",
    expiree: "neutre",
    annulee: "neutre",
    en_attente_medecin: "attente",
    refusee: "attente",
  };

  const renderOffre = (o) => {
    const st = STATUTS_OFFRE[o.statut] || { label: o.statut };
    const rdv = o.rendez_vous;
    const date = partiesDateOffre(o);
    const enCoursOffre = STATUTS_EN_COURS.includes(o.statut);
    const avecReponses = o.statut === "ouverte" || o.statut === "attribuee";
    // Demande directe jamais proposée aux autres : elle ne concerne que ce médecin.
    const directe = Boolean(o.medecin_cible) && !o.diffusee_le;
    const echeanceReponse = o.echeance_reponse_medecin
      ? new Date(o.echeance_reponse_medecin).toLocaleString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    const nbReponses = o.reponses.length;
    const publieeLe = o.date_creation
      ? new Date(o.date_creation).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;
    return (
      <article key={o.offre_id} className={`dr-card ${enCoursOffre ? "" : "is-terminee"}`}>
        <header className="dr-card-head">
          {date ? (
            <div className="dr-date" aria-label={dateOffreLisible(o)}>
              <span className="dr-date-sem">{date.jourSemaine}</span>
              <span className="dr-date-jour">{date.jour}</span>
              <span className="dr-date-mois">{date.mois}</span>
            </div>
          ) : (
            <div className="dr-date"><i className="fa-regular fa-calendar"></i></div>
          )}

          <div className="dr-card-main">
            <div className="dr-card-top">
              <h3>{o.specialite?.nom}</h3>
              <span className={`dr-statut is-${TON_STATUT[o.statut] || "neutre"}`}>
                <span className="dr-statut-point" />
                {st.label}
              </span>
            </div>
            <div className="dr-heure">
              <i className="fa-regular fa-clock"></i>
              {date ? `${date.heure}` : dateOffreLisible(o)}
              {o.ville?.nom && <span className="dr-heure-note">heure de {o.ville.nom}</span>}
            </div>
            <ul className="dr-meta">
              <li>
                <i className={`fa-solid ${o.type_rdv === "teleconsultation" ? "fa-video" : "fa-stethoscope"}`}></i>
                {TYPE_RDV_LABEL[o.type_rdv]}
              </li>
              <li>
                <i className="fa-solid fa-location-dot"></i>
                {o.ville?.nom}
              </li>
              {o.medecin_cible && (
                <li>
                  <i className="fa-solid fa-user-doctor"></i>
                  Demande à {nomMedecin(o.medecin_cible)}
                </li>
              )}
            </ul>
          </div>
        </header>

        {o.motif && (
          <div className="dr-motif">
            <span className="dr-label">Motif</span>
            <p>{o.motif}</p>
          </div>
        )}

        {o.statut === "en_attente_medecin" && (
          <div className="dr-panel">
            <i className="fa-solid fa-user-clock"></i>
            <span className="flex-grow-1">
              Demande envoyée à {nomMedecin(o.medecin_cible)}.
              {echeanceReponse ? ` Il a jusqu'au ${echeanceReponse} pour accepter ou refuser.` : ""}
            </span>
          </div>
        )}

        {o.statut === "refusee" && (
          <div className="dr-panel">
            <i className="fa-solid fa-user-xmark"></i>
            <span className="flex-grow-1">
              {o.sans_reponse
                ? `${nomMedecin(o.medecin_cible)} n'a pas répondu à temps.`
                : `${nomMedecin(o.medecin_cible)} ne peut pas vous recevoir à cette heure.`}
              {o.motif_refus && <> « {o.motif_refus} »</>}
              <br />
              Souhaitez-vous changer de médecin, ou recevoir les candidatures d&apos;autres médecins pour la même date ?
            </span>
            <div className="d-flex gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm-aps"
                disabled={actionEnCours !== null}
                onClick={() => changerDeMedecin(o)}
              >
                <i className="fa-solid fa-user-doctor"></i> Changer de médecin
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm-aps"
                disabled={actionEnCours !== null}
                onClick={() => diffuser(o)}
              >
                {actionEnCours === o.offre_id ? (
                  "Envoi…"
                ) : (
                  <><i className="fa-solid fa-bullhorn"></i> Recevoir d&apos;autres candidatures</>
                )}
              </button>
            </div>
          </div>
        )}

        {o.statut === "attribuee" && rdv && (
          <div className="dr-panel">
            <i className={`fa-solid ${rdv.statut === "cree" ? "fa-credit-card" : "fa-circle-check"}`}></i>
            <span className="flex-grow-1">
              {rdv.statut === "cree"
                ? directe
                  ? `${nomMedecin(o.medecin_cible)} a accepté : réglez le rendez-vous pour le confirmer. Sans paiement dans le délai, il est annulé.`
                  : "Rendez-vous créé : réglez-le pour le confirmer. Sans paiement dans le délai, il est annulé et la demande redevient ouverte."
                : "Rendez-vous confirmé : retrouvez-le dans vos rendez-vous."}
            </span>
            {rdv.statut === "cree" ? (
              <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setChoixRdvId(rdv.rdv_id)}>
                <i className="fa-solid fa-lock"></i> Payer
              </button>
            ) : (
              <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={() => navigate("/portail/patient-rdv")}>
                Mes rendez-vous
              </button>
            )}
          </div>
        )}

        {avecReponses && !directe && (
          <section className="dr-reponses">
            {nbReponses === 0 ? (
              <div className="dr-attente">
                <span className="dr-attente-point" />
                <div>
                  <strong>En attente de réponses</strong>
                  <span>
                    Les médecins de cette spécialité{o.ville?.nom ? ` à ${o.ville.nom}` : ""} ont été prévenus. Leurs
                    réponses apparaîtront ici.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="dr-reponses-titre">
                  <span className="dr-label">Médecins disponibles</span>
                  <span className="dr-compteur">{nbReponses}</span>
                </div>
                <div className="offre-reponses">{o.reponses.map((r) => renderReponse(o, r))}</div>
              </>
            )}
          </section>
        )}

        <footer className="dr-card-foot">
          <span className="dr-publiee">{publieeLe ? `Publiée le ${publieeLe}` : ""}</span>
          {(o.statut === "ouverte" || o.statut === "en_attente_medecin") && (
            <button
              type="button"
              className="dr-lien-retirer"
              disabled={actionEnCours !== null}
              onClick={() => annuler(o)}
            >
              <i className="fa-solid fa-xmark"></i> Retirer la demande
            </button>
          )}
        </footer>
      </article>
    );
  };

  const aujourdhui = jourLocal(new Date());

  return (
    <>
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <header className="portail-head dr-page-head">
              <div>
                <span className="eyebrow">Espace patient</span>
                <h1>Demande rapide</h1>
                <p>
                  Indiquez la spécialité, le jour et l'heure : les médecins disponibles vous répondent, vous choisissez
                  celui qui vous convient.
                </p>
              </div>
              <button type="button" className="btn btn-primary btn-sm-aps dr-btn-nouvelle" onClick={ouvrirModale}>
                <i className="fa-solid fa-plus"></i> Publier une nouvelle demande
              </button>
            </header>

            {erreur && (
              <div className="alert alert-danger d-flex align-items-center" role="alert">
                <i className="fa-solid fa-circle-exclamation me-2"></i>
                <div className="flex-grow-1">{erreur}</div>
                <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
              </div>
            )}

            <h2 className="h6 mt-2 mb-3">Mes demandes en cours</h2>
            {chargement ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Chargement…</span>
                </div>
              </div>
            ) : enCours.length === 0 ? (
              <div className="aps-empty-state">
                <i className="fa-solid fa-bullhorn"></i>
                <div>Aucune demande en cours.</div>
                <button type="button" className="btn btn-outline-primary btn-sm-aps mt-2" onClick={ouvrirModale}>
                  <i className="fa-solid fa-plus"></i> Publier une nouvelle demande
                </button>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">{enCours.map(renderOffre)}</div>
            )}

            {terminees.length > 0 && (
              <details className="mt-4">
                <summary className="h6">Demandes terminées ({terminees.length})</summary>
                <div className="d-flex flex-column gap-3 mt-3">{terminees.map(renderOffre)}</div>
              </details>
            )}
          </main>
          <PatientPortailSidebar />
        </div>
      </div>


      {modaleOuverte &&
        createPortal(
          <div className="rdv-modal-overlay" onClick={fermerModale}>
            <div
              className="rdv-modal dr-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dr-modal-titre"
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="rdv-modal-close" onClick={fermerModale} aria-label="Fermer" disabled={envoi}>
                <i className="fa-solid fa-xmark"></i>
              </button>
              <div className="dr-modal-head">
                <span className="dr-modal-icone"><i className="fa-solid fa-bullhorn"></i></span>
                <div>
                  <h3 id="dr-modal-titre">Nouvelle demande</h3>
                  <p>Les médecins de la spécialité dans cette ville sont prévenus et vous répondent.</p>
                </div>
              </div>

              <form onSubmit={publier}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="offre-specialite">Spécialité</label>
                    <select id="offre-specialite" className="form-select" value={form.specialite_id} onChange={maj("specialite_id")} required>
                      <option value="">Choisir…</option>
                      {specialites.map((s) => (
                        <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="offre-ville">Ville</label>
                    <select id="offre-ville" className="form-select" value={form.ville_id} onChange={maj("ville_id")} required>
                      <option value="">Choisir…</option>
                      {villes.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="offre-jour">Jour</label>
                    <input id="offre-jour" type="date" className="form-control" min={aujourdhui} value={form.jour} onChange={maj("jour")} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="offre-heure">Heure (heure locale de la ville)</label>
                    <input id="offre-heure" type="time" step="900" className="form-control" value={form.heure} onChange={maj("heure")} required />
                  </div>
                  <div className="col-12">
                    <span className="form-label-aps d-block">Type de consultation</span>
                    <div className="view-toggle w-100">
                      {["physique", "teleconsultation"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={form.type_rdv === t ? "active" : ""}
                          onClick={() => setForm((f) => ({ ...f, type_rdv: t }))}
                        >
                          <i className={`fa-solid ${t === "teleconsultation" ? "fa-video" : "fa-stethoscope"}`}></i>{" "}
                          {TYPE_RDV_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="offre-motif">Motif (facultatif)</label>
                    <textarea
                      id="offre-motif"
                      className="form-control"
                      rows={3}
                      maxLength={1000}
                      placeholder="Ex. fièvre depuis deux jours"
                      value={form.motif}
                      onChange={maj("motif")}
                    />
                    <div className="dr-aide">Visible par les médecins de la spécialité, sans votre nom.</div>
                  </div>
                </div>
                {erreurForm && <div className="alert alert-danger mt-3 mb-0">{erreurForm}</div>}
                <div className="rdv-modal-actions mt-4">
                  <button type="button" className="btn btn-ghost" onClick={fermerModale} disabled={envoi}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={envoi}>
                    {envoi ? (
                      <><i className="fa-solid fa-spinner fa-spin"></i> Publication…</>
                    ) : (
                      <><i className="fa-solid fa-paper-plane"></i> Publier ma demande</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {choixRdvId && (
        <ChoixMoyenPaiement
          rdvId={choixRdvId}
          onFermer={() => {
            setChoixRdvId(null);
            charger();
          }}
          onChoisirMobileMoney={() => {
            setMomoRdvId(choixRdvId);
            setChoixRdvId(null);
          }}
        />
      )}

      {momoRdvId && (
        <PaiementMobileMoney
          rdvId={momoRdvId}
          telephoneInitial={user?.telephone || ""}
          onFermer={() => {
            setMomoRdvId(null);
            charger();
          }}
        />
      )}
    </>
  );
}
