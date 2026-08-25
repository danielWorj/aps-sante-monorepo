// src/pages/medecin-profil.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import PortailNavbar from "../layouts/portail-navbar";
import PortailFooter from "../layouts/portail-footer";
import PortailSidebar from "../layouts/portail-sidebar";
import { useAuth } from "./../../../context/AuthContext";
import * as medecinService from "../../../services/medecinService";
import { listerPays, listerVilles } from "../../../services/geoService";

const MedecinProfil = () => {
  const { user, rafraichirUtilisateur, status: authStatus } = useAuth();
  const navigate = useNavigate();

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [profile, setProfile] = useState(null);
  const [statistiques, setStatistiques] = useState(null);
  const [specialites, setSpecialites] = useState([]);
  const [pays, setPays] = useState([]);
  const [villesExercice, setVillesExercice] = useState([]);
  const [villesResidence, setVillesResidence] = useState([]);

  const [photoFile, setPhotoFile] = useState(null);
  const [cniFile, setCniFile] = useState(null);
  const [attestationFile, setAttestationFile] = useState(null);
  const [cvFile, setCvFile] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // Chargement initial des données
  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      navigate("/login");
      return;
    }

    async function chargerDonnees() {
      try {
        setLoading(true);
        setError(null);

        // Appel à la nouvelle route authentifiée
        const { medecin, statistiques: stats } = await medecinService.obtenirMonProfil();

        const [specialitesData, paysData] = await Promise.all([
          medecinService.listerSpecialites(),
          listerPays(),
        ]);

        setSpecialites(specialitesData || []);
        setPays(paysData?.pays || []);
        setStatistiques(stats);

        setProfile({
          medecin_id: medecin.medecin_id,
          utilisateur_id: medecin.utilisateur_id,
          // Utilisateur
          nom: medecin.utilisateur?.nom || "",
          prenom: medecin.utilisateur?.prenom || "",
          email: medecin.utilisateur?.email || "",
          telephone: medecin.utilisateur?.telephone || "",
          pays_id: medecin.utilisateur?.pays_id || "",
          // Medecin
          specialite_id: medecin.specialite_id || "",
          numero_ordre: medecin.numero_ordre || "",
          statut_verification: medecin.statut_verification || "non_publie",
          pays_exercice_id: medecin.pays_exercice_id || "",
          ville_exercice_id: medecin.ville_exercice_id || "",
          teleconsultation_activee: Boolean(medecin.teleconsultation_activee),
          tarif_indicatif: medecin.tarif_indicatif != null ? Number(medecin.tarif_indicatif) : 0,
          biographie: medecin.biographie || "",
          linkedInUrl: medecin.linkedInUrl || "",
          // Fichiers
          cni_url: medecin.cni_url || null,
          attestation_url: medecin.attestation_url || null,
          photo_url: medecin.photo_url || null,
          cv_url: medecin.cv_url || null,
          // Moyens de paiement
          mobile_moneys: medecin.mobile_moneys || [],
          comptes_bancaires: medecin.comptes_bancaires || [],
        });

        if (medecin.pays_exercice_id) {
          const v = await listerVilles(medecin.pays_exercice_id);
          setVillesExercice(v?.villes || []);
        }
        if (medecin.utilisateur?.pays_id) {
          const v = await listerVilles(medecin.utilisateur.pays_id);
          setVillesResidence(v?.villes || []);
        }
      } catch (err) {
        console.error("Erreur de chargement du profil", err);
        setError(err.message || "Impossible de charger votre profil.");
      } finally {
        setLoading(false);
      }
    }

    chargerDonnees();
  }, [authStatus, navigate]);

  const updateProfile = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handlePaysExerciceChange = async (e) => {
    const nouveauPaysId = e.target.value;
    updateProfile("pays_exercice_id", nouveauPaysId);
    updateProfile("ville_exercice_id", "");
    setVillesExercice([]);
    if (nouveauPaysId) {
      try {
        const data = await listerVilles(nouveauPaysId);
        setVillesExercice(data?.villes || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handlePaysResidenceChange = async (e) => {
    const nouveauPaysId = e.target.value;
    updateProfile("pays_id", nouveauPaysId);
    setVillesResidence([]);
    if (nouveauPaysId) {
      try {
        const data = await listerVilles(nouveauPaysId);
        setVillesResidence(data?.villes || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handlePhotoChange = (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPhotoFile(fichier);
    setProfile((prev) => ({ ...prev, photo_url: URL.createObjectURL(fichier) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profile) return;

    try {
      setSubmitting(true);

      const donnees = {
        nom: profile.nom,
        prenom: profile.prenom,
        telephone: profile.telephone || null,
        pays_id: profile.pays_id || null,
        specialite_id: profile.specialite_id,
        numero_ordre: profile.numero_ordre,
        pays_exercice_id: profile.pays_exercice_id,
        ville_exercice_id: profile.ville_exercice_id,
        teleconsultation_activee: profile.teleconsultation_activee,
        tarif_indicatif: profile.tarif_indicatif,
        biographie: profile.biographie,
        linkedInUrl: profile.linkedInUrl || null,
      };

      const fichiers = {};
      if (photoFile) fichiers.photo = photoFile;
      if (cniFile) fichiers.cni = cniFile;
      if (attestationFile) fichiers.attestation = attestationFile;
      if (cvFile) fichiers.cv = cvFile;

      const { medecin: medecinMaj } = await medecinService.modifierMedecin(
        profile.medecin_id,
        donnees,
        fichiers
      );

      setProfile((prev) => ({
        ...prev,
        ...medecinMaj,
        nom: medecinMaj.utilisateur?.nom ?? prev.nom,
        prenom: medecinMaj.utilisateur?.prenom ?? prev.prenom,
        telephone: medecinMaj.utilisateur?.telephone ?? prev.telephone,
        pays_id: medecinMaj.utilisateur?.pays_id ?? prev.pays_id,
      }));

      setPhotoFile(null);
      setCniFile(null);
      setAttestationFile(null);
      setCvFile(null);

      try { await rafraichirUtilisateur(); } catch {}

      const warningVerif = medecinMaj.statut_verification === "en_cours"
        ? " (votre fiche repasse en vérification)"
        : "";
      showToast(`Modifications enregistrées${warningVerif}.`, "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Échec de l'enregistrement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    window.location.reload();
  };

  if (authStatus === "loading" || loading) {
    return (
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status" />
              <div>Chargement de votre profil…</div>
            </div>
          </main>
          <PortailSidebar />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <div className="alert alert-danger" role="alert">
              <i className="fa-solid fa-triangle-exclamation me-2"></i>
              {error || "Profil introuvable."}
            </div>
          </main>
          <PortailSidebar />
        </div>
      </div>
    );
  }

  const statut = profile.statut_verification;
  const chipStatut =
    statut === "publie" ? { classe: "chip-verifie", icone: "fa-circle-check", label: "Vérifié & Publié" } :
    statut === "en_cours" ? { classe: "chip-semaine", icone: "fa-hourglass-half", label: "Vérification en cours" } :
    { classe: "chip-danger", icone: "fa-circle-exclamation", label: "Non publié" };

  return (
    <>
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <header className="portail-head">
              <div>
                <span className="eyebrow">Espace médecin</span>
                <h1>Mon profil</h1>
                <p>Ces informations alimentent votre fiche publique dans l'annuaire APS.</p>
                <div className="chips-row">
                  <span className={`chip ${chipStatut.classe}`}>
                    <i className={`fa-solid ${chipStatut.icone}`}></i> {chipStatut.label}
                  </span>
                  {statistiques && statistiques.total_avis > 0 && (
                    <span className="chip chip-info">
                      <i className="fa-solid fa-star"></i> {statistiques.note_moyenne}/5 ({statistiques.total_avis} avis)
                    </span>
                  )}
                </div>
              </div>
              <Link to="/" className="btn btn-outline-primary btn-sm-aps">
                <i className="fa-solid fa-eye"></i> Voir ma fiche publique
              </Link>
            </header>

            <form onSubmit={handleSubmit}>
              {/* Photo & identité */}
              <div className="info-card">
                <h3><i className="fa-solid fa-id-card"></i> Photo &amp; identité</h3>
                <div className="avatar-upload-row">
                  <div className="avatar-upload">
                    {!profile.photo_url && <i className="fa-solid fa-camera upload-placeholder-icon"></i>}
                    {profile.photo_url && <img src={profile.photo_url} alt="Photo de profil" />}
                    <input type="file" accept="image/*" onChange={handlePhotoChange} />
                    <span className="avatar-upload-badge">
                      <i className="fa-solid fa-camera"></i>
                    </span>
                  </div>
                  <div className="avatar-upload-info">
                    <strong>Photo de profil</strong>
                    <span className="upload-default-text">JPG, PNG — visage bien visible, fond neutre. 5 Mo max.</span>
                    {photoFile && <span className="upload-filename">{photoFile.name}</span>}
                  </div>
                </div>
                <div className="row g-3 mt-3">
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-nom">Nom</label>
                    <input type="text" className="form-control" id="p-nom"
                      value={profile.nom} onChange={(e) => updateProfile("nom", e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-prenom">Prénom</label>
                    <input type="text" className="form-control" id="p-prenom"
                      value={profile.prenom} onChange={(e) => updateProfile("prenom", e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-email">Adresse e-mail</label>
                    <input type="email" className="form-control" id="p-email" value={profile.email} readOnly />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-tel">Téléphone</label>
                    <input type="tel" className="form-control" id="p-tel"
                      value={profile.telephone || ""} onChange={(e) => updateProfile("telephone", e.target.value)} />
                  </div>
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="p-bio">Biographie</label>
                    <textarea className="form-control" id="p-bio" rows={3}
                      value={profile.biographie || ""} onChange={(e) => updateProfile("biographie", e.target.value)} required />
                  </div>
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="p-linkedin">Lien LinkedIn</label>
                    <input type="url" className="form-control" id="p-linkedin"
                      placeholder="https://linkedin.com/in/..."
                      value={profile.linkedInUrl || ""}
                      onChange={(e) => updateProfile("linkedInUrl", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Informations professionnelles */}
              <div className="info-card">
                <h3><i className="fa-solid fa-stethoscope"></i> Informations professionnelles</h3>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-spec">Spécialité</label>
                    <select className="form-select" id="p-spec"
                      value={profile.specialite_id} onChange={(e) => updateProfile("specialite_id", e.target.value)} required>
                      <option value="">Sélectionner…</option>
                      {specialites.map((s) => (
                        <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-ordre">Numéro d'ordre</label>
                    <input type="text" className="form-control" id="p-ordre"
                      value={profile.numero_ordre || ""} onChange={(e) => updateProfile("numero_ordre", e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-tarif">Tarif indicatif (FCFA)</label>
                    <input type="number" className="form-control" id="p-tarif" min={0}
                      value={profile.tarif_indicatif || 0}
                      onChange={(e) => updateProfile("tarif_indicatif", parseFloat(e.target.value) || 0)} required />
                  </div>
                  <div className="col-md-6 d-flex align-items-center pt-4">
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" id="p-tele"
                        checked={profile.teleconsultation_activee}
                        onChange={(e) => updateProfile("teleconsultation_activee", e.target.checked)} />
                      <label className="form-check-label" htmlFor="p-tele">
                        Téléconsultation activée
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lieu d'exercice */}
              <div className="info-card">
                <h3><i className="fa-solid fa-location-dot"></i> Lieu d'exercice</h3>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-pays-ex">Pays d'exercice</label>
                    <select className="form-select" id="p-pays-ex"
                      value={profile.pays_exercice_id} onChange={handlePaysExerciceChange} required>
                      <option value="">Sélectionner…</option>
                      {pays.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="p-ville">Ville d'exercice</label>
                    <select className="form-select" id="p-ville"
                      value={profile.ville_exercice_id}
                      onChange={(e) => updateProfile("ville_exercice_id", e.target.value)}
                      disabled={!profile.pays_exercice_id} required>
                      <option value="">Sélectionner…</option>
                      {villesExercice.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Documents justificatifs */}
              <div className="info-card">
                <h3><i className="fa-solid fa-shield-halved"></i> Documents justificatifs</h3>
                <p className="text-muted small">
                  Ces documents sont vérifiés par l'administration APS. Remplacer un fichier déclenchera une nouvelle vérification.
                </p>
                <div className="row g-3">
                  <DocumentInput label="Pièce d'identité (CNI)" currentUrl={profile.cni_url} newFile={cniFile} onChange={(f) => setCniFile(f)} />
                  <DocumentInput label="Attestation d'inscription à l'Ordre" currentUrl={profile.attestation_url} newFile={attestationFile} onChange={(f) => setAttestationFile(f)} />
                  <DocumentInput label="CV (optionnel)" currentUrl={profile.cv_url} newFile={cvFile} onChange={(f) => setCvFile(f)} />
                </div>
              </div>

              {/* Moyens de paiement (lecture seule) */}
              <div className="info-card">
                <h3><i className="fa-solid fa-wallet"></i> Moyens de paiement</h3>
                {profile.mobile_moneys.length > 0 && (
                  <div className="mb-3">
                    <h4 className="h6 text-muted mb-2">Mobile Money</h4>
                    {profile.mobile_moneys.map((mm) => (
                      <div key={mm.id} className="p-2 border rounded mb-2">
                        <strong>{mm.type_mobile_money?.libelle}</strong> — {mm.numero} ({mm.titulaire})
                      </div>
                    ))}
                  </div>
                )}
                {profile.comptes_bancaires.length > 0 && (
                  <div>
                    <h4 className="h6 text-muted mb-2">Comptes bancaires</h4>
                    {profile.comptes_bancaires.map((cb) => (
                      <div key={cb.id} className="p-2 border rounded mb-2">
                        <strong>{cb.nom_banque}</strong> — {cb.iban} ({cb.titulaire})
                      </div>
                    ))}
                  </div>
                )}
                {profile.mobile_moneys.length === 0 && profile.comptes_bancaires.length === 0 && (
                  <div className="note-box">
                    <i className="fa-solid fa-circle-info"></i>
                    <span>Aucun moyen de paiement configuré. Contactez l'administration APS.</span>
                  </div>
                )}
              </div>

              <div className="save-bar">
                <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={submitting}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary btn-lg-aps" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-floppy-disk"></i> Enregistrer les modifications
                    </>
                  )}
                </button>
              </div>
            </form>
          </main>
          <PortailSidebar />
        </div>
      </div>

      <div className={`toast-aps ${toast ? "show" : ""}`} role="status">
        <i className={`fa-solid ${toast?.type === "error" ? "fa-circle-xmark text-danger" : "fa-circle-check"}`}></i>
        <span>{toast?.msg}</span>
      </div>
    </>
  );
};

const DocumentInput = ({ label, currentUrl, newFile, onChange }) => (
  <div className="col-md-4">
    <label className="form-label-aps">{label}</label>
    {currentUrl && !newFile && (
      <div className="mb-2">
        <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="small text-truncate d-block">
          <i className="fa-solid fa-file me-1"></i> Voir le fichier actuel
        </a>
      </div>
    )}
    {newFile && (
      <div className="mb-2 small text-success">
        <i className="fa-solid fa-file-circle-plus me-1"></i> {newFile.name}
      </div>
    )}
    {!currentUrl && !newFile && (
      <div className="mb-2 small text-muted">Aucun fichier</div>
    )}
    <input type="file" className="form-control form-control-sm" onChange={(e) => onChange(e.target.files?.[0] || null)} />
  </div>
);

export default MedecinProfil;