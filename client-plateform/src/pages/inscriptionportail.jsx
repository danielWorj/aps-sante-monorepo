import React from 'react';
import { useNavigate } from 'react-router-dom';
import './../assets/styles/creer-medecin.css';
import './../assets/styles/inscriptionportail.css';

const InscriptionPortail = () => {
  const navigate = useNavigate();

  const accountTypes = [
    {
      id: 'patient',
      title: 'Patient',
      description: 'Accéder à vos rendez-vous et ordonnances',
      icon: 'bi-person-heart',
      color: 'var(--primary)',
      path: '/creer-patient',
    },
    {
      id: 'medecin',
      title: 'Médecin & Professionnel',
      description: 'Médecins, spécialistes, professionnels de santé',
      icon: 'bi-stethoscope',
      color: 'var(--teal)',
      path: '/devenir-medecin',
    },
    {
      id: 'pharmacie',
      title: 'Pharmacie',
      description: 'Gérants et personnel des pharmacies',
      icon: 'bi-capsule',
      color: 'var(--violet)',
      path: '/pharmacie/creation',
    },
    {
      id: 'structure',
      title: 'Structure de Santé',
      description: 'Cliniques, hôpitaux, centres médicaux',
      icon: 'bi-building',
      color: 'var(--urgence)',
      path: '/structure-sante/creation',
    },
    {
      id: 'assurance',
      title: 'Compagnie d\'Assurance',
      description: 'Assurances santé et mutuelles',
      icon: 'bi-shield-check',
      color: 'var(--orange)',
      path: '/assurances/creation',
    },
  ];

  const handleSelectType = (path) => {
    navigate(path);
  };

  return (
    <main className="main-content">
      <section className="inscription-section">
        <div className="container-aps">
          <div className="inscription-wrapper">
            <div className="inscription-header">
              <div className="eyebrow">L'ANNUAIRE</div>
              <h1>Créer votre compte</h1>
              <p className="inscription-subtitle">
                Chaque fiche est vérifiée et structurée selon le type d'acteur.
              </p>
            </div>

            <div className="account-types-grid">
              {accountTypes.map((type) => (
                <button
                  key={type.id}
                  className="account-type-card"
                  onClick={() => handleSelectType(type.path)}
                  style={{ '--icon-color': type.color }}
                >
                  <div className="icon-wrapper">
                    <i className={`bi ${type.icon}`}></i>
                  </div>
                  <div className="card-content">
                    <h3>{type.title}</h3>
                    <p>{type.description}</p>
                  </div>
                  <div className="arrow-icon">
                    <i className="bi bi-chevron-right"></i>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default InscriptionPortail;