'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Award, TrendingUp, MessageSquare, Calendar, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function FeedbackView() {
  const feedbackItems = [
    {
      id: 1,
      taskTitle: 'API Documentation',
      program: 'Full Stack Web Development',
      mentor: 'John Smith',
      reviewedDate: '2024-01-21',
      score: 95,
      strengths: [
        'Excellent clarity and organization',
        'Comprehensive endpoint coverage',
        'Good use of examples and code samples',
      ],
      improvements: [
        'Add authentication flow diagrams',
        'Include error code reference table',
      ],
      generalFeedback: 'Outstanding work! Your documentation is clear, well-structured, and thorough. The examples you provided make it easy to understand how to use each endpoint. For future iterations, consider adding visual diagrams for complex flows like authentication.',
      skills: [
        { name: 'Technical Writing', rating: 5 },
        { name: 'API Design', rating: 4 },
        { name: 'Documentation', rating: 5 },
      ],
    },
    {
      id: 2,
      taskTitle: 'UI Mockup Design',
      program: 'Full Stack Web Development',
      mentor: 'John Smith',
      reviewedDate: '2024-01-20',
      score: 88,
      strengths: [
        'Clean and modern design aesthetic',
        'Good understanding of component hierarchy',
        'Consistent spacing and typography',
      ],
      improvements: [
        'Improve color contrast for accessibility',
        'Add mobile breakpoint variants',
        'Consider dark mode implementation',
      ],
      generalFeedback: 'Great job on the overall design! The layout is intuitive and the visual hierarchy is clear. Pay more attention to accessibility guidelines, particularly color contrast ratios. Also, think about responsive design earlier in your process.',
      skills: [
        { name: 'UI Design', rating: 4 },
        { name: 'Figma', rating: 4 },
        { name: 'Accessibility', rating: 3 },
      ],
    },
    {
      id: 3,
      taskTitle: 'React Component Library',
      program: 'Full Stack Web Development',
      mentor: 'John Smith',
      reviewedDate: '2024-01-18',
      score: 92,
      strengths: [
        'Well-structured component architecture',
        'Good TypeScript type definitions',
        'Comprehensive test coverage',
      ],
      improvements: [
        'Add more prop variants for flexibility',
        'Improve component documentation',
      ],
      generalFeedback: 'Impressive work building a reusable component library! Your code is clean and well-tested. The TypeScript usage is excellent. Consider adding Storybook for better component documentation and visual testing.',
      skills: [
        { name: 'React', rating: 5 },
        { name: 'TypeScript', rating: 5 },
        { name: 'Testing', rating: 4 },
      ],
    },
  ];

  const stats = {
    averageScore: 91.7,
    totalReviews: 15,
    improvement: '+8%',
    strengthAreas: ['React', 'TypeScript', 'Documentation'],
    growthAreas: ['Accessibility', 'Mobile Design', 'Performance'],
  };

  const renderStarRating = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <Award
            key={i}
            className={`h-4 w-4 ${
              i < rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Feedback & Reviews</h1>
        <p className="text-muted-foreground mt-2">
          Track your progress and learn from mentor feedback
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageScore}</div>
            <p className="text-xs text-green-500 mt-1">{stats.improvement} from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalReviews}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Skills Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Technical Skills</span>
                  <span className="font-medium">92%</span>
                </div>
                <Progress value={92} className="h-1.5" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Design Skills</span>
                  <span className="font-medium">85%</span>
                </div>
                <Progress value={85} className="h-1.5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strengths & Growth Areas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Strength Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.strengthAreas.map((skill) => (
                <Badge key={skill} className="bg-green-500/10 text-green-500 border-green-500/20">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Growth Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.growthAreas.map((skill) => (
                <Badge key={skill} variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Feedback</CardTitle>
          <CardDescription>Review mentor feedback on your submissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {feedbackItems.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">{item.taskTitle}</CardTitle>
                      <CardDescription>{item.program}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary">{item.score}</div>
                      <div className="text-xs text-muted-foreground">Score</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                    <Calendar className="h-3 w-3" />
                    <span>Reviewed on {item.reviewedDate}</span>
                    <span>•</span>
                    <span>By {item.mentor}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* General Feedback */}
                  <div>
                    <h4 className="font-medium mb-2">General Feedback</h4>
                    <p className="text-sm text-muted-foreground italic">"{item.generalFeedback}"</p>
                  </div>

                  {/* Strengths & Improvements */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Strengths
                      </h4>
                      <ul className="space-y-1">
                        {item.strengths.map((strength, index) => (
                          <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-green-500 mt-1">•</span>
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-blue-600">
                        <TrendingUp className="h-4 w-4" />
                        Areas for Improvement
                      </h4>
                      <ul className="space-y-1">
                        {item.improvements.map((improvement, index) => (
                          <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>{improvement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Skill Ratings */}
                  <div>
                    <h4 className="font-medium mb-3">Skill Assessment</h4>
                    <div className="grid md:grid-cols-3 gap-3">
                      {item.skills.map((skill) => (
                        <div key={skill.name} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                          <span className="text-sm font-medium">{skill.name}</span>
                          {renderStarRating(skill.rating)}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
