import { Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import Annonce from './components/annonce';
import Footer from './components/Footer';

export default function App() {
  return (
    <>
      <Navbar />
      <Annonce />
      <Outlet />
      <Footer />
    </>
  );
}