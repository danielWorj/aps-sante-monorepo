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
// Le client n'invente aucun montant : il affiche le tarif indicatif renvoyé
// par le serveur ; le total (frais et commission) est celui du devis de
// paiement (ChoixMoyenPaiement).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  listerMesOffres,
  publierOffre,
  validerMedecin,
} from "./../../../services/offreRdvService";
import { montantDevise } from "./../../../utils/fonds";

const TYPE_RDV_LABEL = {
  physique: "Consultation physique",
  teleconsultation: "Téléconsultation",
};

// Miroir de OFFRE_RDV_DELAI_MIN_MINUTES (serveur, 2 h par défaut) : le
// serveur reste seul juge, ceci ne sert qu'à guider la saisie.
const DELAI_MIN_MS = 2 * 60 * 60 * 1000;

const dateLongue = (iso) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

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

const FORMULAIRE_VIDE = { specialite_id: "", ville_id: "", type_rdv: "physique", jour: "", heure: "", motif: "" };

export default function PatientDemandes() {
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const estPatient = status === "authenticated" && user?.role === "patient";

  const [specialites, setSpecialites] = useState([]);
  const [villes, setVilles] = useState([]);
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreurForm, setErreurForm] = useState(null);

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
    listerVilles(user?.pays_id).then((d) => setVilles(d?.villes || [])).catch(() => setVilles([]));
  }, [estPatient, user?.pays_id]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const publier = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    const { specialite_id, ville_id, type_rdv, jour, heure, motif } = form;
    if (!specialite_id || !ville_id || !jour || !heure) {
      setErreurForm("Choisissez la spécialité, la ville, le jour et l'heure.");
      return;
    }
    const date = new Date(`${jour}T${heure}`);
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + DELAI_MIN_MS) {
      setErreurForm("Choisissez une heure au moins 2 h plus tard, pour laisser aux médecins le temps de répondre.");
      return;
    }
    setEnvoi(true);
    try {
      const data = await publierOffre({
        specialite_id,
        ville_id,
        type_rdv,
        date_souhaitee: date.toISOString(),
        motif: motif.trim() || null,
      });
      setForm(FORMULAIRE_VIDE);
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
      message: `${nom}, le ${dateLongue(offre.date_souhaitee)}.\nVous passerez ensuite au paiement.`,
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

  const [enCours, terminees] = useMemo(() => {
    const a = [];
    const b = [];
    for (const o of offres) (o.statut === "ouverte" || o.statut === "attribuee" ? a : b).push(o);
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

  const renderOffre = (o) => {
    const st = STATUTS_OFFRE[o.statut] || { label: o.statut, chip: "", icone: "fa-circle" };
    const rdv = o.rendez_vous;
    return (
      <article key={o.offre_id} className="info-card offre-card">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">{o.specialite?.nom}</h3>
            <div className="rdv-meta">
              <span>
                <i className="fa-regular fa-calendar"></i> {dateLongue(o.date_souhaitee)}
              </span>
              <span>
                <i className={`fa-solid ${o.type_rdv === "teleconsultation" ? "fa-video" : "fa-stethoscope"}`}></i>{" "}
                {TYPE_RDV_LABEL[o.type_rdv]}
              </span>
              <span>
                <i className="fa-solid fa-location-dot"></i> {o.ville?.nom}
              </span>
            </div>
          </div>
          <span className={`chip ${st.chip}`}>
            <i className={`fa-solid ${st.icone}`}></i> {st.label}
          </span>
        </div>
        {o.motif && <p className="text-faint small mt-2 mb-0">Motif : {o.motif}</p>}

        {o.statut === "attribuee" && rdv && (
          <div className="alert alert-info mt-3 mb-0 d-flex align-items-center gap-2 flex-wrap">
            <i className="fa-solid fa-circle-info"></i>
            <span className="flex-grow-1">
              {rdv.statut === "cree"
                ? "Rendez-vous créé : réglez-le pour le confirmer. Sans paiement dans le délai, il est annulé et la demande redevient ouverte."
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

        {(o.statut === "ouverte" || o.statut === "attribuee") && (
          <div className="mt-3">
            {o.reponses.length === 0 ? (
              <div className="text-faint small">
                <i className="fa-solid fa-hourglass-half"></i> En attente de réponses des médecins…
              </div>
            ) : (
              <>
                <div className="small fw-semibold mb-2">
                  {o.reponses.length} médecin{o.reponses.length > 1 ? "s ont" : " a"} répondu
                </div>
                <div className="offre-reponses">{o.reponses.map((r) => renderReponse(o, r))}</div>
              </>
            )}
          </div>
        )}

        {o.statut === "ouverte" && (
          <div className="text-end mt-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm-aps"
              disabled={actionEnCours !== null}
              onClick={() => annuler(o)}
            >
              <i className="fa-solid fa-xmark"></i> Retirer la demande
            </button>
          </div>
        )}
      </article>
    );
  };

  const aujourdhui = jourLocal(new Date());

  return (
    <>
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <header className="portail-head">
              <div>
                <span className="eyebrow">Espace patient</span>
                <h1>Demande rapide</h1>
                <p>
                  Indiquez la spécialité, le jour et l'heure : les médecins disponibles vous répondent, vous choisissez
                  celui qui vous convient.
                </p>
              </div>
            </header>

            <form className="info-card offre-form" onSubmit={publier}>
              <h2 className="h6 mb-3">
                <i className="fa-solid fa-bullhorn"></i> Nouvelle demande
              </h2>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="offre-specialite">Spécialité</label>
                  <select id="offre-specialite" className="form-select" value={form.specialite_id} onChange={maj("specialite_id")} required>
                    <option value="">Choisir…</option>
                    {specialites.map((s) => (
                      <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="offre-ville">Ville</label>
                  <select id="offre-ville" className="form-select" value={form.ville_id} onChange={maj("ville_id")} required>
                    <option value="">Choisir…</option>
                    {villes.map((v) => (
                      <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="offre-jour">Jour</label>
                  <input id="offre-jour" type="date" className="form-control" min={aujourdhui} value={form.jour} onChange={maj("jour")} required />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="offre-heure">Heure</label>
                  <input id="offre-heure" type="time" step="900" className="form-control" value={form.heure} onChange={maj("heure")} required />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="offre-type">Type</label>
                  <select id="offre-type" className="form-select" value={form.type_rdv} onChange={maj("type_rdv")}>
                    <option value="physique">{TYPE_RDV_LABEL.physique}</option>
                    <option value="teleconsultation">{TYPE_RDV_LABEL.teleconsultation}</option>
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="offre-motif">Motif (facultatif)</label>
                  <textarea
                    id="offre-motif"
                    className="form-control"
                    rows={2}
                    maxLength={1000}
                    placeholder="Ex. fièvre depuis deux jours"
                    value={form.motif}
                    onChange={maj("motif")}
                  />
                  <div className="form-text">Le motif est visible par les médecins de la spécialité, sans votre nom.</div>
                </div>
              </div>
              {erreurForm && <div className="alert alert-danger mt-3 mb-0">{erreurForm}</div>}
              <div className="text-end mt-3">
                <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>
                  {envoi ? "Publication…" : "Publier ma demande"}
                </button>
              </div>
            </form>

            {erreur && (
              <div className="alert alert-danger d-flex align-items-center" role="alert">
                <i className="fa-solid fa-circle-exclamation me-2"></i>
                <div className="flex-grow-1">{erreur}</div>
                <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
              </div>
            )}

            <h2 className="h6 mt-4 mb-3">Mes demandes en cours</h2>
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
