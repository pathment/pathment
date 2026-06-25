import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MenteeCarouselProps {
  children: React.ReactNode;
}

export function MenteeCarousel({ children }: MenteeCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      // Assuming each card is ~256px wide + 12px gap. 2 cards ~ 536px
      const scrollAmount = direction === 'left' ? -536 : 536;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative group flex items-center">
      <button
        onClick={() => scrollByAmount('left')}
        className="absolute left-0 z-10 -ml-4 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-sm text-slate-500 hover:text-slate-700 hover:border-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-3 py-2 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>

      <button
        onClick={() => scrollByAmount('right')}
        className="absolute right-0 z-10 -mr-4 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-sm text-slate-500 hover:text-slate-700 hover:border-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
