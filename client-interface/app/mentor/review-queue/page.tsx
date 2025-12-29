'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Clock, AlertCircle, CheckCircle, FileText, Calendar, User } from 'lucide-react';

export default function ReviewQueue() {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const submissions = [
    {
      id: 1,
      taskTitle: 'Build REST API with Express',
      studentName: 'Alice Johnson',
      submittedDate: '2024-01-20',
      daysAgo: 2,
      status: 'pending',
      priority: 'high',
      type: 'project',
      submissionUrl: '#',
    },
    {
      id: 2,
      taskTitle: 'React Component Library',
      studentName: 'Bob Williams',
      submittedDate: '2024-01-19',
      daysAgo: 3,
      status: 'pending',
      priority: 'medium',
      type: 'project',
      submissionUrl: '#',
    },
    {
      id: 3,
      taskTitle: 'Database Design Exercise',
      studentName: 'Carol Davis',
      submittedDate: '2024-01-21',
      daysAgo: 1,
      status: 'pending',
      priority: 'high',
      type: 'exercise',
      submissionUrl: '#',
    },
    {
      id: 4,
      taskTitle: 'Algorithm Analysis',
      studentName: 'David Martinez',
      submittedDate: '2024-01-18',
      daysAgo: 4,
      status: 'in_review',
      priority: 'low',
      type: 'research',
      submissionUrl: '#',
    },
  ];

  const recentlyReviewed = [
    {
      id: 5,
      taskTitle: 'API Documentation',
      studentName: 'Emma Wilson',
      reviewedDate: '2024-01-21',
      score: 95,
      feedback: 'Excellent work! Clear and comprehensive documentation.',
    },
    {
      id: 6,
      taskTitle: 'UI Mockup Design',
      studentName: 'Frank Thomas',
      reviewedDate: '2024-01-20',
      score: 88,
      feedback: 'Good design principles. Consider improving color contrast.',
    },
  ];

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">High Priority</Badge>;
      case 'medium':
        return <Badge variant="default">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pending Review</Badge>;
      case 'in_review':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">In Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Review Queue</h1>
        <p className="text-muted-foreground mt-2">
          Review and provide feedback on mentee submissions
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {submissions.filter((s) => s.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting your review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {submissions.filter((s) => s.priority === 'high').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Urgent submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {submissions.filter((s) => s.status === 'in_review').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently reviewing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reviewed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentlyReviewed.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed reviews</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">Pending ({submissions.filter(s => s.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="in_review">In Review ({submissions.filter(s => s.status === 'in_review').length})</TabsTrigger>
          <TabsTrigger value="reviewed">Recently Reviewed ({recentlyReviewed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search submissions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="All Priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="low">Low Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {submissions
                .filter((s) => s.status === 'pending')
                .map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-start justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{submission.taskTitle}</h3>
                        {getPriorityBadge(submission.priority)}
                        <Badge variant="outline" className="text-xs">{submission.type}</Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{submission.studentName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Submitted {submission.daysAgo} days ago</span>
                        </div>
                      </div>

                      {submission.daysAgo >= 3 && (
                        <div className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          <span>Submission is overdue for review</span>
                        </div>
                      )}
                    </div>

                    <Link href={`/mentor/tasks/review/${submission.id}`}>
                      <Button>Review Now</Button>
                    </Link>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="in_review" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {submissions
                .filter((s) => s.status === 'in_review')
                .map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-start justify-between p-4 border border-border rounded-lg"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{submission.taskTitle}</h3>
                        {getStatusBadge(submission.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{submission.studentName}</span>
                        <span>•</span>
                        <span>Started {submission.daysAgo} days ago</span>
                      </div>
                    </div>
                    <Link href={`/mentor/tasks/review/${submission.id}`}>
                      <Button variant="outline">Continue Review</Button>
                    </Link>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviewed" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {recentlyReviewed.map((review) => (
                <div
                  key={review.id}
                  className="p-4 border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{review.taskTitle}</h3>
                      <p className="text-sm text-muted-foreground">{review.studentName}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{review.score}</div>
                      <div className="text-xs text-muted-foreground">Score</div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic">"{review.feedback}"</p>
                  <div className="text-xs text-muted-foreground mt-2">
                    Reviewed on {review.reviewedDate}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
