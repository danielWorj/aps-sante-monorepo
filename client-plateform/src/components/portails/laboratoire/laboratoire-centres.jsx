// laboratoire-centres.jsx — portail laboratoire, « Centres ».
//
// Centres de prélèvement / sites du laboratoire : nom, ville (référentiel du
// pays de la fiche), adresse, téléphone, horaires, position sur la carte
// (itinéraire proposé aux patients sur la fiche publique).
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { LaboratoirePortailPage } from '../layouts/laboratoire.portail-sidebar';
import GoogleMapPicker from '../../maps/GoogleMapPicker';
import { listerVilles } from '../../../services/geoService';
import {
  creerCentre,
  modifierCentre,
  obtenirGestionLaboratoire,
  supprimerCentre,
} from '../../../services/laboratoireService';

const VIDE = { nom: '', ville_id: '', localisation: '', telephone: '', horaires: '', latitude: '', longitude: '' };

function FormulaireCentre({ initial, villes, onAnnuler, onEnregistrer }) {
  const [form, setForm] = useState(() => (initial ? {
    nom: initial.nom ?? '', ville_id: initial.ville_id ?? '', localisation: initial.localisation ?? '',
    telephone: initial.telephone ?? '', horaires: initial.horaires ?? '',
    latitude: initial.gps?.latitude ?? '', longitude: initial.gps?.longitude ?? '',
  } : VIDE));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const { latitude, longitude, ...reste } = form;
    try {
      await onEnregistrer({
        ...reste,
        ville_id: reste.ville_id || null,
        ...(latitude !== '' && longitude !== '' ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
      });
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
      setEnvoi(false);
    }
  };

  return (
    <form className="info-card" onSubmit={valider}>
      <h3><i className="fa-solid fa-house-medical" /> {initial ? 'Modifier le centre' : 'Nouveau centre de prélèvement'}</h3>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="ce-nom">Nom du centre</label>
          <input id="ce-nom" className="form-control" required maxLength={150} value={form.nom} onChange={maj('nom')} placeholder="Ex. Centre Akwa (siège)" />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="ce-ville">Ville</label>
          <select id="ce-ville" className="form-select" value={form.ville_id} onChange={maj('ville_id')}>
            <option value="">Non précisée</option>
            {villes.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
          </select>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="ce-adr">Adresse</label>
          <input id="ce-adr" className="form-control" required maxLength={255} value={form.localisation} onChange={maj('localisation')} placeholder="Quartier, rue, point de repère" />
        </div>
        <div className="col-md-5">
          <label className="form-label" htmlFor="ce-tel">Téléphone</label>
          <input id="ce-tel" type="tel" className="form-control" maxLength={20} value={form.telephone} onChange={maj('telephone')} />
        </div>
        <div className="col-md-7">
          <label className="form-label" htmlFor="ce-hor">Horaires</label>
          <input id="ce-hor" className="form-control" maxLength={255} value={form.horaires} onChange={maj('horaires')} placeholder="Ex. Lun-Sam 7h-18h, prélèvements jusqu'à 11h" />
        </div>
        <div className="col-12">
          <span className="form-label d-block">Position (facultatif)</span>
          <GoogleMapPicker
            latitude={form.latitude === '' ? null : Number(form.latitude)}
            longitude={form.longitude === '' ? null : Number(form.longitude)}
            onPositionChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
          />
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

export default function LaboratoireCentres() {
  const { laboratoireId } = useOutletContext();
  const confirmer = useConfirmation();
  const toast = useToast();
  const [donnees, setDonnees] = useState(null);
  const [villes, setVilles] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [edition, setEdition] = useState(null);

  const charger = useCallback(
    () => obtenirGestionLaboratoire(laboratoireId)
      .then((d) => { setDonnees(d); setErreur(null); return d; })
      .catch((err) => setErreur(err?.message || 'Centres indisponibles.')),
    [laboratoireId]
  );
  useEffect(() => { charger(); }, [charger]);

  const paysId = donnees?.laboratoire?.pays_id;
  useEffect(() => {
    if (!paysId) return;
    listerVilles(paysId).then((d) => setVilles(d?.villes || [])).catch(() => setVilles([]));
  }, [paysId]);

  const enregistrer = async (valeurs) => {
    if (edition === 'nouveau') await creerCentre(laboratoireId, valeurs);
    else await modifierCentre(edition.centre_id, valeurs);
    toast.succes(edition === 'nouveau' ? 'Centre ajouté.' : 'Centre mis à jour.');
    setEdition(null);
    charger();
  };

  const supprimer = async (centre) => {
    const ok = await confirmer({
      titre: 'Supprimer le centre',
      message: `« ${centre.nom} » ne sera plus affiché sur votre fiche.`,
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerCentre(centre.centre_id);
      toast.succes('Centre supprimé.');
      charger();
    } catch (err) {
      toast.erreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <LaboratoirePortailPage
      titre="Centres de prélèvement"
      description="Les sites où vos patients peuvent se faire prélever ou retirer leurs résultats."
      actions={edition ? null : (
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setEdition('nouveau')} disabled={!donnees}>
          <i className="fa-solid fa-plus" /> Ajouter un centre
        </button>
      )}
    >
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && (
        <div className="d-flex flex-column gap-4">
          {edition && (
            <FormulaireCentre
              key={edition === 'nouveau' ? 'nouveau' : edition.centre_id}
              initial={edition === 'nouveau' ? null : edition}
              villes={villes}
              onAnnuler={() => setEdition(null)}
              onEnregistrer={enregistrer}
            />
          )}
          <div className="info-card">
            <h3><i className="fa-solid fa-house-medical" /> Mes centres ({donnees.centres.length})</h3>
            {donnees.centres.length === 0 ? (
              <div className="aps-empty-state">
                <i className="fa-solid fa-house-medical"></i>
                <div>Aucun centre. Ajoutez au moins votre site principal.</div>
              </div>
            ) : donnees.centres.map((c) => (
              <div key={c.centre_id} className="labo-ligne">
                <div className="min-w-0">
                  <strong>{c.nom}</strong>
                  <div className="practitioner-meta mt-1">
                    <span><i className="fa-solid fa-location-dot" /> {[c.localisation, c.ville?.nom].filter(Boolean).join(', ')}</span>
                    {c.telephone && <span><i className="fa-solid fa-phone" /> {c.telephone}</span>}
                    {c.horaires && <span><i className="fa-regular fa-clock" /> {c.horaires}</span>}
                    {!c.gps && <span className="text-faint"><i className="fa-solid fa-map-pin" /> Position non renseignée</span>}
                  </div>
                </div>
                <div className="labo-ligne-actions">
                  <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => setEdition(c)} aria-label="Modifier" title="Modifier">
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => supprimer(c)} aria-label="Supprimer" title="Supprimer">
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
