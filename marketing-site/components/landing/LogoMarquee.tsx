'use client';

import { trustLogos } from './content';

function LogoIcon({ type }: { type: (typeof trustLogos)[number]['icon'] }) {
  const className = 'h-5 w-5 text-zinc-400';

  switch (type) {
    case 'snowflake':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden>
          <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.2 4.2l2.1 2.1M13.7 13.7l2.1 2.1M4.2 15.8l2.1-2.1M13.7 6.3l2.1-2.1M10 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'arrow-box':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
          <rect x="3" y="3" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 12l4-4M8 8h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'diamonds':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden>
          <rect x="2" y="2" width="7" height="7" rx="1.5" transform="rotate(45 5.5 5.5)" />
          <rect x="11" y="2" width="7" height="7" rx="1.5" transform="rotate(45 14.5 5.5)" opacity="0.7" />
          <rect x="2" y="11" width="7" height="7" rx="1.5" transform="rotate(45 5.5 14.5)" opacity="0.7" />
          <rect x="11" y="11" width="7" height="7" rx="1.5" transform="rotate(45 14.5 14.5)" opacity="0.5" />
        </svg>
      );
    case 'angle':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
          <path d="M6 14l8-8M10 6h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'layers':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
          <rect x="4" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="6" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        </svg>
      );
    case 'brackets':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
          <path d="M7 4C5 6 5 14 7 16M13 4c2 2 2 10 0 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function LogoItem({ logo }: { logo: (typeof trustLogos)[number] }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2.5 px-10 md:px-12">
      <LogoIcon type={logo.icon} />
      <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-zinc-400">
        {logo.name}
      </span>
    </div>
  );
}

export function LogoMarquee() {
  const doubled = [...trustLogos, ...trustLogos];

  return (
    <section
      className="relative overflow-hidden border-b border-zinc-200/60 bg-[#fcfcfd] py-7 md:py-9"
      aria-label="Trusted by engineering teams"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#fcfcfd] via-[#fcfcfd]/80 to-transparent sm:w-28 md:w-36" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#fcfcfd] via-[#fcfcfd]/80 to-transparent sm:w-28 md:w-36" />

      <div className="flex animate-logo-marquee items-center">
        {doubled.map((logo, index) => (
          <LogoItem key={`${logo.name}-${index}`} logo={logo} />
        ))}
      </div>
    </section>
  );
}
