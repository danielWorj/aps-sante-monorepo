// portail-footer.jsx
import React from "react";
import { Link } from "react-router-dom";
import { NOM_MARQUE, RAISON_SOCIALE } from '../../../lib/marque';

// `espace` : libellé du portail (médecin par défaut ; le portail assurance
// n'a pas de paiement sous séquestre, d'où la mention propre aux RDV omise).
const PortailFooter = ({ espace }) => {
  return (
    <footer className="portail-footer">
      <div className="container-aps">
        <span>
          © 2026 {RAISON_SOCIALE} ({NOM_MARQUE}) —{" "}
          {espace ?? "Espace médecin · Paiement sous séquestre à chaque étape"}
        </span>
        <span className="d-flex gap-3">
          <Link to="/contact">Support</Link>
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </span>
      </div>
    </footer>
  );
};

export default PortailFooter;