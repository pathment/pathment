'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

interface Submission {
  id: number;
  taskTitle: string;
  studentName: string;
  submittedDate: string;
  priority: string;
}

export function RecentSubmissions({ submissions }: { submissions?: Submission[] }) {
  const defaultSubmissions = submissions || [
    {
      id: 1,
      taskTitle: 'Build REST API',
      studentName: 'Alice Johnson',
      submittedDate: '2 days ago',
      priority: 'high',
    },
    {
      id: 2,
      taskTitle: 'React Component Library',
      studentName: 'Bob Williams',
      submittedDate: '3 days ago',
      priority: 'medium',
    },
    {
      id: 3,
      taskTitle: 'Database Design',
      studentName: 'Carol Davis',
      submittedDate: '1 day ago',
      priority: 'high',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Submissions</CardTitle>
            <CardDescription>Latest task submissions awaiting review</CardDescription>
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
        <div className="space-y-3">
          {defaultSubmissions.map((submission) => (
            <div key={submission.id} className="flex items-start justify-between p-3 border border-border rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{submission.taskTitle}</div>
                <div className="text-sm text-muted-foreground">{submission.studentName}</div>
                <div className="text-xs text-muted-foreground mt-1">{submission.submittedDate}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={submission.priority === 'high' ? 'destructive' : 'secondary'}>
                  {submission.priority}
                </Badge>
                <Link href={`/mentor/tasks/review/${submission.id}`}>
                  <Button size="sm">Review</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
