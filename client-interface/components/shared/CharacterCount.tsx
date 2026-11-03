'use client';

/**
 * "1,240 / 5,000" under a field, saying plainly when it is too long. Grey as
 * a rule, amber in the last tenth, red once over, with how much to cut. The
 * caller counts (plain text, or the words of rich text) and blocks saving
 * while it is over; this only says so.
 */
export function CharacterCount({ count, max, id, className = '' }: {
  count: number;
  max: number;
  /** For the field's aria-describedby. */
  id?: string;
  className?: string;
}) {
  const over = count > max;
  const near = !over && count >= max * 0.9;
  const tone = over ? 'text-red-600 dark:text-red-400' : near ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
  return (
    <div id={id} className={`mt-1 flex items-start justify-between gap-3 text-xs ${className}`} aria-live="polite">
      <span className="text-red-600 dark:text-red-400">
        {over ? `Too long. Shorten it by ${(count - max).toLocaleString()} character${count - max === 1 ? '' : 's'}.` : ''}
      </span>
      <span className={`shrink-0 tabular-nums ${tone}`}>
        {count.toLocaleString()} / {max.toLocaleString()}
      </span>
    </div>
  );
}
