'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface MenuPanelProps {
  /** Horizontal anchor to the trigger. Auto-flips if it would overflow. */
  align?: 'start' | 'end';
  /** Tailwind width class for the panel. */
  width?: string;
  /** Extra classes (e.g. padding, text size). */
  className?: string;
  children: ReactNode;
}

/**
 * MenuPanel — the consistent surface for a click-opened dropdown/action menu.
 * Drop it in place of the bespoke `absolute … bg-card border …` panel div: the
 * trigger, open-state, and outside-click stay at the call site, but placement is
 * standardized — opens downward + start-aligned by default, and **auto-flips up
 * or to the end edge** when it would run off the viewport. Dark-mode aware.
 * (Render it only while the menu is open so it measures correctly.)
 */
export function MenuPanel({ align = 'start', width = 'w-56', className = '', children }: MenuPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  const [side, setSide] = useState<'start' | 'end'>(align);

  // Measure once before paint and flip if the default placement overflows.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8 && r.top - r.height > 8) setUp(true);
    if (r.right > window.innerWidth - 8) setSide('end');
    else if (r.left < 8) setSide('start');
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      className={`absolute z-50 ${width} ${side === 'end' ? 'right-0' : 'left-0'} ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} glass rounded-xl shadow-lg dark:shadow-[0_8px_30px_rgba(0,0,0,0.55)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

export default MenuPanel;
