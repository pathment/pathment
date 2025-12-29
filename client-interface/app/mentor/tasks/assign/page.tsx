'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Save, CalendarIcon, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

export default function TaskAssignment() {
  const router = useRouter();
  const [deadline, setDeadline] = useState<Date>();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    menteeId: '',
    type: '',
    difficulty: '',
    estimatedHours: '',
    resources: [] as string[],
  });
  const [resourceInput, setResourceInput] = useState('');

  const mentees = [
    { id: '1', name: 'Alice Johnson', program: 'Full Stack Dev', progress: 45 },
    { id: '2', name: 'Bob Williams', program: 'Data Science', progress: 60 },
    { id: '3', name: 'Carol Davis', program: 'UI/UX Design', progress: 30 },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Task assignment:', { ...formData, deadline });
    router.push('/mentor/dashboard');
  };

  const addResource = () => {
    if (resourceInput.trim() && !formData.resources.includes(resourceInput.trim())) {
      setFormData({ ...formData, resources: [...formData.resources, resourceInput.trim()] });
      setResourceInput('');
    }
  };

  const removeResource = (resource: string) => {
    setFormData({ ...formData, resources: formData.resources.filter(r => r !== resource) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/mentor/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Assign Task</h1>
          <p className="text-muted-foreground mt-1">
            Create and assign a new task to your mentees
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Task Details</CardTitle>
                <CardDescription>Define the task requirements and objectives</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Task Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Build a REST API with Express"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Provide detailed instructions, requirements, and learning objectives..."
                    rows={6}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="type">Task Type</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="exercise">Exercise</SelectItem>
                        <SelectItem value="reading">Reading</SelectItem>
                        <SelectItem value="research">Research</SelectItem>
                        <SelectItem value="presentation">Presentation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Select value={formData.difficulty} onValueChange={(value) => setFormData({ ...formData, difficulty: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="estimatedHours">Estimated Hours</Label>
                    <Input
                      id="estimatedHours"
                      type="number"
                      placeholder="e.g., 8"
                      value={formData.estimatedHours}
                      onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Deadline</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {deadline ? format(deadline, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={deadline} onSelect={setDeadline} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resources">Resources & Links</Label>
                  <div className="flex gap-2">
                    <Input
                      id="resources"
                      placeholder="Add documentation links, tutorials, or reference materials"
                      value={resourceInput}
                      onChange={(e) => setResourceInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResource())}
                    />
                    <Button type="button" onClick={addResource} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.resources.map((resource) => (
                      <Badge key={resource} variant="secondary" className="gap-1">
                        {resource}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeResource(resource)} />
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Assign To</CardTitle>
                <CardDescription>Select mentee for this task</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={formData.menteeId} onValueChange={(value) => setFormData({ ...formData, menteeId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose mentee" />
                  </SelectTrigger>
                  <SelectContent>
                    {mentees.map((mentee) => (
                      <SelectItem key={mentee.id} value={mentee.id}>
                        <div className="flex flex-col">
                          <span>{mentee.name}</span>
                          <span className="text-xs text-muted-foreground">{mentee.program}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {formData.menteeId && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Mentee Progress</h4>
                    <div className="space-y-2">
                      {mentees
                        .filter((m) => m.id === formData.menteeId)
                        .map((mentee) => (
                          <div key={mentee.id}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">{mentee.program}</span>
                              <span className="font-medium">{mentee.progress}%</span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${mentee.progress}%` }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Tips</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• Be specific with task requirements</p>
                <p>• Set realistic deadlines</p>
                <p>• Provide helpful resources</p>
                <p>• Match difficulty to mentee's level</p>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" size="lg">
              <Save className="h-4 w-4 mr-2" />
              Assign Task
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
