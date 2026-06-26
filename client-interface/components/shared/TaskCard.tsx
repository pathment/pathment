/**
 * TaskCard - Reusable card component for displaying tasks in lists
 * Used in mentor and mentee task overview pages
 */

import Link from 'next/link';
import {
  Calendar,
  Clock,
  User,
  Star,
  CheckCircle2,
  AlertCircle,
  Flag,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { StatusBadge } from '@/components/admin/ui';

export interface TaskCardProps {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string;
  assignedAt?: string;
  completedAt?: string;
  estimatedHours?: number;
  priority?: 'low' | 'medium' | 'high';
  isCustomTask?: boolean;
  mentee?: {
    firstName: string;
    lastName: string;
  };
  mentor?: {
    firstName: string;
    lastName: string;
  };
  roadmapTask?: {
    week?: { weekNumber: number };
  };
  finalRating?: string;
  pointsAwarded?: number;
  href: string;
}

const priorityConfig = {
  high: { color: 'bg-red-100 text-red-700', icon: Flag, label: 'High Priority' },
  medium: { color: 'bg-yellow-100 text-yellow-700', icon: Flag, label: 'Medium Priority' },
  low: { color: 'bg-blue-100 text-blue-700', icon: Flag, label: 'Low Priority' },
};

export function TaskCard({
  title,
  description,
  status,
  dueDate,
  completedAt,
  estimatedHours,
  priority,
  isCustomTask,
  mentee,
  mentor,
  roadmapTask,
  finalRating,
  pointsAwarded,
  href,
}: TaskCardProps) {
  const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== 'completed';
  const priorityStyle = priority ? priorityConfig[priority] : null;

  return (
    <Link href={href}>
      <div className="bg-card rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-slate-900 font-medium break-words min-w-0 flex-1">{title}</h3>
              {isCustomTask ? (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3 shrink-0" /> Custom
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium flex items-center gap-1 shrink-0">
                  <BookOpen className="w-3 h-3 shrink-0" /> Roadmap
                </span>
              )}
              {priority && priorityStyle && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${priorityStyle.color}`}>
                  {priorityStyle.label}
                </span>
              )}
            </div>
            {description && (
              <p className="text-slate-600 text-sm line-clamp-2 mb-3 break-words">{description}</p>
            )}
          </div>
          <div className="shrink-0 max-w-full overflow-hidden">
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Mentee/Mentor Info */}
        {(mentee || mentor) && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl mb-4">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-700">
              {mentee
                ? `${mentee.firstName} ${mentee.lastName}`
                : mentor
                ? `${mentor.firstName} ${mentor.lastName}`
                : 'Unknown'}
            </span>
          </div>
        )}

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          {dueDate && (
            <div
              className={`flex items-center gap-1 ${
                isOverdue ? 'text-red-600 font-medium' : ''
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Due {new Date(dueDate).toLocaleDateString()}</span>
            </div>
          )}
          {estimatedHours && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{estimatedHours}h</span>
            </div>
          )}
          {finalRating && (
            <div className="flex items-center gap-1 text-yellow-600">
              <Star className="w-4 h-4 fill-yellow-400" />
              <span>{parseFloat(finalRating).toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Overdue Alert */}
        {isOverdue && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-red-900 text-sm">This task is overdue</p>
          </div>
        )}

        {/* Completion Info */}
        {status === 'completed' && (completedAt || pointsAwarded) && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            {completedAt && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>Completed {new Date(completedAt).toLocaleDateString()}</span>
              </div>
            )}
            {pointsAwarded != null && (
              <span className="px-3 py-1 bg-brand-50 text-brand-700 rounded-lg text-sm font-medium">
                +{pointsAwarded} pts
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
