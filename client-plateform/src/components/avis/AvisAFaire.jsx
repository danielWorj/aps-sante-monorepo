// AvisAFaire.jsx — espace patient : consultations terminées encore à noter
// (GET /avis-medecin/a-donner). Rien n'est affiché s'il n'y en a aucune.
import { useCallback, useEffect, useState } from 'react';
import ModaleAvis from './ModaleAvis';
import { listerConsultationsANoter } from '../../services/reputationMedecinService';
import { useToast } from '../feedback';

export default function AvisAFaire() {
  const toast = useToast();
  const [consultations, setConsultations] = useState([]);
  const [ouverte, setOuverte] = useState(null);

  const charger = useCallback(
    () => listerConsultationsANoter().then((d) => setConsultations(d?.consultations ?? [])).catch(() => {}),
    []
  );
  useEffect(() => { charger(); }, [charger]);

  if (!consultations.length) return null;

  return (
    <section className="avis-a-faire" aria-labelledby="avis-a-faire-titre">
      <div className="aaf-entete">
        <div className="aaf-icone"><i className="fa-solid fa-star" /></div>
        <div>
          <h2 id="avis-a-faire-titre">Comment se sont passées vos consultations ?</h2>
          <p>Votre avis aide les autres patients à choisir, et votre médecin à progresser.</p>
        </div>
      </div>
      <ul className="aaf-liste">
        {consultations.map((c) => {
          const u = c.medecin?.utilisateur;
          const nom = `Dr ${[u?.prenom, u?.nom].filter(Boolean).join(' ')}`;
          return (
            <li key={c.rdv_id} className="aaf-item">
              <div className="aaf-medecin">
                {c.medecin?.photo_url ? (
                  <img src={c.medecin.photo_url} alt="" className="aaf-photo" />
                ) : (
                  <div className="aaf-photo is-initiales" aria-hidden="true">{(u?.prenom?.[0] ?? '') + (u?.nom?.[0] ?? '')}</div>
                )}
                <div className="min-w-0">
                  <strong className="d-block text-truncate">{nom}</strong>
                  <span className="text-faint small">
                    {c.medecin?.specialite?.nom ? `${c.medecin.specialite.nom} · ` : ''}
                    {new Date(c.date_creneau).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setOuverte(c)}>
                <i className="fa-regular fa-star" /> Noter
              </button>
            </li>
          );
        })}
      </ul>

      {ouverte && (
        <ModaleAvis
          consultation={ouverte}
          onClose={() => setOuverte(null)}
          onDepose={(r) => {
            setOuverte(null);
            toast.succes(r?.message || 'Merci pour votre avis !');
            setConsultations((l) => l.filter((x) => x.rdv_id !== ouverte.rdv_id));
          }}
        />
      )}
    </section>
  );
}
