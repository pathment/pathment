'use client';

import { CheckSquare, BookOpen, Clock, Trophy } from 'lucide-react';
import { StatsCard } from '@/components/admin/ui';

export function MenteeStats() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard icon={CheckSquare} label="Active Tasks"       value="6"  sub="2 due this week"        colorClass="text-indigo-600 bg-indigo-50" />
      <StatsCard icon={BookOpen}    label="Programs Enrolled" value="2"  sub="1 in progress"          colorClass="text-blue-600 bg-blue-50" />
      <StatsCard icon={Clock}       label="Hours Logged"      value="42" sub="This month"             colorClass="text-green-600 bg-green-50" />
      <StatsCard icon={Trophy}      label="Tasks Completed"   value="18" sub="85% completion rate"    colorClass="text-purple-600 bg-purple-50" />
    </div>
  );
}
