// portail-footer.jsx
import React from "react";

const PortailFooter = () => {
  return (
    <footer className="portail-footer">
      <div className="container-aps">
        <span>© 2026 APS — Espace médecin · Paiement sous séquestre à chaque étape</span>
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