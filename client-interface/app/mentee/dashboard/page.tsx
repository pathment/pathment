'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, CheckSquare, Trophy, ArrowRight } from 'lucide-react';
import { MenteeStats } from '@/components/mentee/dashboard/MenteeStats';
import { UpcomingTasks } from '@/components/mentee/dashboard/UpcomingTasks';

export default function MenteeDashboard() {
  const recentFeedback = [
    { id: 1, task: 'API Integration', mentor: 'John Smith', rating: 5, feedback: 'Excellent work! Great attention to detail.' },
    { id: 2, task: 'UI Mockups', mentor: 'Sarah Lee', rating: 4, feedback: 'Good progress. Consider mobile responsiveness.' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Mentee Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Track your learning progress and upcoming tasks
        </p>
      </div>

      <MenteeStats />

      <UpcomingTasks />

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Feedback</CardTitle>
              <CardDescription>Latest feedback from your mentors</CardDescription>
            </div>
            <Link href="/mentee/feedback">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentFeedback.map((item) => (
              <div key={item.id} className="p-4 border border-border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium">{item.task}</div>
                    <div className="text-sm text-muted-foreground">{item.mentor}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Trophy key={i} className={`h-4 w-4 ${i < item.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground italic">"{item.feedback}"</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/mentee/programs/enroll">
            <CardHeader>
              <BookOpen className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Explore Programs</CardTitle>
              <CardDescription>
                Browse and enroll in new mentorship programs
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/mentee/tasks/list">
            <CardHeader>
              <CheckSquare className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>My Tasks</CardTitle>
              <CardDescription>
                View and manage all your assigned tasks
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>
    </div>
  );
}

