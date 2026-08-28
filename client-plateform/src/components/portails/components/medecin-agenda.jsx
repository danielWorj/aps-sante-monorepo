// medecin-agenda.jsx
//
// Consomme désormais les vraies APIs Agenda de medecinService.js (voir
// medecin.routes.js / agenda.controller.js côté backend) au lieu des
// données de démo codées en dur.
//
// Confirmé via agenda.controller.js / rendezVous.controller.js :
//   - GET /medecins/:id/agenda (SELECTION_CRENEAU_PUBLIC) renvoie
//     { creneau_id, medecin_id, horaire_id, date, statut, origine,
//     horaire: {horaire_id, heure_debut, heure_fin} } — et NE renvoie
//     JAMAIS rdv_id, même pour le médecin propriétaire (route publique
//     unique, commentaire explicite du contrôleur). Impossible donc de
//     joindre un créneau "réservé" à son rendez-vous via rdv_id.
//     La jointure ci-dessous se fait à la place sur (date, heure de
//     début), en comparant creneau.date/horaire.heure_debut au
//     date_creneau du rendez-vous — voir rdvParCase plus bas.
//   - GET /rendez-vous inclut bien medecin.utilisateur.{nom,prenom} et
//     patient.utilisateur.{nom,prenom} (INCLUSION_NOMS_RDV) : voir
//     nomPatient() ci-dessous.
//   - Horaire.heure_debut/heure_fin et CreneauAgenda.date sont stockés
//     "épinglés" en UTC (ex. new Date(`1970-01-01T${heure}:00Z`) côté
//     création) : ce sont des chaînes horaires/dates littérales, pas de
//     vrais instants dépendant du fuseau. On extrait donc l'heure/la
//     date par découpage de chaîne (formatHeure/dateSeuleISO) plutôt
//     que via des getters locaux de Date (getHours/getDate), qui
//     décaleraient le résultat selon le fuseau du navigateur.
//
// Le bloc "Horaires hebdomadaires" (auparavant des plages libres
// matin/après-midi) a été remplacé par une sélection de créneaux du
// référentiel Horaire par jour de semaine : c'est le contrat réel de
// DisponibiliteMedecin (jour_semaine + horaire_id, pas de plage libre
// "08:00-12:00" côté serveur).
//
// ⚠️ CORRECTIF : la grille exposait un seul mode ("Bloquer des
// créneaux") qui, sur une case vide ("Non proposé"), créait TOUJOURS
// un CreneauAgenda avec statut="bloque" (voir toggleCreneau plus bas).
// Il n'existait donc aucun moyen, depuis la grille, d'ouvrir un
// créneau ponctuel réellement DISPONIBLE aux patients — alors que
// creerCreneauAgenda (service + contrôleur) l'accepte très bien
// (statut par défaut = "disponible"). La seule voie fonctionnelle
// passait par le gabarit récurrent + "Générer les créneaux de la
// semaine", ce qui est incohérent avec l'info-bulle affichée en mode
// blocage ("cliquez sur une case non proposée pour la bloquer
// directement" ne disait pas qu'on ne pouvait PAS l'ouvrir).
//
// Trois modes mutuellement exclusifs sont donc distingués :
//   - modeBlocage    : agit sur des créneaux existants (libre <->
//     bloqué) et permet de fermer explicitement une case vide
//     (statut="bloque") pour qu'elle ne soit jamais proposée, même
//     après génération. RÉVERSIBLE : le créneau reste en base.
//   - modeAjout      : sur une case vide uniquement, crée un créneau
//     PONCTUEL hors gabarit avec statut="disponible" (origine
//     "manuel"), immédiatement visible/réservable par les patients.
//   - modeSuppression : RETIRE DÉFINITIVEMENT un créneau existant
//     (libre ou bloqué) via DELETE /creneaux-agenda/:id
//     (supprimerCreneauAgenda). C'est le "D" du CRUD, absent jusqu'ici
//     de cette page : sans lui, un créneau ponctuel ajouté par erreur
//     (modeAjout) ou une fermeture manuelle obsolète (modeBlocage sur
//     une case "Non proposé") ne pouvaient JAMAIS redevenir une case
//     vraiment vide ("Non proposé") — au mieux on pouvait les rebasculer
//     en "disponible"/"bloqué", jamais les effacer. Comme côté serveur
//     (supprimerCreneauAgenda), un créneau "réservé" (rdv_id renseigné)
//     n'est jamais supprimable depuis ce mode : il faut d'abord annuler
//     le rendez-vous via le module Rendez-vous — 409 sinon.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PortailNavbar from "./../layouts/portail-navbar";
import PortailFooter from "./../layouts/portail-footer";
import PortailSidebar from "./../layouts/portail-sidebar";
import {
  obtenirMonProfil,
  listerHoraires,
  listerDisponibilitesMedecin,
  creerDisponibiliteMedecin,
  supprimerDisponibiliteMedecin,
  listerCreneauxAgenda,
  genererCreneauxAgenda,
  creerCreneauAgenda,
  modifierCreneauAgenda,
  supprimerCreneauAgenda,
  listerRendezVousMedecinConnecte,
  JOURS_SEMAINE_AGENDA,
} from "../../../services/medecinService"; // ⚠️ ajuster le chemin selon l'arborescence réelle du projet

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

// "HH:mm:ss" | horodatage ISO complet | déjà "HH:mm" -> "HH:mm"
function formatHeure(valeur) {
  if (!valeur) return "--:--";
  const correspondance = String(valeur).match(/(\d{2}):(\d{2})/);
  return correspondance ? `${correspondance[1]}:${correspondance[2]}` : String(valeur);
}

// Pour les dates LOCALES construites en JS (semaine affichée) : ok
// d'utiliser les getters locaux, aucune chaîne serveur n'est en jeu.
function versDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Pour les dates VENANT DU SERVEUR (creneau.date, rdv.date_creneau) :
// on découpe directement la chaîne ISO ("AAAA-MM-JJ...") sans passer
// par un objet Date local, pour rester cohérent avec la façon dont le
// backend épingle ses dates en UTC (voir en-tête de fichier).
function dateSeuleISO(valeurISO) {
  if (!valeurISO) return null;
  return String(valeurISO).slice(0, 10);
}

// Lundi de la semaine courante + décalage en semaines.
function lundiSemaine(decalageSemaines) {
  const auj = new Date();
  const jourAuj = auj.getDay(); // 0 = dimanche ... 6 = samedi
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
  if (rdv.statut === "en_attente_presence") return "En attente · présence";
  if (rdv.statut === "conteste") return "Contesté";
  if (rdv.statut === "non_honore") return "Non honoré";
  if (rdv.type_rdv === "teleconsultation") return "Téléconsultation";
  return rdv.motif ? rdv.motif : "Consultation";
}

const MedecinAgenda = () => {
  // Deux modes d'édition de la grille, mutuellement exclusifs (voir
  // note en tête de fichier) : modeBlocage agit sur des créneaux
  // existants (libre <-> bloqué) et peut fermer une case vide ;
  // modeAjout crée un nouveau créneau DISPONIBLE sur une case vide.
  const [modeBlocage, setModeBlocage] = useState(false);
  const [modeAjout, setModeAjout] = useState(false);
  const [modeSuppression, setModeSuppression] = useState(false);
  const [jourMobile, setJourMobile] = useState(3); // 1 = Lundi ... 6 = Samedi
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [medecinId, setMedecinId] = useState(null);
  const [semaineOffset, setSemaineOffset] = useState(0);

  const [horairesReferentiel, setHorairesReferentiel] = useState([]);
  const [disponibilites, setDisponibilites] = useState([]);
  const [creneaux, setCreneaux] = useState([]);
  const [rendezVous, setRendezVous] = useState([]);

  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    document.body.classList.toggle("block-mode", modeBlocage);
    document.body.classList.toggle("add-mode", modeAjout);
    document.body.classList.toggle("delete-mode", modeSuppression);
    return () => document.body.classList.remove("block-mode", "add-mode", "delete-mode");
  }, [modeBlocage, modeAjout, modeSuppression]);

  // Activent un mode en désactivant systématiquement les deux autres :
  // on ne veut jamais que "cliquer sur une case" soit ambigu entre "la
  // bloquer", "l'ouvrir" ou "la supprimer".
  const activerModeBlocage = () => {
    setModeBlocage((v) => {
      const suivant = !v;
      if (suivant) {
        setModeAjout(false);
        setModeSuppression(false);
      }
      return suivant;
    });
  };

  const activerModeAjout = () => {
    setModeAjout((v) => {
      const suivant = !v;
      if (suivant) {
        setModeBlocage(false);
        setModeSuppression(false);
      }
      return suivant;
    });
  };

  const activerModeSuppression = () => {
    setModeSuppression((v) => {
      const suivant = !v;
      if (suivant) {
        setModeBlocage(false);
        setModeAjout(false);
      }
      return suivant;
    });
  };

  // Jours (Lun -> Sam) de la semaine affichée.
  const jours = useMemo(() => {
    const lundi = lundiSemaine(semaineOffset);
    const ajISO = versDateISO(new Date());
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      const iso = versDateISO(d);
      return { dow: DOW_LABELS[i], num: d.getDate(), iso, today: iso === ajISO };
    });
  }, [semaineOffset]);

  const semaine = useMemo(() => {
    const debut = jours[0];
    const fin = jours[jours.length - 1];
    const finDate = new Date(lundiSemaine(semaineOffset));
    finDate.setDate(finDate.getDate() + 5);
    return {
      debut: debut?.num,
      fin: fin?.num,
      mois: MOIS_LABELS[finDate.getMonth()],
      annee: finDate.getFullYear(),
    };
  }, [jours, semaineOffset]);

  // 1) Profil médecin connecté -> medecin_id.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const data = await obtenirMonProfil();
        if (!annule) setMedecinId(data?.medecin?.medecin_id ?? null);
      } catch (err) {
        if (!annule) setErreur(err.message || "Impossible de charger votre profil médecin.");
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // 2) Chargement de l'agenda de la semaine affichée + du gabarit de dispos.
  const chargerSemaine = useCallback(async () => {
    if (!medecinId) return;
    setChargement(true);
    setErreur(null);
    try {
      const dateDebut = jours[0].iso;
      const dateFin = jours[jours.length - 1].iso;
      const [creneauxData, rdvData, horairesData, disponibilitesData] = await Promise.all([
        listerCreneauxAgenda(medecinId, { date_debut: dateDebut, date_fin: dateFin }),
        listerRendezVousMedecinConnecte(),
        listerHoraires(),
        listerDisponibilitesMedecin(medecinId),
      ]);
      setCreneaux(creneauxData || []);
      // GET /rendez-vous ne filtre pas par date : on limite côté client
      // à la semaine affichée pour la jointure avec les créneaux "réservé".
      setRendezVous(
        (rdvData || []).filter((r) => {
          const dateISO = dateSeuleISO(r.date_creneau);
          return dateISO && dateISO >= dateDebut && dateISO <= dateFin;
        })
      );
      setHorairesReferentiel(horairesData || []);
      setDisponibilites(disponibilitesData || []);
    } catch (err) {
      setErreur(err.message || "Impossible de charger l'agenda.");
    } finally {
      setChargement(false);
    }
  }, [medecinId, jours]);

  useEffect(() => {
    chargerSemaine();
  }, [chargerSemaine]);

  // Lignes (heures) affichées : uniquement les horaires réellement en
  // jeu cette semaine (créneaux générés ou gabarit déclaré), triés.
  const lignes = useMemo(() => {
    const idsUtiles = new Set();
    creneaux.forEach((c) => idsUtiles.add(c.horaire_id));
    disponibilites.forEach((d) => idsUtiles.add(d.horaire_id));
    const source =
      idsUtiles.size > 0
        ? horairesReferentiel.filter((h) => idsUtiles.has(h.horaire_id))
        : horairesReferentiel;
    return [...source].sort((a, b) =>
      formatHeure(a.heure_debut).localeCompare(formatHeure(b.heure_debut))
    );
  }, [creneaux, disponibilites, horairesReferentiel]);

  const creneauParCase = useMemo(() => {
    const carte = new Map();
    creneaux.forEach((c) => {
      const dateISO = dateSeuleISO(c.date);
      if (!dateISO) return;
      carte.set(`${dateISO}__${c.horaire_id}`, c);
    });
    return carte;
  }, [creneaux]);

  // rdv_id n'est jamais exposé par GET /medecins/:id/agenda (route
  // publique — voir en-tête de fichier) : on relie donc un créneau
  // "réservé" à son rendez-vous par (date, heure de début), pas par id.
  const rdvParCase = useMemo(() => {
    const carte = new Map();
    rendezVous.forEach((r) => {
      const dateISO = dateSeuleISO(r.date_creneau);
      if (!dateISO) return;
      carte.set(`${dateISO}__${formatHeure(r.date_creneau)}`, r);
    });
    return carte;
  }, [rendezVous]);

  const obtenirCellule = useCallback(
    (jourISO, horaire) => {
      const creneau = creneauParCase.get(`${jourISO}__${horaire.horaire_id}`);
      if (!creneau) return { statut: "ferme" };
      if (creneau.statut === "disponible") return { statut: "libre", creneau };
      if (creneau.statut === "bloque") return { statut: "bloque", creneau };
      if (creneau.statut === "reserve") {
        const heureCreneau = formatHeure(creneau.horaire?.heure_debut ?? horaire.heure_debut);
        const rdv = rdvParCase.get(`${jourISO}__${heureCreneau}`);
        return {
          statut: rdv?.statut === "en_attente_presence" ? "attente" : "reserve",
          creneau,
          rdv,
          patient: rdv ? nomPatient(rdv) : "Patient",
          type: libelleRendezVous(rdv),
          tele: rdv?.type_rdv === "teleconsultation",
        };
      }
      return { statut: "ferme", creneau };
    },
    [creneauParCase, rdvParCase]
  );

  const toggleCreneau = async (ligne, jour) => {
    if ((!modeBlocage && !modeAjout && !modeSuppression) || !medecinId || enregistrement) return;
    const cellule = obtenirCellule(jour.iso, ligne);
    const label = `${jour.dow} ${jour.num} · ${formatHeure(ligne.heure_debut)}`;
    // Un créneau réservé (ou en attente de présence) n'est jamais
    // modifiable depuis l'agenda, dans aucun des trois modes — il faut
    // passer par le module Rendez-vous. Le serveur refuserait de toute
    // façon (409) une modification ou suppression tant qu'un rdv_id
    // est rattaché, mais on évite l'appel réseau inutile.
    if (cellule.statut === "reserve" || cellule.statut === "attente") return;

    setEnregistrement(true);
    try {
      if (modeSuppression) {
        // Mode suppression : retire DÉFINITIVEMENT un créneau existant
        // (libre ou bloqué) de la base — la case redevient une vraie
        // case vide ("Non proposé"), contrairement au blocage qui ne
        // fait que changer son statut. Rien à supprimer sur une case
        // déjà vide.
        if (cellule.statut !== "libre" && cellule.statut !== "bloque") return;
        const confirmation = window.confirm(
          `Supprimer définitivement ce créneau ? (${label})\nCette action est irréversible.`
        );
        if (!confirmation) return;
        await supprimerCreneauAgenda(cellule.creneau.creneau_id);
        showToast(`Créneau supprimé — ${label}`);
      } else if (modeAjout) {
        // Mode ajout : uniquement les cases vides ("Non proposé")
        // peuvent devenir un nouveau créneau. On le crée directement
        // DISPONIBLE (hors gabarit, origine "manuel") : c'est le seul
        // moyen, dans cette page, d'ouvrir une plage ponctuelle non
        // couverte par le gabarit récurrent (ex. ouverture
        // exceptionnelle un jour habituellement fermé).
        if (cellule.statut !== "ferme") return;
        await creerCreneauAgenda(medecinId, {
          horaire_id: ligne.horaire_id,
          date: jour.iso,
          statut: "disponible",
        });
        showToast(`Créneau ajouté et ouvert aux patients — ${label}`);
      } else {
        // Mode blocage : agit sur des créneaux existants (libre <->
        // bloqué), ou ferme explicitement une case vide pour qu'elle
        // ne soit jamais proposée (même après une future génération
        // du gabarit).
        if (cellule.statut === "libre") {
          await modifierCreneauAgenda(cellule.creneau.creneau_id, { statut: "bloque" });
          showToast(`Créneau bloqué — ${label}`);
        } else if (cellule.statut === "bloque") {
          await modifierCreneauAgenda(cellule.creneau.creneau_id, { statut: "disponible" });
          showToast("Créneau libéré.");
        } else if (cellule.statut === "ferme") {
          await creerCreneauAgenda(medecinId, {
            horaire_id: ligne.horaire_id,
            date: jour.iso,
            statut: "bloque",
          });
          showToast(`Créneau fermé — ${label}`);
        }
      }
      await chargerSemaine();
    } catch (err) {
      showToast(err.message || "Action impossible sur ce créneau.");
    } finally {
      setEnregistrement(false);
    }
  };

  const genererSemaine = async () => {
    if (!medecinId || enregistrement) return;
    setEnregistrement(true);
    try {
      const resultat = await genererCreneauxAgenda(medecinId, {
        date_debut: jours[0].iso,
        date_fin: jours[jours.length - 1].iso,
      });
      showToast(
        resultat?.message ||
          `${resultat?.nombre_crees ?? 0} créneau(x) généré(s) pour cette semaine.`
      );
      await chargerSemaine();
    } catch (err) {
      showToast(err.message || "Impossible de générer les créneaux de la semaine.");
    } finally {
      setEnregistrement(false);
    }
  };

  const toggleDisponibilite = async (jourValeur, horaire) => {
    if (!medecinId || enregistrement) return;
    const existante = disponibilites.find(
      (d) => d.jour_semaine === jourValeur && d.horaire_id === horaire.horaire_id
    );
    setEnregistrement(true);
    try {
      if (existante) {
        await supprimerDisponibiliteMedecin(existante.disponibilite_id);
        showToast(`Disponibilité retirée du gabarit — ${formatHeure(horaire.heure_debut)}.`);
      } else {
        await creerDisponibiliteMedecin(medecinId, {
          horaire_id: horaire.horaire_id,
          jour_semaine: jourValeur,
        });
        showToast(`Disponibilité ajoutée au gabarit — ${formatHeure(horaire.heure_debut)}.`);
      }
      const fraiches = await listerDisponibilitesMedecin(medecinId);
      setDisponibilites(fraiches || []);
    } catch (err) {
      showToast(err.message || "Action impossible sur cette disponibilité.");
    } finally {
      setEnregistrement(false);
    }
  };

  const regles = [
    { icone: "fa-hourglass-half", titre: "Créneaux du référentiel", description: "Chaque case correspond à un horaire partagé (voir Horaire) — pas de plage libre." },
    { icone: "fa-repeat", titre: "Gabarit récurrent", description: "Les cases cochées ci-dessous définissent les créneaux régénérés chaque semaine via « Générer les créneaux »." },
    { icone: "fa-eye", titre: "Synchronisation publique", description: "Les créneaux disponibles apparaissent en temps réel sur votre fiche APS." },
    { icone: "fa-ban", titre: "Blocage manuel", description: "Un créneau bloqué reste invisible des patients tant qu'il n'est pas libéré (réversible, le créneau reste enregistré)." },
    { icone: "fa-trash", titre: "Suppression définitive", description: "Retire un créneau libre ou bloqué de l'agenda ; irréversible, et impossible sur un créneau déjà réservé." },
  ];

  return (
    <>
      <div className="container-aps">
        <div className="portail-shell">
          {/* ===================== CONTENU ===================== */}
          <main className="portail-main">
            <header className="portail-head">
              <div>
                <span className="eyebrow">Espace médecin</span>
                <h1>Agenda</h1>
                <p>Visualisez vos créneaux, bloquez des plages et gérez votre gabarit de disponibilités.</p>
              </div>
            </header>

            {erreur && (
              <div className="alert alert-danger" role="alert">
                {erreur}
              </div>
            )}

            <div className="agenda-toolbar">
              <div className="week-nav">
                <button
                  className="btn btn-outline-primary btn-sm-aps btn-icon"
                  aria-label="Semaine précédente"
                  onClick={() => setSemaineOffset((v) => v - 1)}
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <strong>
                  Semaine du {semaine.debut} au {semaine.fin} {semaine.mois} {semaine.annee}
                </strong>
                <button
                  className="btn btn-outline-primary btn-sm-aps btn-icon"
                  aria-label="Semaine suivante"
                  onClick={() => setSemaineOffset((v) => v + 1)}
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
                <button className="btn btn-ghost btn-sm-aps" onClick={() => setSemaineOffset(0)}>
                  Aujourd'hui
                </button>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button
                  className={modeAjout ? "btn btn-primary btn-sm-aps" : "btn btn-outline-primary btn-sm-aps"}
                  onClick={activerModeAjout}
                >
                  <i className={`fa-solid ${modeAjout ? "fa-check" : "fa-plus"}`}></i>{" "}
                  {modeAjout ? "Terminer l'ajout" : "Ajouter des créneaux"}
                </button>
                <button
                  className={modeBlocage ? "btn btn-primary btn-sm-aps" : "btn btn-outline-primary btn-sm-aps"}
                  onClick={activerModeBlocage}
                >
                  <i className={`fa-solid ${modeBlocage ? "fa-check" : "fa-ban"}`}></i>{" "}
                  {modeBlocage ? "Terminer le blocage" : "Bloquer des créneaux"}
                </button>
                <button
                  className={modeSuppression ? "btn btn-danger btn-sm-aps" : "btn btn-outline-danger btn-sm-aps"}
                  onClick={activerModeSuppression}
                >
                  <i className={`fa-solid ${modeSuppression ? "fa-check" : "fa-trash"}`}></i>{" "}
                  {modeSuppression ? "Terminer la suppression" : "Supprimer des créneaux"}
                </button>
                <button className="btn btn-primary btn-sm-aps" onClick={genererSemaine} disabled={enregistrement}>
                  <i className="fa-solid fa-arrows-rotate"></i> Générer les créneaux de la semaine
                </button>
              </div>
            </div>

            {modeAjout && (
              <div className="block-hint">
                <i className="fa-solid fa-circle-info"></i> Mode ajout actif : cliquez sur une case « Non proposé »
                pour créer un créneau ponctuel immédiatement disponible aux patients. Les créneaux déjà existants ne
                sont pas modifiables dans ce mode.
              </div>
            )}

            {modeBlocage && (
              <div className="block-hint">
                <i className="fa-solid fa-circle-info"></i> Mode blocage actif : cliquez sur un créneau libre pour le
                bloquer, sur un créneau bloqué pour le libérer, ou sur une case non proposée pour la fermer
                explicitement (elle restera fermée même après une future génération du gabarit). Le créneau reste
                enregistré — utilisez le mode suppression pour l'effacer définitivement.
              </div>
            )}

            {modeSuppression && (
              <div className="block-hint block-hint-danger">
                <i className="fa-solid fa-triangle-exclamation"></i> Mode suppression actif : cliquez sur un créneau
                libre ou bloqué pour le retirer définitivement de l'agenda (confirmation demandée à chaque fois). La
                case redevient réellement « Non proposé », contrairement au blocage. Un créneau réservé n'est jamais
                supprimable ici — annulez d'abord le rendez-vous.
              </div>
            )}

            {/* Sélecteur de jour (mobile uniquement) */}
            <div className="day-switch" aria-label="Choisir un jour">
              {jours.map((jour, index) => (
                <button
                  key={jour.iso}
                  type="button"
                  className={`${jourMobile === index + 1 ? "active" : ""} ${jour.today ? "is-today" : ""}`}
                  onClick={() => setJourMobile(index + 1)}
                >
                  <span className="dow">{jour.dow}</span>
                  <span className="num">{jour.num}</span>
                </button>
              ))}
            </div>

            {/* Grille semaine */}
            <div className="agenda-card" data-day={jourMobile}>
              {chargement && <div className="agenda-loading">Chargement de l'agenda…</div>}
              {!chargement && lignes.length === 0 && (
                <p className="text-muted">
                  Aucun créneau ni disponibilité pour cette semaine. Déclarez votre gabarit ci-dessous puis générez
                  les créneaux.
                </p>
              )}
              {!chargement && lignes.length > 0 && (
                <div className="agenda-grid">
                  <div className="ag-corner"></div>
                  {jours.map((jour) => (
                    <div key={jour.iso} className={`ag-head ${jour.today ? "is-today" : ""}`}>
                      <span className="dow">{jour.dow}</span>
                      <span className="num">{jour.num}</span>
                      {jour.today && <span className="today-tag">Aujourd'hui</span>}
                    </div>
                  ))}

                  {lignes.map((ligne) => (
                    <React.Fragment key={ligne.horaire_id}>
                      <div className="ag-hour">{formatHeure(ligne.heure_debut)}</div>
                      {jours.map((jour) => {
                        const cellule = obtenirCellule(jour.iso, ligne);
                        const isToday = jour.today;
                        if (cellule.statut === "libre") {
                          // origine="manuel" : créneau ponctuel ouvert hors gabarit
                          // (ex. via le mode "Ajouter des créneaux" sur une case
                          // normalement fermée), à distinguer visuellement d'un
                          // créneau "genere" issu du gabarit récurrent — sinon les
                          // deux sont indiscernables à l'écran après coup.
                          const estPonctuel = cellule.creneau?.origine === "manuel";
                          return (
                            <div
                              key={jour.iso}
                              className={`ag-cell is-free ${isToday ? "is-today" : ""} ${
                                modeSuppression ? "is-removable" : ""
                              } ${estPonctuel ? "is-manual" : ""}`}
                              data-label={`${jour.dow} ${jour.num} · ${formatHeure(ligne.heure_debut)}`}
                              title={estPonctuel ? "Créneau ponctuel ajouté hors gabarit" : undefined}
                              onClick={() => (modeBlocage || modeSuppression) && toggleCreneau(ligne, jour)}
                            >
                              {/* style inline en repli : garantit une distinction visuelle
                                  même si .is-manual n'est pas (encore) défini côté CSS —
                                  voir le souci précédent avec .is-free vide */}
                              <span
                                className="slot slot-free"
                                style={estPonctuel ? { border: "1px dashed currentColor", padding: "1px 4px", borderRadius: "4px" } : undefined}
                              >
                                {estPonctuel && <i className="fa-solid fa-star" aria-hidden="true"></i>}
                                {estPonctuel ? "Libre (ponctuel)" : "Libre"}
                              </span>
                            </div>
                          );
                        }
                        if (cellule.statut === "ferme") {
                          return (
                            <div
                              key={jour.iso}
                              className={`ag-cell ${isToday ? "is-today" : ""} ${
                                modeAjout ? "is-addable" : ""
                              }`}
                              onClick={() => (modeBlocage || modeAjout) && toggleCreneau(ligne, jour)}
                            >
                              <span className="slot slot-blocked">
                                {modeAjout ? "Cliquer pour ouvrir" : "Non proposé"}
                              </span>
                            </div>
                          );
                        }
                        const slotClass =
                          cellule.statut === "reserve"
                            ? "slot-booked"
                            : cellule.statut === "attente"
                            ? "slot-pending"
                            : "slot-blocked";
                        const bloqueModifiable = cellule.statut === "bloque" && (modeBlocage || modeSuppression);
                        return (
                          <div
                            key={jour.iso}
                            className={`ag-cell ${isToday ? "is-today" : ""} ${
                              cellule.statut === "bloque" && modeSuppression ? "is-removable" : ""
                            }`}
                            onClick={() => bloqueModifiable && toggleCreneau(ligne, jour)}
                          >
                            <span className={`slot ${slotClass}`}>
                              {cellule.tele && <i className="fa-solid fa-video"></i>}
                              {cellule.patient || "Bloqué"}
                              {cellule.patient && cellule.type && <small>{cellule.type}</small>}
                            </span>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            <div className="agenda-legend">
              <span className="legend-key"><span className="legend-swatch sw-free"></span> Libre</span>
              <span className="legend-key"><span className="legend-swatch sw-booked"></span> Réservé</span>
              <span className="legend-key"><span className="legend-swatch sw-pending"></span> En attente de présence</span>
              <span className="legend-key"><span className="legend-swatch sw-blocked"></span> Bloqué / non proposé</span>
              <span className="legend-key"><span className="legend-swatch sw-today"></span> Aujourd'hui</span>
            </div>

            {/* Gabarit récurrent + règles */}
            <div className="row g-4 mt-1">
              <div className="col-lg-7">
                <div className="info-card mb-0">
                  <h3><i className="fa-solid fa-repeat"></i> Gabarit de disponibilités</h3>
                  <p className="form-side-desc">
                    Cochez les créneaux du référentiel où vous recevez habituellement, par jour de semaine. Chaque
                    case est enregistrée immédiatement ; utilisez « Générer les créneaux de la semaine » pour les
                    matérialiser sur l'agenda.
                  </p>
                  <div className="table-responsive">
                    <table className="hours-edit">
                      <thead>
                        <tr>
                          <th>Jour</th>
                          <th>Créneaux (référentiel Horaire)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {JOURS_SEMAINE_AGENDA.map((j) => (
                          <tr key={j.valeur}>
                            <td className="day-name">{j.libelle}</td>
                            <td>
                              <div className="d-flex flex-wrap gap-1">
                                {horairesReferentiel.map((h) => {
                                  const actif = disponibilites.some(
                                    (d) => d.jour_semaine === j.valeur && d.horaire_id === h.horaire_id
                                  );
                                  return (
                                    <button
                                      key={h.horaire_id}
                                      type="button"
                                      className={actif ? "btn btn-primary btn-sm-aps" : "btn btn-outline-primary btn-sm-aps"}
                                      disabled={enregistrement}
                                      onClick={() => toggleDisponibilite(j.valeur, h)}
                                    >
                                      {formatHeure(h.heure_debut)}
                                    </button>
                                  );
                                })}
                                {horairesReferentiel.length === 0 && (
                                  <span className="text-muted">Référentiel horaire indisponible.</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-5">
                <div className="info-card mb-0">
                  <h3><i className="fa-solid fa-sliders"></i> Règles de votre agenda</h3>
                  <ul className="form-side-list">
                    {regles.map((regle) => (
                      <li key={regle.titre}>
                        <i className={`fa-solid ${regle.icone}`}></i>
                        <span>
                          <strong>{regle.titre}</strong>
                          <span className="form-side-desc">{regle.description}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </main>

          {/* ===================== SIDEBAR (droite) ===================== */}
          <PortailSidebar />
        </div>
      </div>

      <div className={`toast-aps ${toast ? "show" : ""}`} role="status">
        <i className="fa-solid fa-circle-check"></i>
        <span>{toast}</span>
      </div>
    </>
  );
};

export default MedecinAgenda;