import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MenteeCarouselProps {
  children: React.ReactNode;
}

/**
 * Horizontal, snap-scrolling rail for the round attendance chips. Arrows only
 * appear (and only on the side you can actually move toward) once the content
 * overflows, and soft edge fades hint there's more off-screen. Scrollbar is
 * hidden via the shared `.scrollbar-hide` utility; touch / trackpad still work.
 */
export function MenteeCarousel({ children }: MenteeCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 4);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update, children]);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    // Page by ~80% of the visible width so a click always reveals fresh chips
    // while keeping a couple in view for context.
    const amount = Math.round(el.clientWidth * 0.8) * (direction === 'left' ? -1 : 1);
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* Left arrow + fade — only when there's something to the left. */}
      {canLeft && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10 bg-gradient-to-r from-card to-transparent rounded-l-xl" />
          <button
            type="button"
            onClick={() => scrollByAmount('left')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center bg-card border border-slate-200 rounded-full shadow-sm text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-1 px-2 py-2 scrollbar-hide snap-x"
      >
        {children}
      </div>

      {/* Right arrow + fade — only when there's something further right. */}
      {canRight && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10 bg-gradient-to-l from-card to-transparent rounded-r-xl" />
          <button
            type="button"
            onClick={() => scrollByAmount('right')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center bg-card border border-slate-200 rounded-full shadow-sm text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
