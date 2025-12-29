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
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import Link from 'next/link';

export default function CreateProgram() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: '',
    level: '',
    duration: '',
    maxEnrollments: '',
    skills: [] as string[],
    prerequisites: [] as string[],
  });
  const [skillInput, setSkillInput] = useState('');
  const [prerequisiteInput, setPrerequisiteInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // API integration will happen here
    console.log('Program data:', formData);
    router.push('/admin/programs/list');
  };

  const addSkill = () => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData({ ...formData, skills: [...formData.skills, skillInput.trim()] });
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setFormData({ ...formData, skills: formData.skills.filter(s => s !== skill) });
  };

  const addPrerequisite = () => {
    if (prerequisiteInput.trim() && !formData.prerequisites.includes(prerequisiteInput.trim())) {
      setFormData({ ...formData, prerequisites: [...formData.prerequisites, prerequisiteInput.trim()] });
      setPrerequisiteInput('');
    }
  };

  const removePrerequisite = (prereq: string) => {
    setFormData({ ...formData, prerequisites: formData.prerequisites.filter(p => p !== prereq) });
  };

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/programs/list">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Create New Program</h1>
            <p className="text-muted-foreground mt-1">
              Set up a new mentorship program for your organization
            </p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {s}
            </div>
            {s < 3 && <div className={`h-1 w-12 mx-2 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Core details about your program</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Program Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Full Stack Web Development"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the program objectives, outcomes, and key focus areas..."
                  rows={5}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="type">Program Type</Label>
                  <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical Skills</SelectItem>
                      <SelectItem value="career">Career Development</SelectItem>
                      <SelectItem value="leadership">Leadership</SelectItem>
                      <SelectItem value="entrepreneurship">Entrepreneurship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="level">Difficulty Level</Label>
                  <Select value={formData.level} onValueChange={(value) => setFormData({ ...formData, level: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={nextStep}>
                  Next Step
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Program Details</CardTitle>
              <CardDescription>Duration, capacity, and requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (weeks)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="e.g., 12"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxEnrollments">Maximum Enrollments</Label>
                  <Input
                    id="maxEnrollments"
                    type="number"
                    placeholder="e.g., 50"
                    value={formData.maxEnrollments}
                    onChange={(e) => setFormData({ ...formData, maxEnrollments: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Skills Taught</Label>
                <div className="flex gap-2">
                  <Input
                    id="skills"
                    placeholder="Enter a skill and press Add"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  />
                  <Button type="button" onClick={addSkill} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="gap-1">
                      {skill}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeSkill(skill)} />
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prerequisites">Prerequisites</Label>
                <div className="flex gap-2">
                  <Input
                    id="prerequisites"
                    placeholder="Enter a prerequisite and press Add"
                    value={prerequisiteInput}
                    onChange={(e) => setPrerequisiteInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addPrerequisite())}
                  />
                  <Button type="button" onClick={addPrerequisite} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.prerequisites.map((prereq) => (
                    <Badge key={prereq} variant="outline" className="gap-1">
                      {prereq}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removePrerequisite(prereq)} />
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <Button type="button" onClick={prevStep} variant="outline">
                  Previous
                </Button>
                <Button type="button" onClick={nextStep}>
                  Next Step
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Confirm</CardTitle>
              <CardDescription>Review your program details before creating</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground">Program Title</h3>
                  <p className="mt-1">{formData.title}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground">Description</h3>
                  <p className="mt-1 text-sm">{formData.description}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground">Type</h3>
                    <p className="mt-1 capitalize">{formData.type}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground">Level</h3>
                    <p className="mt-1 capitalize">{formData.level}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground">Duration</h3>
                    <p className="mt-1">{formData.duration} weeks</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground">Max Enrollments</h3>
                    <p className="mt-1">{formData.maxEnrollments} students</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {formData.skills.map((skill) => (
                      <Badge key={skill} variant="secondary">{skill}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-2">Prerequisites</h3>
                  <div className="flex flex-wrap gap-2">
                    {formData.prerequisites.map((prereq) => (
                      <Badge key={prereq} variant="outline">{prereq}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button type="button" onClick={prevStep} variant="outline">
                  Previous
                </Button>
                <Button type="submit">
                  <Save className="h-4 w-4 mr-2" />
                  Create Program
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </form>
    </div>
  );
}
