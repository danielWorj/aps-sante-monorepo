// src/components/visio/CompteAReboursVisio.jsx
//
// Durée maximale d'une téléconsultation (réglée par pays au back-office).
// Le serveur fixe la fin prévue dès que médecin et patient sont tous deux
// présents (GET /visio/:id/duree). Ici :
//   - relecture régulière de la durée (le compte à rebours démarre quand la
//     seconde partie arrive) ;
//   - horloge corrigée avec l'heure du serveur (`maintenant`) ;
//   - bandeau « temps restant », alerte X minutes avant la fin ;
//   - `onEcoulee` appelé une seule fois à l'échéance (l'appel est coupé).
import { useEffect, useRef, useState } from "react";
import { obtenirDureeVisio } from "../../services/visioService";

const INTERVALLE_RELECTURE_MS = 15_000;

function formater(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CompteAReboursVisio({ rdvId, onEcoulee }) {
  // { fin, alerteMs, minutes, decalage (heure serveur - heure locale) }
  const [duree, setDuree] = useState(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const ecouleeRef = useRef(false);
  const onEcouleeRef = useRef(onEcoulee);

  useEffect(() => {
    onEcouleeRef.current = onEcoulee;
  }, [onEcoulee]);

  // Relecture de la durée : la fin prévue apparaît quand les deux parties sont là.
  useEffect(() => {
    let actif = true;
    const lire = async () => {
      try {
        const { duree: d } = await obtenirDureeVisio(rdvId);
        if (!actif || !d) return;
        setDuree({
          decalage: new Date(d.maintenant).getTime() - Date.now(),
          fin: d.fin_prevue_le ? new Date(d.fin_prevue_le).getTime() : null,
          alerteMs: (d.alerte_avant_fin_minutes ?? 5) * 60_000,
          minutes: d.duree_minutes,
        });
      } catch {
        // Silencieux : nouvel essai au prochain tour.
      }
    };
    lire();
    const t = setInterval(lire, INTERVALLE_RELECTURE_MS);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [rdvId]);

  // Tic chaque seconde une fois le compte à rebours démarré.
  useEffect(() => {
    if (!duree?.fin) return undefined;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [duree?.fin]);

  const restant = duree?.fin ? duree.fin - (maintenant + duree.decalage) : null;

  useEffect(() => {
    if (restant == null || restant > 0 || ecouleeRef.current) return;
    ecouleeRef.current = true;
    onEcouleeRef.current?.();
  }, [restant]);

  if (!duree) return null;
  if (restant == null) {
    return (
      <div className="tc-duree" role="status">
        <i className="fa-regular fa-clock" /> Durée prévue : {duree.minutes} min (démarre quand vous êtes tous les deux connectés)
      </div>
    );
  }
  const alerte = restant <= duree.alerteMs;
  return (
    <div className={`tc-duree ${alerte ? "is-alerte" : ""}`} role={alerte ? "alert" : "status"}>
      <i className={`fa-solid ${alerte ? "fa-triangle-exclamation" : "fa-clock"}`} />{" "}
      {restant > 0
        ? alerte
          ? `Plus que ${formater(restant)} : l'appel sera coupé automatiquement à la fin du temps prévu.`
          : `Temps restant : ${formater(restant)}`
        : "Temps écoulé : fin de l'appel."}
    </div>
  );
}
