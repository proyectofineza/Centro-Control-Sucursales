import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Monitoreo from './pages/Monitoreo.jsx';
import Verificacion from './pages/Verificacion.jsx';
import Sucursales from './pages/Sucursales.jsx';
import Incidencias from './pages/Incidencias.jsx';
import Historial from './pages/Historial.jsx';
import Ranking from './pages/Ranking.jsx';
import Score from './pages/Score.jsx';
import Mapa from './pages/Mapa.jsx';
import Reportes from './pages/Reportes.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Auditoria from './pages/Auditoria.jsx';
import Configuracion from './pages/Configuracion.jsx';
import TragamonedasControl from './pages/TragamonedasControl.jsx';
import TragamonedasCheck from './pages/TragamonedasCheck.jsx';
import TragamonedasPanel from './pages/TragamonedasPanel.jsx';

const ALL = ['admin', 'supervisor', 'monitoreo', 'rrhh', 'tragamonedas'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute roles={ALL}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/monitoreo" element={<ProtectedRoute roles={['admin', 'supervisor', 'monitoreo']}><Monitoreo /></ProtectedRoute>} />
        <Route path="/monitoreo/:branchId" element={<ProtectedRoute roles={['admin', 'monitoreo']}><Verificacion /></ProtectedRoute>} />
        <Route path="/sucursales" element={<ProtectedRoute roles={['admin', 'supervisor']}><Sucursales /></ProtectedRoute>} />
        <Route path="/incidencias" element={<ProtectedRoute roles={['admin', 'supervisor']}><Incidencias /></ProtectedRoute>} />
        <Route path="/historial" element={<ProtectedRoute roles={['admin', 'supervisor', 'monitoreo']}><Historial /></ProtectedRoute>} />
        <Route path="/ranking" element={<ProtectedRoute roles={['admin', 'supervisor']}><Ranking /></ProtectedRoute>} />
        <Route path="/score/:branchId" element={<ProtectedRoute roles={['admin', 'supervisor']}><Score /></ProtectedRoute>} />
        <Route path="/mapa" element={<ProtectedRoute roles={['admin', 'supervisor']}><Mapa /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute roles={['admin', 'supervisor']}><Reportes /></ProtectedRoute>} />
        <Route path="/tragamonedas" element={<ProtectedRoute roles={['admin', 'monitoreo']}><TragamonedasControl /></ProtectedRoute>} />
        <Route path="/tragamonedas/control/:branchId" element={<ProtectedRoute roles={['admin', 'monitoreo']}><TragamonedasCheck /></ProtectedRoute>} />
        <Route path="/tragamonedas/panel" element={<ProtectedRoute roles={['admin', 'tragamonedas']}><TragamonedasPanel /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute roles={['admin']}><Usuarios /></ProtectedRoute>} />
        <Route path="/auditoria" element={<ProtectedRoute roles={['admin']}><Auditoria /></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute roles={['admin']}><Configuracion /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
