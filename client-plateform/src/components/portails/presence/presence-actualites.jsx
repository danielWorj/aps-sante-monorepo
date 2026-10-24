// presence-actualites.jsx — portails pharmacie et centre de santé, « Actualités ».
//
// Informations pratiques publiées sur la fiche (onglet « Annonces » de la
// fiche publique) : fermeture exceptionnelle, campagne de vaccination ou de
// dépistage, nouveau service… Brouillon, publication programmée et date de
// fin (retrait automatique). Visibles du public avec un abonnement qui
// inclut les contenus enrichis. Jamais de message promotionnel.
import { useCallback, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { creerActualite, listerActualitesGestion, modifierActualite, supprimerActualite } from '../../../services/espacePresenceService';
import { BandeauMasque, EtatChargement } from './presenceCommun';
import { dateCourte, useRessource } from './presenceOutils';

const STATUTS = {
  en_ligne: { label: 'En ligne', chip: 'chip-verifie' },
  programmee: { label: 'Programmée', chip: 'chip-st-attente' },
  brouillon: { label: 'Brouillon', chip: 'chip-complet' },
  expiree: { label: 'Terminée', chip: 'chip-st-annule' },
};

// <input type="datetime-local"> attend l'heure locale « AAAA-MM-JJTHH:MM ».
function versLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const depuisLocal = (v) => (v ? new Date(v).toISOString() : '');

function FormulaireActualite({ initial, onAnnuler, onEnregistrer }) {
  const [form, setForm] = useState(() => ({
    titre: initial?.titre ?? '',
    contenu: initial?.contenu ?? '',
    publiee: initial?.publiee ?? true,
    date_publication: versLocal(initial?.date_publication),
    date_expiration: versLocal(initial?.date_expiration),
  }));
  const [image, setImage] = useState(null);
  const [retirerImage, setRetirerImage] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const valider = async (e) => {
    e.preventDefault();
    if (form.date_expiration && form.date_publication && form.date_expiration <= form.date_publication) {
      return setErreur('La date de fin doit suivre la date de publication.');
    }
    if (image && image.size > 5 * 1024 * 1024) return setErreur('Image trop volumineuse (5 Mo maximum).');
    setEnvoi(true);
    setErreur(null);
    try {
      await onEnregistrer(
        {
          titre: form.titre.trim(),
          contenu: form.contenu.trim(),
          publiee: form.publiee,
          // Vide à la création : publication immédiate (date du serveur).
          ...(form.date_publication ? { date_publication: depuisLocal(form.date_publication) } : {}),
          date_expiration: depuisLocal(form.date_expiration),
        },
        { image, supprimerImage: retirerImage && !image }
      );
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
      setEnvoi(false);
    }
    return undefined;
  };

  return (
    <form className="info-card" onSubmit={valider}>
      <h3><i className="fa-solid fa-newspaper" /> {initial ? "Modifier l'actualité" : 'Nouvelle actualité'}</h3>
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label" htmlFor="ac-titre">Titre</label>
          <input id="ac-titre" className="form-control" required maxLength={150} value={form.titre} onChange={maj('titre')}
            placeholder="Ex. Fermeture exceptionnelle le 1er novembre" />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="ac-contenu">Texte</label>
          <textarea id="ac-contenu" className="form-control" rows={5} required maxLength={3000} value={form.contenu} onChange={maj('contenu')} />
          <div className="text-end text-faint small">{form.contenu.length} / 3000</div>
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="ac-debut">Publication <span className="text-faint">(vide = maintenant)</span></label>
          <input id="ac-debut" type="datetime-local" className="form-control" value={form.date_publication} onChange={maj('date_publication')} />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="ac-fin">Retirer de la fiche le <span className="text-faint">(facultatif)</span></label>
          <input id="ac-fin" type="datetime-local" className="form-control" value={form.date_expiration} onChange={maj('date_expiration')} />
        </div>
        <div className="col-md-8">
          <label className="form-label" htmlFor="ac-image">Illustration <span className="text-faint">(facultatif, 5 Mo)</span></label>
          <input id="ac-image" type="file" accept="image/jpeg,image/png,image/webp" className="form-control" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          {initial?.image_url && !image && (
            <div className="form-check mt-1">
              <input id="ac-retirer" type="checkbox" className="form-check-input" checked={retirerImage} onChange={(e) => setRetirerImage(e.target.checked)} />
              <label className="form-check-label small" htmlFor="ac-retirer">Retirer l&apos;illustration actuelle</label>
            </div>
          )}
        </div>
        <div className="col-md-4 d-flex align-items-end">
          <div className="form-check form-switch mb-2">
            <input id="ac-publiee" type="checkbox" role="switch" className="form-check-input" checked={form.publiee} onChange={maj('publiee')} />
            <label className="form-check-label" htmlFor="ac-publiee">{form.publiee ? 'Publiée' : 'Brouillon'}</label>
          </div>
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

export default function PresenceActualites() {
  const { type, acteurId } = useOutletContext();
  const confirmer = useConfirmation();
  const toast = useToast();
  const charger = useCallback(() => listerActualitesGestion(type, acteurId), [type, acteurId]);
  const etat = useRessource(charger);
  const [edition, setEdition] = useState(null); // null | 'nouvelle' | actualité
  const d = etat.donnees;

  const enregistrer = async (champs, { image, supprimerImage }) => {
    if (edition === 'nouvelle') await creerActualite(type, acteurId, champs, image);
    else await modifierActualite(edition.actualite_id, champs, { image, supprimerImage });
    toast.succes(edition === 'nouvelle' ? 'Actualité enregistrée.' : 'Actualité mise à jour.');
    setEdition(null);
    etat.recharger();
  };

  const supprimer = async (a) => {
    const ok = await confirmer({ titre: "Supprimer l'actualité", message: `« ${a.titre} » sera supprimée définitivement.`, labelConfirmer: 'Supprimer', variante: 'danger' });
    if (!ok) return;
    try {
      await supprimerActualite(a.actualite_id);
      toast.succes('Actualité supprimée.');
      etat.recharger();
    } catch (err) {
      toast.erreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <PresencePortailPage
      titre="Actualités"
      description="Les informations pratiques à communiquer à vos patients : fermeture exceptionnelle, campagne de vaccination, nouveau service…"
      actions={edition || !d ? null : (
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setEdition('nouvelle')} disabled={d.actualites.length >= d.max}>
          <i className="fa-solid fa-plus" /> Nouvelle actualité
        </button>
      )}
    >
      <EtatChargement {...etat}>
        {d && (
          <div className="d-flex flex-column gap-4">
            <BandeauMasque type={type} visible={d.visibles_public}>
              Vos actualités sont enregistrées mais masquées au public : votre abonnement actuel n&apos;inclut pas les contenus enrichis.
            </BandeauMasque>
            {edition && (
              <FormulaireActualite
                key={edition === 'nouvelle' ? 'nouvelle' : edition.actualite_id}
                initial={edition === 'nouvelle' ? null : edition}
                onAnnuler={() => setEdition(null)}
                onEnregistrer={enregistrer}
              />
            )}
            <div className="info-card">
              <h3><i className="fa-solid fa-list" /> Vos actualités ({d.actualites.length})</h3>
              <p className="minimal-note">Informations factuelles uniquement : aucune promotion commerciale.</p>
              {d.actualites.length === 0 ? (
                <div className="aps-empty-state"><i className="fa-regular fa-newspaper"></i><div>Aucune actualité publiée.</div></div>
              ) : d.actualites.map((a) => {
                const s = STATUTS[a.statut] ?? STATUTS.brouillon;
                return (
                  <div key={a.actualite_id} className="labo-ligne">
                    <div className="d-flex gap-3 min-w-0">
                      {a.image_url && <img src={a.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />}
                      <div className="min-w-0">
                        <div><strong>{a.titre}</strong><span className={`chip ${s.chip} ms-2`}>{s.label}</span></div>
                        <div className="small text-faint text-truncate">{a.contenu}</div>
                        <div className="practitioner-meta mt-1">
                          <span><i className="fa-regular fa-calendar" /> {dateCourte(a.date_publication)}</span>
                          {a.date_expiration && <span><i className="fa-solid fa-flag-checkered" /> jusqu&apos;au {dateCourte(a.date_expiration)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="labo-ligne-actions">
                      <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => setEdition(a)} aria-label="Modifier" title="Modifier"><i className="fa-solid fa-pen" /></button>
                      <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => supprimer(a)} aria-label="Supprimer" title="Supprimer"><i className="fa-solid fa-trash" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </EtatChargement>
    </PresencePortailPage>
  );
}
