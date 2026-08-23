// medecin-agenda.jsx
import React, { useState, useEffect } from "react";

const MedecinAgenda = () => {
  const [modeBlocage, setModeBlocage] = useState(false);
  const [jourMobile, setJourMobile] = useState(3); // data-day (1 = Lundi ... 6 = Samedi)

  // Le mode blocage pilote body.block-mode (utilisé par les sélecteurs CSS
  // .ag-cell.is-free / .block-hint dans portail-medecin.css)
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

  const creneaux = [
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
    {
      heure: "12:00",
      cells: Array(6).fill({ statut: "ferme", type: "Pause" }),
    },
    {
      heure: "13:00",
      cells: Array(6).fill({ statut: "ferme", type: "Pause" }),
    },
    {
      heure: "14:00",
      cells: [
        libre, libre,
        { statut: "reserve", patient: "C. Etoundi", type: "Suivi" },
        { statut: "ferme" },
        { statut: "ferme" },
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
    {
      heure: "17:00",
      cells: Array(6).fill({ statut: "ferme" }),
    },
  ];

  // Horaires hebdomadaires (Matin / Après-midi)
  const [horaires, setHoraires] = useState([
    { jour: "Lundi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Mardi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Mercredi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Jeudi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Vendredi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Samedi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Dimanche", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: false },
  ]);

  const toggleOuvert = (index) => {
    setHoraires((prev) =>
      prev.map((h, i) => (i === index ? { ...h, ouvert: !h.ouvert } : h))
    );
  };

  const updateHoraire = (index, champ, valeur) => {
    setHoraires((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [champ]: valeur } : h))
    );
  };

  // Règles
  const regles = [
    { icone: "fa-clock", titre: "Tampon entre consultations", description: "15 minutes automatiquement réservées entre deux patients." },
    { icone: "fa-mug-hot", titre: "Pause déjeuner", description: "Bloquée automatiquement de 12:00 à 14:00, sauf exception." },
    { icone: "fa-rotate", titre: "Synchronisation publique", description: "Les créneaux confirmés apparaissent en temps réel sur votre fiche APS." },
    { icone: "fa-calendar-xmark", titre: "Dimanche fermé", description: "Aucune réservation possible en dehors des gardes déclarées." },
  ];

  return (
    <main className="portail-main">
      {/* En-tête */}
      <div className="portail-head">
        <div>
          <span className="portail-eyebrow">Espace médecin</span>
          <h1>Agenda</h1>
          <p>Visualisez vos créneaux, bloquez des plages et gérez vos horaires hebdomadaires.</p>
        </div>
      </div>

      {/* Alerte mode blocage */}
      <div className="block-hint">
        <i className="fa-solid fa-triangle-exclamation"></i>
        Mode blocage actif : cliquez sur un créneau libre pour le bloquer, ou sur un créneau bloqué pour le libérer.
      </div>

      {/* Barre d'outils */}
      <div className="agenda-toolbar">
        <div className="week-nav">
          <button className="btn btn-ghost" aria-label="Semaine précédente">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <strong>
            Semaine du {semaine.debut} au {semaine.fin} {semaine.mois} {semaine.annee}
          </strong>
          <button className="btn btn-ghost" aria-label="Semaine suivante">
            <i className="fa-solid fa-chevron-right"></i>
          </button>
          <button className="btn btn-ghost">Aujourd'hui</button>
        </div>
        <div className="d-flex gap-2">
          <button
            className={`btn ${modeBlocage ? "btn--outline" : "btn--primary"}`}
            onClick={() => setModeBlocage((v) => !v)}
          >
            {modeBlocage ? "Terminer le blocage" : "Bloquer des créneaux"}
          </button>
          <button className="btn btn--secondary">Ajouter une disponibilité</button>
        </div>
      </div>

      {/* Sélecteur de jour (mobile uniquement) */}
      <div className="day-switch">
        {jours.map((jour, index) => (
          <button
            key={jour.num}
            className={`${jourMobile === index + 1 ? "active" : ""} ${jour.today ? "is-today" : ""}`}
            onClick={() => setJourMobile(index + 1)}
          >
            <span className="dow">{jour.dow}</span>
            <span className="num">{jour.num}</span>
          </button>
        ))}
      </div>

      {/* Grille hebdomadaire */}
      <div className="agenda-card" data-day={jourMobile}>
        <div className="agenda-grid">
          <div className="ag-corner" />
          {jours.map((jour) => (
            <div key={jour.num} className={`ag-head ${jour.today ? "is-today" : ""}`}>
              <span className="dow">{jour.dow}</span>
              <span className="num">{jour.num}</span>
              {jour.today && <span className="today-tag">Aujourd'hui</span>}
            </div>
          ))}

          {creneaux.map((creneau) => (
            <React.Fragment key={creneau.heure}>
              <div className="ag-hour">{creneau.heure}</div>
              {creneau.cells.map((cell, index) => {
                const isToday = jours[index].today;
                if (cell.statut === "libre") {
                  return (
                    <div key={index} className={`ag-cell is-free ${isToday ? "is-today" : ""}`} />
                  );
                }
                const slotClass =
                  cell.statut === "reserve"
                    ? "slot-booked"
                    : cell.statut === "attente"
                    ? "slot-pending"
                    : "slot-blocked";
                return (
                  <div key={index} className={`ag-cell ${isToday ? "is-today" : ""}`}>
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

      {/* Légende */}
      <div className="agenda-legend">
        <span className="legend-key"><span className="legend-swatch sw-free"></span>Libre</span>
        <span className="legend-key"><span className="legend-swatch sw-booked"></span>Réservé</span>
        <span className="legend-key"><span className="legend-swatch sw-pending"></span>En attente de validation</span>
        <span className="legend-key"><span className="legend-swatch sw-blocked"></span>Bloqué</span>
        <span className="legend-key"><span className="legend-swatch sw-today"></span>Aujourd'hui</span>
      </div>

      {/* Horaires hebdomadaires */}
      <section>
        <h2>Horaires hebdomadaires</h2>
        <table className="hours-edit">
          <thead>
            <tr>
              <th>Jour</th>
              <th colSpan={3}>Matin</th>
              <th colSpan={3}>Après-midi</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {horaires.map((h, index) => (
              <tr key={h.jour}>
                <td className="day-name">{h.jour}</td>
                <td>
                  <input
                    type="time"
                    value={h.matinDebut}
                    disabled={!h.ouvert}
                    onChange={(e) => updateHoraire(index, "matinDebut", e.target.value)}
                  />
                </td>
                <td className="sep">–</td>
                <td>
                  <input
                    type="time"
                    value={h.matinFin}
                    disabled={!h.ouvert}
                    onChange={(e) => updateHoraire(index, "matinFin", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={h.amDebut}
                    disabled={!h.ouvert}
                    onChange={(e) => updateHoraire(index, "amDebut", e.target.value)}
                  />
                </td>
                <td className="sep">–</td>
                <td>
                  <input
                    type="time"
                    value={h.amFin}
                    disabled={!h.ouvert}
                    onChange={(e) => updateHoraire(index, "amFin", e.target.value)}
                  />
                </td>
                <td>
                  <label className="d-flex align-items-center gap-2">
                    <input type="checkbox" checked={h.ouvert} onChange={() => toggleOuvert(index)} />
                    <span className={h.ouvert ? "status--open" : "status--closed"}>
                      {h.ouvert ? "Ouvert" : "Fermé"}
                    </span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="save-bar">
          <button className="btn btn--outline">Annuler</button>
          <button className="btn btn--primary">Enregistrer les horaires</button>
        </div>
      </section>

      {/* Règles */}
      <section>
        <h2>Règles de votre agenda</h2>
        {regles.map((regle) => (
          <div key={regle.titre} className="note-box">
            <i className={`fa-solid ${regle.icone}`}></i>
            <div>
              <strong>{regle.titre}</strong>
              <p style={{ margin: 0 }}>{regle.description}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
};

export default MedecinAgenda;