// Données des KPI — à remplacer par un appel API le moment venu
const kpis = [
  {
    id: "pros",
    icon: "fa-user-doctor",
    tone: "is-primary",
    label: "Professionnels actifs",
    value: "1 284",
    trend: "up",
    trendValue: "4,2%",
    trendNote: "vs mois dernier",
  },
  {
    id: "pending",
    icon: "fa-file-signature",
    tone: "is-warning",
    label: "Inscriptions en attente",
    value: "38",
    trend: "down",
    trendValue: "12%",
    trendNote: "vs mois dernier",
  },
  {
    id: "escrow",
    icon: "fa-money-check-dollar",
    tone: "is-success",
    label: "Paiements escrow (mois)",
    value: "42,6M XAF",
    trend: "up",
    trendValue: "8,1%",
    trendNote: "vs mois dernier",
  },
  {
    id: "reports",
    icon: "fa-triangle-exclamation",
    tone: "is-danger",
    label: "Signalements ouverts",
    value: "6",
    trend: "down",
    trendValue: "2",
    trendNote: "vs semaine dernière",
  },
];

// Inscriptions à valider — à remplacer par un appel API
const registrations = [
  {
    id: 1,
    avatar: "https://i.pravatar.cc/64?img=32",
    name: "Dr. Alfonso Stiedemann",
    sub: "Hôpital Protestant de Garoua",
    specialty: "Cardiologie",
    country: "Cameroun",
    submittedOn: "2 juil. 2026",
    status: "pending",
  },
  {
    id: 2,
    avatar: "https://i.pravatar.cc/64?img=12",
    name: "Dr. Armando O'Connell",
    sub: "Hôpital de District de Biyem-Assi",
    specialty: "Psychiatrie",
    country: "Cameroun",
    submittedOn: "1 juil. 2026",
    status: "verified",
  },
  {
    id: 3,
    avatar: "https://i.pravatar.cc/64?img=45",
    name: "Pharmacie du Centre",
    sub: "Douala, Akwa",
    specialty: "Pharmacie",
    country: "Cameroun",
    submittedOn: "29 juin 2026",
    status: "rejected",
  },
];

const statusMap = {
  pending: { tone: "is-warning", label: "En attente" },
  verified: { tone: "is-success", label: "Vérifié" },
  rejected: { tone: "is-danger", label: "Rejeté" },
};

const calendarDays = [null, null, 1, 2, 3, 4, 5];
const selectedDay = 3;

function KpiCard({ icon, tone, label, value, trend, trendValue, trendNote }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="aps-kpi">
        <div className="aps-kpi__top">
          <div className={`aps-kpi__icon ${tone}`}>
            <i className={`fa-solid ${icon}`}></i>
          </div>
        </div>
        <div className="aps-kpi__label">{label}</div>
        <div className="aps-kpi__value">{value}</div>
        <div className={`aps-kpi__trend is-${trend}`}>
          <i className={`fa-solid fa-arrow-${trend}`}></i> {trendValue}{" "}
          <span className="muted">{trendNote}</span>
        </div>
      </div>
    </div>
  );
}

function RegistrationRow({ row }) {
  const status = statusMap[row.status];
  return (
    <tr>
      <td>
        <div className="aps-avatar-cell">
          <img src={row.avatar} alt="" />
          <div>
            <div className="cell-title">{row.name}</div>
            <div className="cell-sub">{row.sub}</div>
          </div>
        </div>
      </td>
      <td>{row.specialty}</td>
      <td>{row.country}</td>
      <td>{row.submittedOn}</td>
      <td>
        <span className={`aps-badge ${status.tone}`}>
          <i className="fa-solid fa-circle"></i>
          {status.label}
        </span>
      </td>
      <td className="text-end">
        <button className="btn btn-sm btn-outline-primary">Examiner</button>
      </td>
    </tr>
  );
}

export default function Dashboard() {
  return (
    <main className="aps-content">
      <div className="aps-page-header">
            <div>
              <div className="aps-breadcrumb">
                Back-office <span className="sep">/</span> Tableau de bord
              </div>
              <h1>Bon retour, Yves Michel</h1>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-light">
                <i className="fa-solid fa-download me-2"></i>Exporter
              </button>
              <button className="btn btn-primary">
                <i className="fa-solid fa-plus me-2"></i>Nouvelle validation
              </button>
            </div>
          </div>

          {/* KPI */}
          <div className="row g-3 mb-4">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.id} {...kpi} />
            ))}
          </div>

          <div className="row g-3">
            {/* Tableau des validations */}
            <div className="col-lg-8">
              <div className="aps-card">
                <div className="aps-card__header">
                  <h2>Inscriptions à valider</h2>
                  <a href="validation.html" className="btn btn-sm btn-light">
                    Voir tout <i className="fa-solid fa-arrow-right ms-1"></i>
                  </a>
                </div>
                <div className="aps-table-wrap">
                  <table className="table aps-table">
                    <thead>
                      <tr>
                        <th>Professionnel</th>
                        <th>Spécialité</th>
                        <th>Pays</th>
                        <th>Soumis le</th>
                        <th>Statut</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((row) => (
                        <RegistrationRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="aps-pagination">
                  <span>Affichage de 1 à 3 sur 38</span>
                  <div className="pages">
                    <button className="is-active">1</button>
                    <button>2</button>
                    <button>3</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Calendrier + notice */}
            <div className="col-lg-4">
              <div className="aps-card mb-3">
                <div className="aps-card__body">
                  <div className="aps-mini-calendar">
                    <div className="aps-mini-calendar__head">
                      <button className="btn-icon btn btn-light">
                        <i className="fa-solid fa-chevron-left"></i>
                      </button>
                      Juillet 2026
                      <button className="btn-icon btn btn-light">
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                    </div>
                    <div className="aps-mini-calendar__grid">
                      <div className="dow">L</div>
                      <div className="dow">M</div>
                      <div className="dow">M</div>
                      <div className="dow">J</div>
                      <div className="dow">V</div>
                      <div className="dow">S</div>
                      <div className="dow">D</div>
                      {calendarDays.map((day, i) => (
                        <div
                          key={i}
                          className={`day${day === selectedDay ? " is-selected" : ""}`}
                        >
                          {day ?? ""}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="aps-card">
                <div className="aps-card__header">
                  <h2>Alertes système</h2>
                </div>
                <div className="aps-card__body d-flex flex-column gap-2">
                  <div className="aps-notice is-warning">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <div>3 signalements de fraude nécessitent une revue sous 24h.</div>
                  </div>
                  <div className="aps-notice is-info">
                    <i className="fa-solid fa-circle-info"></i>
                    <div>Le référentiel « Sénégal » a été mis à jour hier.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
    </main>
  );
}