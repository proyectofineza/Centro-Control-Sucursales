import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../lib/auth.jsx';
import Badge from '../components/Badge.jsx';
import { ROLE_LABEL, fmtDateTime } from '../lib/format.js';
import { IconPlus } from '../components/icons.jsx';

const ROLES = ['admin', 'supervisor', 'monitoreo', 'rrhh', 'tragamonedas'];
const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'monitoreo' };

export default function Usuarios() {
  const { profile: myProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Restablecer contraseña (solo Admin): usuario elegido, contraseña nueva,
  // y la contraseña ya aplicada (para mostrarla/copiarla una vez).
  const [resetUser, setResetUser] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(null);
  const [copied, setCopied] = useState(false);

  const openReset = (u) => {
    setResetUser(u);
    setNewPass('');
    setResetError('');
    setResetDone(null);
    setCopied(false);
  };
  const closeReset = () => setResetUser(null);

  // Contraseña aleatoria legible (sin caracteres que se confunden: 0/O, 1/l/I).
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint32Array(10);
    crypto.getRandomValues(bytes);
    setNewPass(Array.from(bytes, (b) => chars[b % chars.length]).join(''));
    setResetError('');
  };

  const confirmReset = async () => {
    if (newPass.length < 6) {
      setResetError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setResetting(true);
    setResetError('');
    const { data, error } = await supabase.functions.invoke('admin-set-role', {
      body: { user_id: resetUser.id, password: newPass },
    });
    setResetting(false);
    if (error || data?.error) {
      setResetError('No se pudo restablecer la contraseña: ' + (data?.error || error.message));
      return;
    }
    setResetDone(newPass);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(resetDone);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.full_name.trim()) {
      setMsg('Completá email, contraseña y nombre completo.');
      return;
    }
    if (form.password.length < 6) {
      setMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setSaving(true);
    setMsg('');
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: form.email.trim(), password: form.password, full_name: form.full_name.trim(), role: form.role },
    });
    setSaving(false);
    if (error || data?.error) {
      setMsg('No se pudo crear el usuario: ' + (data?.error || error.message));
      return;
    }
    setMsg(`Usuario ${form.full_name} creado correctamente.`);
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  };

  const changeRole = async (userId, role) => {
    setBusyId(userId);
    const { data, error } = await supabase.functions.invoke('admin-set-role', { body: { user_id: userId, role } });
    setBusyId(null);
    if (error || data?.error) {
      alert('No se pudo cambiar el rol: ' + (data?.error || error.message));
      return;
    }
    load();
  };

  const toggleActive = async (u) => {
    setBusyId(u.id);
    const { data, error } = await supabase.functions.invoke('admin-set-role', { body: { user_id: u.id, active: !u.active } });
    setBusyId(null);
    if (error || data?.error) {
      alert('No se pudo actualizar el estado: ' + (data?.error || error.message));
      return;
    }
    load();
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Administración</div>
          <h1 className="text-[22px] font-bold tracking-tight">Usuarios</h1>
        </div>
        <button className="btn btn-primary !text-[12px]" onClick={() => { setShowForm((v) => !v); setMsg(''); }}>
          <IconPlus /> Nuevo usuario
        </button>
      </div>

      {msg && (
        <div className="card mb-4 !py-2.5 text-[12.5px] text-text2 flex justify-between items-center">
          <span>{msg}</span>
          <button className="text-text3 hover:text-text" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="text-sm font-semibold mb-3.5">Crear usuario</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Email</div>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nombre@fineza.com.py" />
            </div>
            <div>
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Contraseña</div>
              <input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mín. 6 caracteres" />
            </div>
            <div>
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Rol</div>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Nombre completo</div>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary" disabled={saving} onClick={createUser}>{saving ? 'Creando…' : 'Crear usuario'}</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="datatable">
          <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center text-text3 py-8">Cargando…</td></tr>}
            {!loading && users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}{u.id === myProfile?.id && <span className="text-text3 text-[11px] ml-1.5">(vos)</span>}</td>
                <td>
                  <select
                    className="bg-transparent border border-border rounded-md px-2 py-1 text-[12px]"
                    value={u.role}
                    disabled={busyId === u.id || u.id === myProfile?.id}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td><Badge className={u.active ? 'badge-green' : 'badge-red'}>{u.active ? 'Activo' : 'Inactivo'}</Badge></td>
                <td className="text-text3 font-mono">{fmtDateTime(u.created_at)}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="text-[11.5px] text-brand hover:underline mr-3" disabled={busyId === u.id} onClick={() => openReset(u)}>
                    Restablecer contraseña
                  </button>
                  {u.id !== myProfile?.id && (
                    <button className="text-[11.5px] hover:underline" disabled={busyId === u.id} onClick={() => toggleActive(u)}>
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">{users.length} usuarios registrados</div>
      </div>

      {resetUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={resetting ? undefined : closeReset}>
          <div className="card w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            {!resetDone ? (
              <>
                <div className="font-bold text-[15.5px] mb-1">Restablecer contraseña</div>
                <p className="text-[12.5px] text-text3 mb-4">
                  Usuario: <b className="text-text">{resetUser.full_name}</b>. La contraseña actual deja de servir y se reemplaza por la nueva.
                </p>
                <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Contraseña nueva</div>
                <div className="flex gap-2">
                  <input
                    className="input font-mono"
                    type="text"
                    value={newPass}
                    onChange={(e) => { setNewPass(e.target.value); setResetError(''); }}
                    placeholder="Mín. 6 caracteres"
                    autoFocus
                    autoComplete="off"
                  />
                  <button type="button" className="btn btn-ghost !px-3 whitespace-nowrap" onClick={generatePassword}>Generar</button>
                </div>
                {resetError && <div className="text-[12.5px] text-red mt-3">{resetError}</div>}
                <div className="flex gap-2.5 justify-end mt-5">
                  <button className="btn btn-ghost" onClick={closeReset} disabled={resetting}>Cancelar</button>
                  <button className={`btn ${newPass.length >= 6 && !resetting ? 'btn-primary' : 'btn-disabled'}`} disabled={newPass.length < 6 || resetting} onClick={confirmReset}>
                    {resetting ? 'Guardando…' : 'Restablecer'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-[15.5px] mb-1">Contraseña restablecida</div>
                <p className="text-[12.5px] text-text3 mb-4">
                  Pasale esta contraseña a <b className="text-text">{resetUser.full_name}</b>. Por seguridad no se vuelve a mostrar una vez que cerrás esta ventana.
                </p>
                <div className="bg-surface2 border border-border rounded-xl px-4 py-3 font-mono text-lg tracking-wide text-center select-all">{resetDone}</div>
                <div className="flex gap-2.5 justify-end mt-5">
                  <button className="btn btn-ghost" onClick={copyPassword}>{copied ? '¡Copiada!' : 'Copiar'}</button>
                  <button className="btn btn-primary" onClick={closeReset}>Listo</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
