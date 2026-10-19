import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

/** QR de la OT para mostrar en la garita. */
export function QrModal({ o, titulo, onClose }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(o.codigo, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#16212B' } }).then(setSrc); }, [o.codigo]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim m" onClick={onClose} />
      <div className="modalbox" role="dialog" aria-label={titulo} style={{ textAlign: 'center' }}>
        <div className="sub" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{titulo}</div>
        <h2 style={{ fontSize: 30, margin: '2px 0 4px' }}>{o.codigo}</h2>
        <div className="sub">{o.origen_nombre} → {o.destino_nombre} · {o.movil_codigo}</div>
        {src ? <img className="qrimg" src={src} alt={'Código QR de ' + o.codigo} /> : <div className="qrimg" />}
        <p className="hint" style={{ marginTop: 0 }}>Muestra este código en la garita. Si el QR no lee, el guardia puede cargar <b>{o.codigo}</b> a mano.</p>
        <button className="btn big" onClick={onClose}>Cerrar</button>
      </div>
    </>
  );
}

/** Escáner con la cámara trasera. Llama a onResult(texto) una vez por lectura. Necesita HTTPS o localhost. */
export function QrScanner({ activo, onResult }) {
  const video = useRef(null);
  const canvas = useRef(null);
  const [estado, setEstado] = useState('quieto');
  const [error, setError] = useState('');
  const res = useRef(onResult);
  res.current = onResult;

  useEffect(() => {
    if (!activo) return undefined;
    let stream, raf, parado = false;
    const tick = () => {
      if (parado) return;
      const v = video.current, c = canvas.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) { parado = true; res.current(code.data.trim()); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      setEstado('abriendo');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (parado) return;
        video.current.srcObject = stream;
        await video.current.play();
        setEstado('leyendo');
        tick();
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Habilítalo en el navegador o usa el registro manual.' : 'No se pudo abrir la cámara de este dispositivo.');
        setEstado('error');
      }
    })();
    return () => { parado = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); setEstado('quieto'); };
  }, [activo]);

  return (
    <div className="scanner">
      <video ref={video} playsInline muted style={{ opacity: estado === 'leyendo' ? 1 : 0 }} />
      <canvas ref={canvas} hidden />
      <div className="marco" />
      <div className="aviso">
        {estado === 'error' ? error : estado === 'leyendo' ? 'Apunta al QR de la orden' : estado === 'abriendo' ? 'Abriendo la cámara…' : 'Toca «Escanear QR» para abrir la cámara'}
      </div>
    </div>
  );
}
