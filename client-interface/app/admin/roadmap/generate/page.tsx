'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ChevronDown, ChevronUp, Calendar, Target, Clock } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export default function RoadmapGenerator() {
  const [programId, setProgramId] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRoadmap, setGeneratedRoadmap] = useState<any>(null);

  const programs = [
    { id: '1', title: 'Full Stack Web Development' },
    { id: '2', title: 'Data Science Fundamentals' },
    { id: '3', title: 'UI/UX Design Mastery' },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    // Simulate API call
    setTimeout(() => {
      setGeneratedRoadmap({
        programTitle: programs.find(p => p.id === programId)?.title,
        totalWeeks: 12,
        weeks: [
          {
            weekNumber: 1,
            title: 'Foundation & Setup',
            description: 'Get started with development environment and core concepts',
            tasks: [
              { title: 'Install Development Tools', duration: '2 hours', difficulty: 'beginner', type: 'setup' },
              { title: 'Learn Git Basics', duration: '3 hours', difficulty: 'beginner', type: 'learning' },
              { title: 'HTML & CSS Fundamentals', duration: '5 hours', difficulty: 'beginner', type: 'project' },
            ],
          },
          {
            weekNumber: 2,
            title: 'JavaScript Essentials',
            description: 'Master JavaScript fundamentals and ES6+ features',
            tasks: [
              { title: 'Variables, Data Types, Functions', duration: '4 hours', difficulty: 'beginner', type: 'learning' },
              { title: 'Arrays and Objects', duration: '3 hours', difficulty: 'beginner', type: 'practice' },
              { title: 'Build a Simple Calculator', duration: '3 hours', difficulty: 'intermediate', type: 'project' },
            ],
          },
          {
            weekNumber: 3,
            title: 'React Introduction',
            description: 'Start building modern web applications with React',
            tasks: [
              { title: 'React Components & Props', duration: '4 hours', difficulty: 'intermediate', type: 'learning' },
              { title: 'State and Lifecycle', duration: '3 hours', difficulty: 'intermediate', type: 'learning' },
              { title: 'Build a Todo App', duration: '5 hours', difficulty: 'intermediate', type: 'project' },
            ],
          },
        ],
      });
      setIsGenerating(false);
    }, 2000);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'intermediate':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'advanced':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <Target className="h-4 w-4" />;
      case 'learning':
        return <Calendar className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">AI Roadmap Generator</h1>
        <p className="text-muted-foreground mt-2">
          Generate personalized learning roadmaps using AI
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Select a program and provide context for AI generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="program">Select Program</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="context">Additional Context (Optional)</Label>
              <Textarea
                id="context"
                placeholder="E.g., Focus on modern frameworks, include hands-on projects, target beginners..."
                rows={6}
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!programId || isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Generating Roadmap...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview/Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>AI-powered roadmap generation process</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                1
              </div>
              <div>
                <h4 className="font-medium">Select Program</h4>
                <p className="text-sm text-muted-foreground">
                  Choose the program you want to generate a roadmap for
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                2
              </div>
              <div>
                <h4 className="font-medium">Provide Context</h4>
                <p className="text-sm text-muted-foreground">
                  Add specific requirements or focus areas for better customization
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                3
              </div>
              <div>
                <h4 className="font-medium">AI Generation</h4>
                <p className="text-sm text-muted-foreground">
                  Our AI analyzes program details and creates a structured roadmap
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                4
              </div>
              <div>
                <h4 className="font-medium">Review & Customize</h4>
                <p className="text-sm text-muted-foreground">
                  Review the generated roadmap and make adjustments as needed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generated Roadmap */}
      {generatedRoadmap && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated Roadmap</CardTitle>
                <CardDescription>
                  {generatedRoadmap.programTitle} • {generatedRoadmap.totalWeeks} weeks
                </CardDescription>
              </div>
              <Button>Save Roadmap</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {generatedRoadmap.weeks.map((week: any) => (
                <AccordionItem key={week.weekNumber} value={`week-${week.weekNumber}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-semibold text-primary">
                        {week.weekNumber}
                      </div>
                      <div>
                        <div className="font-semibold">{week.title}</div>
                        <div className="text-sm text-muted-foreground">{week.description}</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-14 space-y-3 pt-2">
                      {week.tasks.map((task: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-start justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex gap-3 flex-1">
                            <div className="mt-1">{getTypeIcon(task.type)}</div>
                            <div className="flex-1">
                              <div className="font-medium">{task.title}</div>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className={getDifficultyColor(task.difficulty)}>
                                  {task.difficulty}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {task.duration}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  {task.type}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
