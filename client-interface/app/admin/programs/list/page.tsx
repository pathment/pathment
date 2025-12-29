'use client';

import Link from 'next/link';
import { 
  BookOpen, 
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ProgramListPage() {
  const programs = [
    { 
      id: 1, 
      name: 'Full Stack Development Bootcamp', 
      description: 'Comprehensive program covering frontend and backend development',
      type: 'Technical',
      enrollments: 45, 
      status: 'active', 
      duration: '12 weeks',
      startDate: '2024-01-15'
    },
    { 
      id: 2, 
      name: 'UI/UX Design Mastery', 
      description: 'Learn modern design principles and tools',
      type: 'Creative',
      enrollments: 32, 
      status: 'active', 
      duration: '8 weeks',
      startDate: '2024-01-20'
    },
    { 
      id: 3, 
      name: 'Data Science Fundamentals', 
      description: 'Master data analysis and machine learning basics',
      type: 'Technical',
      enrollments: 28, 
      status: 'active', 
      duration: '10 weeks',
      startDate: '2024-02-01'
    },
    { 
      id: 4, 
      name: 'Mobile App Development', 
      description: 'Build cross-platform mobile applications',
      type: 'Technical',
      enrollments: 51, 
      status: 'draft', 
      duration: '14 weeks',
      startDate: '2024-03-01'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Programs</h1>
          <p className="text-muted-foreground mt-2">
            Manage all mentorship programs
          </p>
        </div>
        <Link href="/admin/programs/create">
          <Button className="mt-4 sm:mt-0">
            <Plus className="w-4 h-4 mr-2" />
            Create Program
          </Button>
        </Link>
      </div>

      {/* Programs Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {programs.map((program) => (
          <Card key={program.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <Badge variant={program.status === 'active' ? 'default' : 'secondary'}>
                  {program.status}
                </Badge>
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardTitle className="line-clamp-1">{program.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {program.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium">{program.type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{program.duration}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Enrollments:</span>
                  <span className="font-medium">{program.enrollments}</span>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <Link href={`/admin/programs/${program.id}`} className="flex-1">
                  <Button variant="outline" className="w-full" size="sm">
                    View Details
                  </Button>
                </Link>
                <Link href={`/admin/roadmap/generate?programId=${program.id}`} className="flex-1">
                  <Button variant="default" className="w-full" size="sm">
                    Generate Roadmap
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
