export function fmtDuration(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return 'Hace instantes';
  if (diffH < 24) return `Hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `Hace ${diffD}d`;
}

export const SEVERITY_LABEL = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
export const SEVERITY_BADGE = { baja: 'badge-neutral', media: 'badge-amber', alta: 'badge-orange', critica: 'badge-red' };
export const SEVERITY_WEIGHT = { baja: 1, media: 2, alta: 3, critica: 4 };

export const STATUS_LABEL = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  verificada: 'Verificada',
  con_incidencia: 'Con incidencia',
};
export const STATUS_BADGE = {
  pendiente: 'badge-red',
  en_revision: 'badge-amber',
  verificada: 'badge-green',
  con_incidencia: 'badge-orange',
};

export const ROLE_LABEL = { admin: 'Administrador', supervisor: 'Supervisor', monitoreo: 'Monitoreo', rrhh: 'RRHH', tragamonedas: 'Tragamonedas' };
export const ROLE_BADGE = { admin: 'badge-brand', supervisor: 'badge-amber', monitoreo: 'badge-green', rrhh: 'badge-orange', tragamonedas: 'badge-red' };

export function scoreColor(score) {
  if (score >= 80) return '#22e2a0';
  if (score >= 60) return '#ff8a3d';
  return '#ff5468';
}

export function scoreLabel(score) {
  if (score >= 80) return 'BUEN ESTADO';
  if (score >= 60) return 'ATENCIÓN';
  return 'REQUIERE ATENCIÓN';
}

export function scoreBadgeClass(score) {
  if (score >= 80) return 'badge-green';
  if (score >= 60) return 'badge-orange';
  return 'badge-red';
}

export function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(';'), ...rows.map((r) => headers.map((h) => escape(r[h])).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
