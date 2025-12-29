import { cn } from '@/lib/utils/cn';

interface StatusBadgeProps {
  status: 'active' | 'pending' | 'completed' | 'inactive' | 'draft';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variants = {
    active: 'bg-[hsl(var(--success-light))] text-[hsl(var(--success))]',
    pending: 'bg-[hsl(var(--pending-light))] text-[hsl(var(--pending))]',
    completed: 'bg-[hsl(var(--success-light))] text-[hsl(var(--success))]',
    inactive: 'bg-muted text-muted-foreground',
    draft: 'bg-muted text-muted-foreground',
  };

  return (
    <span className={cn('px-3 py-1 rounded-lg text-sm font-medium', variants[status], className)}>
      {status}
    </span>
  );
}
