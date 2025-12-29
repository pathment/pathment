'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Clock, CheckCircle, AlertCircle, Calendar, FileText, Target } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function TaskList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const tasks = [
    {
      id: 1,
      title: 'Build React Dashboard',
      program: 'Full Stack Web Development',
      description: 'Create a responsive dashboard using React and Chart.js',
      status: 'in_progress',
      type: 'project',
      difficulty: 'intermediate',
      deadline: '2024-01-25',
      daysLeft: 3,
      estimatedHours: 8,
      progress: 45,
      mentor: 'John Smith',
    },
    {
      id: 2,
      title: 'Database Schema Design',
      program: 'Full Stack Web Development',
      description: 'Design a normalized database schema for an e-commerce application',
      status: 'assigned',
      type: 'exercise',
      difficulty: 'intermediate',
      deadline: '2024-01-28',
      daysLeft: 6,
      estimatedHours: 4,
      progress: 0,
      mentor: 'John Smith',
    },
    {
      id: 3,
      title: 'API Documentation',
      program: 'Full Stack Web Development',
      description: 'Write comprehensive API documentation using OpenAPI/Swagger',
      status: 'completed',
      type: 'project',
      difficulty: 'beginner',
      deadline: '2024-01-20',
      completedDate: '2024-01-19',
      score: 95,
      feedback: 'Excellent work! Very thorough documentation.',
      estimatedHours: 3,
      progress: 100,
      mentor: 'John Smith',
    },
    {
      id: 4,
      title: 'Unit Testing Practice',
      program: 'Full Stack Web Development',
      description: 'Write unit tests for the authentication module using Jest',
      status: 'submitted',
      type: 'exercise',
      difficulty: 'intermediate',
      deadline: '2024-01-23',
      submittedDate: '2024-01-22',
      estimatedHours: 5,
      progress: 100,
      mentor: 'John Smith',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <Badge variant="secondary">Not Started</Badge>;
      case 'in_progress':
        return <Badge variant="default">In Progress</Badge>;
      case 'submitted':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Awaiting Review</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-500';
      case 'intermediate':
        return 'text-yellow-500';
      case 'advanced':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <Target className="h-4 w-4" />;
      case 'exercise':
        return <FileText className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const activeTasks = tasks.filter(t => ['assigned', 'in_progress'].includes(t.status));
  const submittedTasks = tasks.filter(t => t.status === 'submitted');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Tasks</h1>
        <p className="text-muted-foreground mt-2">
          Manage your assignments and track your progress
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTasks.length}</div>
            <p className="text-xs text-muted-foreground mt-1">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Submitted</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submittedTasks.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks.length}</div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85%</div>
            <p className="text-xs text-muted-foreground mt-1">Overall</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active ({activeTasks.length})</TabsTrigger>
          <TabsTrigger value="submitted">Submitted ({submittedTasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getTypeIcon(task.type)}
                            <h3 className="font-semibold text-lg">{task.title}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(task.status)}
                            <Badge variant="outline" className="capitalize">
                              {task.type}
                            </Badge>
                            <Badge variant="outline" className={getDifficultyColor(task.difficulty)}>
                              {task.difficulty}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{task.program}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">
                              {task.daysLeft} days left
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Due {task.deadline}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{task.estimatedHours} hours</div>
                            <div className="text-xs text-muted-foreground">Estimated time</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{task.progress}%</div>
                            <div className="text-xs text-muted-foreground">Progress</div>
                          </div>
                        </div>
                      </div>

                      {task.status === 'in_progress' && (
                        <div>
                          <Progress value={task.progress} className="h-2" />
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Link href={`/mentee/tasks/submit/${task.id}`} className="flex-1">
                          <Button className="w-full">
                            {task.status === 'in_progress' ? 'Continue Working' : 'Start Task'}
                          </Button>
                        </Link>
                        <Button variant="outline">View Details</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submitted" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {submittedTasks.map((task) => (
                <div key={task.id} className="p-4 border border-border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{task.title}</h3>
                      <p className="text-sm text-muted-foreground">{task.program}</p>
                    </div>
                    {getStatusBadge(task.status)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Submitted on {task.submittedDate} • Awaiting feedback from {task.mentor}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {completedTasks.map((task) => (
                <div key={task.id} className="p-4 border border-border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{task.title}</h3>
                      <p className="text-sm text-muted-foreground">{task.program}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{task.score}</div>
                      <div className="text-xs text-muted-foreground">Score</div>
                    </div>
                  </div>
                  {task.feedback && (
                    <p className="text-sm text-muted-foreground italic mb-2">"{task.feedback}"</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Completed {task.completedDate}</span>
                    <span>•</span>
                    <span>Reviewed by {task.mentor}</span>
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
