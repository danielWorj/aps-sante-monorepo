// src/components/abonnements/StatistiquesFichePresence.jsx
//
// Statistiques de consultation d'une fiche (pharmacie, centre de santé,
// médecin), vues par son gestionnaire. Le serveur décide de ce qui est
// restitué selon l'abonnement : totaux (droit « statistiques ») et détail
// jour par jour (« statistiques détaillées »). Les vues sont comptées en
// permanence ; elles apparaissent dès que l'abonnement les inclut.
//
// « Visiteurs / jour » = somme des visiteurs uniques de chaque jour (une
// même personne revenue deux jours différents compte deux fois sur la
// période) : libellé et note explicites pour ne pas laisser croire à des
// personnes distinctes.
import { useEffect, useState } from 'react';
import { obtenirStatistiquesPresence } from '../../services/abonnementPresenceService';

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const jourCourt = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });

export default function StatistiquesFichePresence({ type, acteurId }) {
  const [stats, setStats] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    obtenirStatistiquesPresence(type, acteurId, 30)
      .then((d) => { if (!annule) { setStats(d); setErreur(null); } })
      .catch((err) => { if (!annule) setErreur(err?.message || 'Statistiques indisponibles.'); });
    return () => { annule = true; };
  }, [type, acteurId]);

  return (
    <div className="info-card mb-3">
      <h3><i className="fa-solid fa-chart-simple" /> Consultations de ma fiche</h3>
      {erreur && <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
      {!erreur && !stats && <p className="minimal-note">Chargement…</p>}
      {stats && !stats.disponible && (
        <p className="minimal-note mb-0">
          Les statistiques de consultation sont incluses avec un abonnement de présence. Les consultations de votre
          fiche sont déjà comptées : elles s&apos;afficheront ici dès la souscription.
        </p>
      )}
      {stats?.disponible && (
        <>
          <table className="hours-table" style={{ width: '100%' }}>
            <thead>
              <tr><th></th><th>Vues</th><th title="Visiteurs différents chaque jour, additionnés sur la période">Visiteurs / jour</th></tr>
            </thead>
            <tbody>
              <tr><td>7 derniers jours</td><td><strong>{nombre(stats.totaux.sept_jours.vues)}</strong></td><td>{nombre(stats.totaux.sept_jours.visiteurs)}</td></tr>
              <tr><td>30 derniers jours</td><td><strong>{nombre(stats.totaux.periode.vues)}</strong></td><td>{nombre(stats.totaux.periode.visiteurs)}</td></tr>
              <tr><td>Depuis le début</td><td>{nombre(stats.totaux.depuis_le_debut.vues)}</td><td>{nombre(stats.totaux.depuis_le_debut.visiteurs)}</td></tr>
            </tbody>
          </table>
          {stats.detaillees && stats.serie && (
            <details className="mt-2">
              <summary style={{ cursor: 'pointer', fontSize: '.9rem' }}>Détail des 14 derniers jours</summary>
              <table className="hours-table mt-2" style={{ width: '100%' }}>
                <tbody>
                  {stats.serie.slice(-14).reverse().map((j) => (
                    <tr key={j.jour}><td>{jourCourt(j.jour)}</td><td>{nombre(j.vues)} vue(s)</td><td>{nombre(j.visiteurs)} visiteur(s)</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <p className="minimal-note mt-2 mb-0">
            Une vue = un affichage de votre fiche détaillée (site ou application). Vos propres consultations, celles
            d&apos;ApSa et des robots ne sont pas comptées ; un même visiteur n&apos;est recompté qu&apos;après 30 minutes.
            « Visiteurs / jour » additionne les visiteurs différents de chaque jour : une personne revenue deux jours
            différents y compte deux fois.
          </p>
        </>
      )}
    </div>
  );
}
