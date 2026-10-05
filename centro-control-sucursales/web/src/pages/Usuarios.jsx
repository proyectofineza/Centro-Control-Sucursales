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
                <td className="text-right">
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
    </div>
  );
}
