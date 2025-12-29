'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, Clock, AlertCircle } from 'lucide-react';

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

export function MentorStats() {
  const stats = [
    { title: 'Active Mentees', value: '8', icon: CheckSquare, change: '2 new this week' },
    { title: 'Pending Reviews', value: '5', icon: Clock, change: '3 high priority' },
    { title: 'Tasks Assigned', value: '24', icon: AlertCircle, change: 'This month' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat) => (
        <StatsCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
