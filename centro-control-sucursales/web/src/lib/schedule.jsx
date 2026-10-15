import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { setSchedule } from './slots.js';

// Mensaje que una pantalla deja antes de recargar los horarios, para mostrarlo después.
export const flash = { msg: '' };

const ScheduleContext = createContext({ reload: () => {} });
export const useScheduleReload = () => useContext(ScheduleContext).reload;

// Carga los horarios de control desde la base antes de mostrar la app.
// Si falla (p. ej. falta la migración 0012) usa los horarios de respaldo.
// Al guardar cambios en "Horarios tragamonedas" se llama a reload() y toda
// la app se vuelve a dibujar con los horarios nuevos.
export function ScheduleGate({ children }) {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('slot_schedule').select('slot, on_weekdays, on_weekend, valid_from, valid_to');
      setSchedule(error ? null : data);
    } catch {
      setSchedule(null);
    }
    setReady(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-text3 text-sm">Cargando…</div>;
  return (
    <ScheduleContext.Provider value={{ reload: load }}>
      <React.Fragment key={version}>{children}</React.Fragment>
    </ScheduleContext.Provider>
  );
}
