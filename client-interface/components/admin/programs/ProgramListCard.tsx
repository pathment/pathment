'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

interface Program {
  id: number;
  title: string;
  enrolled: number;
  maxEnrollments: number;
  status: string;
}

export function ProgramListCard({ programs }: { programs?: Program[] }) {
  const defaultPrograms = programs || [
    { id: 1, title: 'Full Stack Web Development', enrolled: 45, maxEnrollments: 50, status: 'active' },
    { id: 2, title: 'Data Science Fundamentals', enrolled: 38, maxEnrollments: 40, status: 'active' },
    { id: 3, title: 'UI/UX Design Mastery', enrolled: 30, maxEnrollments: 35, status: 'active' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Programs</CardTitle>
          <Link href="/admin/programs/list">
            <Button variant="outline" size="sm">
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {defaultPrograms.map((program) => (
            <div key={program.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{program.title}</div>
                <div className="text-sm text-muted-foreground">
                  {program.enrolled}/{program.maxEnrollments} enrolled
                </div>
              </div>
              <Badge variant="default">{program.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
