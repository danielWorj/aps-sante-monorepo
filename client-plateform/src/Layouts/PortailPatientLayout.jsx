import { Outlet } from "react-router-dom";
import PatientPortailNavbar from "./../components/portails/layouts/patient.portail-navbar";
import PortailFooter from "../components/portails/layouts/portail-footer";

export default function PortailParentLayout() {
  return (
    <div className="portail">
      <PatientPortailNavbar />
      <Outlet />
      <PortailFooter espace="Espace patient · Paiement sous séquestre à chaque étape" />
    </div>
  );
}
