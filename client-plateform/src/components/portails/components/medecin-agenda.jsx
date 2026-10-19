// medecin-agenda.jsx
//
// Agenda du médecin, en deux blocs :
//
// 1. « Ma semaine type » — le gabarit hebdomadaire (DisponibiliteMedecin).
//    Pour chaque jour, le médecin coche des PÉRIODES (matin, après-midi,
//    soirée : toutes leurs tranches sont sélectionnées) et peut affiner heure
//    par heure (voir agenda/selecteur-periodes.jsx et utils/periodesAgenda.js).
//    « Copier vers… » recopie un jour sur d'autres. Les changements sont
//    enregistrés en une fois (PUT /medecins/:id/disponibilites) ; le serveur
//    publie aussitôt les semaines à venir. Les rendez-vous déjà réservés sur
//    une tranche décochée sont maintenus (rdv_maintenus) : on prévient.
//
// 2. « Mes prochains jours » — les créneaux réels d'une semaine (CreneauAgenda),
//    jour par jour : périodes ouvertes, nombre de créneaux libres, rendez-vous.
//    « Modifier ce jour » crée une EXCEPTION pour cette date seulement (congé,
//    demi-journée, ouverture exceptionnelle) via PUT /agenda/jours/:date ;
//    « Revenir à la semaine type » l'annule (DELETE /agenda/jours/:date).
//    Un jour est « personnalisé » dès qu'une de ses tranches a été modifiée à
//    la main (origine « manuel »).
//
// Conventions de dates (inchangées) : creneau.date et horaire.heure_* sont des
// heures MURALES du médecin épinglées en UTC, lues par découpage de chaîne ;
// creneau.debut est l'instant réel, qui sert de jointure avec
// rdv.date_creneau (rdv_id n'est jamais exposé par la route publique).
//
// D8 (politique de fonds v2) : un rendez-vous NON PAYÉ (statut « cree ») est en
// lecture seule pour le médecin : ni identité du patient, ni motif. Il apparaît
// « En attente de paiement ».

import { useState, useEffect, useMemo, useCallback } from "react";
import PortailSidebar from "./../layouts/portail-sidebar";
import { estRdvNonPaye, estConsultationTerminee } from "./../../../utils/rdv";
import { formatHeure, grouperParPeriode, periodeDeHeure, resumeJournee } from "../../../utils/periodesAgenda";
import SelecteurPeriodes from "./agenda/selecteur-periodes";
import "./medecin-agenda.css";
import { useConfirmation, useToast } from "../../feedback";
import {
  obtenirMonProfil,
  listerHoraires,
  listerDisponibilitesMedecin,
  remplacerDisponibilitesMedecin,
  listerCreneauxAgenda,
  listerRendezVousMedecinConnecte,
  definirJourAgenda,
  retablirJourAgenda,
  JOURS_SEMAINE_AGENDA,
} from "../../../services/medecinService";

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_OUVRES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
const MOIS_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
// L'agenda est publié sur 60 jours (AGENDA_HORIZON_JOURS côté serveur) :
// au-delà, rien à afficher ni à modifier.
const SEMAINES_MAX = 8;

const cle = (jour, horaireId) => `${jour}|${horaireId}`;

function cleInstant(valeurISO) {
  const t = new Date(valeurISO).getTime();
  return Number.isNaN(t) ? null : t;
}

function versDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lundiSemaine(decalageSemaines) {
  const auj = new Date();
  const jourAuj = auj.getDay();
  const offsetVersLundi = jourAuj === 0 ? -6 : 1 - jourAuj;
  const lundi = new Date(auj);
  lundi.setHours(0, 0, 0, 0);
  lundi.setDate(auj.getDate() + offsetVersLundi + decalageSemaines * 7);
  return lundi;
}

function nomPatient(rdv) {
  const u = rdv?.patient?.utilisateur;
  if (u && (u.prenom || u.nom)) return `${u.prenom ?? ""} ${u.nom ?? ""}`.trim();
  if (rdv?.patient?.nom_complet) return rdv.patient.nom_complet;
  return "Patient";
}

function libelleRendezVous(rdv) {
  if (!rdv) return "";
  if (estRdvNonPaye(rdv)) return "En attente de paiement";
  if (estConsultationTerminee(rdv) && (rdv.statut === "confirme" || rdv.statut === "en_attente_presence")) {
    return "Terminé";
  }
  if (rdv.statut === "en_attente_presence") return "En attente · présence";
  if (rdv.statut === "a_reprogrammer") return "À reprogrammer";
  if (rdv.statut === "conteste") return "Contesté";
  if (rdv.statut === "non_honore") return "Non honoré";
  if (rdv.type_rdv === "teleconsultation") return "Téléconsultation";
  return rdv.motif ? rdv.motif : "Consultation";
}

function libelleDateRdv(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* « Copier vers… » : recopie la sélection d'un jour sur d'autres jours */
/* ------------------------------------------------------------------ */
const CopieVers = ({ source, onAppliquer, onFermer }) => {
  const [cibles, setCibles] = useState(() => new Set());
  const autres = JOURS_SEMAINE_AGENDA.filter((j) => j.valeur !== source);
  const basculer = (valeur) =>
    setCibles((c) => {
      const s = new Set(c);
      if (s.has(valeur)) s.delete(valeur);
      else s.add(valeur);
      return s;
    });
  return (
    <div className="agd-copie" role="dialog" aria-label="Copier vers d'autres jours">
      <div className="agd-copie-raccourcis">
        <button type="button" onClick={() => setCibles(new Set(JOURS_OUVRES.filter((j) => j !== source)))}>
          Lun–Ven
        </button>
        <button type="button" onClick={() => setCibles(new Set(autres.map((j) => j.valeur)))}>
          Tous
        </button>
      </div>
      <div className="agd-copie-jours">
        {autres.map((j) => (
          <label key={j.valeur} className={cibles.has(j.valeur) ? "is-actif" : ""}>
            <input type="checkbox" checked={cibles.has(j.valeur)} onChange={() => basculer(j.valeur)} />
            {j.libelle.slice(0, 3)}
          </label>
        ))}
      </div>
      <div className="agd-copie-actions">
        <button type="button" className="btn btn-ghost btn-sm-aps" onClick={onFermer}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm-aps"
          disabled={cibles.size === 0}
          onClick={() => onAppliquer([...cibles])}
        >
          Copier
        </button>
      </div>
    </div>
  );
};

const MedecinAgenda = () => {
  const toast = useToast();
  const confirmer = useConfirmation();

  const [medecinId, setMedecinId] = useState(null);
  const [horaires, setHoraires] = useState([]);
  const [gabaritServeur, setGabaritServeur] = useState(() => new Set());
  const [gabarit, setGabarit] = useState(() => new Set());
  const [copieOuverte, setCopieOuverte] = useState(null);

  const [semaineOffset, setSemaineOffset] = useState(0);
  const [creneaux, setCreneaux] = useState([]);
  const [rendezVous, setRendezVous] = useState([]);
  const [jourEdite, setJourEdite] = useState(null); // { iso, selection: Set, verrouilles: Set }

  const [chargement, setChargement] = useState(true);
  // Semaine dont les créneaux sont affichés : tant qu'elle diffère de la
  // semaine demandée, la liste est en cours de chargement.
  const [semaineChargee, setSemaineChargee] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState(null);

  const groupes = useMemo(() => grouperParPeriode(horaires), [horaires]);
  const modifie = useMemo(
    () => gabarit.size !== gabaritServeur.size || [...gabarit].some((k) => !gabaritServeur.has(k)),
    [gabarit, gabaritServeur]
  );

  // Jours de la semaine affichée (bloc 2).
  const jours = useMemo(() => {
    const lundi = lundiSemaine(semaineOffset);
    const ajISO = versDateISO(new Date());
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      const iso = versDateISO(d);
      return {
        dow: DOW_LABELS[i],
        valeur: JOURS_SEMAINE_AGENDA[i].valeur,
        libelle: JOURS_SEMAINE_AGENDA[i].libelle,
        num: d.getDate(),
        mois: MOIS_LABELS[d.getMonth()],
        iso,
        today: iso === ajISO,
        passe: iso < ajISO,
      };
    });
  }, [semaineOffset]);

  const cleSemaine = `${medecinId}|${jours[0].iso}`;
  const chargementSemaine = semaineChargee !== cleSemaine;

  const changerSemaine = (offset) => {
    setJourEdite(null);
    setSemaineOffset(offset);
  };

  const libelleSemaine = useMemo(() => {
    const debut = jours[0];
    const fin = jours[6];
    return debut.mois === fin.mois
      ? `${debut.num} – ${fin.num} ${fin.mois}`
      : `${debut.num} ${debut.mois} – ${fin.num} ${fin.mois}`;
  }, [jours]);

  // 1) Profil, référentiel et semaine type.
  const chargerGabarit = useCallback(async (id) => {
    const [horairesData, disponibilitesData] = await Promise.all([
      listerHoraires(),
      listerDisponibilitesMedecin(id),
    ]);
    const cles = new Set((disponibilitesData || []).map((d) => cle(d.jour_semaine, d.horaire_id)));
    setHoraires(horairesData || []);
    setGabaritServeur(cles);
    setGabarit(new Set(cles));
  }, []);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const data = await obtenirMonProfil();
        const id = data?.medecin?.medecin_id ?? null;
        if (annule) return;
        setMedecinId(id);
        if (id) await chargerGabarit(id);
      } catch (err) {
        if (!annule) setErreur(err.message || "Impossible de charger votre agenda.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [chargerGabarit]);

  // 2) Créneaux réels et rendez-vous de la semaine affichée.
  // Pas de setState synchrone : appelée depuis un effet (react-hooks/set-state-in-effect).
  const chargerSemaine = useCallback(() => {
    if (!medecinId) return Promise.resolve();
    return Promise.all([
      listerCreneauxAgenda(medecinId, { date_debut: jours[0].iso, date_fin: jours[6].iso }),
      listerRendezVousMedecinConnecte(),
    ])
      .then(([creneauxData, rdvData]) => {
        setCreneaux(creneauxData || []);
        setRendezVous((rdvData || []).filter((r) => r.statut !== "annule"));
      })
      .catch((err) => toast.erreur(err.message || "Impossible de charger les créneaux de la semaine."))
      .finally(() => setSemaineChargee(`${medecinId}|${jours[0].iso}`));
  }, [medecinId, jours, toast]);

  useEffect(() => {
    chargerSemaine();
  }, [chargerSemaine]);

  const rdvParInstant = useMemo(() => {
    const carte = new Map();
    rendezVous.forEach((r) => {
      const k = cleInstant(r.date_creneau);
      if (k !== null) carte.set(k, r);
    });
    return carte;
  }, [rendezVous]);

  const creneauxParJour = useMemo(() => {
    const carte = new Map();
    creneaux.forEach((c) => {
      const iso = String(c.date ?? "").slice(0, 10);
      if (!carte.has(iso)) carte.set(iso, []);
      carte.get(iso).push(c);
    });
    carte.forEach((liste) =>
      liste.sort((a, b) => formatHeure(a.horaire?.heure_debut).localeCompare(formatHeure(b.horaire?.heure_debut)))
    );
    return carte;
  }, [creneaux]);

  /* ---------------------------- Semaine type ---------------------------- */

  const selectionDuJour = (valeur) =>
    new Set(horaires.filter((h) => gabarit.has(cle(valeur, h.horaire_id))).map((h) => h.horaire_id));

  const changerJourType = (valeur, selection) => {
    setGabarit((g) => {
      const suivant = new Set([...g].filter((k) => !k.startsWith(`${valeur}|`)));
      selection.forEach((id) => suivant.add(cle(valeur, id)));
      return suivant;
    });
  };

  const copierJour = (source, cibles) => {
    const selection = selectionDuJour(source);
    cibles.forEach((c) => changerJourType(c, selection));
    setCopieOuverte(null);
    const libelle = JOURS_SEMAINE_AGENDA.find((j) => j.valeur === source)?.libelle ?? source;
    toast.info(`Horaires du ${libelle.toLowerCase()} copiés sur ${cibles.length} jour(s). Pensez à enregistrer.`);
  };

  const enregistrerSemaineType = async () => {
    if (!medecinId || enregistrement) return;
    setEnregistrement(true);
    try {
      const { disponibilites, rdv_maintenus: maintenus } = await remplacerDisponibilitesMedecin(
        medecinId,
        [...gabarit].map((k) => {
          const [jour_semaine, horaire_id] = k.split("|");
          return { jour_semaine, horaire_id };
        })
      );
      const cles = new Set(disponibilites.map((d) => cle(d.jour_semaine, d.horaire_id)));
      setGabaritServeur(cles);
      setGabarit(new Set(cles));
      toast.succes("Semaine type enregistrée : vos horaires sont publiés sur les semaines à venir.");
      if (maintenus.length > 0) {
        const apercu = maintenus.slice(0, 3).map((m) => libelleDateRdv(m.debut)).join(", ");
        toast.avertissement(
          `${maintenus.length} rendez-vous déjà réservé(s) sur des horaires retirés sont maintenus` +
            ` (${apercu}${maintenus.length > 3 ? "…" : ""}). Annulez-les depuis vos rendez-vous si besoin.`
        );
      }
      await chargerSemaine();
    } catch (err) {
      toast.erreur(err.message || "Impossible d'enregistrer votre semaine type.");
    } finally {
      setEnregistrement(false);
    }
  };

  /* --------------------------- Exceptions datées --------------------------- */

  const ouvrirEditionJour = (jour) => {
    const liste = creneauxParJour.get(jour.iso) ?? [];
    setJourEdite({
      iso: jour.iso,
      selection: new Set(liste.filter((c) => c.statut !== "bloque").map((c) => c.horaire_id)),
      verrouilles: new Set(liste.filter((c) => c.statut === "reserve").map((c) => c.horaire_id)),
    });
  };

  const enregistrerJour = async (jour) => {
    if (!medecinId || !jourEdite || enregistrement) return;
    setEnregistrement(true);
    try {
      const r = await definirJourAgenda(medecinId, jour.iso, [...jourEdite.selection]);
      toast.succes(`${jour.libelle} ${jour.num} ${jour.mois} : horaires mis à jour pour cette date.`);
      if (r?.maintenus > 0) {
        toast.avertissement(`${r.maintenus} rendez-vous déjà réservé(s) ce jour-là sont maintenus.`);
      }
      setJourEdite(null);
      await chargerSemaine();
    } catch (err) {
      toast.erreur(err.message || "Impossible d'enregistrer cette journée.");
    } finally {
      setEnregistrement(false);
    }
  };

  const retablirJour = async (jour) => {
    if (!medecinId || enregistrement) return;
    const ok = await confirmer({
      titre: "Revenir à la semaine type",
      message: `${jour.libelle} ${jour.num} ${jour.mois} reprendra les horaires de votre semaine type.\nLes rendez-vous déjà réservés sont conservés.`,
      labelConfirmer: "Rétablir",
      variante: "avertissement",
    });
    if (!ok) return;
    setEnregistrement(true);
    try {
      await retablirJourAgenda(medecinId, jour.iso);
      toast.succes(`${jour.libelle} ${jour.num} ${jour.mois} suit de nouveau votre semaine type.`);
      setJourEdite(null);
      await chargerSemaine();
    } catch (err) {
      toast.erreur(err.message || "Impossible de rétablir cette journée.");
    } finally {
      setEnregistrement(false);
    }
  };

  /* -------------------------------- Rendu -------------------------------- */

  const resumeDate = (jour) => {
    const liste = creneauxParJour.get(jour.iso) ?? [];
    const ouverts = new Set(liste.filter((c) => c.statut !== "bloque").map((c) => c.horaire_id));
    const parPeriode = groupes.map((g) => {
      const ids = new Set(g.horaires.map((h) => h.horaire_id));
      const duGroupe = liste.filter((c) => ids.has(c.horaire_id));
      return {
        ...g,
        libres: duGroupe.filter((c) => c.statut === "disponible").length,
        rdv: duGroupe.filter((c) => c.statut === "reserve").length,
      };
    });
    const rdvs = liste
      .filter((c) => c.statut === "reserve")
      .map((c) => {
        const k = cleInstant(c.debut);
        const rdv = k !== null ? rdvParInstant.get(k) : undefined;
        const nonPaye = rdv ? estRdvNonPaye(rdv) : false;
        return {
          id: c.creneau_id,
          heure: formatHeure(c.horaire?.heure_debut),
          patient: nonPaye ? "En attente de paiement" : rdv ? nomPatient(rdv) : "Patient",
          type: nonPaye ? "" : libelleRendezVous(rdv),
          tele: !nonPaye && rdv?.type_rdv === "teleconsultation",
          nonPaye,
          periode: periodeDeHeure(c.horaire?.heure_debut),
        };
      });
    return {
      parPeriode,
      rdvs,
      ouverts,
      personnalise: liste.some((c) => c.origine === "manuel"),
      libres: liste.filter((c) => c.statut === "disponible").length,
    };
  };

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main agd">
          <header className="portail-head">
            <div>
              <span className="eyebrow">Espace médecin</span>
              <h1>Agenda</h1>
              <p>Cochez vos périodes de consultation : chaque créneau est ouvert automatiquement aux patients.</p>
            </div>
          </header>

          {erreur && (
            <div className="alert alert-danger" role="alert">
              {erreur}
            </div>
          )}

          {chargement ? (
            <div className="agd-carte agd-chargement">Chargement de votre agenda…</div>
          ) : (
            <>
              {/* ===================== 1. SEMAINE TYPE ===================== */}
              <section className="agd-carte">
                <div className="agd-carte-tete">
                  <div>
                    <h2>
                      <i className="fa-solid fa-repeat" aria-hidden="true"></i> Ma semaine type
                    </h2>
                    <p>
                      Ces horaires se répètent chaque semaine. Cochez une période pour ouvrir toutes ses heures,
                      puis affinez si besoin.
                    </p>
                  </div>
                </div>

                <div className="agd-semaine">
                  {JOURS_SEMAINE_AGENDA.map((j) => {
                    const selection = selectionDuJour(j.valeur);
                    return (
                      <div key={j.valeur} className={`agd-jour ${selection.size === 0 ? "is-ferme" : ""}`}>
                        <div className="agd-jour-nom">
                          <strong>{j.libelle}</strong>
                          <small>{resumeJournee(groupes, selection)}</small>
                        </div>
                        <SelecteurPeriodes
                          groupes={groupes}
                          selection={selection}
                          onChange={(s) => changerJourType(j.valeur, s)}
                          disabled={enregistrement}
                        />
                        <div className="agd-jour-actions">
                          <button
                            type="button"
                            className="agd-lien"
                            disabled={enregistrement || selection.size === 0}
                            onClick={() => setCopieOuverte((v) => (v === j.valeur ? null : j.valeur))}
                            aria-expanded={copieOuverte === j.valeur}
                          >
                            <i className="fa-regular fa-copy" aria-hidden="true"></i> Copier vers…
                          </button>
                          {copieOuverte === j.valeur && (
                            <CopieVers
                              source={j.valeur}
                              onAppliquer={(cibles) => copierJour(j.valeur, cibles)}
                              onFermer={() => setCopieOuverte(null)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={`agd-barre-enregistrer ${modifie ? "is-visible" : ""}`}>
                  <span>
                    <i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Modifications non
                    enregistrées
                  </span>
                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm-aps"
                      disabled={!modifie || enregistrement}
                      onClick={() => setGabarit(new Set(gabaritServeur))}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm-aps"
                      disabled={!modifie || enregistrement}
                      onClick={enregistrerSemaineType}
                    >
                      <i className="fa-solid fa-check" aria-hidden="true"></i>{" "}
                      {enregistrement ? "Enregistrement…" : "Enregistrer ma semaine"}
                    </button>
                  </div>
                </div>
              </section>

              {/* ===================== 2. PROCHAINS JOURS ===================== */}
              <section className="agd-carte">
                <div className="agd-carte-tete">
                  <div>
                    <h2>
                      <i className="fa-regular fa-calendar" aria-hidden="true"></i> Mes prochains jours
                    </h2>
                    <p>Un imprévu ou un congé ? Modifiez une date précise sans toucher à votre semaine type.</p>
                  </div>
                  <div className="agd-nav-semaine">
                    <button
                      type="button"
                      className="agd-nav-btn"
                      aria-label="Semaine précédente"
                      disabled={semaineOffset <= 0}
                      onClick={() => changerSemaine(semaineOffset - 1)}
                    >
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <strong>{libelleSemaine}</strong>
                    <button
                      type="button"
                      className="agd-nav-btn"
                      aria-label="Semaine suivante"
                      disabled={semaineOffset >= SEMAINES_MAX}
                      onClick={() => changerSemaine(semaineOffset + 1)}
                    >
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                    {semaineOffset !== 0 && (
                      <button type="button" className="agd-lien" onClick={() => changerSemaine(0)}>
                        Cette semaine
                      </button>
                    )}
                  </div>
                </div>

                <div className={`agd-dates ${chargementSemaine ? "is-chargement" : ""}`}>
                  {jours.map((jour) => {
                    const r = resumeDate(jour);
                    const enEdition = jourEdite?.iso === jour.iso;
                    return (
                      <article
                        key={jour.iso}
                        className={`agd-date ${jour.today ? "is-today" : ""} ${jour.passe ? "is-passe" : ""} ${
                          enEdition ? "is-edition" : ""
                        }`}
                      >
                        <div className="agd-date-ligne">
                          <div className="agd-date-badge">
                            <span>{jour.dow}</span>
                            <strong>{jour.num}</strong>
                          </div>

                          <div className="agd-date-corps">
                            <div className="agd-date-titre">
                              <span>
                                {jour.libelle} {jour.num} {jour.mois}
                              </span>
                              {jour.today && <span className="agd-tag agd-tag-today">Aujourd'hui</span>}
                              {r.personnalise && <span className="agd-tag agd-tag-perso">Personnalisé</span>}
                            </div>

                            {r.ouverts.size === 0 ? (
                              <span className="agd-date-ferme">Fermé</span>
                            ) : (
                              <div className="agd-date-periodes">
                                {r.parPeriode
                                  .filter((p) => p.libres + p.rdv > 0)
                                  .map((p) => (
                                    <span key={p.cle} className="agd-pastille">
                                      <i className={`fa-solid ${p.icone}`} aria-hidden="true"></i> {p.libelle}
                                      <em>
                                        {p.libres} libre{p.libres > 1 ? "s" : ""}
                                        {p.rdv > 0 && ` · ${p.rdv} RDV`}
                                      </em>
                                    </span>
                                  ))}
                              </div>
                            )}

                            {r.rdvs.length > 0 && (
                              <ul className="agd-rdvs">
                                {r.rdvs.map((rdv) => (
                                  <li key={rdv.id} className={rdv.nonPaye ? "is-non-paye" : ""}>
                                    <span className="agd-rdv-heure">{rdv.heure}</span>
                                    <span className="agd-rdv-patient">
                                      {rdv.nonPaye && <i className="fa-solid fa-hourglass-half" aria-hidden="true"></i>}
                                      {rdv.tele && <i className="fa-solid fa-video" aria-hidden="true"></i>}
                                      {rdv.patient}
                                    </span>
                                    {rdv.type && <span className="agd-rdv-type">{rdv.type}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {!jour.passe && !enEdition && (
                            <div className="agd-date-actions">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm-aps"
                                disabled={enregistrement || chargementSemaine}
                                onClick={() => ouvrirEditionJour(jour)}
                              >
                                <i className="fa-solid fa-pen" aria-hidden="true"></i> Modifier ce jour
                              </button>
                            </div>
                          )}
                        </div>

                        {enEdition && (
                          <div className="agd-date-edition">
                            <SelecteurPeriodes
                              groupes={groupes}
                              selection={jourEdite.selection}
                              verrouilles={jourEdite.verrouilles}
                              onChange={(s) => setJourEdite((e) => ({ ...e, selection: s }))}
                              disabled={enregistrement}
                            />
                            <div className="agd-date-edition-actions">
                              {r.personnalise && (
                                <button
                                  type="button"
                                  className="agd-lien"
                                  disabled={enregistrement}
                                  onClick={() => retablirJour(jour)}
                                >
                                  <i className="fa-solid fa-rotate-left" aria-hidden="true"></i> Revenir à la
                                  semaine type
                                </button>
                              )}
                              <span className="agd-espace"></span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm-aps"
                                disabled={enregistrement}
                                onClick={() => setJourEdite(null)}
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm-aps"
                                disabled={enregistrement}
                                onClick={() => enregistrerJour(jour)}
                              >
                                <i className="fa-solid fa-check" aria-hidden="true"></i> Enregistrer ce jour
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="agd-bon-a-savoir">
                <h3>
                  <i className="fa-solid fa-circle-info" aria-hidden="true"></i> Bon à savoir
                </h3>
                <ul>
                  <li>Seuls les créneaux libres sont visibles des patients ; un créneau demandé disparaît aussitôt.</li>
                  <li>Sans paiement dans le délai fixé par ApSa, la demande est annulée et le créneau redevient libre.</li>
                  <li>Un créneau déjà réservé n'est jamais fermé : annulez d'abord le rendez-vous si nécessaire.</li>
                </ul>
              </section>
            </>
          )}
        </main>

        <PortailSidebar />
      </div>
    </div>
  );
};

export default MedecinAgenda;
