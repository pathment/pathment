'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Upload, Link as LinkIcon, FileText, Send, AlertCircle, CheckCircle } from 'lucide-react';

export default function TaskSubmission() {
  const router = useRouter();
  const [submissionType, setSubmissionType] = useState<'file' | 'link' | 'text'>('file');
  const [formData, setFormData] = useState({
    submissionText: '',
    submissionUrl: '',
    notes: '',
  });
  const [files, setFiles] = useState<File[]>([]);

  // Mock task data
  const task = {
    id: 1,
    title: 'Build React Dashboard',
    program: 'Full Stack Web Development',
    description: 'Create a responsive dashboard using React and Chart.js with real-time data updates',
    type: 'project',
    difficulty: 'intermediate',
    deadline: '2024-01-25',
    estimatedHours: 8,
    requirements: [
      'Use React functional components and hooks',
      'Implement at least 3 different chart types',
      'Add responsive design for mobile and desktop',
      'Include data filtering and date range selection',
      'Write unit tests for key components',
    ],
    resources: [
      'https://react.dev/learn',
      'https://www.chartjs.org/docs/',
      'https://tailwindcss.com/docs',
    ],
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submission:', { type: submissionType, formData, files });
    router.push('/mentee/tasks/list');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/mentee/tasks/list">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tasks
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Submit Task</h1>
          <p className="text-muted-foreground mt-1">
            Complete and submit your work for review
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Task Details */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">{task.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{task.description}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="capitalize">{task.type}</Badge>
                  <Badge variant="outline">{task.difficulty}</Badge>
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Program</span>
                  <span className="font-medium">{task.program}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Deadline</span>
                  <span className="font-medium">{task.deadline}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Time</span>
                  <span className="font-medium">{task.estimatedHours} hours</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {task.requirements.map((req, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {task.resources.map((resource, index) => (
                  <a
                    key={index}
                    href={resource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <LinkIcon className="h-3 w-3" />
                    <span className="truncate">{resource}</span>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submission Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Your Submission</CardTitle>
                <CardDescription>
                  Upload your completed work or provide a link to your project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Submission Type Selector */}
                <div>
                  <Label className="mb-3 block">Submission Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={submissionType === 'file' ? 'default' : 'outline'}
                      onClick={() => setSubmissionType('file')}
                      className="flex flex-col items-center gap-2 h-auto py-4"
                    >
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">Upload Files</span>
                    </Button>
                    <Button
                      type="button"
                      variant={submissionType === 'link' ? 'default' : 'outline'}
                      onClick={() => setSubmissionType('link')}
                      className="flex flex-col items-center gap-2 h-auto py-4"
                    >
                      <LinkIcon className="h-5 w-5" />
                      <span className="text-xs">Share Link</span>
                    </Button>
                    <Button
                      type="button"
                      variant={submissionType === 'text' ? 'default' : 'outline'}
                      onClick={() => setSubmissionType('text')}
                      className="flex flex-col items-center gap-2 h-auto py-4"
                    >
                      <FileText className="h-5 w-5" />
                      <span className="text-xs">Text Response</span>
                    </Button>
                  </div>
                </div>

                {/* File Upload */}
                {submissionType === 'file' && (
                  <div className="space-y-2">
                    <Label htmlFor="file">Upload Files</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                      <Input
                        id="file"
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <label htmlFor="file" className="cursor-pointer">
                        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm font-medium mb-1">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, ZIP, Images, or any project files
                        </p>
                      </label>
                    </div>
                    {files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {files.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm p-2 bg-accent rounded">
                            <FileText className="h-4 w-4" />
                            <span className="flex-1">{file.name}</span>
                            <span className="text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Link Submission */}
                {submissionType === 'link' && (
                  <div className="space-y-2">
                    <Label htmlFor="url">Project URL</Label>
                    <Input
                      id="url"
                      type="url"
                      placeholder="https://github.com/yourusername/project"
                      value={formData.submissionUrl}
                      onChange={(e) => setFormData({ ...formData, submissionUrl: e.target.value })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Provide a link to your GitHub repository, deployed app, or other project hosting
                    </p>
                  </div>
                )}

                {/* Text Submission */}
                {submissionType === 'text' && (
                  <div className="space-y-2">
                    <Label htmlFor="text">Your Response</Label>
                    <Textarea
                      id="text"
                      placeholder="Write your solution, analysis, or response here..."
                      rows={12}
                      value={formData.submissionText}
                      onChange={(e) => setFormData({ ...formData, submissionText: e.target.value })}
                      required
                    />
                  </div>
                )}

                {/* Additional Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any challenges faced, questions, or additional context for your mentor..."
                    rows={4}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                {/* Important Notice */}
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Make sure you've completed all requirements before submitting. Your mentor will review your work and provide feedback.
                  </AlertDescription>
                </Alert>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button type="submit" className="flex-1" size="lg">
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Review
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    Save Draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
    </div>
  );
}
