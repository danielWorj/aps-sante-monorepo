// medecin-profil.jsx
import React, { useState } from "react";

const MedecinProfil = () => {
  /* ── État du formulaire ───────────────────────── */
  const [specialite, setSpecialite] = useState("Médecine générale");
  const [pays, setPays] = useState("Cameroun");
  const [modeConsultation, setModeConsultation] = useState("cabinet-tele");
  const [duree, setDuree] = useState("30 minutes");

  const [horaires, setHoraires] = useState([
    { jour: "Lundi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Mardi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Mercredi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Jeudi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Vendredi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Samedi", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
    { jour: "Dimanche", matinDebut: "08:00", matinFin: "12:00", amDebut: "14:00", amFin: "18:00", ouvert: true },
  ]);

  /* ── Opérations du portefeuille ───────────────── */
  const operations = [
    { id: 1, label: "Consultation — H. Manga", date: "18 août 2026", montant: "+15 000 FCFA", type: "credit" },
    { id: 2, label: "Retrait vers Afriland First Bank", date: "16 août 2026", montant: "−120 000 FCFA", type: "debit" },
    { id: 3, label: "Téléconsultation — T. Essomba", date: "15 août 2026", montant: "+10 000 FCFA", type: "credit" },
  ];

  /* ── Vérification & documents ─────────────────── */
  const documents = [
    {
      id: 1,
      titre: "Inscription à l'Ordre (CNOM)",
      detail: "N° 4521/ORD/2014 — vérifié auprès de la source officielle",
      statut: "verifie",
      statutLabel: "Vérifié",
      icone: "fa-stamp",
      iconeClasse: "v-teal",
    },
    {
      id: 2,
      titre: "Pièce d'identité",
      detail: "CNI déposée le 02 août 2026",
      statut: "verifie",
      statutLabel: "Vérifié",
      icone: "fa-id-card",
      iconeClasse: "v-teal",
    },
    {
      id: 3,
      titre: "Diplôme d'État de docteur en médecine",
      detail: "Déposé le 17 août 2026",
      statut: "encours",
      statutLabel: "En cours",
      icone: "fa-graduation-cap",
      iconeClasse: "v-gold",
    },
    {
      id: 4,
      titre: "Attestation d'assurance responsabilité civile",
      detail: "Document demandé pour compléter votre dossier",
      statut: "afournir",
      statutLabel: "À fournir",
      action: "Déposer",
      icone: "fa-file-circle-exclamation",
      iconeClasse: "v-orange",
    },
  ];

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

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO : appel API d'enregistrement du profil
  };

  return (
    <main className="portail-main">
      {/* ── En-tête ── */}
      <div className="portail-head">
        <div>
          <span className="portail-eyebrow">Espace médecin</span>
          <h1>Mon profil</h1>
          <p>Ces informations alimentent votre fiche publique dans l'annuaire APS.</p>
          <div className="chips-row">
            <span className="badge badge--verifie">Vérifié à l'Ordre</span>
            <span className="badge badge--progress">Profil complété à 90 %</span>
            <a href="#">Voir ma fiche publique</a>
          </div>
        </div>
      </div>

      <form className="profil__form" onSubmit={handleSubmit}>
        {/* ══ Photo & identité ══ */}
        <section className="profil__section">
          <h2>Photo & identité</h2>

          <div className="profil__field profil__field--photo">
            <label className="profil__label">Photo de profil</label>
            <div className="profil__photo-drop">
              <span>JPG, PNG — visage bien visible, fond neutre. 5 Mo max.</span>
            </div>
          </div>

          <div className="profil__grid">
            <div className="profil__field">
              <label className="profil__label" htmlFor="nom">Nom complet</label>
              <input id="nom" type="text" className="profil__input" defaultValue="Dr Émile Kammogne" />
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="email">Adresse e-mail professionnelle</label>
              <input id="email" type="email" className="profil__input" />
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="tel">Téléphone</label>
              <input id="tel" type="tel" className="profil__input" />
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="specialite">Spécialité</label>
              <select
                id="specialite"
                className="profil__select"
                value={specialite}
                onChange={(e) => setSpecialite(e.target.value)}
              >
                <option>Médecine générale</option>
                <option>Pédiatrie</option>
                <option>Gynécologie</option>
                <option>Cardiologie</option>
                <option>Dentisterie</option>
              </select>
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="experience">Années d'expérience</label>
              <input id="experience" type="number" className="profil__input" min="0" />
            </div>
          </div>

          <div className="profil__field">
            <label className="profil__label" htmlFor="bio">Biographie</label>
            <textarea
              id="bio"
              className="profil__textarea"
              rows={4}
              defaultValue="Médecin généraliste installé à Douala depuis 2014. Prise en charge des adultes et des enfants, suivi des maladies chroniques, téléconsultation."
            />
          </div>
        </section>

        {/* ══ Lieu d'exercice ══ */}
        <section className="profil__section">
          <h2>Lieu d'exercice</h2>

          <div className="profil__grid">
            <div className="profil__field">
              <label className="profil__label" htmlFor="adresse">Adresse du cabinet</label>
              <input id="adresse" type="text" className="profil__input" />
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="quartier">Quartier</label>
              <input id="quartier" type="text" className="profil__input" />
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="ville">Ville</label>
              <input id="ville" type="text" className="profil__input" />
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="pays">Pays d'exercice</label>
              <select
                id="pays"
                className="profil__select"
                value={pays}
                onChange={(e) => setPays(e.target.value)}
              >
                <option>Cameroun</option>
                <option>Sénégal</option>
                <option>Côte d'Ivoire</option>
                <option>Gabon</option>
              </select>
            </div>
          </div>

          <div className="note-box">
            <i className="fa-solid fa-location-crosshairs"></i>
            <p style={{ margin: 0 }}>
              La position exacte de votre cabinet est calculée automatiquement
              pour le tri par proximité dans les résultats de recherche.
            </p>
          </div>
        </section>

        {/* ══ Consultations & tarifs ══ */}
        <section className="profil__section">
          <h2>Consultations & tarifs</h2>

          <fieldset className="profil__fieldset">
            <legend className="profil__label">Mode d'exercice</legend>
            <div className="profil__radio-group">
              <label className="profil__radio">
                <input
                  type="radio"
                  name="mode"
                  value="cabinet"
                  checked={modeConsultation === "cabinet"}
                  onChange={(e) => setModeConsultation(e.target.value)}
                />
                Cabinet uniquement
              </label>
              <label className="profil__radio">
                <input
                  type="radio"
                  name="mode"
                  value="tele"
                  checked={modeConsultation === "tele"}
                  onChange={(e) => setModeConsultation(e.target.value)}
                />
                Téléconsultation uniquement
              </label>
              <label className="profil__radio">
                <input
                  type="radio"
                  name="mode"
                  value="cabinet-tele"
                  checked={modeConsultation === "cabinet-tele"}
                  onChange={(e) => setModeConsultation(e.target.value)}
                />
                Cabinet et téléconsultation
              </label>
            </div>
          </fieldset>

          <div className="profil__grid">
            <div className="profil__field">
              <label className="profil__label" htmlFor="hono-cabinet">Honoraires consultation</label>
              <div className="profil__input-suffix input-group-text">
                <input id="hono-cabinet" type="number" className="profil__input" min="0" />
                <span>FCFA</span>
              </div>
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="hono-tele">Honoraires téléconsultation</label>
              <div className="profil__input-suffix input-group-text">
                <input id="hono-tele" type="number" className="profil__input" min="0" />
                <span>FCFA</span>
              </div>
            </div>

            <div className="profil__field">
              <label className="profil__label" htmlFor="duree">Durée moyenne d'une consultation</label>
              <select
                id="duree"
                className="profil__select"
                value={duree}
                onChange={(e) => setDuree(e.target.value)}
              >
                <option>20 minutes</option>
                <option>30 minutes</option>
                <option>45 minutes</option>
              </select>
            </div>
          </div>

          <div className="note-box">
            <i className="fa-solid fa-circle-info"></i>
            <p style={{ margin: 0 }}>
              Commission APS : 1 000 FCFA par réservation. Les fonds du patient
              restent sous séquestre (escrow) jusqu'à la réalisation de la consultation.
            </p>
          </div>
        </section>

        {/* ══ Horaires d'ouverture ══ */}
        <section className="profil__section">
          <h2>Horaires d'ouverture</h2>

          <table className="hours-edit">
            <thead>
              <tr>
                <th>Jour</th>
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
        </section>

        {/* ══ Portefeuille APS ══ */}
        <section className="profil__section">
          <h2>Portefeuille APS</h2>

          <div className="wallet-banner">
            <div>
              <span className="wallet-amount">186 500 FCFA</span>
              <div className="wallet-sub">+ 45 000 FCFA sous séquestre (consultations à venir)</div>
            </div>
            <button type="button" className="btn btn--primary">Demander un retrait</button>
          </div>

          <div className="profil__grid">
            <div className="profil__field">
              <label className="profil__label" htmlFor="banque">Banque</label>
              <input id="banque" type="text" className="profil__input" placeholder="Modifier le RIB" />
            </div>
            <div className="profil__field">
              <label className="profil__label" htmlFor="compte">Compte</label>
              <input id="compte" type="text" className="profil__input" />
            </div>
          </div>
        </section>

        {/* ══ Dernières opérations ══ */}
        <section className="profil__section">
          <h2>Dernières opérations</h2>

          <div>
            {operations.map((op) => (
              <div key={op.id} className="tx-row">
                <div>
                  <div>{op.label}</div>
                  <div className="wallet-sub">{op.date}</div>
                </div>
                <span className={`tx-amount ${op.type}`}>{op.montant}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ══ Vérification & documents ══ */}
        <section className="profil__section">
          <h2>Vérification & documents</h2>

          <div>
            {documents.map((doc) => (
              <div key={doc.id} className="verify-row">
                <span className={`verify-icon ${doc.iconeClasse}`}>
                  <i className={`fa-solid ${doc.icone}`}></i>
                </span>
                <div>
                  <div>{doc.titre}</div>
                  <div className="wallet-sub">{doc.detail}</div>
                </div>
                <div className="status">
                  <span className={`badge badge--${doc.statut}`}>{doc.statutLabel}</span>
                  {doc.action && (
                    <button type="button" className="btn btn--sm btn--outline">
                      {doc.action}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Actions du formulaire ── */}
        <div className="save-bar">
          <button type="button" className="btn btn--outline">Annuler</button>
          <button type="submit" className="btn btn--primary">Enregistrer les modifications</button>
        </div>
      </form>
    </main>
  );
};

export default MedecinProfil;