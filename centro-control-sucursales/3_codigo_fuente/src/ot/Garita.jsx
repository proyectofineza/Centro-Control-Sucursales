import { useState } from 'react';
import { useToast } from '../lib/store';
import { addDays, hoy, parse } from '../lib/util';
import { bitacora, garitaRegistrar, garitaVer, useCarga, useOTVivo, verOrden } from './api';
import { ddmm, hhmm } from './util';
import { Estado } from './OrdenDetalle';
import { QrScanner } from './Qr';

function Escanear() {
  const toast = useToast();
  const [pantalla, setPantalla] = useState('scan'); // scan | manual | resultado
  const [leyendo, setLeyendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nota, setNota] = useState('');
  const [res, setRes] = useState(null); // { prev, o, manual }
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const buscar = async (texto, manual) => {
    setLeyendo(false); setBuscando(true); setErr('');
    try {
      // el QR trae el código de la OT; también se acepta un texto que lo contenga
      const limpio = ((String(texto).match(/OT-\d+/i) || [])[0] || String(texto)).trim().toUpperCase();
      const prev = await garitaVer(limpio);
      const o = await verOrden(prev.id);
      setRes({ prev, o, manual }); setNota(''); setPantalla('resultado');
    } catch (e) { setErr(e.message); }
    setBuscando(false);
  };
  const reiniciar = () => { setRes(null); setCodigo(''); setErr(''); setPantalla('scan'); };
  const registrar = async () => {
    setErr(''); setOcupado(true);
    try { const r = await garitaRegistrar(res.prev.codigo, res.prev.esperado, { manual: res.manual, nota: nota || null }); toast(r.mensaje); reiniciar(); }
    catch (e) { setErr(e.message); }
    setOcupado(false);
  };
  const o = res && res.o, esp = res && res.prev.esperado;

  return (
    <div className="otcol">
      {err && <div className="warnbox">{err}</div>}
      {pantalla === 'scan' && (
        <>
          <QrScanner activo={leyendo} onResult={(c) => buscar(c, false)} />
          {buscando ? <p className="hint">Buscando la orden…</p> : (
            <>
              <button className="btn primary big" onClick={() => setLeyendo((v) => !v)}>{leyendo ? 'Detener la cámara' : 'Escanear QR de la orden'}</button>
              <button className="btn big" style={{ marginTop: 8 }} onClick={() => { setLeyendo(false); setPantalla('manual'); }}>El QR no lee: registrar a mano</button>
            </>
          )}
        </>
      )}
      {pantalla === 'manual' && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); buscar(codigo, true); }}>
          <h2>Registro manual</h2>
          <p className="hint">Úsalo solo si el QR no puede leerse. Queda marcado en la trazabilidad y en la auditoría.</p>
          <div className="fld"><label htmlFor="g-c">N.º de orden</label><input id="g-c" autoFocus autoCapitalize="characters" placeholder="OT-1042" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></div>
          <div className="acts"><button type="button" className="btn" onClick={reiniciar}>Cancelar</button><button className="btn primary" disabled={codigo.trim().length < 3 || buscando}>Buscar orden</button></div>
        </form>
      )}
      {pantalla === 'resultado' && o && (
        <>
          <div className={'card otres ' + (esp ? 'si' : 'no')}>
            <div className="perhead" style={{ margin: 0 }}>
              <b style={{ fontSize: 18 }}>{esp === 'salida' ? '✓ Salida habilitada' : esp === 'entrada' ? '✓ Entrada habilitada' : '✕ Sin movimiento posible'}</b>
              <Estado e={o.estado} />
            </div>
            <h2 style={{ fontSize: 34, margin: '6px 0 0' }}>{o.codigo}</h2>
            {res.manual && <div className="sub">Registro manual</div>}
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            {[['Chofer', o.chofer_nombre], ['Departamento', o.departamento_nombre], ['Móvil', o.movil_codigo + ' · ' + o.movil_descripcion],
              ['Trayecto', o.origen_nombre + ' → ' + o.destino_nombre], ['Motivo', o.motivo],
              ['Fecha', ddmm(o.fecha) + (o.programada_en ? ' · ' + hhmm(o.programada_en) : '')], ...(o.salida_en ? [['Salió', hhmm(o.salida_en)]] : [])]
              .map(([k, v]) => <div className="row" key={k}><span className="sub">{k}</span><b style={{ textAlign: 'right' }}>{v}</b></div>)}
          </div>
          {esp ? (
            <div style={{ marginTop: 10 }}>
              {res.manual && <div className="fld"><label htmlFor="g-n">Observación (opcional)</label><input id="g-n" maxLength={300} placeholder="Ej.: QR dañado, se verificó la chapa" value={nota} onChange={(e) => setNota(e.target.value)} /></div>}
              <button className="btn primary big" disabled={ocupado} onClick={registrar}>Registrar {esp === 'salida' ? 'SALIDA de' : 'ENTRADA a'} la base</button>
            </div>
          ) : <div className="note" style={{ marginTop: 10 }}>{res.prev.bloqueo}</div>}
          <button className="btn big" style={{ marginTop: 8 }} onClick={reiniciar}>Escanear otra orden</button>
        </>
      )}
    </div>
  );
}

function Bitacora() {
  const [dia, setDia] = useState(hoy());
  const { data, cargando, error, recargar } = useCarga(() => { const d = parse(dia); d.setHours(0, 0, 0, 0); const h = new Date(d); h.setDate(h.getDate() + 1); return bitacora(d, h); }, [dia]);
  useOTVivo(recargar);
  return (
    <div className="otcol">
      <div className="inl" style={{ marginTop: 0, marginBottom: 12, alignItems: 'center' }}>
        <button className="btn" aria-label="Día anterior" onClick={() => setDia(addDays(dia, -1))}>‹</button>
        <input type="date" max={hoy()} value={dia} aria-label="Día" onChange={(e) => e.target.value && setDia(e.target.value)} />
        <button className="btn" aria-label="Día siguiente" disabled={dia >= hoy()} onClick={() => setDia(addDays(dia, 1))}>›</button>
      </div>
      {error && <div className="warnbox">{error.message}</div>}
      <div className="card">
        {cargando && !data ? <p className="hint">Cargando…</p> : (data || []).length ? data.map((b, i) => (
          <div className="row" key={i}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={'pill ' + (b.evento === 'salida' ? 'curso' : 'hecha')} style={{ minWidth: 64, justifyContent: 'center' }}>{b.evento === 'salida' ? 'Salida' : 'Entrada'}</span>
              <div><b>{b.orden_codigo} · {b.chofer_nombre}</b><div className="sub">{b.movil_codigo}{b.medio === 'manual' ? ' · registro manual' : ' · QR'}{b.actor_nombre ? ' · ' + b.actor_nombre : ''}</div></div>
            </div>
            <span className="mono sub">{hhmm(b.creado_en)}</span>
          </div>
        )) : <p className="hint" style={{ margin: 0 }}>Sin movimientos registrados en la garita este día.</p>}
      </div>
    </div>
  );
}

export default function Garita() {
  const [tab, setTab] = useState('scan');
  return (
    <>
      <div className="perhead">
        <h2>Garita · salidas y entradas</h2>
        <div className="seg" role="group" aria-label="Vista">
          <button aria-pressed={tab === 'scan'} onClick={() => setTab('scan')}>Escanear</button>
          <button aria-pressed={tab === 'bit'} onClick={() => setTab('bit')}>Bitácora</button>
        </div>
      </div>
      {tab === 'scan' ? <Escanear /> : <Bitacora />}
    </>
  );
}
