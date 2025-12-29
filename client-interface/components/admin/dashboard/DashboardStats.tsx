'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, BookOpen, Award } from 'lucide-react';

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

export function DashboardStats() {
  const stats = [
    { title: 'Total Programs', value: '12', icon: BookOpen, change: '+2 this month' },
    { title: 'Active Mentors', value: '45', icon: Users, change: '+5 this week' },
    { title: 'Total Mentees', value: '248', icon: TrendingUp, change: '+18 this month' },
    { title: 'Success Rate', value: '94%', icon: Award, change: '+2% from last month' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatsCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
