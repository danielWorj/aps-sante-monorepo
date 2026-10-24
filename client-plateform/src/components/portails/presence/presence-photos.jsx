// presence-photos.jsx — portails pharmacie et centre de santé, « Photos ».
//
// Galerie de la fiche (onglet « Images » de la fiche publique) : ajout,
// légende, ordre, suppression. Toutes les photos sont conservées ; le public
// voit les premières, dans la limite de l'abonnement (droit « photos » et
// nombre maximal du niveau). Chaque photo indique si elle est visible.
import { useCallback, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { ajouterPhoto, listerPhotosGestion, modifierPhoto, ordonnerPhotos, supprimerPhoto } from '../../../services/espacePresenceService';
import { BandeauMasque, EtatChargement } from './presenceCommun';
import { useRessource } from './presenceOutils';

const TAILLE_MAX = 5 * 1024 * 1024;
const taille = (o) => (o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(o / 1024)} Ko`);

function FormulaireAjout({ type, acteurId, quota, onAjoute }) {
  const entree = useRef(null);
  const [titre, setTitre] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  if (quota.utilise >= quota.max) {
    return <p className="minimal-note mb-0"><i className="fa-solid fa-circle-info" /> Vous avez atteint le maximum ({quota.max} photos). Supprimez-en une pour en ajouter une autre.</p>;
  }

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur(null);
    const fichier = entree.current?.files?.[0];
    if (!fichier) return setErreur('Choisissez une photo.');
    if (fichier.size > TAILLE_MAX) return setErreur('Photo trop volumineuse (5 Mo maximum).');
    setEnvoi(true);
    try {
      await ajouterPhoto(type, acteurId, fichier, titre);
      setTitre('');
      entree.current.value = '';
      onAjoute();
    } catch (err) {
      setErreur(err?.message || 'Téléversement impossible.');
    } finally {
      setEnvoi(false);
    }
    return undefined;
  };

  return (
    <form onSubmit={envoyer} className="row g-2 align-items-end">
      <div className="col-md-5">
        <label className="form-label small" htmlFor="ph-fichier">Photo (JPEG, PNG, WEBP — 5 Mo)</label>
        <input id="ph-fichier" ref={entree} type="file" accept="image/jpeg,image/png,image/webp" className="form-control" />
      </div>
      <div className="col-md-5">
        <label className="form-label small" htmlFor="ph-titre">Légende (facultatif)</label>
        <input id="ph-titre" className="form-control" maxLength={150} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Accueil, façade, salle d'attente" />
      </div>
      <div className="col-md-2">
        <button type="submit" className="btn btn-primary w-100" disabled={envoi}>
          {envoi ? <span className="spinner-border spinner-border-sm" role="status" /> : <><i className="fa-solid fa-upload" /> Ajouter</>}
        </button>
      </div>
      {erreur && <div className="col-12"><p className="status-card-error mb-0"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p></div>}
    </form>
  );
}

function CartePhoto({ photo, index, total, onDeplacer, onSupprimer, onRenommer }) {
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(photo.titre ?? '');
  const valider = async (e) => {
    e.preventDefault();
    if (await onRenommer(photo, titre)) setEdition(false);
  };
  return (
    <div className="media-carte">
      <div className="media-apercu">
        <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.titre || 'Photo'} loading="lazy" /></a>
      </div>
      <div className="media-pied">
        {edition ? (
          <form onSubmit={valider} className="d-flex gap-1">
            <input className="form-control form-control-sm" maxLength={150} value={titre} onChange={(e) => setTitre(e.target.value)} aria-label="Légende" />
            <button type="submit" className="btn btn-primary btn-sm-aps" aria-label="Enregistrer"><i className="fa-solid fa-check" /></button>
          </form>
        ) : (
          <div className="small text-truncate" title={photo.titre || ''}>{photo.titre || <span className="text-faint">Sans légende</span>}</div>
        )}
        <div className="d-flex justify-content-between align-items-center mt-1">
          <span className={`chip ${photo.visible_public ? 'chip-verifie' : 'chip-st-annule'}`} style={{ fontSize: '.68rem' }}>
            {photo.visible_public ? 'Visible' : 'Masquée'}
          </span>
          <span className="d-flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" disabled={index === 0} onClick={() => onDeplacer(index, -1)} aria-label="Avancer"><i className="fa-solid fa-arrow-left" /></button>
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" disabled={index === total - 1} onClick={() => onDeplacer(index, 1)} aria-label="Reculer"><i className="fa-solid fa-arrow-right" /></button>
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => setEdition((v) => !v)} aria-label="Modifier la légende"><i className="fa-solid fa-pen" /></button>
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => onSupprimer(photo)} aria-label="Supprimer"><i className="fa-solid fa-trash" /></button>
          </span>
        </div>
        {photo.taille_octets ? <div className="text-faint" style={{ fontSize: '.7rem' }}>{taille(photo.taille_octets)}</div> : null}
      </div>
    </div>
  );
}

export default function PresencePhotos() {
  const { type, acteurId } = useOutletContext();
  const confirmer = useConfirmation();
  const toast = useToast();
  const charger = useCallback(() => listerPhotosGestion(type, acteurId), [type, acteurId]);
  const etat = useRessource(charger);
  const d = etat.donnees;

  const deplacer = async (index, sens) => {
    const ids = d.images.map((p) => p.media_id);
    [ids[index], ids[index + sens]] = [ids[index + sens], ids[index]];
    try {
      await ordonnerPhotos(type, acteurId, ids);
      etat.recharger();
    } catch (err) {
      toast.erreur(err?.message || 'Réorganisation impossible.');
    }
  };

  const supprimer = async (photo) => {
    const ok = await confirmer({ titre: 'Supprimer la photo', message: 'Cette photo sera supprimée définitivement.', labelConfirmer: 'Supprimer', variante: 'danger' });
    if (!ok) return;
    try {
      await supprimerPhoto(photo.media_id);
      toast.succes('Photo supprimée.');
      etat.recharger();
    } catch (err) {
      toast.erreur(err?.message || 'Suppression impossible.');
    }
  };

  const renommer = async (photo, titre) => {
    try {
      await modifierPhoto(photo.media_id, titre);
      etat.recharger();
      return true;
    } catch (err) {
      toast.erreur(err?.message || 'Modification impossible.');
      return false;
    }
  };

  const limite = d?.droits.max_photos;
  return (
    <PresencePortailPage titre="Photos" description="Les photos de votre établissement présentées sur votre fiche publique.">
      <EtatChargement {...etat}>
        {d && (
          <div className="d-flex flex-column gap-4">
            <BandeauMasque type={type} visible={d.droits.photos}>
              Vos photos sont conservées mais masquées au public : votre abonnement actuel n&apos;inclut pas les photos.
            </BandeauMasque>
            <div className="info-card">
              <h3><i className="fa-solid fa-images" /> Galerie <small className="text-faint">({d.quota.utilise} / {d.quota.max})</small></h3>
              {d.droits.photos && limite !== null && (
                <p className="minimal-note">Votre abonnement affiche les {limite} premières photos. Les suivantes sont conservées et apparaîtront avec un abonnement supérieur.</p>
              )}
              {d.images.length > 1 && <p className="minimal-note">La première photo est mise en avant. Utilisez les flèches pour changer l&apos;ordre.</p>}
              {d.images.length > 0 ? (
                <div className="media-grille mb-3">
                  {d.images.map((p, i) => (
                    <CartePhoto key={p.media_id} photo={p} index={i} total={d.images.length} onDeplacer={deplacer} onSupprimer={supprimer} onRenommer={renommer} />
                  ))}
                </div>
              ) : (
                <div className="aps-empty-state mb-3">
                  <i className="fa-solid fa-images"></i>
                  <div>Aucune photo. Montrez votre façade, votre accueil, vos équipements : cela aide les patients à vous trouver.</div>
                </div>
              )}
              <FormulaireAjout type={type} acteurId={acteurId} quota={d.quota} onAjoute={etat.recharger} />
            </div>
          </div>
        )}
      </EtatChargement>
    </PresencePortailPage>
  );
}
