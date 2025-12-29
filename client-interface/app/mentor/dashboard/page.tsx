'use client';

import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText } from 'lucide-react';
import { MentorStats } from '@/components/mentor/dashboard/MentorStats';
import { RecentSubmissions } from '@/components/mentor/dashboard/RecentSubmissions';

export default function MentorDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Mentor Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Review submissions and guide your mentees
        </p>
      </div>

      <MentorStats />

      <RecentSubmissions />

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/mentor/tasks/assign">
            <CardHeader>
              <Plus className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Assign Task</CardTitle>
              <CardDescription>
                Create and assign a new task to your mentees
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/mentor/review-queue">
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Review Queue</CardTitle>
              <CardDescription>
                Review pending task submissions
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>
    </div>
  );
}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Submissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Submissions</CardTitle>
              <CardDescription>Latest task submissions from your mentees</CardDescription>
            </div>
            <Link href="/mentor/review-queue">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentSubmissions.map((submission) => (
              <div key={submission.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="space-y-1">
                  <div className="font-medium">{submission.task}</div>
                  <div className="text-sm text-muted-foreground">
                    {submission.mentee} • {submission.program}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {submission.submittedAt}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Pending</Badge>
                  <Link href={`/mentor/tasks/review/${submission.id}`}>
                    <Button size="sm">Review</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/mentor/tasks/assign">
            <CardHeader>
              <Plus className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Assign New Task</CardTitle>
              <CardDescription>
                Create and assign tasks to your mentees
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/mentor/mentees">
            <CardHeader>
              <Users className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>View Mentees</CardTitle>
              <CardDescription>
                Track progress and manage your mentees
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>
    </div>
  );
}

