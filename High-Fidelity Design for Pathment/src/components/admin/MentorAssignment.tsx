import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../shared/Navigation';
import { ArrowLeft, Search, Sparkles, UserCheck, Star, BookOpen, Users, CheckCircle2 } from 'lucide-react';

export default function MentorAssignment() {
  const [selectedProgram, setSelectedProgram] = useState('1');
  const [showAISuggestions, setShowAISuggestions] = useState(true);

  const programs = [
    { id: '1', name: 'Full Stack Development Bootcamp', unmatched: 8 },
    { id: '2', name: 'UI/UX Design Mastery', unmatched: 3 },
    { id: '3', name: 'Data Science Fundamentals', unmatched: 5 },
  ];

  const unmatchedMentees = [
    {
      id: 1,
      name: 'Alex Thompson',
      program: 'Full Stack Development',
      skills: ['JavaScript', 'React'],
      joinedDays: 2,
      background: 'Career switcher from marketing'
    },
    {
      id: 2,
      name: 'Maria Garcia',
      program: 'Full Stack Development',
      skills: ['Python', 'Backend'],
      joinedDays: 1,
      background: 'Computer Science graduate'
    },
    {
      id: 3,
      name: 'James Wilson',
      program: 'Full Stack Development',
      skills: ['HTML', 'CSS', 'JavaScript'],
      joinedDays: 3,
      background: 'Self-taught developer'
    },
  ];

  const availableMentors = [
    {
      id: 1,
      name: 'Sarah Johnson',
      expertise: ['React', 'Node.js', 'JavaScript'],
      currentMentees: 3,
      maxMentees: 6,
      rating: 4.9,
      matchScore: 95
    },
    {
      id: 2,
      name: 'Michael Chen',
      expertise: ['Python', 'Django', 'PostgreSQL'],
      currentMentees: 4,
      maxMentees: 6,
      rating: 4.8,
      matchScore: 88
    },
    {
      id: 3,
      name: 'Emma Wilson',
      expertise: ['Full Stack', 'React', 'TypeScript'],
      currentMentees: 2,
      maxMentees: 5,
      rating: 4.9,
      matchScore: 92
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="admin" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
            <h1 className="text-slate-900 mb-2">Mentor Assignment</h1>
            <p className="text-slate-600">Match mentees with mentors using AI-powered recommendations</p>
          </div>

          {/* AI Matching Banner */}
          {showAISuggestions && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-indigo-900 mb-2">AI Matching Enabled</h2>
                  <p className="text-indigo-700 text-sm mb-4">
                    Our AI analyzes mentee backgrounds, skills, and learning goals to suggest the best mentor matches 
                    based on expertise, availability, and teaching style compatibility.
                  </p>
                  <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors">
                    Auto-Match All Pending
                  </button>
                </div>
                <button
                  onClick={() => setShowAISuggestions(false)}
                  className="text-indigo-600 hover:text-indigo-700"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Program Filter */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <label className="block text-slate-900 mb-3">Filter by Program</label>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="w-full md:w-96 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name} ({program.unmatched} unmatched)
                </option>
              ))}
            </select>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Unmatched Mentees */}
            <div>
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-slate-900">Pending Matches</h2>
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm">
                      {unmatchedMentees.length}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-slate-200">
                  {unmatchedMentees.map((mentee) => (
                    <div key={mentee.id} className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-600">
                            {mentee.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-slate-900 mb-1">{mentee.name}</h3>
                          <p className="text-slate-600 text-sm mb-2">{mentee.background}</p>
                          <div className="flex items-center gap-2 text-slate-500 text-xs mb-3">
                            <span>Joined {mentee.joinedDays}d ago</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {mentee.skills.map((skill) => (
                              <span key={skill} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      {/* AI Suggested Mentor */}
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          <span className="text-indigo-900 text-sm">AI Recommended Match</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-200 rounded-full flex items-center justify-center">
                              <span className="text-indigo-700 text-sm">SJ</span>
                            </div>
                            <div>
                              <div className="text-slate-900 text-sm">Sarah Johnson</div>
                              <div className="text-slate-600 text-xs">95% match</div>
                            </div>
                          </div>
                          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors">
                            Assign
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Available Mentors */}
            <div>
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-slate-900">Available Mentors</h2>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="divide-y divide-slate-200">
                  {availableMentors.map((mentor) => (
                    <div key={mentor.id} className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-700">
                            {mentor.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-slate-900">{mentor.name}</h3>
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              <span className="text-slate-700 text-sm">{mentor.rating}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {mentor.expertise.map((skill) => (
                              <span key={skill} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {mentor.currentMentees}/{mentor.maxMentees} mentees
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Capacity Bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                          <span>Capacity</span>
                          <span>{Math.round((mentor.currentMentees / mentor.maxMentees) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              mentor.currentMentees / mentor.maxMentees < 0.7
                                ? 'bg-green-500'
                                : mentor.currentMentees / mentor.maxMentees < 0.9
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${(mentor.currentMentees / mentor.maxMentees) * 100}%` }}
                          />
                        </div>
                      </div>

                      <button className="w-full px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors">
                        View Profile
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
