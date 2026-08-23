import { Outlet } from "react-router-dom";
import PortailNavbar from "./../components/portails/layouts/portail-navbar";
import PortailFooter from "../components/portails/layouts/portail-footer";

export default function PortailLayout() {
  return (
    <div className="portail">
      <PortailNavbar />
      <Outlet />
      <PortailFooter />
    </div>
  );
}
