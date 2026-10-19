import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// items: [{id, lat, lng, titulo, clase, color, texto}]
export default function MapView({ items, onPick, alto = 520 }) {
  const el = useRef(null);
  const map = useRef(null);
  const capa = useRef(null);
  const ajustado = useRef(false);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: true }).setView([-25.3, -57.55], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(map.current);
    capa.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!capa.current) return;
    capa.current.clearLayers();
    const pts = [];
    items.forEach((it) => {
      const icon = L.divIcon({
        className: 'mk-wrap',
        html: '<div class="mk ' + it.clase + '" style="--c:' + it.color + '">' + (it.texto || '') + '</div>',
        iconSize: [30, 30], iconAnchor: [15, 15]
      });
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const eq = (it.equipo || []).map((e) => '<div class="tt-eq">' + esc(e) + '</div>').join('');
      const m = L.marker([it.lat, it.lng], { icon, title: it.titulo + ((it.equipo || []).length ? ' · ' + it.equipo.join(' | ') : ''), keyboard: true });
      m.bindTooltip('<b>' + esc(it.titulo) + '</b>' + eq, { direction: 'top', offset: [0, -14] });
      m.on('click', () => pick.current(it.id));
      m.addTo(capa.current);
      pts.push([it.lat, it.lng]);
    });
    if (pts.length && !ajustado.current) {
      map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      ajustado.current = true;
    }
  }, [items]);

  return <div ref={el} className="leaflet-host" style={{ height: alto }} />;
}
