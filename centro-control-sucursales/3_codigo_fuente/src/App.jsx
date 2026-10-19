import { useCallback, useEffect, useState } from 'react';
import { configurado, supabase } from './lib/supabase';
import { DataProvider, ToastProvider, useData } from './lib/store';
import Drawer from './components/Drawer';
import TaskModal from './components/TaskModal';
import Mapa from './views/Mapa';
import Planificador from './views/Planificador';
import Panel from './views/Panel';
import Relevamiento from './views/Relevamiento';
import GastosView from './views/Gastos';
import Parametros from './views/Parametros';
import Tecnico from './views/Tecnico';
import MisOT from './ot/MisOT';
import Garita from './ot/Garita';
import PanelOT from './ot/PanelOT';
import ReportesOT from './ot/ReportesOT';


function Marca() {
  return (
    <div className="brand"><span className="mark" aria-hidden="true" />
      <div><div className="bt">Mantenimiento</div><div className="bs">FINEZA S.A. · Sucursales, cuadrillas y órdenes de trabajo de los móviles</div></div></div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault(); setErr(''); setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setCargando(false);
    if (error) setErr('Correo o contraseña incorrectos.');
  };
  return (
    <div className="login">
      <Marca />
      <div className="hazard" style={{ margin: '14px 0 20px' }} />
      <form className="card" onSubmit={entrar}>
        <h2>Ingresar</h2>
        <div className="fld"><label htmlFor="em">Correo</label><input id="em" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="fld"><label htmlFor="pw">Contraseña</label><input id="pw" type="password" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} /></div>
        {err && <div className="warnbox">{err}</div>}
        <button className="btn primary big" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>
        <p className="hint" style={{ marginBottom: 0 }}>¿No tienes usuario? Pídelo al administrador.</p>
      </form>
    </div>
  );
}

function Shell({ onSalir }) {
  const { perfil, listo, puede, veGastos, rolActual } = useData();
  const nav = [];
  if (puede('mapa')) nav.push(['mapa', 'Mapa']);
  if (puede('planificar')) nav.push(['rel', 'Relevamiento']);
  if (puede('planificar')) nav.push(['plan', 'Planificador']);
  if (puede('panel')) nav.push(['panel', 'Panel']);
  if (veGastos) nav.push(['gas', 'Gastos']);
  if (puede('ot_supervisar') || puede('parametros')) nav.push(['ot', 'Órdenes OT'], ['otrep', 'Reportes OT']);
  if (puede('parametros')) nav.push(['param', 'Parámetros']);
  if (puede('operar')) nav.push(['tec', 'Mi jornada']);
  if (puede('ot_chofer')) nav.push(['misot', 'Mis OT']);
  if (puede('ot_guardia')) nav.push(['gar', 'Garita']);
  const [vista, setVista] = useState(null);
  const [sucId, setSucId] = useState(null);
  const [sucTab, setSucTab] = useState('inv');
  const [relSuc, setRelSuc] = useState(null);
  const abrirSuc = (id, tab) => { setSucTab(tab || 'inv'); setSucId(id); };
  const relevar = (id) => { setRelSuc(id); setSucId(null); setVista('rel'); };
  const [modal, setModal] = useState(null);
  const [semana, setSemana] = useState(null);
  const sem = useCallback((l) => setSemana(l), []);
  const abrirNueva = (sucursalId, catalogoId) => setModal({ tarea: null, sucursalId, catalogoId });
  const abrirEditar = (t) => { if (puede('planificar')) setModal({ tarea: t }); };
  const vistaOk = nav.some((n) => n[0] === vista) ? vista : (nav[0] ? nav[0][0] : null);

  return (
    <>
      <header className="top">
        <Marca />
        <div className="roles">
          <span className="who"><b>{perfil.nombre || perfil.email}</b>{listo && ' · ' + (rolActual ? rolActual.nombre : perfil.rol)}</span>
          <button className="btn" onClick={onSalir}>Salir</button>
        </div>
      </header>
      <div className="hazard" />
      {nav.length > 1 && (
        <nav className="tabs" aria-label="Secciones">
          {nav.map(([k, l]) => <button key={k} onClick={() => { setVista(k); setSucId(null); if (k === 'rel') setRelSuc(null); }} aria-current={vistaOk === k ? 'page' : undefined}>{l}</button>)}
        </nav>
      )}
      <p className="hint">{rolActual ? rolActual.descripcion : ''}</p>
      <main>
        {!listo && <p className="hint">Cargando datos…</p>}
        {listo && !vistaOk && <div className="card"><h2>Sin permisos</h2><p>Tu rol todavía no tiene secciones habilitadas. Pídele al administrador que lo configure en Parámetros &gt; Roles.</p></div>}
        {listo && vistaOk === 'mapa' && <Mapa onSucursal={abrirSuc} />}
        {listo && vistaOk === 'rel' && <Relevamiento selId={relSuc} onSel={setRelSuc} />}
        {listo && vistaOk === 'plan' && <Planificador onNueva={abrirNueva} onEditar={abrirEditar} onSemana={sem} />}
        {listo && vistaOk === 'panel' && <Panel onSucursal={abrirSuc} />}
        {listo && vistaOk === 'gas' && <GastosView onSucursal={abrirSuc} />}
        {listo && vistaOk === 'param' && <Parametros />}
        {listo && vistaOk === 'tec' && <Tecnico />}
        {listo && vistaOk === 'ot' && <PanelOT />}
        {listo && vistaOk === 'otrep' && <ReportesOT />}
        {listo && vistaOk === 'misot' && <MisOT />}
        {listo && vistaOk === 'gar' && <Garita />}
      </main>
      {sucId && ['mapa', 'plan', 'panel', 'gas'].includes(vistaOk) && <Drawer sucId={sucId} tab0={sucTab} onRelevar={puede('planificar') ? relevar : null} onClose={() => setSucId(null)} onNueva={abrirNueva} onEditar={abrirEditar} />}
      {modal && <TaskModal tarea={modal.tarea} sucursalId={modal.sucursalId} catalogoId={modal.catalogoId} semana={semana} onClose={() => setModal(null)} />}
    </>
  );
}

function Sesion() {
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sesion) { setPerfil(null); return; }
    let vivo = true;
    supabase.rpc('mnt_asegurar_perfil').then(({ data, error }) => {
      if (!vivo) return;
      if (error) setFallo('No pude cargar tu perfil. ¿Ya ejecutaste el SQL en Supabase? (' + error.message + ')');
      else setPerfil(data);
    });
    return () => { vivo = false; };
  }, [sesion]);

  const salir = () => supabase.auth.signOut();
  if (sesion === undefined) return <p className="hint" style={{ padding: 24 }}>Cargando…</p>;
  if (!sesion) return <Login />;
  if (fallo) return <div className="login"><Marca /><div className="card" style={{ marginTop: 20 }}><h2>No se pudo entrar</h2><p>{fallo}</p><button className="btn" onClick={salir}>Salir</button></div></div>;
  if (!perfil) return <p className="hint" style={{ padding: 24 }}>Cargando tu perfil…</p>;
  if (!perfil.activo) return <div className="login"><Marca /><div className="card" style={{ marginTop: 20 }}><h2>Usuario desactivado</h2><p>Pídele al administrador que active tu usuario.</p><button className="btn" onClick={salir}>Salir</button></div></div>;
  return <DataProvider perfil={perfil}><Shell onSalir={salir} /></DataProvider>;
}

export default function App() {
  if (!configurado) {
    return (
      <div className="login"><Marca />
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Falta conectar con Supabase</h2>
          <p>Abre el archivo <b>config.js</b> de esta carpeta con el Bloc de notas, pega la URL y la anon key de tu proyecto de Supabase y vuelve a subir el sitio.</p>
        </div>
      </div>
    );
  }
  return <ToastProvider><Sesion /></ToastProvider>;
}
