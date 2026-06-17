import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface LandingCardProps {
  children: ReactNode;
  className?: string;
}

export function LandingCard({ children, className = '' }: LandingCardProps) {
  return (
    <div
      className={`group h-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm-soft transition-all duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md-soft sm:p-7 ${className}`}
    >
      {children}
    </div>
  );
}

interface IconBadgeProps {
  icon: LucideIcon;
  size?: 'md' | 'lg';
}

export function IconBadge({ icon: Icon, size = 'md' }: IconBadgeProps) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-5 w-5';

  return (
    <span
      className={`mb-5 flex ${box} items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600 transition-colors group-hover:border-brand-200 group-hover:bg-brand-100`}
    >
      <Icon className={iconSize} />
    </span>
  );
}

interface CardTitleProps {
  children: ReactNode;
  as?: 'h3' | 'h4';
  className?: string;
}

export function CardTitle({ children, as: Tag = 'h3', className = '' }: CardTitleProps) {
  return (
    <Tag className={`mb-2 text-base font-semibold text-brand-900 sm:text-lg ${className}`}>
      {children}
    </Tag>
  );
}

export function CardDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-zinc-600">{children}</p>;
}
