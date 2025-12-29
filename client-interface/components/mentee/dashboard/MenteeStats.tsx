'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, BookOpen, Clock, Trophy } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  change: string;
}

function StatsCard({ title, value, icon: Icon, change }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{change}</p>
      </CardContent>
    </Card>
  );
}

export function MenteeStats() {
  const stats = [
    { title: 'Active Tasks', value: '6', icon: CheckSquare, change: '2 due this week' },
    { title: 'Programs Enrolled', value: '2', icon: BookOpen, change: '1 in progress' },
    { title: 'Hours Logged', value: '42', icon: Clock, change: 'This month' },
    { title: 'Tasks Completed', value: '18', icon: Trophy, change: '85% completion rate' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatsCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
