// medecin-rdv.jsx
import React, { useState, useMemo } from "react";

const STATUT_LABEL = {
  confirme: "Confirmé",
  attente: "En attente",
  termine: "Terminé",
  annule: "Annulé",
};

const MedecinRdv = () => {
  const [activeTab, setActiveTab] = useState("attente");

  // Statistiques
  const stats = [
    { label: "RDV aujourd'hui", value: 8, icon: "fa-calendar-day", tint: "primary" },
    { label: "Demandes en attente", value: 3, icon: "fa-hourglass-half", tint: "gold" },
    { label: "Cette semaine", value: 32, icon: "fa-calendar-week", tint: "teal" },
    { label: "Téléconsultations à venir", value: 5, icon: "fa-video", tint: "violet" },
  ];

  // Rendez-vous confirmés
  const rdvConfirmes = [
    { id: 1, heure: "09:30", date: "Auj.", initials: "MN", patient: "Marie Ngo Bell", type: "Consultation générale", lieu: "Cabinet", paiement: "Payé · sous séquestre", statut: "confirme", action: "Dossier" },
    { id: 2, heure: "10:15", date: "Auj.", initials: "JM", patient: "Jean-Paul Mbarga", type: "Consultation générale", lieu: "Téléconsultation", paiement: "Payé · sous séquestre", statut: "confirme", action: "Démarrer la visio" },
    { id: 3, heure: "14:00", date: "Auj.", initials: "CE", patient: "Clarisse Etoundi", type: "Consultation de suivi", lieu: "Cabinet", paiement: "Payé · sous séquestre", statut: "confirme", action: "Dossier" },
    { id: 4, heure: "09:00", date: "Jeu 20", initials: "SN", patient: "Serge Nkolo", type: "Consultation générale", lieu: "Téléconsultation", paiement: "Payé · sous séquestre", statut: "confirme", action: "Dossier" },
    { id: 5, heure: "11:30", date: "Ven 21", initials: "AD", patient: "Aïcha Diallo", type: "Vaccination", lieu: "Cabinet", paiement: "Payé · sous séquestre", statut: "confirme", action: "Dossier" },
  ];

  // Demandes en attente
  const rdvEnAttente = [
    { id: 6, heure: "16:45", date: "Auj.", initials: "PB", patient: "Paul Biyong", type: "Consultation urgente", lieu: "Cabinet", deadline: "Réponse attendue avant 18:00", statut: "attente" },
    { id: 7, heure: "15:30", date: "Jeu 20", initials: "FA", patient: "Florence Abena", type: "Consultation générale", lieu: "Téléconsultation", deadline: "Réponse attendue avant demain 12:00", statut: "attente" },
    { id: 8, heure: "10:00", date: "Sam 22", initials: "RT", patient: "Rodrigue Temgoua", type: "Consultation générale", lieu: "Cabinet", deadline: "Réponse attendue avant vendredi 18:00", statut: "attente" },
  ];

  // Rendez-vous passés
  const rdvPasses = [
    { id: 9, heure: "09:00", date: "Mar 18", initials: "HM", patient: "Hortense Manga", type: "Consultation de suivi", lieu: "Cabinet", statut: "termine", montant: "15 000 FCFA libérés" },
    { id: 10, heure: "11:00", date: "Mar 18", initials: "YK", patient: "Yves Kouam", type: "Certificat médical", lieu: "Cabinet", statut: "termine", montant: "20 000 FCFA libérés" },
    { id: 11, heure: "10:30", date: "Lun 17", initials: "SE", patient: "Solange Epée", type: "Consultation générale", lieu: "Cabinet", statut: "termine", montant: "15 000 FCFA libérés" },
  ];

  // Rendez-vous annulés
  const rdvAnnules = [
    { id: 12, heure: "15:00", date: "Lun 17", initials: "DF", patient: "Didier Fouda", type: "Consultation générale", motif: "Annulé par le patient", note: "Remboursement automatique via séquestre", statut: "annule" },
    { id: 13, heure: "09:30", date: "Sam 15", initials: "JM", patient: "Justine Mvondo", type: "Consultation de suivi", motif: "Annulé par vous", statut: "annule" },
  ];

  const tabs = [
    { key: "attente", label: "En attente", count: rdvEnAttente.length, data: rdvEnAttente },
    { key: "confirmes", label: "Confirmés", count: rdvConfirmes.length, data: rdvConfirmes },
    { key: "passes", label: "Passés", count: rdvPasses.length, data: rdvPasses },
    { key: "annules", label: "Annulés", count: rdvAnnules.length, data: rdvAnnules },
  ];

  const currentList = useMemo(
    () => tabs.find((t) => t.key === activeTab)?.data ?? [],
    [activeTab]
  );

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main">
          {/* En-tête */}
          <div className="portail-head">
            <div>
              <span className="portail-eyebrow">Espace médecin</span>
              <h1>Rendez-vous</h1>
              <p>Demandes, confirmations et historique de vos consultations.</p>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn--outline">Exporter</button>
              <a href="/portail/medecin-agenda" className="btn btn--primary">
                Ouvrir l'agenda
              </a>
            </div>
          </div>

          {/* Statistiques */}
          <div className="stat-row">
            {stats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <span className={`stat-icon i-${stat.tint}`}>
                  <i className={`fas ${stat.icon}`} />
                </span>
                <div>
                  <span className="stat-value">{stat.value}</span>
                  <span className="stat-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div className="aps-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className="tab-count">{tab.count}</span>
              </button>
            ))}
          </div>

          {activeTab === "attente" && (
            <p className="note-box">
              <i className="fas fa-circle-info" />
              Acceptez ou refusez chaque demande : les fonds ne sont capturés qu'après votre acceptation.
            </p>
          )}

          {/* Liste filtrée selon l'onglet actif */}
          <div className="rdv-list">
            {currentList.map((rdv) => (
              <div
                key={rdv.id}
                className={`rdv-item${rdv.statut === "attente" ? " is-pending" : ""}`}
              >
                <div className="rdv-time">
                  <span className="t">{rdv.heure}</span>
                  <span className="d">{rdv.date}</span>
                </div>

                <div className="patient-avatar">{rdv.initials}</div>

                <div className="rdv-body">
                  <h3>{rdv.patient}</h3>
                  <div className="rdv-meta">
                    <span><i className="fas fa-stethoscope" />{rdv.type}</span>
                    <span>
                      <i className={`fas ${rdv.lieu === "Téléconsultation" ? "fa-video" : "fa-hospital"}`} />
                      {rdv.lieu}
                    </span>
                    {rdv.paiement && <span><i className="fas fa-credit-card" />{rdv.paiement}</span>}
                    {rdv.deadline && <span><i className="fas fa-clock" />{rdv.deadline}</span>}
                    {rdv.motif && <span><i className="fas fa-ban" />{rdv.motif}</span>}
                    {rdv.note && <span><i className="fas fa-rotate-left" />{rdv.note}</span>}
                    {rdv.montant && <span><i className="fas fa-coins" />{rdv.montant}</span>}
                  </div>
                </div>

                <div className="rdv-status">
                  <span className={`chip-st-${rdv.statut}`}>
                    {STATUT_LABEL[rdv.statut]}
                  </span>
                </div>

                <div className="rdv-actions">
                  {rdv.statut === "attente" ? (
                    <>
                      <button className="btn btn--sm btn--success">Accepter</button>
                      <button className="btn btn--sm btn--danger">Refuser</button>
                    </>
                  ) : rdv.statut === "annule" ? (
                    <button className="btn btn--sm btn--outline">Reprogrammer</button>
                  ) : rdv.statut === "termine" ? (
                    <button className="btn btn--sm btn--outline">Compte rendu</button>
                  ) : (
                    <button className="btn btn--sm btn--outline">{rdv.action}</button>
                  )}
                </div>
              </div>
            ))}

            {currentList.length === 0 && (
              <p className="rdv-empty">Aucun rendez-vous dans cette catégorie.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MedecinRdv;