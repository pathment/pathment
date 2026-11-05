import { Star } from 'lucide-react';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4.5 w-4.5', lg: 'h-6 w-6' } as const;

/**
 * Five stars filled to a value in half steps, for reading a rating (not for
 * giving one). The same look as the Selection pool's half-star control.
 */
export function StarRating({ value, size = 'md', className = '' }: {
  value: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shown = value ?? 0;
  const cls = SIZES[size];
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={value === null ? 'Not rated yet' : `${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = shown >= n ? 100 : shown >= n - 0.5 ? 50 : 0;
        return (
          <span key={n} className={`relative inline-block ${cls}`}>
            <Star className={`absolute inset-0 ${cls} text-slate-300 dark:text-slate-600`} aria-hidden />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
                <Star className={`${cls} fill-amber-400 text-amber-400`} aria-hidden />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
