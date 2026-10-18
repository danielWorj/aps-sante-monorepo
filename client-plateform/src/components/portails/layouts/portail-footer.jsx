// portail-footer.jsx
import React from "react";

// `espace` : libellé du portail (médecin par défaut ; le portail assurance
// n'a pas de paiement sous séquestre, d'où la mention propre aux RDV omise).
const PortailFooter = ({ espace }) => {
  return (
    <footer className="portail-footer">
      <div className="container-aps">
        <span>
          © 2026 AZA PROXI SANTÉ ASSURANCES (ApSa) —{" "}
          {espace ?? "Espace médecin · Paiement sous séquestre à chaque étape"}
        </span>
        <span className="d-flex gap-3">
          <a href="#">Support</a>
          <a href="#">CGU</a>
          <a href="#">Confidentialité</a>
        </span>
      </div>
    </footer>
  );
};

export default PortailFooter;