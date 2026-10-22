// laboratoire-examens.jsx — portail laboratoire, « Examens ».
//
// Catalogue des examens proposés : nom, catégorie, prix indicatif (devise
// du pays ; vide = « sur demande »), délai de résultat, préparation,
// description, disponibilité. Un examen indisponible reste enregistré mais
// n'apparaît plus sur la fiche publique.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { LaboratoirePortailPage } from '../layouts/laboratoire.portail-sidebar';
import {
  creerExamen,
  formaterPrix,
  modifierExamen,
  obtenirGestionLaboratoire,
  supprimerExamen,
} from '../../../services/laboratoireService';

const VIDE = { nom: '', categorie: '', prix: '', delai_resultat: '', preparation: '', description: '', disponible: true };
const CATEGORIES_SUGGEREES = ['Hématologie', 'Biochimie', 'Immunologie', 'Sérologie', 'Microbiologie', 'Parasitologie', 'Hormonologie', 'Urines', 'Bilans'];

function FormulaireExamen({ initial, devise, categories, onAnnuler, onEnregistrer }) {
  const [form, setForm] = useState(() => (initial
    ? { ...VIDE, ...initial, prix: initial.prix ?? '', categorie: initial.categorie ?? '', delai_resultat: initial.delai_resultat ?? '', preparation: initial.preparation ?? '', description: initial.description ?? '' }
    : VIDE));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await onEnregistrer({
        nom: form.nom.trim(),
        categorie: form.categorie.trim(),
        prix: form.prix === '' ? null : form.prix,
        delai_resultat: form.delai_resultat.trim(),
        preparation: form.preparation.trim(),
        description: form.description.trim(),
        disponible: form.disponible,
      });
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
      setEnvoi(false);
    }
  };

  return (
    <form className="info-card" onSubmit={valider}>
      <h3><i className="fa-solid fa-vial" /> {initial ? "Modifier l'examen" : 'Nouvel examen'}</h3>
      <div className="row g-3">
        <div className="col-md-7">
          <label className="form-label" htmlFor="ex-nom">Nom de l&apos;examen</label>
          <input id="ex-nom" className="form-control" required maxLength={200} value={form.nom} onChange={maj('nom')} placeholder="Ex. Numération formule sanguine (NFS)" />
        </div>
        <div className="col-md-5">
          <label className="form-label" htmlFor="ex-cat">Catégorie</label>
          <input id="ex-cat" className="form-control" list="ex-categories" maxLength={100} value={form.categorie} onChange={maj('categorie')} placeholder="Ex. Hématologie" />
          <datalist id="ex-categories">
            {[...new Set([...categories, ...CATEGORIES_SUGGEREES])].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="ex-prix">Prix indicatif {devise ? `(${devise})` : ''}</label>
          <input id="ex-prix" type="number" min={0} step="any" className="form-control" value={form.prix} onChange={maj('prix')} placeholder="Vide = sur demande" />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="ex-delai">Délai de résultat</label>
          <input id="ex-delai" className="form-control" maxLength={100} value={form.delai_resultat} onChange={maj('delai_resultat')} placeholder="Ex. 24 h, le jour même" />
        </div>
        <div className="col-md-4 d-flex align-items-end">
          <div className="form-check form-switch mb-2">
            <input id="ex-dispo" type="checkbox" role="switch" className="form-check-input" checked={form.disponible} onChange={maj('disponible')} />
            <label className="form-check-label" htmlFor="ex-dispo">Disponible</label>
          </div>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="ex-prep">Préparation du patient</label>
          <input id="ex-prep" className="form-control" maxLength={2000} value={form.preparation} onChange={maj('preparation')} placeholder="Ex. À jeun depuis 12 h, ordonnance requise" />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="ex-desc">Description</label>
          <textarea id="ex-desc" className="form-control" rows={2} maxLength={4000} value={form.description} onChange={maj('description')} />
        </div>
      </div>
      {erreur && <div className="alert alert-danger mt-3 mb-0">{erreur}</div>}
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button type="button" className="btn btn-ghost btn-sm-aps" onClick={onAnnuler}>Annuler</button>
        <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

export default function LaboratoireExamens() {
  const { laboratoireId } = useOutletContext();
  const confirmer = useConfirmation();
  const toast = useToast();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [edition, setEdition] = useState(null); // null | 'nouveau' | examen
  const [recherche, setRecherche] = useState('');

  const charger = useCallback(
    () => obtenirGestionLaboratoire(laboratoireId)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err?.message || 'Examens indisponibles.')),
    [laboratoireId]
  );
  useEffect(() => { charger(); }, [charger]);

  const examens = useMemo(() => {
    const liste = donnees?.examens ?? [];
    const t = recherche.trim().toLowerCase();
    return t ? liste.filter((e) => e.nom.toLowerCase().includes(t) || e.categorie?.toLowerCase().includes(t)) : liste;
  }, [donnees, recherche]);
  const categories = useMemo(() => [...new Set((donnees?.examens ?? []).map((e) => e.categorie).filter(Boolean))], [donnees]);
  const devise = donnees?.laboratoire?.devise;

  const enregistrer = async (valeurs) => {
    if (edition === 'nouveau') await creerExamen(laboratoireId, valeurs);
    else await modifierExamen(edition.examen_id, valeurs);
    toast.succes(edition === 'nouveau' ? 'Examen ajouté.' : 'Examen mis à jour.');
    setEdition(null);
    charger();
  };

  const basculer = async (examen) => {
    try {
      await modifierExamen(examen.examen_id, { disponible: !examen.disponible });
      charger();
    } catch (err) {
      toast.erreur(err?.message || 'Modification impossible.');
    }
  };

  const supprimer = async (examen) => {
    const ok = await confirmer({
      titre: "Supprimer l'examen",
      message: `« ${examen.nom} » sera retiré définitivement de votre catalogue.`,
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerExamen(examen.examen_id);
      toast.succes('Examen supprimé.');
      charger();
    } catch (err) {
      toast.erreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <LaboratoirePortailPage
      titre="Examens"
      description="Les analyses que vous proposez, avec leurs tarifs indicatifs et délais de résultat."
      actions={edition ? null : (
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setEdition('nouveau')} disabled={!donnees}>
          <i className="fa-solid fa-plus" /> Ajouter un examen
        </button>
      )}
    >
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && (
        <div className="d-flex flex-column gap-4">
          {edition && (
            <FormulaireExamen
              key={edition === 'nouveau' ? 'nouveau' : edition.examen_id}
              initial={edition === 'nouveau' ? null : edition}
              devise={devise}
              categories={categories}
              onAnnuler={() => setEdition(null)}
              onEnregistrer={enregistrer}
            />
          )}
          <div className="info-card">
            <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
              <h3 className="mb-0"><i className="fa-solid fa-vials" /> Catalogue ({donnees.examens.length})</h3>
              {donnees.examens.length > 5 && (
                <input className="form-control form-control-sm" style={{ maxWidth: 240 }} placeholder="Filtrer…" value={recherche}
                  onChange={(e) => setRecherche(e.target.value)} aria-label="Filtrer les examens" />
              )}
            </div>
            {donnees.examens.length === 0 ? (
              <div className="aps-empty-state">
                <i className="fa-solid fa-vials"></i>
                <div>Aucun examen. Ajoutez vos analyses pour qu&apos;elles apparaissent sur votre fiche publique.</div>
              </div>
            ) : examens.map((e) => (
              <div key={e.examen_id} className={`labo-ligne ${e.disponible ? '' : 'is-indisponible'}`}>
                <div className="min-w-0">
                  <div>
                    <strong>{e.nom}</strong>
                    {e.categorie && <span className="chip chip-complet ms-2">{e.categorie}</span>}
                    {!e.disponible && <span className="chip chip-st-annule ms-2">Indisponible</span>}
                  </div>
                  <div className="practitioner-meta mt-1">
                    <span><i className="fa-solid fa-tag" /> {formaterPrix(e.prix, devise)}</span>
                    {e.delai_resultat && <span><i className="fa-regular fa-clock" /> {e.delai_resultat}</span>}
                    {e.preparation && <span><i className="fa-solid fa-circle-exclamation" /> {e.preparation}</span>}
                  </div>
                </div>
                <div className="labo-ligne-actions">
                  <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => basculer(e)}
                    aria-label={e.disponible ? 'Marquer indisponible' : 'Marquer disponible'} title={e.disponible ? 'Marquer indisponible' : 'Marquer disponible'}>
                    <i className={`fa-solid ${e.disponible ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => setEdition(e)} aria-label="Modifier" title="Modifier">
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => supprimer(e)} aria-label="Supprimer" title="Supprimer">
                    <i className="fa-solid fa-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </LaboratoirePortailPage>
  );
}
