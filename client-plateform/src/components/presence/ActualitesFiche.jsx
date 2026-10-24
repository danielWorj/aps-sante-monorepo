// ActualitesFiche.jsx — actualités d'un centre de santé sur sa fiche publique
// (informations pratiques publiées depuis l'espace du centre ; le serveur ne
// renvoie que celles en ligne, et seulement si l'abonnement les inclut).
const formatDate = (iso) =>
  (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

export default function ActualitesFiche({ actualites, chargement, nom }) {
  if (chargement) return <p className="minimal-note">Chargement des actualités…</p>;
  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3><i className="fa-solid fa-newspaper" /> Actualités</h3>
        {actualites.length === 0 ? (
          <p className="minimal-note mb-0">{nom} n&apos;a publié aucune actualité pour le moment.</p>
        ) : (
          <div className="d-flex flex-column gap-3">
            {actualites.map((a) => (
              <article key={a.actualite_id} className="exam-row" style={{ alignItems: 'flex-start' }}>
                {a.image_url && (
                  <img src={a.image_url} alt="" loading="lazy"
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, marginRight: '.75rem', flexShrink: 0 }} />
                )}
                <div className="exam-row-name" style={{ flex: 1 }}>
                  <strong>{a.titre}</strong>
                  <span className="exam-row-cat" style={{ whiteSpace: 'pre-line' }}>{a.contenu}</span>
                  <span className="exam-row-cat"><i className="fa-regular fa-calendar" /> {formatDate(a.date_publication)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="minimal-note mt-3 mb-0">
          <i className="fa-solid fa-circle-info" /> Publiées par l&apos;établissement lui-même. À confirmer directement auprès de lui avant tout déplacement.
        </p>
      </div>
    </div>
  );
}
