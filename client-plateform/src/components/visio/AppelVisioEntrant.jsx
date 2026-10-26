// components/visio/AppelVisioEntrant.jsx
//
// Appel entrant façon WhatsApp, côté PATIENT : quand son médecin lance la
// téléconsultation, une carte d'appel (photo, nom, « Appel vidéo entrant… »,
// boutons Refuser / Accepter) s'affiche sur n'importe quelle page du site,
// avec une sonnerie.
//
// Source : GET /visio/appel-entrant (visio lancée depuis moins de 10 min,
// ni clôturée ni terminée), relu toutes les 8 s quand l'onglet est visible.
// Indépendant de la cloche (60 s) pour sonner sans attendre.
//
// Accepter -> /portail/consultation/:id?rejoindre=1 (entrée directe dans la
// salle). Refuser, ou 45 s sans réponse -> refus enregistré côté serveur
// (POST /visio/:id/refus) : l'appel cesse de sonner sur TOUS les appareils du
// patient ; le bouton « Rejoindre la visio » reste disponible dans les RDV.
// Refusé / décroché ailleurs, ou visio terminée par le médecin : le serveur
// ne présente plus l'appel et la carte disparaît à la relecture suivante.
// Un nouveau lancement par le médecin (nouvelle `lancee_le`) sonne de nouveau.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { obtenirAppelEntrant, refuserAppelVisio } from "../../services/visioService";
import "../../assets/styles/appel-entrant.css";

const INTERVALLE_MS = 8_000;
const DUREE_SONNERIE_MS = 45_000;
const CLE_STOCKAGE = "aps_appels_visio_traites";

/** Un lancement de visio donné : rdv + horodatage du lancement. */
const cleAppel = (appel) => `${appel.rdv_id}:${appel.lancee_le}`;

function lireTraites() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || "[]");
    return Array.isArray(brut) ? brut : [];
  } catch {
    return [];
  }
}

function memoriserTraite(cle) {
  try {
    const liste = [cle, ...lireTraites().filter((c) => c !== cle)].slice(0, 20);
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(liste));
  } catch {
    // Stockage indisponible : l'appel ne resonnera pas pendant cette visite (mémoire).
  }
}

function initiales(prenom, nom) {
  return `${(prenom || "").trim().charAt(0)}${(nom || "").trim().charAt(0)}`.toUpperCase() || "Dr";
}

/**
 * Sonnerie « double bip » répétée, générée par Web Audio (aucun fichier).
 * Le navigateur peut la bloquer tant que l'utilisateur n'a pas interagi avec
 * la page : la carte s'affiche quand même.
 */
function demarrerSonnerie() {
  const Contexte = window.AudioContext || window.webkitAudioContext;
  if (!Contexte) return () => {};
  let ctx;
  try {
    ctx = new Contexte();
  } catch {
    return () => {};
  }
  const bip = (debut) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(0.18, debut + 0.03);
    gain.gain.setValueAtTime(0.18, debut + 0.35);
    gain.gain.linearRampToValueAtTime(0, debut + 0.4);
    osc.start(debut);
    osc.stop(debut + 0.42);
  };
  const sonner = () => {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.05;
    bip(t);
    bip(t + 0.55);
  };
  sonner();
  const minuteur = setInterval(sonner, 2_500);
  return () => {
    clearInterval(minuteur);
    ctx.close().catch(() => {});
  };
}

export default function AppelVisioEntrant() {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const estPatient = status === "authenticated" && user?.role === "patient";
  // Déjà dans la salle de consultation : on ne sonne pas.
  const enConsultation = pathname.startsWith("/portail/consultation/");

  const [appel, setAppel] = useState(null);
  const traites = useRef(new Set(lireTraites()));

  const verifier = useCallback(async () => {
    try {
      const { appel: a } = await obtenirAppelEntrant();
      setAppel(a && !traites.current.has(cleAppel(a)) ? a : null);
    } catch {
      // Silencieux : un appel manqué reste joignable depuis les rendez-vous.
    }
  }, []);

  useEffect(() => {
    if (!estPatient || enConsultation) return undefined;
    const premier = setTimeout(verifier, 0);
    const t = setInterval(() => {
      if (!document.hidden) verifier();
    }, INTERVALLE_MS);
    const auRetour = () => {
      if (!document.hidden) verifier();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      clearTimeout(premier);
      clearInterval(t);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [estPatient, enConsultation, verifier]);

  const terminer = useCallback((a) => {
    const cle = cleAppel(a);
    traites.current.add(cle);
    memoriserTraite(cle);
    setAppel(null);
  }, []);

  /** Refus ou appel manqué : partagé avec les autres appareils du patient. */
  const refuser = useCallback(
    (a) => {
      terminer(a);
      refuserAppelVisio(a.rdv_id).catch(() => {
        // Hors ligne : l'appel ne resonnera pas ici, il expire côté serveur.
      });
    },
    [terminer]
  );

  // Hors compte patient ou déjà en consultation : rien ne sonne.
  const actif = estPatient && !enConsultation;
  const cle = actif && appel ? cleAppel(appel) : null;

  // Sonnerie, titre de l'onglet et fin automatique de l'appel.
  useEffect(() => {
    if (!cle) return undefined;
    const arreterSonnerie = demarrerSonnerie();
    const titreInitial = document.title;
    let bascule = false;
    const clignote = setInterval(() => {
      bascule = !bascule;
      document.title = bascule ? "📹 Appel vidéo entrant" : titreInitial;
    }, 1_000);
    const manque = setTimeout(() => refuser(appel), DUREE_SONNERIE_MS);
    return () => {
      arreterSonnerie();
      clearInterval(clignote);
      clearTimeout(manque);
      document.title = titreInitial;
    };
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cle) return null;

  const { medecin } = appel;
  const nom = `Dr ${[medecin.prenom, medecin.nom].filter(Boolean).join(" ")}`.trim();

  const accepter = () => {
    terminer(appel);
    navigate(`/portail/consultation/${appel.rdv_id}?rejoindre=1`);
  };

  return (
    <div className="ae-appel" role="alertdialog" aria-live="assertive" aria-label={`Appel vidéo entrant de ${nom}`}>
      <div className="ae-entete">
        <i className="fa-solid fa-lock" aria-hidden="true" /> APS Santé · Téléconsultation
      </div>
      <div className="ae-corps">
        <div className="ae-avatar">
          <span className="ae-onde" aria-hidden="true" />
          {medecin.photo_url ? (
            <img src={medecin.photo_url} alt="" />
          ) : (
            <span className="ae-initiales">{initiales(medecin.prenom, medecin.nom)}</span>
          )}
        </div>
        <div className="ae-texte">
          <strong className="ae-nom">{nom}</strong>
          <span className="ae-statut">
            <i className="fa-solid fa-video" aria-hidden="true" /> Appel vidéo entrant…
          </span>
          {medecin.specialite && <span className="ae-specialite">{medecin.specialite}</span>}
        </div>
      </div>
      <div className="ae-actions">
        <div className="ae-action">
          <button type="button" className="ae-bouton is-refuser" onClick={() => refuser(appel)} aria-label="Refuser l'appel">
            <i className="fa-solid fa-phone-slash" />
          </button>
          <span>Refuser</span>
        </div>
        <div className="ae-action">
          <button type="button" className="ae-bouton is-accepter" onClick={accepter} aria-label="Accepter l'appel">
            <i className="fa-solid fa-video" />
          </button>
          <span>Accepter</span>
        </div>
      </div>
    </div>
  );
}
