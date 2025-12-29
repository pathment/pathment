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
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Generate Roadmap',
      description: 'AI-powered learning path creation',
      icon: GitBranch,
      href: '/admin/roadmap/generate',
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      title: 'View Enrollments',
      description: 'Manage student enrollments',
      icon: Users,
      href: '/admin/enrollment/overview',
      bgColor: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
    {
      title: 'Match Mentors',
      description: 'AI mentor-mentee matching',
      icon: UserCheck,
      href: '/admin/matching/mentor-assignment',
      bgColor: 'bg-orange-100',
      iconColor: 'text-orange-600',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {actions.map((action) => (
        <Link key={action.title} href={action.href}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-border">
            <CardContent className="pt-6">
              <div className={`h-12 w-12 rounded-xl ${action.bgColor} flex items-center justify-center mb-4`}>
                <action.icon className={`h-6 w-6 ${action.iconColor}`} />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{action.title}</h3>
              <p className="text-sm text-muted-foreground">
                {action.description}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
