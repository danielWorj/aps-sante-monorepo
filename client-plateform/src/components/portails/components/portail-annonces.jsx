// portail-annonces.jsx — rubrique « Annonces » de chaque portail.
//
// Même liste partout (ListeAnnonces) ; seul l'habillage change selon
// l'espace : sidebar médecin, sidebar patient, gabarit du portail
// assurance ou espaces pharmacie / structure / annonceur (page simple).
import ListeAnnonces from '../../annonces/ListeAnnonces';
import PortailSidebar from '../layouts/portail-sidebar';
import PatientPortailSidebar from '../layouts/patient.portail-sidebar';
import { AssurancePortailPage } from '../layouts/assurance.portail-sidebar';

const INTRO = 'Les informations publiées par APS Santé à destination de ses utilisateurs.';

function Entete({ espace }) {
  return (
    <header className="portail-head">
      <div>
        <span className="eyebrow">{espace}</span>
        <h1>Annonces</h1>
        <p>{INTRO}</p>
      </div>
    </header>
  );
}

function AvecSidebar({ espace, sidebar }) {
  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main">
          <Entete espace={espace} />
          <ListeAnnonces />
        </main>
        {sidebar}
      </div>
    </div>
  );
}

export function MedecinAnnonces() {
  return <AvecSidebar espace="Espace médecin" sidebar={<PortailSidebar />} />;
}

export function PatientAnnonces() {
  return <AvecSidebar espace="Espace patient" sidebar={<PatientPortailSidebar />} />;
}

export function EspaceAnnonces({ espace = 'Mon espace' }) {
  return (
    <section style={{ padding: '2.5rem 0' }}>
      <div className="container-aps" style={{ maxWidth: '860px' }}>
        <Entete espace={espace} />
        <ListeAnnonces />
      </div>
    </section>
  );
}

export function AssuranceAnnonces() {
  return (
    <AssurancePortailPage titre="Annonces" description={INTRO}>
      <ListeAnnonces />
    </AssurancePortailPage>
  );
}
