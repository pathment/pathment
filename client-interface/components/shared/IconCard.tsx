import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface IconCardProps {
  icon: LucideIcon;
  variant?: 'purple' | 'green' | 'blue' | 'orange' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function IconCard({ icon: Icon, variant = 'primary', size = 'md', className }: IconCardProps) {
  const variants = {
    purple: {
      bg: 'bg-[hsl(var(--card-purple))]',
      icon: 'text-[hsl(var(--card-purple-icon))]',
    },
    green: {
      bg: 'bg-[hsl(var(--card-green))]',
      icon: 'text-[hsl(var(--card-green-icon))]',
    },
    blue: {
      bg: 'bg-[hsl(var(--card-blue))]',
      icon: 'text-[hsl(var(--card-blue-icon))]',
    },
    orange: {
      bg: 'bg-[hsl(var(--card-orange))]',
      icon: 'text-[hsl(var(--card-orange-icon))]',
    },
    primary: {
      bg: 'bg-primary/10',
      icon: 'text-primary',
    },
  };

  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10 sm:h-12 sm:w-12',
    lg: 'h-14 w-14',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5 sm:h-6 sm:w-6',
    lg: 'h-7 w-7',
  };

  return (
    <div className={cn(
      'rounded-xl flex items-center justify-center',
      sizes[size],
      variants[variant].bg,
      className
    )}>
      <Icon className={cn(iconSizes[size], variants[variant].icon)} />
    </div>
  );
}
