// structure-prestations.jsx — portail centre de santé, « Prestations ».
//
// Actes, consultations et examens réalisés par la structure (onglet
// « Examens » de la fiche publique) : nom, catégorie, prix indicatif (devise
// du pays ; vide = « sur demande »), description, disponibilité. Visibles du
// public avec un abonnement qui inclut les contenus enrichis ; une prestation
// indisponible reste enregistrée mais n'apparaît plus sur la fiche.
import { useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import {
  creerPrestation,
  formaterPrixPrestation,
  listerPrestationsGestion,
  modifierPrestation,
  supprimerPrestation,
} from '../../../services/espacePresenceService';
import { BandeauMasque, EtatChargement } from './presenceCommun';
import { useRessource } from './presenceOutils';

const VIDE = { nom: '', categorie: '', prix: '', description: '', disponible: true };
const CATEGORIES_SUGGEREES = ['Consultations', 'Imagerie', 'Biologie', 'Maternité', 'Pédiatrie', 'Chirurgie', 'Soins infirmiers', 'Vaccination', 'Urgences', 'Dentaire'];

function FormulairePrestation({ initial, devise, categories, onAnnuler, onEnregistrer }) {
  const [form, setForm] = useState(() => (initial
    ? { ...VIDE, ...initial, prix: initial.prix ?? '', categorie: initial.categorie ?? '', description: initial.description ?? '' }
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
      <h3><i className="fa-solid fa-file-waveform" /> {initial ? 'Modifier la prestation' : 'Nouvelle prestation'}</h3>
      <div className="row g-3">
        <div className="col-md-7">
          <label className="form-label" htmlFor="pr-nom">Nom</label>
          <input id="pr-nom" className="form-control" required maxLength={200} value={form.nom} onChange={maj('nom')} placeholder="Ex. Échographie obstétricale" />
        </div>
        <div className="col-md-5">
          <label className="form-label" htmlFor="pr-cat">Catégorie</label>
          <input id="pr-cat" className="form-control" list="pr-categories" maxLength={100} value={form.categorie} onChange={maj('categorie')} placeholder="Ex. Imagerie" />
          <datalist id="pr-categories">
            {[...new Set([...categories, ...CATEGORIES_SUGGEREES])].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="pr-prix">Prix indicatif {devise ? `(${devise})` : ''}</label>
          <input id="pr-prix" type="number" min={0} step="any" className="form-control" value={form.prix} onChange={maj('prix')} placeholder="Vide = sur demande" />
        </div>
        <div className="col-md-8 d-flex align-items-end">
          <div className="form-check form-switch mb-2">
            <input id="pr-dispo" type="checkbox" role="switch" className="form-check-input" checked={form.disponible} onChange={maj('disponible')} />
            <label className="form-check-label" htmlFor="pr-dispo">Disponible actuellement</label>
          </div>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="pr-desc">Description <span className="text-faint">(facultatif)</span></label>
          <textarea id="pr-desc" className="form-control" rows={2} maxLength={2000} value={form.description} onChange={maj('description')}
            placeholder="Ex. Sur rendez-vous, à jeun, ordonnance requise…" />
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

export default function StructurePrestations() {
  const { type, acteurId } = useOutletContext();
  const confirmer = useConfirmation();
  const toast = useToast();
  const charger = useCallback(() => listerPrestationsGestion(acteurId), [acteurId]);
  const etat = useRessource(charger);
  const d = etat.donnees;
  const [edition, setEdition] = useState(null); // null | 'nouvelle' | prestation
  const [recherche, setRecherche] = useState('');

  const prestations = useMemo(() => {
    const liste = d?.prestations ?? [];
    const t = recherche.trim().toLowerCase();
    return t ? liste.filter((p) => p.nom.toLowerCase().includes(t) || p.categorie?.toLowerCase().includes(t)) : liste;
  }, [d, recherche]);
  const categories = useMemo(() => [...new Set((d?.prestations ?? []).map((p) => p.categorie).filter(Boolean))], [d]);

  const enregistrer = async (valeurs) => {
    if (edition === 'nouvelle') await creerPrestation(acteurId, valeurs);
    else await modifierPrestation(edition.prestation_id, valeurs);
    toast.succes(edition === 'nouvelle' ? 'Prestation ajoutée.' : 'Prestation mise à jour.');
    setEdition(null);
    etat.recharger();
  };

  const basculer = async (p) => {
    try {
      await modifierPrestation(p.prestation_id, { disponible: !p.disponible });
      etat.recharger();
    } catch (err) {
      toast.erreur(err?.message || 'Modification impossible.');
    }
  };

  const supprimer = async (p) => {
    const ok = await confirmer({ titre: 'Supprimer la prestation', message: `« ${p.nom} » sera retirée définitivement.`, labelConfirmer: 'Supprimer', variante: 'danger' });
    if (!ok) return;
    try {
      await supprimerPrestation(p.prestation_id);
      toast.succes('Prestation supprimée.');
      etat.recharger();
    } catch (err) {
      toast.erreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <PresencePortailPage
      titre="Prestations"
      description="Les consultations, actes et examens réalisés dans votre structure, avec leurs tarifs indicatifs."
      actions={edition || !d ? null : (
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setEdition('nouvelle')} disabled={d.prestations.length >= d.max}>
          <i className="fa-solid fa-plus" /> Ajouter une prestation
        </button>
      )}
    >
      <EtatChargement {...etat}>
        {d && (
          <div className="d-flex flex-column gap-4">
            <BandeauMasque type={type} visible={d.visibles_public}>
              Vos prestations sont enregistrées mais masquées au public : votre abonnement actuel n&apos;inclut pas les contenus enrichis.
            </BandeauMasque>
            {edition && (
              <FormulairePrestation
                key={edition === 'nouvelle' ? 'nouvelle' : edition.prestation_id}
                initial={edition === 'nouvelle' ? null : edition}
                devise={d.devise}
                categories={categories}
                onAnnuler={() => setEdition(null)}
                onEnregistrer={enregistrer}
              />
            )}
            <div className="info-card">
              <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
                <h3 className="mb-0"><i className="fa-solid fa-list" /> Catalogue ({d.prestations.length})</h3>
                {d.prestations.length > 5 && (
                  <input className="form-control form-control-sm" style={{ maxWidth: 240 }} placeholder="Filtrer…" value={recherche}
                    onChange={(e) => setRecherche(e.target.value)} aria-label="Filtrer les prestations" />
                )}
              </div>
              {d.prestations.length === 0 ? (
                <div className="aps-empty-state">
                  <i className="fa-solid fa-file-waveform"></i>
                  <div>Aucune prestation. Ajoutez vos consultations et examens pour qu&apos;ils apparaissent sur votre fiche.</div>
                </div>
              ) : prestations.map((p) => (
                <div key={p.prestation_id} className={`labo-ligne ${p.disponible ? '' : 'is-indisponible'}`}>
                  <div className="min-w-0">
                    <div>
                      <strong>{p.nom}</strong>
                      {p.categorie && <span className="chip chip-complet ms-2">{p.categorie}</span>}
                      {!p.disponible && <span className="chip chip-st-annule ms-2">Indisponible</span>}
                    </div>
                    <div className="practitioner-meta mt-1">
                      <span><i className="fa-solid fa-tag" /> {formaterPrixPrestation(p.prix, d.devise)}</span>
                      {p.description && <span className="text-truncate">{p.description}</span>}
                    </div>
                  </div>
                  <div className="labo-ligne-actions">
                    <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => basculer(p)}
                      aria-label={p.disponible ? 'Marquer indisponible' : 'Marquer disponible'} title={p.disponible ? 'Marquer indisponible' : 'Marquer disponible'}>
                      <i className={`fa-solid ${p.disponible ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => setEdition(p)} aria-label="Modifier" title="Modifier"><i className="fa-solid fa-pen" /></button>
                    <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => supprimer(p)} aria-label="Supprimer" title="Supprimer"><i className="fa-solid fa-trash" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </EtatChargement>
    </PresencePortailPage>
  );
}
