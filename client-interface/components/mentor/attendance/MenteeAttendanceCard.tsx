import React from 'react';

type Attendance = 'present' | 'absent' | 'excused' | null;

interface MenteeAttendanceCardProps {
  mentee: { id: string; name: string };
  attendance: Attendance;
  isActive: boolean;
  onClick: () => void;
}

export function MenteeAttendanceCard({ mentee, attendance, isActive, onClick }: MenteeAttendanceCardProps) {
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getGlassmorphismStyle = (att: Attendance) => {
    switch (att) {
      case 'present':
        return 'bg-emerald-500/10 backdrop-blur-md border-emerald-500/20 text-emerald-700';
      case 'absent':
        return 'bg-red-500/10 backdrop-blur-md border-red-500/20 text-red-700';
      case 'excused':
        return 'bg-slate-500/10 backdrop-blur-md border-slate-500/20 text-slate-700';
      default:
        return 'bg-slate-100/50 backdrop-blur-md border-slate-200 text-slate-500';
    }
  };

  const getStatusDot = (att: Attendance) => {
    switch (att) {
      case 'present':
        return 'bg-emerald-500';
      case 'absent':
        return 'bg-red-500';
      case 'excused':
        return 'bg-slate-500';
      default:
        return 'bg-slate-300';
    }
  };

  const style = getGlassmorphismStyle(attendance);
  const dotStyle = getStatusDot(attendance);

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 p-3 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md shrink-0 w-64 ${
        isActive ? 'ring-2 ring-brand-500 border-brand-200' : 'border-slate-200 hover:border-brand-300 bg-card'
      }`}
    >
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
          {getInitials(mentee.name)}
        </div>
        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${dotStyle}`} />
      </div>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-slate-900 truncate">{mentee.name}</p>
        <div className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium capitalize ${style}`}>
          {attendance || 'Not Marked'}
        </div>
      </div>
    </button>
  );
}
