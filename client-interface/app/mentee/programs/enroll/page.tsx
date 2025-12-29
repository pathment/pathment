'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Users, Clock, BookOpen, Award, TrendingUp, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function ProgramEnrollment() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const programs = [
    {
      id: 1,
      title: 'Full Stack Web Development',
      description: 'Master modern web development with React, Node.js, and databases. Build production-ready applications.',
      type: 'technical',
      level: 'intermediate',
      duration: 12,
      enrolled: 45,
      maxEnrollments: 50,
      skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
      mentor: 'John Smith',
      rating: 4.8,
      completionRate: 85,
    },
    {
      id: 2,
      title: 'Data Science Fundamentals',
      description: 'Learn data analysis, machine learning, and statistical modeling with Python and popular libraries.',
      type: 'technical',
      level: 'beginner',
      duration: 10,
      enrolled: 38,
      maxEnrollments: 40,
      skills: ['Python', 'Pandas', 'Machine Learning', 'Statistics'],
      mentor: 'Sarah Lee',
      rating: 4.9,
      completionRate: 92,
    },
    {
      id: 3,
      title: 'UI/UX Design Mastery',
      description: 'Create beautiful, user-centered designs. Learn Figma, design systems, and user research.',
      type: 'design',
      level: 'intermediate',
      duration: 8,
      enrolled: 30,
      maxEnrollments: 35,
      skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems'],
      mentor: 'Michael Chen',
      rating: 4.7,
      completionRate: 88,
    },
    {
      id: 4,
      title: 'Leadership Development',
      description: 'Develop essential leadership skills, team management, and strategic thinking capabilities.',
      type: 'leadership',
      level: 'advanced',
      duration: 6,
      enrolled: 20,
      maxEnrollments: 25,
      skills: ['Team Management', 'Strategy', 'Communication', 'Decision Making'],
      mentor: 'Emily Davis',
      rating: 4.9,
      completionRate: 90,
    },
  ];

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'beginner':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Beginner</Badge>;
      case 'intermediate':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Intermediate</Badge>;
      case 'advanced':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Advanced</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Browse Programs</h1>
        <p className="text-muted-foreground mt-2">
          Explore and enroll in mentorship programs to advance your skills
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Find Your Program</CardTitle>
          <CardDescription>Filter programs by type and difficulty level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search programs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="technical">Technical Skills</SelectItem>
                <SelectItem value="design">Design</SelectItem>
                <SelectItem value="leadership">Leadership</SelectItem>
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Programs Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {programs.map((program) => (
          <Card key={program.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <CardTitle className="text-xl mb-2">{program.title}</CardTitle>
                  <CardDescription>{program.description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {getLevelBadge(program.level)}
                <Badge variant="secondary" className="capitalize">{program.type}</Badge>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-4 mb-6">
                {/* Skills */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Skills You'll Learn</h4>
                  <div className="flex flex-wrap gap-1">
                    {program.skills.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{program.duration} weeks</div>
                      <div className="text-xs text-muted-foreground">Duration</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{program.enrolled}/{program.maxEnrollments}</div>
                      <div className="text-xs text-muted-foreground">Enrolled</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{program.rating} ⭐</div>
                      <div className="text-xs text-muted-foreground">Rating</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{program.completionRate}%</div>
                      <div className="text-xs text-muted-foreground">Completion</div>
                    </div>
                  </div>
                </div>

                {/* Availability */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Availability</span>
                    <span className="font-medium">
                      {program.maxEnrollments - program.enrolled} spots left
                    </span>
                  </div>
                  <Progress value={(program.enrolled / program.maxEnrollments) * 100} />
                </div>

                {/* Mentor */}
                <div className="flex items-center gap-2 pt-4 border-t">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Led by <span className="font-medium">{program.mentor}</span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-auto">
                <Link href={`/mentee/programs/${program.id}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    View Details
                  </Button>
                </Link>
                <Button className="flex-1">
                  Enroll Now
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
