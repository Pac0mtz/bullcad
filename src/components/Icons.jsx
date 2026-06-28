import React from 'react';

// Minimal stroke icons. Inherit color via currentColor.
const S = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" {...props} />
);

export const IconSelect = (p) => (<S {...p}><path d="M5 3l14 8-6 1.5L11 19z" /></S>);
export const IconTools = (p) => (<S {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></S>);
export const IconSettings = (p) => (<S {...p}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h6M14 18h6" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="12" cy="18" r="2" /></S>);
export const IconWall = (p) => (<S {...p}><path d="M3 18h18" /><path d="M5 18V9l7-4 7 4v9" /></S>);
export const IconDoor = (p) => (<S {...p}><rect x="6" y="3" width="12" height="18" rx="1" /><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" /></S>);
export const IconWindow = (p) => (<S {...p}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M12 4v16M4 12h16" /></S>);
export const IconOpening = (p) => (<S {...p}><path d="M4 20V6M20 20V6" /><path d="M2 20h20" /></S>);
export const IconFence = (p) => (<S {...p}><path d="M6 21V6l2-2 2 2v15M14 21V6l2-2 2 2v15M3 10h18M3 15h18" /></S>);
export const IconGate = (p) => (<S {...p}><path d="M3 21V8M21 21V8M3 21h18" /><path d="M3 12l9-4 9 4" /><path d="M9 21v-6l6 6" /></S>);
export const IconMeasure = (p) => (<S {...p}><rect x="2" y="8" width="20" height="8" rx="1" transform="rotate(0 12 12)" /><path d="M6 8v3M10 8v4M14 8v3M18 8v4" /></S>);
export const IconLabel = (p) => (<S {...p}><rect x="11" y="3" width="10" height="6" rx="1.5" /><path d="M11 6L4 13l2 2" /><circle cx="4" cy="13" r="1.2" fill="currentColor" /></S>);
export const IconStairs = (p) => (<S {...p}><path d="M4 20v-4h4v-4h4V8h4V4h4" /><path d="M4 20h4v-4h4v-4h4V8h4" /></S>);
export const IconUndo = (p) => (<S {...p}><path d="M9 7L4 12l5 5" /><path d="M4 12h11a5 5 0 0 1 0 10h-1" /></S>);
export const IconRedo = (p) => (<S {...p}><path d="M15 7l5 5-5 5" /><path d="M20 12H9a5 5 0 0 0 0 10h1" /></S>);
export const IconFit = (p) => (<S {...p}><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" /></S>);
export const IconZoomIn = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="M11 8v6M8 11h6M20 20l-3.5-3.5" /></S>);
export const IconZoomOut = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-3.5-3.5" /></S>);
export const IconExport = (p) => (<S {...p}><path d="M12 3v12M8 11l4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></S>);
export const IconImport = (p) => (<S {...p}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></S>);
export const IconNew = (p) => (<S {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></S>);
export const IconTrash = (p) => (<S {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></S>);
export const IconSun = (p) => (<S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>);
export const IconMoon = (p) => (<S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>);
export const IconRoom = (p) => (<S {...p}><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h6V3" /></S>);
export const IconPdf = (p) => (<S {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 17v-4h1a1 1 0 0 1 0 2H8M16 13v4M16 13h-1.5v4" /></S>);
export const IconPan = (p) => (<S {...p}><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.3-4a1.5 1.5 0 0 1 2.6-1.5L9 14" /><path d="M9 11V8.5a1.5 1.5 0 0 0-3 0V13" /></S>);
export const IconChevron = (p) => (<S {...p}><path d="M6 9l6 6 6-6" /></S>);
export const IconCollapseLeft = (p) => (<S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /><path d="M10.5 9.5L8 12l2.5 2.5" /></S>);
export const IconCollapseRight = (p) => (<S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 4v16" /><path d="M13.5 9.5L16 12l-2.5 2.5" /></S>);
export const IconSparkle = (p) => (<S {...p}><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16l-1.8-4.5L5 9.7l5.2-1.8z" /><path d="M19 14l.7 1.9 2.1.7-2.1.7-.7 1.9-.7-1.9-2.1-.7 2.1-.7z" /></S>);
export const IconSend = (p) => (<S {...p}><path d="M4 12l16-7-7 16-2.5-6.5z" /></S>);
