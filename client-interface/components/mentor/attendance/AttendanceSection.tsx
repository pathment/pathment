import React, { useState, useMemo, type ReactNode } from 'react';
import { AttendanceFilters, type AttendanceFilter } from './AttendanceFilters';
import { MenteeCarousel } from './MenteeCarousel';
import { MenteeAttendanceCard, type AttendanceMentee, type FacePlan } from './MenteeAttendanceCard';
import { AttendanceModal } from './AttendanceModal';
import { CheckCircle2 } from 'lucide-react';

type Attendance = 'present' | 'absent' | 'excused' | null;

interface AttendanceSectionProps {
  cohort: AttendanceMentee[];
  attendance: Record<string, Attendance>;
  activeMenteeId?: string;
  onSelectMentee: (index: number) => void;
  onSaveAttendance: (updates: Record<string, Attendance>) => Promise<void>;
  isSaving: boolean;
  readOnly?: boolean;
  /** Today's plan progress per mentee, for the ring on each face. */
  planProgress?: Record<string, FacePlan>;
  /**
   * The "jump to a mentee" field, rendered in this row.
   *
   * It had a full-width row of its own directly above, which is a lot of screen
   * for one input — and it belongs with the roster it searches, not floating
   * above the whole page.
   */
  search?: ReactNode;
}

// Sort weight for the "all" view: present → absent → excused → not-yet-marked.
const SORT_WEIGHT: Record<string, number> = { present: 1, absent: 2, excused: 3, null: 4 };

export function AttendanceSection({
  cohort,
  attendance,
  activeMenteeId,
  onSelectMentee,
  onSaveAttendance,
  isSaving,
  readOnly = false,
  planProgress,
  search,
}: AttendanceSectionProps) {
  const [currentFilter, setCurrentFilter] = useState<AttendanceFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);


  // Headline tallies so the mentor sees the split without counting chips.
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, excused: 0, marked: 0 };
    cohort.forEach((m) => {
      const a = attendance[m.id];
      if (a === 'present') c.present++;
      else if (a === 'absent') c.absent++;
      else if (a === 'excused') c.excused++;
      if (a) c.marked++;
    });
    return c;
  }, [cohort, attendance]);

  const filteredMentees = useMemo(() => {
    if (currentFilter !== 'all') {
      return cohort.filter((m) => attendance[m.id] === currentFilter);
    }
    return [...cohort].sort((a, b) => {
      const wa = SORT_WEIGHT[attendance[a.id] ?? 'null'];
      const wb = SORT_WEIGHT[attendance[b.id] ?? 'null'];
      return wa - wb;
    });
  }, [cohort, attendance, currentFilter]);

  return (
    <div className="space-y-3 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
          {search}
          <div className="overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            <AttendanceFilters currentFilter={currentFilter} onFilterChange={setCurrentFilter} />
          </div>
          <span className="text-xs text-slate-500 truncate">
            {counts.marked}/{cohort.length} marked
            {counts.marked > 0 && (
              <span className="text-slate-400 hidden sm:inline"> · {counts.present} P · {counts.absent} A · {counts.excused} E</span>
            )}
          </span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={readOnly}
          title={readOnly ? 'Completed programs are read-only' : undefined}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-medium transition-colors shrink-0 w-full sm:w-auto disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          Attendance Sheet
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200">
        {filteredMentees.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No mentees match the current filter.
          </div>
        ) : (
          <MenteeCarousel>
            {filteredMentees.map((mentee) => {
              const originalIndex = cohort.findIndex((m) => m.id === mentee.id);
              return (
                <MenteeAttendanceCard
                  key={mentee.id}
                  mentee={mentee}
                  attendance={attendance[mentee.id] ?? null}
                  isActive={mentee.id === activeMenteeId}
                  onClick={() => onSelectMentee(originalIndex)}
                  plan={planProgress?.[mentee.id]}
                />
              );
            })}
          </MenteeCarousel>
        )}
      </div>

      {/* The sheet always manages the whole cohort, not the filtered rail, so
          "Mark all present" can't silently skip mentees hidden by a filter. */}
      <AttendanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mentees={cohort}
        initialAttendance={attendance}
        onSave={onSaveAttendance}
        isSaving={isSaving}
      />
    </div>
  );
}
