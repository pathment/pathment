import { Reveal } from './Reveal';

interface SectionHeaderProps {
  label: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  className?: string;
  titleId?: string;
}

export function SectionHeader({
  label,
  title,
  description,
  align = 'center',
  className = '',
  titleId,
}: SectionHeaderProps) {
  const alignClass =
    align === 'center'
      ? 'mx-auto max-w-3xl text-center [&_.section-label]:mx-auto'
      : 'max-w-2xl text-left';

  return (
    <Reveal className={`mb-10 md:mb-14 lg:mb-16 ${alignClass} ${className}`}>
      <div className="section-label mb-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-brand-200/80 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 sm:mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        {label}
      </div>
      <h2
        id={titleId}
        className="font-display text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl md:text-4xl"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 sm:mt-4 sm:text-base">{description}</p>
      ) : null}
    </Reveal>
  );
}
