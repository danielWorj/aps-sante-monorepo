// src/components/assurances/gestion/ActivitesAssurance.jsx
//
// Activités (produits) d'une fiche assurance et leurs options : ajout,
// modification en place, suppression. Le serveur refuse de supprimer une
// activité qui porte encore des options (409) : on supprime d'abord ses
// options, après confirmation. Les activités sont conservées hors droits.
import { useState } from 'react';
import { useConfirmation, useToast } from '../../feedback';
import {
  creerActivite,
  modifierActivite,
  supprimerActivite,
  creerOptionActivite,
  supprimerOptionActivite,
} from '../../../services/assuranceService';

const VIDE = { titre: '', public_cible: '', description: '' };

function ChampsActivite({ valeur, onChange }) {
  return (
    <>
      <div className="col-md-4">
        <input className="form-control" placeholder="Titre (ex. Santé Famille)" required maxLength={200}
          value={valeur.titre} onChange={(e) => onChange({ ...valeur, titre: e.target.value })} aria-label="Titre" />
      </div>
      <div className="col-md-3">
        <input className="form-control" placeholder="Public cible" required maxLength={200}
          value={valeur.public_cible} onChange={(e) => onChange({ ...valeur, public_cible: e.target.value })} aria-label="Public cible" />
      </div>
      <div className="col-md-3">
        <input className="form-control" placeholder="Description (facultatif)"
          value={valeur.description ?? ''} onChange={(e) => onChange({ ...valeur, description: e.target.value })} aria-label="Description" />
      </div>
    </>
  );
}

function OptionsActivite({ activite, executer }) {
  const [libelle, setLibelle] = useState('');

  const ajouter = async (e) => {
    e.preventDefault();
    if (!libelle.trim()) return;
    if (await executer(() => creerOptionActivite({ activite_id: activite.activite_id, libelle: libelle.trim() }), "Impossible d'ajouter l'option.")) {
      setLibelle('');
    }
  };

  return (
    <div className="ms-3 mt-2">
      <div className="d-flex flex-wrap gap-1 mb-2">
        {(activite.options ?? []).map((o) => (
          <span key={o.option_activite_id} className="chip">
            {o.libelle}
            <button type="button" className="btn btn-link btn-sm p-0 ms-1" aria-label={`Retirer l'option ${o.libelle}`}
              onClick={() => executer(() => supprimerOptionActivite(o.option_activite_id), 'Suppression impossible.')}>
              <i className="fa-solid fa-xmark" />
            </button>
          </span>
        ))}
        {!activite.options?.length && <span className="minimal-note">Aucune option.</span>}
      </div>
      <form onSubmit={ajouter} className="d-flex gap-2" style={{ maxWidth: 420 }}>
        <input className="form-control form-control-sm" placeholder="Nouvelle option (ex. Hospitalisation)" maxLength={150}
          value={libelle} onChange={(e) => setLibelle(e.target.value)} aria-label="Nouvelle option" />
        <button type="submit" className="btn btn-outline-primary btn-sm-aps" aria-label="Ajouter l'option">
          <i className="fa-solid fa-plus" />
        </button>
      </form>
    </div>
  );
}

/**
 * @param {{ serviceId: string, activites: object[], visiblesAuPublic: boolean, onChange: () => void }} props
 */
export default function ActivitesAssurance({ serviceId, activites, visiblesAuPublic, onChange }) {
  const confirmer = useConfirmation();
  const toast = useToast();
  const [form, setForm] = useState(VIDE);
  const [edition, setEdition] = useState(null);
  const [ouverte, setOuverte] = useState(null); // activite_id dont les options sont dépliées
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

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
    if (await executer(() => creerActivite({ service_assurance_id: serviceId, ...form }), "Impossible d'ajouter l'activité.")) {
      setForm(VIDE);
    }
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    const { activite_id, titre, public_cible, description } = edition;
    if (await executer(() => modifierActivite(activite_id, { titre, public_cible, description }), 'Modification impossible.')) {
      setEdition(null);
    }
  };

  const retirer = async (a) => {
    const nb = a.options?.length ?? 0;
    const ok = await confirmer({
      titre: "Supprimer l'activité",
      message: nb
        ? `« ${a.titre} » et ses ${nb} option(s) seront supprimées définitivement.`
        : `« ${a.titre} » sera supprimée définitivement.`,
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    const supprimee = await executer(async () => {
      for (const o of a.options ?? []) await supprimerOptionActivite(o.option_activite_id);
      await supprimerActivite(a.activite_id);
    }, 'Suppression impossible.');
    if (supprimee) toast.succes('Activité supprimée.');
  };

  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-file-shield" /> Activités &amp; produits</h3>
      {!visiblesAuPublic && activites.length > 0 && (
        <p className="minimal-note">
          <i className="fa-solid fa-eye-slash" /> Vos activités sont conservées mais ne sont pas visibles du public avec votre abonnement actuel.
        </p>
      )}
      <ul className="list-unstyled mb-3">
        {activites.map((a) => (
          <li key={a.activite_id} className="py-2 border-bottom" style={{ fontSize: '.9rem' }}>
            {edition?.activite_id === a.activite_id ? (
              <form onSubmit={enregistrer} className="row g-2 align-items-center">
                <ChampsActivite valeur={edition} onChange={setEdition} />
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
              <>
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <span>
                    <strong>{a.titre}</strong> — {a.public_cible}
                    {a.description ? <span className="text-faint"> · {a.description}</span> : null}
                  </span>
                  <span className="d-flex gap-1 flex-none">
                    <button type="button" className="btn btn-ghost btn-sm-aps" aria-expanded={ouverte === a.activite_id}
                      onClick={() => setOuverte((o) => (o === a.activite_id ? null : a.activite_id))}>
                      <i className="fa-solid fa-list-check" /> Options ({a.options?.length ?? 0})
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm-aps" aria-label={`Modifier ${a.titre}`}
                      onClick={() => setEdition({ activite_id: a.activite_id, titre: a.titre, public_cible: a.public_cible, description: a.description ?? '' })}>
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => retirer(a)} aria-label={`Supprimer ${a.titre}`}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </span>
                </div>
                {ouverte === a.activite_id && <OptionsActivite activite={a} executer={executer} />}
              </>
            )}
          </li>
        ))}
        {!activites.length && <li className="minimal-note">Aucune activité.</li>}
      </ul>
      <form onSubmit={ajouter} className="row g-2">
        <ChampsActivite valeur={form} onChange={setForm} />
        <div className="col-md-2">
          <button type="submit" className="btn btn-primary w-100" disabled={envoi}>
            <i className="fa-solid fa-plus" /> Ajouter
          </button>
        </div>
      </form>
      {erreur && <p className="status-card-error mt-2"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
    </div>
  );
}
