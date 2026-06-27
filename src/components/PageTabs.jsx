import React from 'react';
import { useStore } from '../store.js';

// Floating page switcher (multiple plans in one project). Click a tab to switch,
// double-click to rename, × to delete, + to add a new page.
export default function PageTabs() {
  const pages = useStore((s) => s.pages);
  const activePage = useStore((s) => s.activePage);
  const switchPage = useStore((s) => s.switchPage);
  const addPage = useStore((s) => s.addPage);
  const deletePage = useStore((s) => s.deletePage);
  const renamePage = useStore((s) => s.renamePage);

  return (
    <div className="page-tabs">
      {pages.map((p) => {
        const active = p.id === activePage;
        return (
          <button key={p.id} className={'page-tab' + (active ? ' active' : '')}
            onClick={() => switchPage(p.id)}
            onDoubleClick={() => { const n = prompt('Rename page', p.name); if (n != null) renamePage(p.id, n.trim()); }}
            title={active ? 'Double-click to rename' : `Switch to ${p.name}`}>
            <span>{p.name}</span>
            {active && pages.length > 1 && (
              <span className="pt-x" title="Delete this page"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${p.name}"? This can't be undone.`)) deletePage(p.id); }}>×</span>
            )}
          </button>
        );
      })}
      <button className="page-tab add" onClick={addPage} title="Add a new page">＋</button>
    </div>
  );
}
