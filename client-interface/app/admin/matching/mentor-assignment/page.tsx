'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles, Users, TrendingUp, Award, ChevronRight, Check, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function MentorAssignment() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const unassignedMentees = [
    {
      id: 1,
      name: 'Alice Johnson',
      program: 'Full Stack Web Development',
      skills: ['JavaScript', 'React', 'Node.js'],
      level: 'Beginner',
      interests: ['Web Development', 'Mobile Apps'],
    },
    {
      id: 2,
      name: 'Bob Williams',
      program: 'Data Science Fundamentals',
      skills: ['Python', 'Statistics'],
      level: 'Intermediate',
      interests: ['Machine Learning', 'Data Analysis'],
    },
  ];

  const availableMentors = [
    {
      id: 1,
      name: 'John Smith',
      expertise: ['JavaScript', 'React', 'Node.js', 'TypeScript'],
      availability: 5,
      maxMentees: 8,
      currentMentees: 3,
      rating: 4.8,
      matchScore: 95,
    },
    {
      id: 2,
      name: 'Sarah Lee',
      expertise: ['Python', 'Machine Learning', 'Data Science'],
      availability: 3,
      maxMentees: 6,
      currentMentees: 3,
      rating: 4.9,
      matchScore: 92,
    },
    {
      id: 3,
      name: 'Michael Chen',
      expertise: ['JavaScript', 'React', 'UI/UX'],
      availability: 4,
      maxMentees: 7,
      currentMentees: 3,
      rating: 4.7,
      matchScore: 88,
    },
  ];

  const handleGenerateSuggestions = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setSuggestions([
        {
          mentee: unassignedMentees[0],
          recommendedMentor: availableMentors[0],
          reasons: [
            'Skills alignment: JavaScript, React, Node.js',
            'Availability: 5 slots remaining',
            'High success rate with beginner students',
            'Similar project interests',
          ],
        },
        {
          mentee: unassignedMentees[1],
          recommendedMentor: availableMentors[1],
          reasons: [
            'Expertise in Python and Data Science',
            'Proven track record with intermediate students',
            'Active in mentee\'s area of interest',
            'Availability: 3 slots remaining',
          ],
        },
      ]);
      setIsGenerating(false);
    }, 2000);
  };

  const handleAssign = (suggestionIndex: number) => {
    const newSuggestions = [...suggestions];
    newSuggestions.splice(suggestionIndex, 1);
    setSuggestions(newSuggestions);
  };

  const handleReject = (suggestionIndex: number) => {
    const newSuggestions = [...suggestions];
    newSuggestions.splice(suggestionIndex, 1);
    setSuggestions(newSuggestions);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">AI Mentor Matching</h1>
        <p className="text-muted-foreground mt-2">
          Intelligent mentor-mentee assignment using AI-powered matching
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned Mentees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unassignedMentees.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting mentor assignment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Mentors</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableMentors.length}</div>
            <p className="text-xs text-muted-foreground mt-1">With capacity for new mentees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Match Accuracy</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94%</div>
            <p className="text-xs text-muted-foreground mt-1">Average match score</p>
          </CardContent>
        </Card>
      </div>

      {/* Generate Suggestions */}
      {suggestions.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generate AI Suggestions</CardTitle>
            <CardDescription>
              Use AI to analyze skills, availability, and preferences for optimal matches
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleGenerateSuggestions}
              disabled={isGenerating}
              size="lg"
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing Matches...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Mentor Suggestions
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">AI Match Suggestions</h2>
            <Button variant="outline" onClick={handleGenerateSuggestions}>
              <Sparkles className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          </div>

          {suggestions.map((suggestion, index) => (
            <Card key={index} className="overflow-hidden">
              <div className="grid md:grid-cols-2 gap-0">
                {/* Mentee Info */}
                <div className="p-6 border-r border-border">
                  <div className="flex items-start gap-3 mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {suggestion.mentee.name.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{suggestion.mentee.name}</h3>
                      <p className="text-sm text-muted-foreground">{suggestion.mentee.program}</p>
                      <Badge variant="outline" className="mt-2">
                        {suggestion.mentee.level}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {suggestion.mentee.skills.map((skill: string) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Interests</h4>
                      <div className="flex flex-wrap gap-1">
                        {suggestion.mentee.interests.map((interest: string) => (
                          <Badge key={interest} variant="outline" className="text-xs">
                            {interest}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mentor Match */}
                <div className="p-6 bg-accent/20">
                  <div className="flex items-start gap-3 mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {suggestion.recommendedMentor.name.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{suggestion.recommendedMentor.name}</h3>
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          {suggestion.recommendedMentor.matchScore}% Match
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Award
                              key={i}
                              className={`h-3 w-3 ${
                                i < Math.floor(suggestion.recommendedMentor.rating)
                                  ? 'text-yellow-500 fill-yellow-500'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {suggestion.recommendedMentor.rating} rating
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Expertise</h4>
                      <div className="flex flex-wrap gap-1">
                        {suggestion.recommendedMentor.expertise.map((skill: string) => (
                          <Badge key={skill} variant="default" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Availability</h4>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={(suggestion.recommendedMentor.currentMentees / suggestion.recommendedMentor.maxMentees) * 100}
                          className="flex-1"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {suggestion.recommendedMentor.currentMentees}/{suggestion.recommendedMentor.maxMentees}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Match Reasons</h4>
                      <ul className="space-y-1">
                        {suggestion.reasons.map((reason: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleAssign(index)} className="flex-1">
                      <Check className="h-4 w-4 mr-2" />
                      Assign Mentor
                    </Button>
                    <Button onClick={() => handleReject(index)} variant="outline">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
