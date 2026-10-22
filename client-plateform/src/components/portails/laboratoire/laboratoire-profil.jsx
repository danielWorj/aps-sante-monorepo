// laboratoire-profil.jsx — portail laboratoire, « Profil ».
//
// Le gérant modifie sa fiche (nom, contacts, agrément, présentation, ville,
// adresse, position, logo) et peut renvoyer ses pièces justificatives (CNI
// du responsable, agrément). Les modifications sont publiées aussitôt : la
// fiche garde son statut de vérification (pas de re-modération).
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../feedback';
import { LaboratoirePortailPage } from '../layouts/laboratoire.portail-sidebar';
import GoogleMapPicker from '../../maps/GoogleMapPicker';
import { listerVilles } from '../../../services/geoService';
import { modifierLaboratoire, obtenirGestionLaboratoire } from '../../../services/laboratoireService';

function versFormulaire(f) {
  return {
    nom: f.nom ?? '',
    telephone: f.telephone ?? '',
    email: f.email ?? '',
    agrement: f.agrement ?? '',
    description: f.description ?? '',
    ville_id: f.ville_id ?? '',
    localisation: f.localisation ?? '',
    latitude: f.geolocalisation?.latitude ?? '',
    longitude: f.geolocalisation?.longitude ?? '',
  };
}

function FormulaireFiche({ fiche, onEnregistre }) {
  const toast = useToast();
  const [form, setForm] = useState(() => versFormulaire(fiche));
  const [fichiers, setFichiers] = useState({ image_laboratoire: null, piece_identite: null, document_agrement: null });
  const [villes, setVilles] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    listerVilles(fiche.pays_id).then((d) => setVilles(d?.villes || [])).catch(() => setVilles([]));
  }, [fiche.pays_id]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));
  const fichier = (champ) => (e) => setFichiers((f) => ({ ...f, [champ]: e.target.files?.[0] ?? null }));

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const { latitude, longitude, ...reste } = form;
      await modifierLaboratoire(fiche.laboratoire_id, {
        ...reste,
        ...(latitude !== '' && longitude !== '' ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
        ...fichiers,
      });
      setFichiers({ image_laboratoire: null, piece_identite: null, document_agrement: null });
      toast.succes('Fiche enregistrée.');
      onEnregistre();
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form className="d-flex flex-column gap-4" onSubmit={enregistrer}>
      <div className="info-card">
        <h3><i className="fa-solid fa-flask-vial" /> Ma fiche</h3>
        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label" htmlFor="lp-nom">Nom du laboratoire</label>
            <input id="lp-nom" className="form-control" required maxLength={200} value={form.nom} onChange={maj('nom')} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="lp-agr">N° d&apos;agrément</label>
            <input id="lp-agr" className="form-control" required maxLength={100} value={form.agrement} onChange={maj('agrement')} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="lp-tel">Téléphone</label>
            <input id="lp-tel" type="tel" className="form-control" required maxLength={20} value={form.telephone} onChange={maj('telephone')} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="lp-email">E-mail</label>
            <input id="lp-email" type="email" className="form-control" required maxLength={255} value={form.email} onChange={maj('email')} />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="lp-desc">Présentation</label>
            <textarea id="lp-desc" className="form-control" rows={4} value={form.description} onChange={maj('description')}
              placeholder="Spécialités, équipements, prélèvements à domicile, horaires…" />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="lp-ville">Ville</label>
            <select id="lp-ville" className="form-select" value={form.ville_id} onChange={maj('ville_id')}>
              {!villes.some((v) => v.ville_id === form.ville_id) && fiche.ville && <option value={fiche.ville_id}>{fiche.ville.nom}</option>}
              {villes.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
            </select>
          </div>
          <div className="col-md-8">
            <label className="form-label" htmlFor="lp-adr">Adresse</label>
            <input id="lp-adr" className="form-control" required maxLength={255} value={form.localisation} onChange={maj('localisation')} />
          </div>
          <div className="col-12">
            <span className="form-label d-block">Position sur la carte</span>
            <GoogleMapPicker
              latitude={form.latitude === '' ? null : Number(form.latitude)}
              longitude={form.longitude === '' ? null : Number(form.longitude)}
              onPositionChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
              region={fiche.pays?.code_iso2?.toLowerCase()}
            />
          </div>
        </div>
      </div>

      <div className="info-card">
        <h3><i className="fa-solid fa-folder-open" /> Logo et pièces justificatives</h3>
        <p className="minimal-note">La CNI et l&apos;agrément ne sont jamais visibles du public. Laissez vide pour conserver le fichier actuel.</p>
        <div className="row g-3">
          {[
            ['image_laboratoire', 'Logo / photo', 'image/jpeg,image/png,image/webp', fiche.image_url],
            ['piece_identite', 'CNI du responsable', 'image/jpeg,image/png,image/webp,application/pdf', fiche.piece_identite_url],
            ['document_agrement', 'Agrément officiel', 'image/jpeg,image/png,image/webp,application/pdf', fiche.document_agrement_url],
          ].map(([champ, libelle, accept, actuel]) => (
            <div className="col-md-4" key={champ}>
              <label className="form-label" htmlFor={`lp-${champ}`}>{libelle}</label>
              <input id={`lp-${champ}`} type="file" accept={accept} className="form-control" onChange={fichier(champ)} />
              {actuel && <a href={actuel} target="_blank" rel="noreferrer" className="small d-inline-block mt-1">Voir le fichier actuel</a>}
            </div>
          ))}
        </div>
      </div>

      {erreur && <div className="alert alert-danger mb-0">{erreur}</div>}
      <div className="text-end">
        <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
      </div>
    </form>
  );
}

export default function LaboratoireProfil() {
  const { laboratoireId, rechargerFiche } = useOutletContext();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0);

  const charger = useCallback(
    () => obtenirGestionLaboratoire(laboratoireId)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err?.message || 'Profil indisponible.')),
    [laboratoireId]
  );
  useEffect(() => { charger(); }, [charger]);

  return (
    <LaboratoirePortailPage titre="Profil" description="Les informations de votre laboratoire, telles que le public les voit.">
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && (
        <FormulaireFiche
          key={version}
          fiche={donnees.laboratoire}
          onEnregistre={() => { charger().then(() => setVersion((v) => v + 1)); rechargerFiche(); }}
        />
      )}
    </LaboratoirePortailPage>
  );
}
