import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const tiene = (p) => p && p.lat != null && p.lng != null;
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const icono = (tipo) => L.divIcon({ className: 'mk-wrap', html: '<div class="otpin ' + tipo + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });

/**
 * Mapa de OT sobre OpenStreetMap.
 *  puntos:   [{ lat, lng, tipo: 'base'|'dest'|'ahora', etiqueta, fija }]
 *  lineas:   [{ de, a, demora, texto }]
 *  circulos: [{ lat, lng, radio }]
 *  onPick(punto) activa el clic para marcar un punto.
 */
export default function MapaOT({ puntos = [], lineas = [], circulos = [], onPick, alto = 240 }) {
  const el = useRef(null);
  const map = useRef(null);
  const capa = useRef(null);
  const pick = useRef(onPick);
  const encuadre = useRef('');
  pick.current = onPick;

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([-25.3, -57.55], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    capa.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (e) => { if (pick.current) pick.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const c = capa.current;
    if (!c) return;
    c.clearLayers();
    circulos.filter(tiene).forEach((x) => L.circle([x.lat, x.lng], { radius: x.radio || 200, color: '#0E5C78', weight: 1, fillOpacity: 0.07 }).addTo(c));
    lineas.filter((l) => tiene(l.de) && tiene(l.a)).forEach((l) => {
      const pl = L.polyline([[l.de.lat, l.de.lng], [l.a.lat, l.a.lng]], { color: l.demora ? '#B3261E' : '#0E5C78', weight: 2.5, dashArray: '6 6' }).addTo(c);
      if (l.texto) pl.bindTooltip(esc(l.texto), { sticky: true });
    });
    const pts = puntos.filter(tiene);
    pts.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: icono(p.tipo || 'dest'), keyboard: false }).addTo(c);
      if (p.etiqueta) m.bindTooltip(esc(p.etiqueta), { direction: 'top', offset: [0, -8], permanent: Boolean(p.fija) });
    });
    // reencuadra solo cuando cambian los puntos, no en cada actualización
    const clave = pts.map((p) => p.lat + ',' + p.lng).join('|');
    if (clave && clave !== encuadre.current) {
      encuadre.current = clave;
      if (pts.length === 1) map.current.setView([pts[0].lat, pts[0].lng], 15);
      else map.current.fitBounds(pts.map((p) => [p.lat, p.lng]), { padding: [36, 36], maxZoom: 15 });
    }
  }, [puntos, lineas, circulos]);

  return <div ref={el} className="leaflet-host otmap" style={{ height: alto, cursor: onPick ? 'crosshair' : undefined }} />;
}

/** Trayecto de una OT: salida, destino con su geocerco y la última posición GPS. */
export function MapaRuta({ o, alto = 220 }) {
  const ori = { lat: o.origen_lat, lng: o.origen_lng };
  const des = { lat: o.destino_lat, lng: o.destino_lng };
  const ahora = tiene({ lat: o.llegada_lat, lng: o.llegada_lng }) ? { lat: o.llegada_lat, lng: o.llegada_lng }
    : tiene({ lat: o.salida_lat, lng: o.salida_lng }) ? { lat: o.salida_lat, lng: o.salida_lng } : null;
  return (
    <MapaOT alto={alto}
      puntos={[
        { ...ori, tipo: o.origen_es_base ? 'base' : 'dest', etiqueta: o.origen_nombre, fija: true },
        { ...des, tipo: o.destino_es_base ? 'base' : 'dest', etiqueta: o.destino_nombre, fija: true },
        ...(ahora ? [{ ...ahora, tipo: 'ahora', etiqueta: 'Última posición GPS' }] : [])
      ]}
      lineas={[{ de: ori, a: des }]}
      circulos={[{ ...des, radio: o.destino_geocerco_m }]} />
  );
}
