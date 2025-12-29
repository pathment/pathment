'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ArrowRight } from 'lucide-react';

export function RecentActivity() {
  const activities = [
    {
      id: 1,
      type: 'enrollment',
      title: 'New Enrollment',
      description: 'Alice Johnson enrolled in Full Stack Web Development',
      time: '2 hours ago',
      status: 'pending',
    },
    {
      id: 2,
      type: 'program',
      title: 'Program Updated',
      description: 'Data Science Fundamentals roadmap was updated',
      time: '5 hours ago',
      status: 'completed',
    },
    {
      id: 3,
      type: 'matching',
      title: 'Mentor Matched',
      description: 'Bob Williams matched with Sarah Lee',
      time: '1 day ago',
      status: 'completed',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system activities and updates</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start justify-between p-3 border border-border rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{activity.title}</div>
                <div className="text-sm text-muted-foreground">{activity.description}</div>
                <div className="text-xs text-muted-foreground mt-1">{activity.time}</div>
              </div>
              <StatusBadge status={activity.status as 'pending' | 'completed'} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
