// Set de íconos de línea (stroke-based) reutilizados en toda la app —
// coherentes con el prototipo visual validado en Claude Design.
import React from 'react';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconDashboard = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" />
  </svg>
);
export const IconCamera = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="6.5" width="14" height="11" rx="2" /><path d="M17 10.2l4-2.2v8l-4-2.2" strokeLinejoin="round" />
  </svg>
);
export const IconBuilding = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <rect x="8" y="7" width="2.6" height="2.6" fill="currentColor" stroke="none" />
    <rect x="13.4" y="7" width="2.6" height="2.6" fill="currentColor" stroke="none" />
    <rect x="8" y="12" width="2.6" height="2.6" fill="currentColor" stroke="none" />
    <rect x="13.4" y="12" width="2.6" height="2.6" fill="currentColor" stroke="none" />
  </svg>
);
export const IconAlert = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <path d="M12 3.5 21 19H3L12 3.5Z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconClipboard = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <rect x="9" y="2" width="6" height="3" rx="1" fill="currentColor" stroke="none" />
    <line x1="8" y1="10" x2="16" y2="10" strokeWidth="1.5" /><line x1="8" y1="13.5" x2="16" y2="13.5" strokeWidth="1.5" />
    <line x1="8" y1="17" x2="13" y2="17" strokeWidth="1.5" />
  </svg>
);
export const IconTrophy = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <rect x="4" y="12" width="4" height="8" rx="1" /><rect x="10" y="7" width="4" height="13" rx="1" /><rect x="16" y="3" width="4" height="17" rx="1" />
  </svg>
);
export const IconTrend = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <polyline points="3,17 9,10 13,13 21,5" /><polyline points="15,5 21,5 21,11" />
  </svg>
);
export const IconReport = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <path d="M7 3h7l4 4v14H7Z" /><path d="M14 3v4h4" />
    <line x1="9.5" y1="13" x2="15" y2="13" strokeWidth="1.5" /><line x1="9.5" y1="16.5" x2="15" y2="16.5" strokeWidth="1.5" />
  </svg>
);
export const IconUsers = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="8.5" cy="8" r="2.8" /><circle cx="16" cy="9.2" r="2.2" />
    <path d="M3 20c.7-3.3 2.7-5 5.5-5s4.8 1.7 5.5 5" /><path d="M14.3 15.2c2.1.3 3.5 1.8 4.1 4.1" />
  </svg>
);
export const IconSettings = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <line x1="4" y1="7" x2="20" y2="7" /><circle cx="9" cy="7" r="1.8" fill="currentColor" stroke="none" />
    <line x1="4" y1="13" x2="20" y2="13" /><circle cx="15" cy="13" r="1.8" fill="currentColor" stroke="none" />
    <line x1="4" y1="19" x2="20" y2="19" /><circle cx="11" cy="19" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);
export const IconMap = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" strokeLinejoin="round" />
    <line x1="9" y1="4" x2="9" y2="17" /><line x1="15" y1="6.5" x2="15" y2="19.5" />
  </svg>
);
export const IconAudit = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" />
  </svg>
);
export const IconBell = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}>
    <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" strokeLinejoin="round" />
    <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
  </svg>
);
export const IconLogout = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
    <path d="M9 12h11m0 0-3.5-3.5M20 12l-3.5 3.5" strokeLinejoin="round" />
  </svg>
);
export const IconCheck = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} strokeWidth={2.4} {...p}><path d="M5 13l4 4L19 7" /></svg>
);
export const IconPlus = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...base} strokeWidth={2} {...p}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
export const IconSearch = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" />
  </svg>
);

export const IconSlot = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}>
    <rect x="4" y="3" width="13" height="18" rx="2" />
    <rect x="6.5" y="6" width="8" height="5" rx="1" />
    <line x1="9.2" y1="6" x2="9.2" y2="11" strokeWidth="1.3" /><line x1="11.8" y1="6" x2="11.8" y2="11" strokeWidth="1.3" />
    <line x1="7" y1="15.5" x2="14" y2="15.5" strokeWidth="1.5" />
    <path d="M20 8v5" /><circle cx="20" cy="7" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
