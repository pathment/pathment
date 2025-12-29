'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, GitBranch, Users, UserCheck } from 'lucide-react';

export function QuickActions() {
  const actions = [
    {
      title: 'Create Program',
      description: 'Set up a new mentorship program',
      icon: Plus,
      href: '/admin/programs/create',
      color: 'text-blue-500',
    },
    {
      title: 'Generate Roadmap',
      description: 'AI-powered learning path creation',
      icon: GitBranch,
      href: '/admin/roadmap/generate',
      color: 'text-green-500',
    },
    {
      title: 'View Enrollments',
      description: 'Manage student enrollments',
      icon: Users,
      href: '/admin/enrollment/overview',
      color: 'text-purple-500',
    },
    {
      title: 'Match Mentors',
      description: 'AI mentor-mentee matching',
      icon: UserCheck,
      href: '/admin/matching/mentor-assignment',
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {actions.map((action) => (
        <Link key={action.title} href={action.href}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader>
              <action.icon className={`h-8 w-8 mb-2 ${action.color}`} />
              <CardTitle className="text-base">{action.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                {action.description}
              </p>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
