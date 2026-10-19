// selecteur-periodes.jsx
//
// Choix des horaires d'une journée par PÉRIODE (matin / après-midi / soirée) :
// cocher une période sélectionne toutes ses tranches ; « Affiner les heures »
// déplie le détail pour décocher ou cocher une tranche précise. Une période
// partiellement cochée affiche l'état intermédiaire (aria-checked="mixed").
//
// Utilisé pour la semaine type (un jour de la semaine) comme pour une date
// précise. `verrouilles` : tranches réservées par un rendez-vous, affichées
// cochées avec un cadenas et jamais retirables.

import { useState } from "react";
import { etatPeriode, formatHeure } from "../../../../utils/periodesAgenda";

const SelecteurPeriodes = ({ groupes, selection, onChange, verrouilles, disabled = false, detailOuvertParDefaut = false }) => {
  const [detailOuvert, setDetailOuvert] = useState(detailOuvertParDefaut);
  const bloques = verrouilles ?? new Set();

  const basculerPeriode = (groupe) => {
    const suivante = new Set(selection);
    if (etatPeriode(groupe, selection) === "complet") {
      groupe.horaires.forEach((h) => {
        if (!bloques.has(h.horaire_id)) suivante.delete(h.horaire_id);
      });
    } else {
      groupe.horaires.forEach((h) => suivante.add(h.horaire_id));
    }
    onChange(suivante);
  };

  const basculerHeure = (horaireId) => {
    if (bloques.has(horaireId)) return;
    const suivante = new Set(selection);
    if (suivante.has(horaireId)) suivante.delete(horaireId);
    else suivante.add(horaireId);
    onChange(suivante);
  };

  if (groupes.length === 0) {
    return <span className="text-muted">Référentiel horaire indisponible.</span>;
  }

  return (
    <div className="agd-selecteur">
      <div className="agd-periodes">
        {groupes.map((g) => {
          const etat = etatPeriode(g, selection);
          const nb = g.horaires.filter((h) => selection.has(h.horaire_id)).length;
          return (
            <button
              key={g.cle}
              type="button"
              role="checkbox"
              aria-checked={etat === "complet" ? "true" : etat === "partiel" ? "mixed" : "false"}
              className={`agd-periode is-${etat}`}
              disabled={disabled}
              onClick={() => basculerPeriode(g)}
            >
              <span className="agd-coche" aria-hidden="true">
                {etat === "complet" && <i className="fa-solid fa-check"></i>}
                {etat === "partiel" && <i className="fa-solid fa-minus"></i>}
              </span>
              <span className="agd-periode-texte">
                <strong>
                  <i className={`fa-solid ${g.icone}`} aria-hidden="true"></i> {g.libelle}
                </strong>
                <small>{etat === "partiel" ? `${nb}/${g.horaires.length} créneaux` : g.plage}</small>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="agd-affiner"
          aria-expanded={detailOuvert}
          onClick={() => setDetailOuvert((v) => !v)}
        >
          {detailOuvert ? "Masquer les heures" : "Affiner les heures"}
          <i className={`fa-solid fa-chevron-${detailOuvert ? "up" : "down"}`} aria-hidden="true"></i>
        </button>
      </div>

      {detailOuvert && (
        <div className="agd-heures">
          {groupes.map((g) => (
            <div key={g.cle} className="agd-heures-groupe">
              <span className="agd-heures-titre">{g.libelle}</span>
              <div className="agd-chips">
                {g.horaires.map((h) => {
                  const actif = selection.has(h.horaire_id);
                  const verrou = bloques.has(h.horaire_id);
                  return (
                    <button
                      key={h.horaire_id}
                      type="button"
                      aria-pressed={actif}
                      className={`agd-chip ${actif ? "is-actif" : ""} ${verrou ? "is-verrou" : ""}`}
                      disabled={disabled || verrou}
                      title={verrou ? "Réservé par un patient : ne peut pas être fermé ici." : undefined}
                      onClick={() => basculerHeure(h.horaire_id)}
                    >
                      {verrou && <i className="fa-solid fa-lock" aria-hidden="true"></i>}
                      {formatHeure(h.heure_debut)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelecteurPeriodes;
