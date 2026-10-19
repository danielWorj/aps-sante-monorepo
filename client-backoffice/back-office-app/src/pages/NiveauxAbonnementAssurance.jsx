// src/pages/NiveauxAbonnementAssurance.jsx
//
// Niveaux d'abonnement des assurances (guide abonnements v3, §3.1.1).
// C'est ici que l'admin « active les données envoyées ou non » au public :
// chaque case correspond à un drapeau lu par le serveur (resoudreDroits).
//   - actif = vendable ; décocher n'enlève RIEN aux abonnés en cours ;
//   - un rang supérieur doit inclure tous les avantages des rangs
//     inférieurs (vérifié aussi côté serveur) ;
//   - pas de prix ici : il vit dans la grille de tarifs ;
//   - avantages « réservés » : stockés, sans effet tant que les modèles de
//     données correspondants n'existent pas (phase 9).
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import {
  listerNiveaux,
  creerNiveau,
  modifierNiveau,
  DRAPEAUX_APPLIQUES,
  DRAPEAUX_RESERVES,
} from '../services/abonnementAssuranceService';

const VIDE = {
  code: '',
  libelle: '',
  rang: '',
  actif: true,
  siege_complet: true,
  afficher_activites: true,
  afficher_agences: true,
  formulaire_contact: true,
  suivi_demandes: true,
  video_presentation: false,
  vitrine_premium: false,
  stats_completes: false,
  export_stats: false,
  max_agences: '',
  max_photos: '',
  max_gestionnaires: '',
};

const QUOTAS = [
  ['max_agences', 'Agences', false],
  ['max_photos', 'Photos (médiathèque)', false],
  ['max_gestionnaires', 'Gestionnaires', true],
];

const quotaVersForm = (v) => (v === null || v === undefined ? '' : String(v));
const quotaVersApi = (v) => (v === '' ? null : Number(v));
const libelleQuota = (v) => (v === null || v === undefined ? 'illimité' : v);

export default function NiveauxAbonnementAssurance() {
  const [niveaux, setNiveaux] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const toast = useToast();
  const [form, setForm] = useState(null); // null = fermé ; { niveau_id?, ...champs }
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  // Pas de setState synchrone : appelée depuis un effet (react-hooks/set-state-in-effect).
  const charger = useCallback(
    () =>
      listerNiveaux()
        .then((n) => { setNiveaux(n); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'))
        .finally(() => setChargement(false)),
    []
  );
  useEffect(() => { charger(); }, [charger]);

  const ouvrir = (n) => {
    setErreurForm(null);
    setForm(
      n
        ? {
            ...VIDE,
            ...n,
            rang: String(n.rang),
            max_agences: quotaVersForm(n.max_agences),
            max_photos: quotaVersForm(n.max_photos),
            max_gestionnaires: quotaVersForm(n.max_gestionnaires),
          }
        : { ...VIDE, rang: String((niveaux.at(-1)?.rang ?? 0) + 1) }
    );
  };

  const maj = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    const donnees = {
      code: form.code.trim(),
      libelle: form.libelle.trim(),
      rang: Number(form.rang),
      actif: form.actif,
      ...Object.fromEntries([...DRAPEAUX_APPLIQUES, ...DRAPEAUX_RESERVES].map(([cle]) => [cle, !!form[cle]])),
      max_agences: quotaVersApi(form.max_agences),
      max_photos: quotaVersApi(form.max_photos),
      max_gestionnaires: quotaVersApi(form.max_gestionnaires),
    };
    try {
      if (form.niveau_id) {
        await modifierNiveau(form.niveau_id, donnees);
        toast.succes(`Niveau « ${donnees.libelle} » mis à jour.`);
      } else {
        await creerNiveau(donnees);
        toast.succes(`Niveau « ${donnees.libelle} » créé.`);
      }
      setForm(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Assurances <span className="sep">/</span> Niveaux d&apos;abonnement</div>
          <h1>Niveaux d&apos;abonnement</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => { setChargement(true); charger(); }} disabled={chargement}><i className="fa-solid fa-rotate me-2"></i>Actualiser</button>
          <button className="btn btn-primary" onClick={() => ouvrir(null)}><i className="fa-solid fa-plus me-2"></i>Nouveau niveau</button>
        </div>
      </div>

      <div className="alert alert-info">
        Chaque case cochée est une donnée <strong>envoyée au public</strong> pour les fiches abonnées à ce niveau.
        Sans abonnement, une fiche n&apos;affiche que sa dénomination, son type et sa localisation.
        Un niveau de rang supérieur doit inclure tous les avantages des rangs inférieurs. Les prix se saisissent
        dans « Tarifs ».
      </div>
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      <div className="aps-card">
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Rang</th><th>Niveau</th><th>Avantages</th><th>Quotas</th><th>Vente</th><th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={6}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : niveaux.length === 0 ? (
                <tr><td colSpan={6}><div className="aps-empty-mini">Aucun niveau. Créez au moins un niveau avant de saisir des tarifs.</div></td></tr>
              ) : niveaux.map((n) => (
                <tr key={n.niveau_id}>
                  <td>{n.rang}</td>
                  <td><strong>{n.libelle}</strong><div className="small aps-text-muted">{n.code}</div></td>
                  <td className="small">
                    {DRAPEAUX_APPLIQUES.filter(([cle]) => n[cle]).map(([, l]) => l).join(' · ') || '—'}
                    {DRAPEAUX_RESERVES.some(([cle]) => n[cle]) && (
                      <div className="aps-text-muted">Réservés : {DRAPEAUX_RESERVES.filter(([cle]) => n[cle]).map(([, l]) => l).join(', ')}</div>
                    )}
                  </td>
                  <td className="small">Agences : {libelleQuota(n.max_agences)}</td>
                  <td>
                    <span className={`aps-badge ${n.actif ? 'is-success' : 'is-neutral'}`}>{n.actif ? 'En vente' : 'Retiré de la vente'}</span>
                  </td>
                  <td className="text-end"><button className="btn btn-sm btn-light" onClick={() => ouvrir(n)}><i className="fa-solid fa-pen"></i></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FondsModal
        titre={form?.niveau_id ? 'Modifier le niveau' : 'Nouveau niveau'}
        ouvert={!!form}
        occupe={envoi}
        onFermer={() => setForm(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-niveau" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer
            </button>
          </>
        }
      >
        {form && (
          <form id="form-niveau" onSubmit={enregistrer}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
            <div className="row g-2 mb-3">
              <div className="col-4">
                <label className="form-label" htmlFor="niv-code">Code</label>
                <input id="niv-code" className="form-control" required value={form.code} placeholder="enrichie"
                  onChange={(e) => maj('code', e.target.value)} />
              </div>
              <div className="col-5">
                <label className="form-label" htmlFor="niv-libelle">Libellé</label>
                <input id="niv-libelle" className="form-control" required value={form.libelle}
                  onChange={(e) => maj('libelle', e.target.value)} />
              </div>
              <div className="col-3">
                <label className="form-label" htmlFor="niv-rang">Rang</label>
                <input id="niv-rang" type="number" min="1" step="1" className="form-control" required value={form.rang}
                  onChange={(e) => maj('rang', e.target.value)} />
              </div>
            </div>
            <div className="form-check form-switch mb-3">
              <input id="niv-actif" type="checkbox" className="form-check-input" checked={form.actif}
                onChange={(e) => maj('actif', e.target.checked)} />
              <label className="form-check-label" htmlFor="niv-actif">En vente (n&apos;affecte pas les abonnés en cours)</label>
            </div>

            <h6>Données envoyées au public</h6>
            {DRAPEAUX_APPLIQUES.map(([cle, libelle]) => (
              <div className="form-check" key={cle}>
                <input id={`niv-${cle}`} type="checkbox" className="form-check-input" checked={!!form[cle]}
                  onChange={(e) => maj(cle, e.target.checked)} />
                <label className="form-check-label" htmlFor={`niv-${cle}`}>{libelle}</label>
              </div>
            ))}
            <h6 className="mt-3">Réservés <small className="aps-text-muted">(stockés, sans effet pour l&apos;instant)</small></h6>
            {DRAPEAUX_RESERVES.map(([cle, libelle]) => (
              <div className="form-check" key={cle}>
                <input id={`niv-${cle}`} type="checkbox" className="form-check-input" checked={!!form[cle]}
                  onChange={(e) => maj(cle, e.target.checked)} />
                <label className="form-check-label" htmlFor={`niv-${cle}`}>{libelle}</label>
              </div>
            ))}

            <h6 className="mt-3">Quotas <small className="aps-text-muted">(vide = illimité)</small></h6>
            <div className="row g-2">
              {QUOTAS.map(([cle, libelle, reserve]) => (
                <div className="col-4" key={cle}>
                  <label className="form-label" htmlFor={`niv-${cle}`}>{libelle}{reserve && ' (réservé)'}</label>
                  <input id={`niv-${cle}`} type="number" min="0" step="1" className="form-control" value={form[cle]}
                    placeholder="illimité" onChange={(e) => maj(cle, e.target.value)} />
                </div>
              ))}
            </div>
          </form>
        )}
      </FondsModal>
    </main>
  );
}
