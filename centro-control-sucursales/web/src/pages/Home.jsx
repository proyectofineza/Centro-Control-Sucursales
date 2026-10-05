import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import DashboardEjecutivo from './DashboardEjecutivo.jsx';
import DashboardSupervisor from './DashboardSupervisor.jsx';
import DashboardRRHH from './DashboardRRHH.jsx';
import TragamonedasPanel from './TragamonedasPanel.jsx';

export default function Home() {
  const { role } = useAuth();
  if (role === 'monitoreo') return <Navigate to="/monitoreo" replace />;
  if (role === 'supervisor') return <DashboardSupervisor />;
  if (role === 'rrhh') return <DashboardRRHH />;
  if (role === 'tragamonedas') return <TragamonedasPanel />;
  return <DashboardEjecutivo />;
}
