import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { obtenirAnnonce } from "../services/annonceService";

// Fiche annonce — page de détail d'une annonce de la bande défilante
// (cf. AnnouncementsBand dans Home.jsx : image, libellé, description).
// Branchée sur annonceService (GET /annonces/:id, route publique), sur le
// même modèle que assuranceService / obtenirServiceAssurance dans
// FicheAssurance.jsx : chargement / introuvable / erreur gérés via
// useEffect.

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ============================ CHARGEMENT ============================ */
function AnnonceChargement() {
  return (
    <section style={{ padding: "4rem 0", textAlign: "center" }}>
      <div className="container-aps">
        <i
          className="fa-solid fa-circle-notch fa-spin"
          style={{ fontSize: "1.6rem", color: "var(--ink-faint)" }}
        />
      </div>
    </section>
  );
}

/* ============================ NON TROUVÉE / ERREUR ============================ */
function AnnonceIntrouvable({ message }) {
  return (
    <section style={{ padding: "3rem 0" }}>
      <div className="container-aps" style={{ maxWidth: "560px", textAlign: "center" }}>
        <i
          className="fa-solid fa-circle-exclamation"
          style={{ fontSize: "1.8rem", color: "var(--ink-faint)" }}
        />
        <h1 style={{ fontSize: "1.4rem", marginTop: "1rem" }}>Annonce introuvable</h1>
        <p className="mt-2">
          {message || "Cette annonce n'existe pas ou n'est plus disponible."}
        </p>
        <Link to="/" className="btn btn-primary btn-sm-aps mt-2">
          Retour à l'accueil
        </Link>
      </div>
    </section>
  );
}

/* ============================ COMPOSANT PRINCIPAL ============================ */
export default function FicheAnnonce() {
  const { id } = useParams();

  const [annonce, setAnnonce] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;

    setLoading(true);
    setErreur(null);

    obtenirAnnonce(id)
      .then((data) => {
        if (!annule) setAnnonce(data);
      })
      .catch((err) => {
        if (!annule) {
          // 404 côté backend → annonce introuvable ; toute autre erreur
          // (réseau, 500…) est affichée avec son message normalisé par apiFetch.
          setErreur(err?.status === 404 ? null : err?.message || "Une erreur est survenue.");
          setAnnonce(null);
        }
      })
      .finally(() => {
        if (!annule) setLoading(false);
      });

    return () => { annule = true; };
  }, [id]);

  if (loading) {
    return <AnnonceChargement />;
  }

  if (erreur) {
    return <AnnonceIntrouvable message={erreur} />;
  }

  if (!annonce) {
    return <AnnonceIntrouvable />;
  }

  return (
    <>
      {/* ============================ FIL D'ARIANE ============================ */}
      <div className="container-aps" style={{ paddingTop: "1.1rem", fontSize: ".82rem" }}>
        <Link to="/" className="text-muted-soft">
          Accueil
        </Link>
        <i
          className="fa-solid fa-chevron-right text-faint mx-1"
          style={{ fontSize: ".6rem" }}
        />
        <span className="text-faint">{annonce.libelle}</span>
      </div>

      {/* ============================ CORPS ============================ */}
      <section style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
        <div className="container-aps" style={{ maxWidth: "760px" }}>
          <div className="info-card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                background: "var(--surface-sunk)",
                overflow: "hidden",
              }}
            >
              {annonce.file_url ? (
                <img
                  src={annonce.file_url}
                  alt={annonce.libelle}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <i
                    className="fa-solid fa-bullhorn"
                    style={{ fontSize: "2.4rem", color: "var(--ink-faint)" }}
                  />
                </div>
              )}
            </div>

            <div style={{ padding: "1.5rem" }}>
              <h1 style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>
                {annonce.libelle}
              </h1>

              <div className="practitioner-meta mb-3">
                <span>
                  <i className="fa-solid fa-calendar-days" /> Publiée le{" "}
                  {formatDate(annonce.date_creation)}
                </span>
                {annonce.expiree && (
                  <span className="text-faint ms-2">
                    <i className="fa-solid fa-hourglass-end" /> Annonce expirée
                  </span>
                )}
              </div>

              {annonce.description && (
                <p style={{ fontSize: ".95rem", lineHeight: 1.6 }}>
                  {annonce.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}