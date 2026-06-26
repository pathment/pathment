import React, { useState, useEffect } from 'react';
import { Loader2, UserCheck, UserX, CheckCircle2 } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { getInitials } from '@/lib/utils/formatting';
import type { AttendanceMentee } from './MenteeAttendanceCard';

type Attendance = 'present' | 'absent' | 'excused' | null;

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  mentees: AttendanceMentee[];
  initialAttendance: Record<string, Attendance>;
  onSave: (updates: Record<string, Attendance>) => void;
  isSaving: boolean;
}

export function AttendanceModal({ isOpen, onClose, mentees, initialAttendance, onSave, isSaving }: AttendanceModalProps) {
  const [localAttendance, setLocalAttendance] = useState<Record<string, Attendance>>({});

  useEffect(() => {
    if (isOpen) {
      setLocalAttendance({ ...initialAttendance });
    }
  }, [isOpen, initialAttendance]);

  const markAll = (status: Attendance) => {
    const next = { ...localAttendance };
    mentees.forEach(m => {
      next[m.id] = status;
    });
    setLocalAttendance(next);
  };

  const markOne = (id: string, status: Attendance) => {
    setLocalAttendance(prev => ({
      ...prev,
      [id]: prev[id] === status ? null : status,
    }));
  };

  const handleSave = () => {
    onSave(localAttendance);
  };

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title="Attendance Sheet"
      width="md"
      subtitle={`Managing attendance for ${mentees.length} mentee${mentees.length !== 1 ? 's' : ''}`}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save Attendance
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Bulk Actions */}
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <button
            onClick={() => markAll('present')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100"
          >
            <UserCheck className="w-3.5 h-3.5" /> Mark All Present
          </button>
          <button
            onClick={() => markAll('absent')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100"
          >
            <UserX className="w-3.5 h-3.5" /> Mark All Absent
          </button>
        </div>

        {/* Mentee List */}
        <div className="space-y-2">
          {mentees.map(m => {
            const att = localAttendance[m.id];
            return (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  {m.profilePictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.profilePictureUrl} alt={m.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs shrink-0">
                      {m.avatar || getInitials(m.name)}
                    </div>
                  )}
                  <span className="text-sm font-medium text-slate-900 truncate max-w-[140px] sm:max-w-[200px]">
                    {m.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shrink-0">
                  {(['present', 'absent', 'excused'] as Attendance[]).map(status => {
                    const isActive = att === status;
                    let activeCls = 'bg-slate-100 text-slate-600';
                    if (isActive) {
                      if (status === 'present') activeCls = 'bg-emerald-100 text-emerald-700 font-medium border-emerald-200';
                      else if (status === 'absent') activeCls = 'bg-red-100 text-red-700 font-medium border-red-200';
                      else activeCls = 'bg-slate-200 text-slate-800 font-medium border-slate-300';
                    } else {
                      activeCls = 'text-slate-500 hover:bg-slate-50 border-transparent';
                    }

                    return (
                      <button
                        key={status}
                        onClick={() => markOne(m.id, status)}
                        className={`px-3 py-1 rounded-md text-xs capitalize transition-colors border ${activeCls}`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
