import { Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

export default function App() {
  return (
    <div className="aps-app" id="apsApp">
      <Sidebar />
      <div className="aps-main">
        <Navbar />
        <Outlet />
      </div>
    </div>
  );
}