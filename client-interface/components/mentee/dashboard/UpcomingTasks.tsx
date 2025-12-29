'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle, ArrowRight } from 'lucide-react';

interface Task {
  id: number;
  title: string;
  program: string;
  deadline: string;
  daysLeft: number;
  priority: string;
  status: string;
}

export function UpcomingTasks({ tasks }: { tasks?: Task[] }) {
  const defaultTasks = tasks || [
    {
      id: 1,
      title: 'Build React Dashboard',
      program: 'Full Stack Dev',
      deadline: '2 days',
      daysLeft: 2,
      priority: 'high',
      status: 'in_progress',
    },
    {
      id: 2,
      title: 'Design System Component',
      program: 'UI/UX Design',
      deadline: '4 days',
      daysLeft: 4,
      priority: 'medium',
      status: 'assigned',
    },
    {
      id: 3,
      title: 'Data Analysis Project',
      program: 'Data Science',
      deadline: '1 week',
      daysLeft: 7,
      priority: 'low',
      status: 'assigned',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Upcoming Tasks</CardTitle>
            <CardDescription>Your next assignments and deadlines</CardDescription>
          </div>
          <Link href="/mentee/tasks/list">
            <Button variant="outline" size="sm">
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {defaultTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors">
              <div className="space-y-1 flex-1">
                <div className="font-medium">{task.title}</div>
                <div className="text-sm text-muted-foreground">{task.program}</div>
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3 w-3" />
                  <span className="text-muted-foreground">Due in {task.deadline}</span>
                  {task.priority === 'high' && (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive ml-2" />
                      <span className="text-destructive">High Priority</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={task.status === 'in_progress' ? 'default' : 'secondary'}>
                  {task.status === 'in_progress' ? 'In Progress' : 'Assigned'}
                </Badge>
                <Link href={`/mentee/tasks/submit/${task.id}`}>
                  <Button size="sm" variant={task.status === 'in_progress' ? 'default' : 'outline'}>
                    {task.status === 'in_progress' ? 'Submit' : 'Start'}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
