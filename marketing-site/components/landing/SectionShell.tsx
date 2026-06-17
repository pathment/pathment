import type { ReactNode } from 'react';

type SectionTone = 'plain' | 'muted';

interface SectionShellProps {
  id?: string;
  tone?: SectionTone;
  pattern?: boolean;
  className?: string;
  ariaLabelledby?: string;
  children: ReactNode;
}

export function SectionShell({
  id,
  tone = 'plain',
  pattern = false,
  className = '',
  ariaLabelledby,
  children,
}: SectionShellProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={`relative border-b border-zinc-200/60 py-16 md:py-24 ${tone === 'muted' ? 'bg-zinc-50' : 'bg-white'} ${className}`}
    >
      {pattern && tone === 'muted' ? (
        <div className="grid-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      ) : null}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
