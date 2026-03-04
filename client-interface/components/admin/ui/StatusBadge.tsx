import React from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

export type EnrollmentStatus =
  | 'active' | 'matched' | 'pending_approval' | 'approved'
  | 'pending_match' | 'pending_completion' | 'level_completed'
  | 'program_completed' | 'rejected' | 'dropped';

export type ProgramStatus = 'published' | 'active' | 'draft' | 'completed' | 'archived';

type AnyStatus = string;

interface BadgeConfig {
  label: string;
  className: string;
  icon?: React.ReactNode;
}

/**
 * Built-in color map covering all enrollment + program statuses used in admin.
 * Pass `config` to override or extend for other areas.
 */
const DEFAULT_CONFIG: Record<string, BadgeConfig> = {
  // Enrollment
  active:              { label: 'Active',              className: 'bg-green-100 text-green-700',   icon: <CheckCircle2 className="w-3 h-3" /> },
  matched:             { label: 'Matched',             className: 'bg-green-100 text-green-700',   icon: <CheckCircle2 className="w-3 h-3" /> },
  pending_approval:    { label: 'Pending Approval',    className: 'bg-amber-100 text-amber-700',   icon: <Clock className="w-3 h-3" /> },
  approved:            { label: 'Approved',            className: 'bg-blue-100 text-blue-700',     icon: <Clock className="w-3 h-3" /> },
  pending_match:       { label: 'Pending Match',       className: 'bg-blue-100 text-blue-700',     icon: <Clock className="w-3 h-3" /> },
  pending_completion:  { label: 'Pending Completion',  className: 'bg-orange-100 text-orange-700', icon: <Clock className="w-3 h-3" /> },
  level_completed:     { label: 'Level Completed',     className: 'bg-indigo-100 text-indigo-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  program_completed:   { label: 'Program Completed',   className: 'bg-indigo-100 text-indigo-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected:            { label: 'Rejected',            className: 'bg-red-100 text-red-700',       icon: <XCircle className="w-3 h-3" /> },
  dropped:             { label: 'Dropped',             className: 'bg-red-100 text-red-700',       icon: <XCircle className="w-3 h-3" /> },
  // Program
  published:           { label: 'Published',           className: 'bg-green-100 text-green-700' },
  draft:               { label: 'Draft',               className: 'bg-amber-100 text-amber-700' },
  completed:           { label: 'Completed',           className: 'bg-indigo-100 text-indigo-700' },
  archived:            { label: 'Archived',            className: 'bg-slate-100 text-slate-600' },
};

interface StatusBadgeProps {
  status: AnyStatus;
  /** Override or extend the default config map */
  config?: Record<string, BadgeConfig>;
  /** Hide the leading icon even when one is configured */
  noIcon?: boolean;
}

export function StatusBadge({ status, config, noIcon = false }: StatusBadgeProps) {
  const map = config ? { ...DEFAULT_CONFIG, ...config } : DEFAULT_CONFIG;
  const cfg = map[status] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    className: 'bg-slate-100 text-slate-700',
    icon: <Clock className="w-3 h-3" />,
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${cfg.className}`}>
      {!noIcon && cfg.icon}
      {cfg.label}
    </span>
  );
}
