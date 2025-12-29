'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, TrendingUp, CheckCircle, Clock, Search, Filter, UserCheck, Mail } from 'lucide-react';

export default function EnrollmentOverview() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');

  const stats = [
    { title: 'Total Enrollments', value: '248', icon: Users, change: '+12% this month' },
    { title: 'Active Students', value: '189', icon: TrendingUp, change: '76% active rate' },
    { title: 'Completed', value: '45', icon: CheckCircle, change: '18% completion' },
    { title: 'Pending Approval', value: '14', icon: Clock, change: '5.6% pending' },
  ];

  const enrollments = [
    {
      id: 1,
      studentName: 'Alice Johnson',
      email: 'alice@example.com',
      program: 'Full Stack Web Development',
      enrolledDate: '2024-01-15',
      status: 'active',
      progress: 45,
      mentor: 'John Smith',
    },
    {
      id: 2,
      studentName: 'Bob Williams',
      email: 'bob@example.com',
      program: 'Data Science Fundamentals',
      enrolledDate: '2024-01-18',
      status: 'active',
      progress: 30,
      mentor: 'Sarah Lee',
    },
    {
      id: 3,
      studentName: 'Carol Davis',
      email: 'carol@example.com',
      program: 'UI/UX Design Mastery',
      enrolledDate: '2024-01-20',
      status: 'pending',
      progress: 0,
      mentor: 'Unassigned',
    },
    {
      id: 4,
      studentName: 'David Martinez',
      email: 'david@example.com',
      program: 'Full Stack Web Development',
      enrolledDate: '2024-01-10',
      status: 'completed',
      progress: 100,
      mentor: 'John Smith',
    },
    {
      id: 5,
      studentName: 'Emma Wilson',
      email: 'emma@example.com',
      program: 'Data Science Fundamentals',
      enrolledDate: '2024-01-22',
      status: 'active',
      progress: 60,
      mentor: 'Sarah Lee',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Enrollment Overview</h1>
        <p className="text-muted-foreground mt-2">
          Manage and monitor student enrollments across all programs
        </p>
      </div>

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

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Enrollment Management</CardTitle>
          <CardDescription>Filter and search through student enrollments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by student name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={programFilter} onValueChange={setProgramFilter}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="All Programs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                <SelectItem value="fullstack">Full Stack Development</SelectItem>
                <SelectItem value="datascience">Data Science</SelectItem>
                <SelectItem value="uiux">UI/UX Design</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Enrollments Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Enrolled Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Mentor</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => (
                  <TableRow key={enrollment.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{enrollment.studentName}</div>
                        <div className="text-sm text-muted-foreground">{enrollment.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{enrollment.program}</TableCell>
                    <TableCell>{enrollment.enrolledDate}</TableCell>
                    <TableCell>{getStatusBadge(enrollment.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-secondary rounded-full h-2 max-w-[100px]">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${enrollment.progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground min-w-[40px]">
                          {enrollment.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{enrollment.mentor}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline">
                          View
                        </Button>
                        {enrollment.status === 'pending' && (
                          <Button size="sm">Approve</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
