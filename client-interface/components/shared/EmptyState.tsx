'use client';

import { ReactNode } from 'react';
import { FileX2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { Kiko, type KikoMood } from '@/components/shared/Kiko';

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  title?: string;
  description?: string;
  /** Shown only with `mascot={false}`; Kiko stands in for it otherwise. */
  icon?: ReactNode;
  /** Kiko's face for this moment. Defaults to thinking: nothing is here yet. */
  mood?: KikoMood;
  /** Kiko by default. Turn him off for a cramped spot that needs the icon. */
  mascot?: boolean;
  /** Primary CTA */
  action?: EmptyStateAction;
  /** Secondary CTA */
  secondaryAction?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  title = 'No results found',
  description,
  icon,
  mood = 'thinking',
  mascot = true,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-16 px-6 text-center',
        className
      )}
    >
      {mascot ? (
        <Kiko mood={mood} size={84} animated className="mb-1" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          {icon ?? <FileX2 className="h-6 w-6 text-muted-foreground" />}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-1">
          {action && (
            action.href ? (
              <Button asChild size="sm">
                <a href={action.href}>{action.label}</a>
              </Button>
            ) : (
              <Button size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Button variant="outline" size="sm" asChild>
                <a href={secondaryAction.href}>{secondaryAction.label}</a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
