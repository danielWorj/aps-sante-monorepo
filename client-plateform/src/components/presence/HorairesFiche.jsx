// HorairesFiche.jsx — horaires d'ouverture d'une pharmacie ou d'un centre de
// santé sur sa fiche publique (toujours publics, quel que soit l'abonnement).
// `fiche.horaires` : { lundi: [{ debut, fin }], … } ou null (non renseignés) ;
// `fiche.ouverture` : état calculé par le serveur à l'heure du pays de la
// fiche (lib/horairesFiche.js).
import { JOURS_SEMAINE, libelleOuverture, plagesEnTexte } from '../../services/espacePresenceService';

// Jour courant (lundi = 0) du navigateur : sert seulement à surligner la ligne.
const indexAujourdhui = () => (new Date().getDay() + 6) % 7;

/** Pastille « Ouvert · ferme à 19:00 » / « Fermé · ouvre lundi à 08:00 ». */
export function StatutOuverture({ fiche }) {
  const libelle = libelleOuverture(fiche.ouverture);
  if (!libelle) return null;
  return (
    <span className={`chip ${fiche.ouverture.ouvert ? 'chip-verifie' : 'chip-st-annule'}`}>
      <i className="fa-solid fa-clock" /> {libelle}
    </span>
  );
}

export default function HorairesFiche({ fiche }) {
  const aujourdhui = indexAujourdhui();
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-clock" /> Horaires d&apos;ouverture</h3>
      {fiche.urgences_24h && (
        <p className="mb-2"><span className="chip chip-verifie"><i className="fa-solid fa-truck-medical" /> Urgences 24 h/24, 7 j/7</span></p>
      )}
      {!fiche.horaires ? (
        <p className="minimal-note mb-0">Horaires non renseignés. Renseignez-vous auprès de l&apos;établissement avant de vous déplacer.</p>
      ) : (
        <>
          <table className="hours-table" style={{ width: '100%' }}>
            <tbody>
              {JOURS_SEMAINE.map(([jour, nom], i) => (
                <tr key={jour} style={i === aujourdhui ? { fontWeight: 600 } : undefined}>
                  <td>{nom}{i === aujourdhui ? " (aujourd'hui)" : ''}</td>
                  <td>{plagesEnTexte(fiche.horaires[jour])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fiche.horaires_note && <p className="minimal-note mt-2 mb-0">{fiche.horaires_note}</p>}
        </>
      )}
    </div>
  );
}
