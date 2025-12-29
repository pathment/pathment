import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../shared/Navigation';
import { ArrowLeft, CheckCircle2, Clock, BookOpen, Calendar, Target, Users, Star } from 'lucide-react';

export default function ProgramEnrollment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const program = {
    name: 'Full Stack Development Bootcamp',
    description: 'Comprehensive program covering modern web development with React, Node.js, and PostgreSQL. Build real-world projects and gain practical experience.',
    duration: '12 weeks',
    level: 'Intermediate',
    startDate: '2024-03-01',
    totalTasks: 35,
    skills: ['React', 'Node.js', 'PostgreSQL', 'REST APIs', 'Git'],
    curriculum: [
      { week: 1, title: 'Web Fundamentals', topics: ['HTML5', 'CSS3', 'JavaScript'] },
      { week: 2, title: 'Modern JavaScript', topics: ['ES6+', 'Async/Await', 'Promises'] },
      { week: 3, title: 'React Fundamentals', topics: ['Components', 'Hooks', 'State'] },
    ],
    stats: {
      enrolled: 45,
      avgRating: 4.8,
      completionRate: 87
    }
  };

  const handleEnroll = () => {
    setShowConfirmDialog(false);
    setTimeout(() => navigate('/mentee/dashboard'), 500);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="mentee" />
      
      <div className="lg:pl-64">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          {/* Program Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-slate-900 mb-3">{program.name}</h1>
                <p className="text-slate-600 mb-4">{program.description}</p>
                <div className="flex flex-wrap gap-2">
                  {program.skills.map((skill) => (
                    <span key={skill} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-6 p-6 bg-slate-50 rounded-xl">
              <div className="text-center">
                <div className="text-slate-900 text-2xl mb-1">{program.stats.enrolled}</div>
                <div className="text-slate-600 text-sm flex items-center justify-center gap-1">
                  <Users className="w-4 h-4" />
                  Enrolled
                </div>
              </div>
              <div className="text-center">
                <div className="text-slate-900 text-2xl mb-1">{program.stats.avgRating}</div>
                <div className="text-slate-600 text-sm flex items-center justify-center gap-1">
                  <Star className="w-4 h-4" />
                  Rating
                </div>
              </div>
              <div className="text-center">
                <div className="text-slate-900 text-2xl mb-1">{program.stats.completionRate}%</div>
                <div className="text-slate-600 text-sm">Completion</div>
              </div>
            </div>
          </div>

          {/* Program Details */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-slate-900 mb-4">Program Information</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm">Duration</div>
                    <div className="text-slate-900">{program.duration}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm">Level</div>
                    <div className="text-slate-900">{program.level}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm">Start Date</div>
                    <div className="text-slate-900">{program.startDate}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm">Total Tasks</div>
                    <div className="text-slate-900">{program.totalTasks}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Curriculum Preview */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-slate-900 mb-4">Curriculum Overview</h2>
              <div className="space-y-3">
                {program.curriculum.map((item) => (
                  <div key={item.week} className="p-4 border border-slate-200 rounded-xl">
                    <div className="text-slate-900 mb-2">Week {item.week}: {item.title}</div>
                    <div className="flex flex-wrap gap-2">
                      {item.topics.map((topic) => (
                        <span key={topic} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="text-center text-slate-600 text-sm pt-2">
                  + 9 more weeks
                </div>
              </div>
            </div>
          </div>

          {/* Enrollment CTA */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8">
            <div className="max-w-xl mx-auto text-center">
              <h2 className="text-slate-900 mb-3">Ready to Start Your Journey?</h2>
              <p className="text-slate-600 mb-6">
                Enroll now and get matched with an expert mentor who will guide you through the program
              </p>
              <button
                onClick={() => setShowConfirmDialog(true)}
                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
              >
                Enroll in Program
              </button>
              <p className="text-slate-500 text-sm mt-4">
                You will be matched with a mentor within 24-48 hours
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-slate-900 text-center mb-3">Confirm Enrollment</h2>
            <p className="text-slate-600 text-center mb-6">
              You are about to enroll in <strong>{program.name}</strong>. You will be matched with a mentor shortly.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEnroll}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
