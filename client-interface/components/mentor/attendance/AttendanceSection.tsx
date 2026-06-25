import React, { useState, useMemo } from 'react';
import { AttendanceFilters, type AttendanceFilter } from './AttendanceFilters';
import { MenteeCarousel } from './MenteeCarousel';
import { MenteeAttendanceCard } from './MenteeAttendanceCard';
import { AttendanceModal } from './AttendanceModal';
import { CheckCircle2 } from 'lucide-react';

type Attendance = 'present' | 'absent' | 'excused' | null;

interface AttendanceSectionProps {
  cohort: { id: string; name: string }[];
  attendance: Record<string, Attendance>;
  activeMenteeId?: string;
  onSelectMentee: (index: number) => void;
  onSaveAttendance: (updates: Record<string, Attendance>) => Promise<void>;
  isSaving: boolean;
}

export function AttendanceSection({
  cohort,
  attendance,
  activeMenteeId,
  onSelectMentee,
  onSaveAttendance,
  isSaving,
}: AttendanceSectionProps) {
  const [currentFilter, setCurrentFilter] = useState<AttendanceFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredMentees = useMemo(() => {
    let list = [...cohort];

    if (currentFilter === 'present') {
      list = list.filter(m => attendance[m.id] === 'present');
    } else if (currentFilter === 'absent') {
      list = list.filter(m => attendance[m.id] === 'absent');
    } else if (currentFilter === 'excused') {
      list = list.filter(m => attendance[m.id] === 'excused');
    } else {
      // 'all' -> smart sorting: Present, Absent, Excused, Not Marked
      list.sort((a, b) => {
        const order = { present: 1, absent: 2, excused: 3, null: 4 };
        const valA = attendance[a.id] || 'null';
        const valB = attendance[b.id] || 'null';
        return (order[valA as keyof typeof order] || 4) - (order[valB as keyof typeof order] || 4);
      });
    }

    return list;
  }, [cohort, attendance, currentFilter]);

  const handleSave = async (updates: Record<string, Attendance>) => {
    await onSaveAttendance(updates);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <AttendanceFilters currentFilter={currentFilter} onFilterChange={setCurrentFilter} />
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          Attendance Sheet
        </button>
      </div>

      <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-2">
        {filteredMentees.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No mentees match the current filter.
          </div>
        ) : (
          <MenteeCarousel>
            {filteredMentees.map(mentee => {
              const originalIndex = cohort.findIndex(m => m.id === mentee.id);
              return (
                <MenteeAttendanceCard
                  key={mentee.id}
                  mentee={mentee}
                  attendance={attendance[mentee.id] || null}
                  isActive={mentee.id === activeMenteeId}
                  onClick={() => onSelectMentee(originalIndex)}
                />
              );
            })}
          </MenteeCarousel>
        )}
      </div>

      <AttendanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mentees={filteredMentees}
        initialAttendance={attendance}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
