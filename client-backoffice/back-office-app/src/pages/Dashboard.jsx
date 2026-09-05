// src/pages/Dashboard.jsx
//
// Tableau de bord principal du back-office.
//
// Contrairement à la version précédente (données statiques en tête de
// fichier), ce composant agrège les VRAIES données de l'application en
// interrogeant les mêmes services que les pages dédiées :
//
//   - StructureSanteService.listerCentresSante({})
//   - medecinService.listerMedecins({}) / listerRendezVous()
//   - pharmacieService.listerPharmacies({})
//   - assuranceService.listerServicesAssurance({})
//   - urgenceService.listerUrgences({})
//   - utilisateurService (UtilisateurService.listerUtilisateurs) — trois
//     appels légers (`limite: 1`) pour ne récupérer que les totaux
//     paginés, exactement comme `chargerStats()` dans Utilisateurs.jsx.
//
// Chaque source est chargée indépendamment via Promise.allSettled : si
// un service tombe en panne, le reste du tableau de bord continue de
// s'afficher (avec une alerte signalant la source en échec) plutôt que
// de tout bloquer sur une seule erreur.
//
// Les liens ("Examiner", "Gérer les comptes"...) pointent vers les
// routes réelles de router.jsx (/medecin, /pharmacie, /structure-sante,
// /assurances, /rendez-vous, /utilisateurs).
//
// ⚠️ Autre hypothèse à garder en tête :
//   - Aucune donnée de paiement/escrow n'est exposée par les services
//     fournis : ce KPI (présent dans l'ancienne maquette statique) a
//     été retiré plutôt que d'afficher un chiffre inventé. Idem pour
//     les tendances "vs mois dernier" : elles nécessiteraient un
//     historique que l'API ne renvoie pas (voir les mêmes réserves déjà
//     documentées dans StructureSante.jsx / Pharmacie.jsx) — les cartes
//     KPI n'affichent donc que la valeur actuelle, avec une note de
//     contexte plutôt qu'une flèche de tendance fictive.
//   - `date_creation` n'est documenté de façon fiable que pour les
//     médecins (voir medecinService.js) ; pharmacies, structures et
//     assurances ne l'exposent pas de façon certaine — la colonne
//     "Soumis le" affiche donc "—" quand la donnée est absente plutôt
//     que de la deviner.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { useAuth } from '../context/AuthContext';
import { listerCentresSante } from '../services/StructureSanteService.js';
import { listerMedecins, listerRendezVous } from '../services/medecinService';
import { listerPharmacies } from '../services/pharmacieService.js';
import { listerServicesAssurance } from '../services/assuranceService';
import { listerUrgences } from '../services/urgenceService';
import UtilisateurService from '../services/utilisateurService';

// ==================== CONSTANTES ====================

const COULEURS_GRAPHIQUE = {
  text500: '#6B7280',
};

const TYPE_ANNUAIRE = {
  medecin: { label: 'Médecin', icone: 'fa-user-doctor', route: '/medecin' },
  pharmacie: { label: 'Pharmacie', icone: 'fa-prescription-bottle-medical', route: '/pharmacie' },
  structure: { label: 'Structure de santé', icone: 'fa-hospital', route: '/structure-sante' },
  assurance: { label: 'Assurance', icone: 'fa-shield-heart', route: '/assurances' },
};

// ==================== HELPERS ====================

// Les 3 annuaires (médecin / pharmacie / structure / assurance)
// partagent le même triptyque de statuts (voir StructureSante.jsx,
// Pharmacie.jsx, Medecin.jsx, Assurances.jsx).
function compterStatuts(liste) {
  return {
    total: liste.length,
    publie: liste.filter((x) => x.statut_verification === 'publie').length,
    enCours: liste.filter((x) => x.statut_verification === 'en_cours').length,
    nonPublie: liste.filter((x) => x.statut_verification === 'non_publie').length,
  };
}

function formaterDate(valeur) {
  if (!valeur) return '—';
  try {
    return new Date(valeur).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formaterNombre(n) {
  return (n ?? 0).toLocaleString('fr-FR');
}

// ==================== SOUS-COMPOSANTS ====================

function KpiCard({ icon, tone, label, value, note }) {
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
        {note && (
          <div className="aps-kpi__trend muted">
            <span className="muted">{note}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingRow({ item }) {
  const type = TYPE_ANNUAIRE[item.type];
  return (
    <tr>
      <td>
        <div className="aps-avatar-cell">
          <div className="aps-kpi__icon is-primary" style={{ width: 36, height: 36, minWidth: 36, fontSize: 14 }}>
            <i className={`fa-solid ${type.icone}`}></i>
          </div>
          <div>
            <div className="cell-title">{item.nom || '—'}</div>
            <div className="cell-sub">{item.sousTitre || '—'}</div>
          </div>
        </div>
      </td>
      <td>{type.label}</td>
      <td>{[item.ville, item.pays].filter(Boolean).join(', ') || '—'}</td>
      <td>{formaterDate(item.date)}</td>
      <td>
        <span className="aps-badge is-warning">
          <i className="fa-solid fa-circle"></i>
          En cours
        </span>
      </td>
      <td className="text-end">
        <Link to={type.route} className="btn btn-sm btn-outline-primary">
          Examiner
        </Link>
      </td>
    </tr>
  );
}

function LoadingPlaceholder() {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--aps-primary)' }}></i>
      <p style={{ marginTop: '16px', color: 'var(--aps-text-500)' }}>Chargement du tableau de bord…</p>
    </div>
  );
}

// ==================== COMPOSANT PRINCIPAL ====================

export default function Dashboard() {
  const { user, status } = useAuth();

  // Extraire le prénom de différentes formes possibles (inchangé par
  // rapport à la version précédente : la forme exacte de `user` peut
  // varier selon ce que /auth/me renvoie réellement).
  const prenom = useMemo(() => {
    if (!user) return 'Utilisateur';
    if (user.prenom) return user.prenom;
    if (user.firstName) return user.firstName;
    if (user.first_name) return user.first_name;
    if (user.nom) return user.nom.split(' ')[0];
    if (user.name) return user.name.split(' ')[0];
    return 'Utilisateur';
  }, [user]);

  const [chargement, setChargement] = useState(true);
  const [sourcesEnErreur, setSourcesEnErreur] = useState([]);

  const [medecins, setMedecins] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [structures, setStructures] = useState([]);
  const [assurances, setAssurances] = useState([]);
  const [urgences, setUrgences] = useState([]);
  const [rendezVous, setRendezVous] = useState([]);
  const [statsUtilisateurs, setStatsUtilisateurs] = useState({ total: 0, actifs: 0, suspendus: 0 });

  // ==================== CHARGEMENT DES DONNÉES ====================

  useEffect(() => {
    let annule = false;

    async function chargerTout() {
      setChargement(true);

      const sources = [
        { cle: 'médecins', setter: setMedecins, promesse: listerMedecins({}) },
        { cle: 'pharmacies', setter: setPharmacies, promesse: listerPharmacies({}) },
        { cle: 'structures de santé', setter: setStructures, promesse: listerCentresSante({}) },
        { cle: 'assurances', setter: setAssurances, promesse: listerServicesAssurance({}) },
        { cle: 'urgences', setter: setUrgences, promesse: listerUrgences({}) },
        { cle: 'rendez-vous', setter: setRendezVous, promesse: listerRendezVous() },
      ];

      const resultats = await Promise.allSettled(sources.map((s) => s.promesse));
      if (annule) return;

      const echecs = [];
      resultats.forEach((resultat, index) => {
        const { cle, setter } = sources[index];
        if (resultat.status === 'fulfilled') {
          setter(Array.isArray(resultat.value) ? resultat.value : []);
        } else {
          echecs.push(cle);
          setter([]);
        }
      });

      // Comptes admin/superadmin : même technique que chargerStats()
      // dans Utilisateurs.jsx — `limite: 1` pour ne récupérer que le
      // total paginé, sans charger toute la liste.
      try {
        const [tousRes, actifsRes, suspendusRes] = await Promise.all([
          UtilisateurService.listerUtilisateurs({ limite: 1 }),
          UtilisateurService.listerUtilisateurs({ statut: 'actif', limite: 1 }),
          UtilisateurService.listerUtilisateurs({ statut: 'suspendu', limite: 1 }),
        ]);
        if (!annule) {
          setStatsUtilisateurs({
            total: tousRes.pagination.total,
            actifs: actifsRes.pagination.total,
            suspendus: suspendusRes.pagination.total,
          });
        }
      } catch {
        echecs.push('comptes administrateurs');
      }

      if (!annule) {
        setSourcesEnErreur(echecs);
        setChargement(false);
      }
    }

    chargerTout();
    return () => {
      annule = true;
    };
  }, []);

  // ==================== KPI CALCULÉS ====================

  const kpiMedecins = useMemo(() => compterStatuts(medecins), [medecins]);
  const kpiPharmacies = useMemo(() => compterStatuts(pharmacies), [pharmacies]);
  const kpiStructures = useMemo(() => compterStatuts(structures), [structures]);
  const kpiAssurances = useMemo(() => compterStatuts(assurances), [assurances]);

  const annuaire = useMemo(() => {
    const total = kpiMedecins.total + kpiPharmacies.total + kpiStructures.total + kpiAssurances.total;
    const totalPublies = kpiMedecins.publie + kpiPharmacies.publie + kpiStructures.publie + kpiAssurances.publie;
    const totalEnAttente = kpiMedecins.enCours + kpiPharmacies.enCours + kpiStructures.enCours + kpiAssurances.enCours;
    const totalNonPublies = kpiMedecins.nonPublie + kpiPharmacies.nonPublie + kpiStructures.nonPublie + kpiAssurances.nonPublie;
    return { total, totalPublies, totalEnAttente, totalNonPublies };
  }, [kpiMedecins, kpiPharmacies, kpiStructures, kpiAssurances]);

  const compteursRdv = useMemo(() => {
    const base = { total: rendezVous.length, aVenir: 0, honores: 0, contestes: 0, annules: 0 };
    const maintenant = Date.now();
    rendezVous.forEach((rdv) => {
      if (rdv.statut === 'honore') base.honores += 1;
      else if (rdv.statut === 'conteste') base.contestes += 1;
      else if (rdv.statut === 'annule') base.annules += 1;
      else if (new Date(rdv.date_creneau).getTime() > maintenant) base.aVenir += 1;
    });
    return base;
  }, [rendezVous]);

  // Fiches "en_cours" des 4 annuaires, réunies dans une seule liste
  // triée (date de soumission la plus récente d'abord quand elle est
  // connue, ordre alphabétique en repli).
  const fichesEnAttente = useMemo(() => {
    const items = [
      ...medecins
        .filter((m) => m.statut_verification === 'en_cours')
        .map((m) => ({
          type: 'medecin',
          id: `medecin-${m.medecin_id}`,
          nom: `Dr ${m.prenom || ''} ${m.nom || ''}`.trim(),
          sousTitre: m.specialite?.nom,
          ville: m.ville_exercice?.nom || m.ville?.nom,
          pays: m.pays_exercice?.nom || m.pays?.nom,
          date: m.date_creation,
        })),
      ...pharmacies
        .filter((p) => p.statut_verification === 'en_cours')
        .map((p) => ({
          type: 'pharmacie',
          id: `pharmacie-${p.pharmacie_id}`,
          nom: p.nom,
          sousTitre: p.numero_ordre_titulaire ? `N° ${p.numero_ordre_titulaire}` : null,
          ville: p.ville?.nom,
          pays: p.pays?.nom,
          date: p.date_creation,
        })),
      ...structures
        .filter((c) => c.statut_verification === 'en_cours')
        .map((c) => ({
          type: 'structure',
          id: `structure-${c.structure_id}`,
          nom: c.nom,
          sousTitre: c.type_structure,
          ville: c.ville?.nom,
          pays: c.pays?.nom,
          date: c.date_creation,
        })),
      ...assurances
        .filter((a) => a.statut_verification === 'en_cours')
        .map((a) => ({
          type: 'assurance',
          id: `assurance-${a.service_assurance_id}`,
          nom: a.nom,
          sousTitre: a.type_acteur,
          ville: a.ville?.nom,
          pays: a.pays?.nom,
          date: a.date_creation,
        })),
    ];

    items.sort((a, b) => {
      if (a.date && b.date) return new Date(b.date) - new Date(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return (a.nom || '').localeCompare(b.nom || '');
    });

    return items;
  }, [medecins, pharmacies, structures, assurances]);

  // ==================== GRAPHIQUE : répartition globale des statuts ====================

  const refGraphStatut = useRef(null);
  const instanceGraph = useRef(null);

  useEffect(() => {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = COULEURS_GRAPHIQUE.text500;
  }, []);

  useEffect(() => {
    if (!refGraphStatut.current || chargement) return;
    instanceGraph.current?.destroy();
    instanceGraph.current = new Chart(refGraphStatut.current, {
      type: 'doughnut',
      data: {
        labels: ['Publié', 'En cours', 'Non publié'],
        datasets: [
          {
            data: [annuaire.totalPublies, annuaire.totalEnAttente, annuaire.totalNonPublies],
            backgroundColor: ['rgba(27,138,75,0.85)', 'rgba(183,121,31,0.85)', 'rgba(229,72,77,0.85)'],
            borderColor: '#fff',
            borderWidth: 2,
          },
        ],
      },
      options: {
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 } },
        },
      },
    });
    return () => instanceGraph.current?.destroy();
  }, [annuaire, chargement]);

  // ==================== ALERTES DYNAMIQUES ====================
  // Contrairement à l'ancienne version (2 alertes statiques codées en
  // dur), cette liste est entièrement dérivée des compteurs réels
  // ci-dessus : elle ne montre que ce qui mérite effectivement une
  // action.

  const alertes = useMemo(() => {
    const liste = [];

    if (compteursRdv.contestes > 0) {
      liste.push({
        tone: 'is-danger',
        icon: 'fa-triangle-exclamation',
        texte: `${compteursRdv.contestes} rendez-vous contesté${compteursRdv.contestes > 1 ? 's' : ''} nécessite${
          compteursRdv.contestes > 1 ? 'nt' : ''
        } une revue.`,
      });
    }
    if (annuaire.totalEnAttente > 0) {
      liste.push({
        tone: 'is-warning',
        icon: 'fa-file-signature',
        texte: `${annuaire.totalEnAttente} fiche${
          annuaire.totalEnAttente > 1 ? 's' : ''
        } en attente de validation dans l'annuaire.`,
      });
    }
    if (statsUtilisateurs.suspendus > 0) {
      liste.push({
        tone: 'is-warning',
        icon: 'fa-user-lock',
        texte: `${statsUtilisateurs.suspendus} compte${statsUtilisateurs.suspendus > 1 ? 's' : ''} administrateur suspendu${
          statsUtilisateurs.suspendus > 1 ? 's' : ''
        }.`,
      });
    }
    if (sourcesEnErreur.length > 0) {
      liste.push({
        tone: 'is-danger',
        icon: 'fa-plug-circle-exclamation',
        texte: `Certaines données n'ont pas pu être chargées (${sourcesEnErreur.join(', ')}).`,
      });
    }
    if (liste.length === 0) {
      liste.push({ tone: 'is-info', icon: 'fa-circle-check', texte: "Aucune alerte en cours — tout est à jour." });
    }

    return liste;
  }, [compteursRdv, annuaire, statsUtilisateurs, sourcesEnErreur]);

  // Afficher un écran de chargement tant que l'authentification n'est pas vérifiée
  if (status === 'loading') {
    return <LoadingPlaceholder />;
  }

  return (
    <main className="aps-content">
      {/* ==================== EN-TÊTE ====================  */}
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Tableau de bord
          </div>
          <h1>Bon retour, {prenom}</h1>
        </div>
        <div className="d-flex gap-2">
          <Link to="/rendez-vous" className="btn btn-light">
            <i className="fa-solid fa-calendar-check me-2"></i>Rendez-vous
          </Link>
          <Link to="/utilisateurs" className="btn btn-primary">
            <i className="fa-solid fa-user-shield me-2"></i>Comptes admin
          </Link>
        </div>
      </div>

      {chargement ? (
        <LoadingPlaceholder />
      ) : (
        <>
          {/* ==================== KPI CARDS ====================  */}
          <div className="row g-3 mb-4">
            <KpiCard
              icon="fa-address-book"
              tone="is-primary"
              label="Fiches d'annuaire publiées"
              value={formaterNombre(annuaire.totalPublies)}
              note={`sur ${formaterNombre(annuaire.total)} au total`}
            />
            <KpiCard
              icon="fa-file-signature"
              tone="is-warning"
              label="En attente de validation"
              value={formaterNombre(annuaire.totalEnAttente)}
              note="médecins, pharmacies, structures, assurances"
            />
            <KpiCard
              icon="fa-calendar-check"
              tone="is-success"
              label="Rendez-vous à venir"
              value={formaterNombre(compteursRdv.aVenir)}
              note={`${formaterNombre(compteursRdv.total)} rendez-vous au total`}
            />
            <KpiCard
              icon="fa-triangle-exclamation"
              tone="is-danger"
              label="Rendez-vous contestés"
              value={formaterNombre(compteursRdv.contestes)}
              note="à examiner en priorité"
            />
          </div>

          {/* ==================== CONTENU PRINCIPAL ====================  */}
          <div className="row g-3">
            {/* Fiches à valider */}
            <div className="col-lg-8">
              <div className="aps-card">
                <div className="aps-card__header">
                  <h2>Fiches à valider</h2>
                  <span className="aps-badge is-warning">{fichesEnAttente.length} en attente</span>
                </div>

                {fichesEnAttente.length === 0 ? (
                  <div className="aps-card__body">
                    <p className="muted mb-0">Aucune fiche en attente de validation pour le moment.</p>
                  </div>
                ) : (
                  <div className="aps-table-wrap">
                    <table className="table aps-table">
                      <thead>
                        <tr>
                          <th>Professionnel / Structure</th>
                          <th>Type</th>
                          <th>Localisation</th>
                          <th>Soumis le</th>
                          <th>Statut</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fichesEnAttente.slice(0, 8).map((item) => (
                          <PendingRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {fichesEnAttente.length > 8 && (
                  <div className="aps-pagination">
                    <span>Affichage de 1 à 8 sur {fichesEnAttente.length}</span>
                  </div>
                )}
              </div>

              {/* Répartition par annuaire */}
              <div className="aps-card mt-3">
                <div className="aps-card__header">
                  <h2>Répartition par annuaire</h2>
                </div>
                <div className="aps-table-wrap">
                  <table className="table aps-table">
                    <thead>
                      <tr>
                        <th>Annuaire</th>
                        <th>Total</th>
                        <th>Publiés</th>
                        <th>En cours</th>
                        <th>Non publiés</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <i className="fa-solid fa-user-doctor me-2"></i>Médecins
                        </td>
                        <td>{kpiMedecins.total}</td>
                        <td>{kpiMedecins.publie}</td>
                        <td>{kpiMedecins.enCours}</td>
                        <td>{kpiMedecins.nonPublie}</td>
                      </tr>
                      <tr>
                        <td>
                          <i className="fa-solid fa-prescription-bottle-medical me-2"></i>Pharmacies
                        </td>
                        <td>{kpiPharmacies.total}</td>
                        <td>{kpiPharmacies.publie}</td>
                        <td>{kpiPharmacies.enCours}</td>
                        <td>{kpiPharmacies.nonPublie}</td>
                      </tr>
                      <tr>
                        <td>
                          <i className="fa-solid fa-hospital me-2"></i>Structures de santé
                        </td>
                        <td>{kpiStructures.total}</td>
                        <td>{kpiStructures.publie}</td>
                        <td>{kpiStructures.enCours}</td>
                        <td>{kpiStructures.nonPublie}</td>
                      </tr>
                      <tr>
                        <td>
                          <i className="fa-solid fa-shield-heart me-2"></i>Assurances
                        </td>
                        <td>{kpiAssurances.total}</td>
                        <td>{kpiAssurances.publie}</td>
                        <td>{kpiAssurances.enCours}</td>
                        <td>{kpiAssurances.nonPublie}</td>
                      </tr>
                      <tr>
                        <td>
                          <i className="fa-solid fa-truck-medical me-2"></i>Numéros d'urgence
                        </td>
                        <td colSpan={4}>{urgences.length} enregistré{urgences.length > 1 ? 's' : ''} (pas de workflow de publication)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="col-lg-4">
              <div className="aps-card mb-3">
                <div className="aps-card__header">
                  <h2>Alertes système</h2>
                </div>
                <div className="aps-card__body d-flex flex-column gap-2">
                  {alertes.map((a, i) => (
                    <div key={i} className={`aps-notice ${a.tone}`}>
                      <i className={`fa-solid ${a.icon}`}></i>
                      <div>{a.texte}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="aps-card mb-3">
                <div className="aps-card__header">
                  <h2>Comptes administrateurs</h2>
                </div>
                <div className="aps-card__body d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between">
                    <span className="muted">Total</span>
                    <strong>{formaterNombre(statsUtilisateurs.total)}</strong>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="muted">Actifs</span>
                    <strong>{formaterNombre(statsUtilisateurs.actifs)}</strong>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="muted">Suspendus</span>
                    <strong>{formaterNombre(statsUtilisateurs.suspendus)}</strong>
                  </div>
                  <Link to="/utilisateurs" className="btn btn-sm btn-light mt-2">
                    Gérer les comptes <i className="fa-solid fa-arrow-right ms-1"></i>
                  </Link>
                </div>
              </div>

              <div className="aps-card">
                <div className="aps-card__header">
                  <h2>Répartition des statuts</h2>
                </div>
                <div className="aps-card__body">
                  <canvas ref={refGraphStatut} height="220"></canvas>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}