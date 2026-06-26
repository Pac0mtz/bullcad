import React, { useState } from 'react';
import { IconChevron, IconCollapseLeft, IconCollapseRight } from './Icons.jsx';

// A collapsible panel section with a clickable header. `right` renders a small
// node on the right of the header (e.g. a count badge). Sections remember their
// own open/closed state so the panel stays scannable.
export function Section({ title, children, defaultOpen = true, right = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={'panel-section' + (open ? '' : ' is-collapsed')}>
      <button type="button" className="section-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconChevron className="section-chevron" />
        <span className="panel-title">{title}</span>
        {right != null && <span className="section-right">{right}</span>}
      </button>
      <div className="section-body" hidden={!open}>{children}</div>
    </div>
  );
}

// Header bar at the top of a side panel: a title and a collapse (hide) button.
// `side` is 'left' | 'right' so the chevron points toward the screen edge.
export function PanelHead({ title, side, onCollapse }) {
  const Icon = side === 'left' ? IconCollapseLeft : IconCollapseRight;
  return (
    <div className="panel-head">
      <span className="panel-head-title">{title}</span>
      <button type="button" className="panel-collapse" onClick={onCollapse}
        title={`Hide ${title.toLowerCase()} panel`} aria-label={`Hide ${title} panel`}>
        <Icon />
      </button>
    </div>
  );
}
