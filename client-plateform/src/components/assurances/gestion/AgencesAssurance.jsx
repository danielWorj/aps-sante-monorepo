// src/components/assurances/gestion/AgencesAssurance.jsx
//
// Agences d'une fiche assurance : liste, ajout (dans la limite du quota de
// l'abonnement), modification en place, suppression. Les agences sont
// conservées hors droits et réapparaissent au public à la réactivation.
import { useState } from 'react';
import { creerAgence, modifierAgence, supprimerAgence } from '../../../services/assuranceService';

const VIDE = { libelle: '', localisation: '', contact: '' };

function ChampsAgence({ valeur, onChange }) {
  return (
    <>
      <div className="col-md-4">
        <input className="form-control" placeholder="Libellé (ex. Agence Akwa)" required maxLength={150}
          value={valeur.libelle} onChange={(e) => onChange({ ...valeur, libelle: e.target.value })} aria-label="Libellé" />
      </div>
      <div className="col-md-4">
        <input className="form-control" placeholder="Localisation" required maxLength={255}
          value={valeur.localisation} onChange={(e) => onChange({ ...valeur, localisation: e.target.value })} aria-label="Localisation" />
      </div>
      <div className="col-md-2">
        <input className="form-control" placeholder="Contact" required maxLength={20}
          value={valeur.contact} onChange={(e) => onChange({ ...valeur, contact: e.target.value })} aria-label="Contact" />
      </div>
    </>
  );
}

/**
 * @param {{ serviceId: string, agences: object[], quota: { utilise: number, max: number|null },
 *   visiblesAuPublic: boolean, onChange: () => void }} props
 */
export default function AgencesAssurance({ serviceId, agences, quota, visiblesAuPublic, onChange }) {
  const [form, setForm] = useState(VIDE);
  const [edition, setEdition] = useState(null); // { agence_id, libelle, localisation, contact }
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const plafond = quota.max !== null && quota.utilise >= quota.max;

  const executer = async (action, messageErreur) => {
    setErreur(null);
    setEnvoi(true);
    try {
      await action();
      onChange();
      return true;
    } catch (err) {
      setErreur(err?.message || messageErreur);
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  const ajouter = async (e) => {
    e.preventDefault();
    if (await executer(() => creerAgence({ service_assurance_id: serviceId, ...form }), "Impossible d'ajouter l'agence.")) {
      setForm(VIDE);
    }
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    const { agence_id, libelle, localisation, contact } = edition;
    if (await executer(() => modifierAgence(agence_id, { libelle, localisation, contact }), 'Modification impossible.')) {
      setEdition(null);
    }
  };

  const retirer = (id) => {
    if (!window.confirm('Supprimer cette agence ?')) return;
    executer(() => supprimerAgence(id), 'Suppression impossible.');
  };

  return (
    <div className="info-card">
      <h3>
        <i className="fa-solid fa-shop" /> Agences{' '}
        <small className="text-faint">
          ({quota.utilise} / {quota.max === null ? 'illimité' : quota.max})
        </small>
      </h3>
      {!visiblesAuPublic && agences.length > 0 && (
        <p className="minimal-note">
          <i className="fa-solid fa-eye-slash" /> Vos agences sont conservées mais ne sont pas visibles du public avec votre abonnement actuel.
        </p>
      )}
      <ul className="list-unstyled mb-3">
        {agences.map((a) => (
          <li key={a.agence_id} className="py-2 border-bottom" style={{ fontSize: '.9rem' }}>
            {edition?.agence_id === a.agence_id ? (
              <form onSubmit={enregistrer} className="row g-2 align-items-center">
                <ChampsAgence valeur={edition} onChange={setEdition} />
                <div className="col-md-2 d-flex gap-1">
                  <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi} aria-label="Enregistrer">
                    <i className="fa-solid fa-check" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => setEdition(null)} aria-label="Annuler">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="d-flex justify-content-between align-items-center gap-2">
                <span><strong>{a.libelle}</strong> — {a.localisation} · {a.contact}</span>
                <span className="d-flex gap-1 flex-none">
                  <button type="button" className="btn btn-ghost btn-sm-aps" aria-label={`Modifier ${a.libelle}`}
                    onClick={() => setEdition({ agence_id: a.agence_id, libelle: a.libelle, localisation: a.localisation, contact: a.contact })}>
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => retirer(a.agence_id)} aria-label={`Supprimer ${a.libelle}`}>
                    <i className="fa-solid fa-trash" />
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
        {!agences.length && <li className="minimal-note">Aucune agence.</li>}
      </ul>
      {plafond ? (
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" />{' '}
          {quota.max === 0
            ? 'Activez un abonnement incluant les agences pour en ajouter.'
            : "Vous avez atteint le nombre maximal d'agences de votre niveau."}
        </p>
      ) : (
        <form onSubmit={ajouter} className="row g-2">
          <ChampsAgence valeur={form} onChange={setForm} />
          <div className="col-md-2">
            <button type="submit" className="btn btn-primary w-100" disabled={envoi}>
              <i className="fa-solid fa-plus" /> Ajouter
            </button>
          </div>
        </form>
      )}
      {erreur && <p className="status-card-error mt-2"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
    </div>
  );
}
