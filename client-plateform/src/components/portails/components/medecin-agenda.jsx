// medecin-agenda.jsx
import React, { useState, useEffect, useRef } from "react";
import PortailNavbar from "./../layouts/portail-navbar";
import PortailFooter from "./../layouts/portail-footer";
import PortailSidebar from "./../layouts/portail-sidebar";

const MedecinAgenda = () => {
  const [modeBlocage, setModeBlocage] = useState(false);
  const [jourMobile, setJourMobile] = useState(3); // 1 = Lundi ... 6 = Samedi
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    document.body.classList.toggle("block-mode", modeBlocage);
    return () => document.body.classList.remove("block-mode");
  }, [modeBlocage]);

  const semaine = { debut: "17", fin: "22", mois: "août", annee: "2026" };

  // index : 0 = Lundi ... 5 = Samedi. Mercredi 19 = aujourd'hui.
  const jours = [
    { dow: "Lun", num: 17 },
    { dow: "Mar", num: 18 },
    { dow: "Mer", num: 19, today: true },
    { dow: "Jeu", num: 20 },
    { dow: "Ven", num: 21 },
    { dow: "Sam", num: 22 },
  ];

  const libre = { statut: "libre" };

  const [creneaux, setCreneaux] = useState([
    {
      heure: "08:00",
      cells: [
        { statut: "reserve", patient: "M. Tchoua", type: "Suivi" },
        libre, libre, libre, libre, libre,
      ],
    },
    {
      heure: "09:00",
      cells: [
        libre,
        { statut: "reserve", patient: "H. Manga", type: "Suivi" },
        { statut: "reserve", patient: "M. Ngo Bell", type: "Consultation" },
        { statut: "reserve", patient: "S. Nkolo", type: "Téléconsultation", tele: true },
        libre, libre,
      ],
    },
    {
      heure: "10:00",
      cells: [
        libre, libre,
        { statut: "reserve", patient: "S. Nguini", type: "1ère consultation" },
        { statut: "reserve", patient: "J-P. Mbarga", type: "Téléconsultation", tele: true },
        { statut: "reserve", patient: "R. Temgoua", type: "Consultation" },
        libre,
      ],
    },
    {
      heure: "11:00",
      cells: [
        libre, libre, libre,
        { statut: "reserve", patient: "Y. Kouam", type: "Certificat" },
        { statut: "reserve", patient: "A. Diallo", type: "Vaccination" },
        libre,
      ],
    },
    { heure: "12:00", cells: Array(6).fill({ statut: "ferme", type: "Pause" }) },
    { heure: "13:00", cells: Array(6).fill({ statut: "ferme", type: "Pause" }) },
    {
      heure: "14:00",
      cells: [
        libre, libre,
        { statut: "reserve", patient: "C. Etoundi", type: "Suivi" },
        { statut: "ferme" }, { statut: "ferme" },
        libre,
      ],
    },
    {
      heure: "15:00",
      cells: [
        libre, libre,
        { statut: "reserve", patient: "B. Kamdem", type: "Téléconsultation", tele: true },
        { statut: "attente", patient: "F. Abena", type: "En attente · téléconsultation", tele: true },
        { statut: "ferme" },
        libre,
      ],
    },
    {
      heure: "16:00",
      cells: [
        libre, libre,
        { statut: "reserve", patient: "L. Eyenga", type: "Téléconsultation", tele: true },
        { statut: "attente", patient: "P. Biyong", type: "En attente · urgent" },
        { statut: "ferme" },
        libre,
      ],
    },
    { heure: "17:00", cells: Array(6).fill({ statut: "ferme" }) },
  ]);

  const toggleCreneau = (heureIndex, cellIndex) => {
    if (!modeBlocage) return;
    const jour = jours[cellIndex];
    const label = `${jour.dow === "Mer" ? "Mercredi" : jour.dow} ${jour.num} · ${creneaux[heureIndex].heure}`;
    setCreneaux((prev) =>
      prev.map((c, hi) => {
        if (hi !== heureIndex) return c;
        return {
          ...c,
          cells: c.cells.map((cell, ci) => {
            if (ci !== cellIndex) return cell;
            if (cell.statut === "libre") return { statut: "bloque", type: "Bloqué" };
            if (cell.statut === "bloque") return { statut: "libre" };
            return cell;
          }),
        };
      })
    );
    showToast(
      creneaux[heureIndex].cells[cellIndex].statut === "libre"
        ? `Créneau bloqué — ${label}`
        : "Créneau libéré."
    );
  };

  // Horaires hebdomadaires
  const [horaires, setHoraires] = useState([
    { jour: "Lundi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Mardi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Mercredi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Jeudi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Vendredi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Samedi", matinDebut: "08:00", matinFin: "13:00", amDebut: "", amFin: "", ouvert: true },
    { jour: "Dimanche", matinDebut: "", matinFin: "", amDebut: "", amFin: "", ouvert: false },
  ]);

  const toggleOuvert = (index) => {
    setHoraires((prev) => prev.map((h, i) => (i === index ? { ...h, ouvert: !h.ouvert } : h)));
  };

  const updateHoraire = (index, champ, valeur) => {
    setHoraires((prev) => prev.map((h, i) => (i === index ? { ...h, [champ]: valeur } : h)));
  };

  // Règles
  const regles = [
    { icone: "fa-hourglass-half", titre: "Tampon entre consultations", description: "15 minutes automatiquement réservées entre deux patients." },
    { icone: "fa-utensils", titre: "Pause déjeuner", description: "Bloquée automatiquement de 12:00 à 14:00, sauf exception." },
    { icone: "fa-eye", titre: "Synchronisation publique", description: "Les créneaux confirmés apparaissent en temps réel sur votre fiche APS." },
    { icone: "fa-moon", titre: "Dimanche fermé", description: "Aucune réservation possible en dehors des gardes déclarées." },
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
                <p>Visualisez vos créneaux, bloquez des plages et gérez vos horaires hebdomadaires.</p>
              </div>
            </header>

            <div className="agenda-toolbar">
              <div className="week-nav">
                <button
                  className="btn btn-outline-primary btn-sm-aps btn-icon"
                  aria-label="Semaine précédente"
                  onClick={() => showToast("Navigation vers la semaine précédente (démo).")}
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <strong>
                  Semaine du {semaine.debut} au {semaine.fin} {semaine.mois} {semaine.annee}
                </strong>
                <button
                  className="btn btn-outline-primary btn-sm-aps btn-icon"
                  aria-label="Semaine suivante"
                  onClick={() => showToast("Navigation vers la semaine suivante (démo).")}
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
                <button className="btn btn-ghost btn-sm-aps">Aujourd'hui</button>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button
                  className={modeBlocage ? "btn btn-primary btn-sm-aps" : "btn btn-outline-primary btn-sm-aps"}
                  onClick={() => setModeBlocage((v) => !v)}
                >
                  <i className={`fa-solid ${modeBlocage ? "fa-check" : "fa-ban"}`}></i>{" "}
                  {modeBlocage ? "Terminer le blocage" : "Bloquer des créneaux"}
                </button>
                <button
                  className="btn btn-primary btn-sm-aps"
                  onClick={() => showToast("Ouverture d'une nouvelle disponibilité (démo).")}
                >
                  <i className="fa-solid fa-plus"></i> Ajouter une disponibilité
                </button>
              </div>
            </div>

            {modeBlocage && (
              <div className="block-hint">
                <i className="fa-solid fa-circle-info"></i> Mode blocage actif : cliquez sur un créneau libre pour le
                bloquer, ou sur un créneau bloqué pour le libérer.
              </div>
            )}

            {/* Sélecteur de jour (mobile uniquement) */}
            <div className="day-switch" aria-label="Choisir un jour">
              {jours.map((jour, index) => (
                <button
                  key={jour.num}
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
              <div className="agenda-grid">
                <div className="ag-corner"></div>
                {jours.map((jour) => (
                  <div key={jour.num} className={`ag-head ${jour.today ? "is-today" : ""}`}>
                    <span className="dow">{jour.dow}</span>
                    <span className="num">{jour.num}</span>
                    {jour.today && <span className="today-tag">Aujourd'hui</span>}
                  </div>
                ))}

                {creneaux.map((creneau, heureIndex) => (
                  <React.Fragment key={creneau.heure}>
                    <div className="ag-hour">{creneau.heure}</div>
                    {creneau.cells.map((cell, cellIndex) => {
                      const isToday = jours[cellIndex].today;
                      if (cell.statut === "libre") {
                        return (
                          <div
                            key={cellIndex}
                            className={`ag-cell is-free ${isToday ? "is-today" : ""}`}
                            data-label={`${jours[cellIndex].dow} ${jours[cellIndex].num} · ${creneau.heure}`}
                            onClick={() => toggleCreneau(heureIndex, cellIndex)}
                          />
                        );
                      }
                      const slotClass =
                        cell.statut === "reserve"
                          ? "slot-booked"
                          : cell.statut === "attente"
                          ? "slot-pending"
                          : "slot-blocked";
                      return (
                        <div
                          key={cellIndex}
                          className={`ag-cell ${isToday ? "is-today" : ""}`}
                          onClick={() => cell.statut === "bloque" && toggleCreneau(heureIndex, cellIndex)}
                        >
                          <span className={`slot ${slotClass}`}>
                            {cell.tele && <i className="fa-solid fa-video"></i>}
                            {cell.patient || cell.type || "Fermé"}
                            {cell.patient && cell.type && <small>{cell.type}</small>}
                          </span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="agenda-legend">
              <span className="legend-key"><span className="legend-swatch sw-free"></span> Libre</span>
              <span className="legend-key"><span className="legend-swatch sw-booked"></span> Réservé</span>
              <span className="legend-key"><span className="legend-swatch sw-pending"></span> En attente de validation</span>
              <span className="legend-key"><span className="legend-swatch sw-blocked"></span> Bloqué</span>
              <span className="legend-key"><span className="legend-swatch sw-today"></span> Aujourd'hui</span>
            </div>

            {/* Horaires + règles */}
            <div className="row g-4 mt-1">
              <div className="col-lg-7">
                <div className="info-card mb-0">
                  <h3><i className="fa-solid fa-repeat"></i> Horaires hebdomadaires</h3>
                  <div className="table-responsive">
                    <table className="hours-edit">
                      <thead>
                        <tr>
                          <th></th>
                          <th colSpan={3}>Matin</th>
                          <th colSpan={3}>Après-midi</th>
                          <th>Ouvert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {horaires.map((h, index) => (
                          <tr key={h.jour}>
                            <td className="day-name">{h.jour}</td>
                            <td>
                              <input
                                type="time"
                                className="form-control form-control-sm"
                                value={h.matinDebut}
                                disabled={!h.ouvert}
                                onChange={(e) => updateHoraire(index, "matinDebut", e.target.value)}
                              />
                            </td>
                            <td className="sep">–</td>
                            <td>
                              <input
                                type="time"
                                className="form-control form-control-sm"
                                value={h.matinFin}
                                disabled={!h.ouvert}
                                onChange={(e) => updateHoraire(index, "matinFin", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="time"
                                className="form-control form-control-sm"
                                value={h.amDebut}
                                disabled={!h.ouvert}
                                onChange={(e) => updateHoraire(index, "amDebut", e.target.value)}
                              />
                            </td>
                            <td className="sep">–</td>
                            <td>
                              <input
                                type="time"
                                className="form-control form-control-sm"
                                value={h.amFin}
                                disabled={!h.ouvert}
                                onChange={(e) => updateHoraire(index, "amFin", e.target.value)}
                              />
                            </td>
                            <td>
                              <div className="form-check form-switch m-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`ag-${h.jour}`}
                                  checked={h.ouvert}
                                  onChange={() => toggleOuvert(index)}
                                />
                                <label className="form-check-label visually-hidden" htmlFor={`ag-${h.jour}`}>
                                  Ouvert
                                </label>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="save-bar">
                    <button
                      className="btn btn-primary btn-sm-aps"
                      onClick={() => showToast("Horaires hebdomadaires enregistrés.")}
                    >
                      <i className="fa-solid fa-floppy-disk"></i> Enregistrer les horaires
                    </button>
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