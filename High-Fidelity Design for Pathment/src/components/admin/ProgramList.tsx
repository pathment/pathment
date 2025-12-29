import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../shared/Navigation';
import { 
  Search, 
  Filter, 
  Plus,
  Users,
  Calendar,
  TrendingUp,
  MoreVertical,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';

export default function ProgramList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const programs = [
    {
      id: 1,
      name: 'Full Stack Development Bootcamp',
      type: 'Bootcamp',
      level: 'Intermediate',
      enrollments: 45,
      mentors: 8,
      status: 'active',
      startDate: '2024-01-15',
      completion: 68,
      tags: ['React', 'Node.js', 'PostgreSQL']
    },
    {
      id: 2,
      name: 'UI/UX Design Mastery',
      type: 'Course',
      level: 'Foundation',
      enrollments: 32,
      mentors: 5,
      status: 'active',
      startDate: '2024-01-20',
      completion: 82,
      tags: ['Figma', 'Design Systems', 'User Research']
    },
    {
      id: 3,
      name: 'Data Science Fundamentals',
      type: 'Bootcamp',
      level: 'Intermediate',
      enrollments: 28,
      mentors: 6,
      status: 'active',
      startDate: '2024-02-01',
      completion: 45,
      tags: ['Python', 'Machine Learning', 'Statistics']
    },
    {
      id: 4,
      name: 'Mobile App Development',
      type: 'Course',
      level: 'Advanced',
      enrollments: 51,
      mentors: 0,
      status: 'draft',
      startDate: '2024-03-01',
      completion: 0,
      tags: ['React Native', 'Flutter', 'iOS', 'Android']
    },
    {
      id: 5,
      name: 'DevOps Engineering',
      type: 'Certification',
      level: 'Advanced',
      enrollments: 19,
      mentors: 4,
      status: 'completed',
      startDate: '2023-11-01',
      completion: 100,
      tags: ['Docker', 'Kubernetes', 'CI/CD']
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="admin" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className="text-slate-900 mb-2">Programs</h1>
              <p className="text-slate-600">Manage all mentorship programs</p>
            </div>
            <Link
              to="/admin/programs/create"
              className="mt-4 sm:mt-0 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Program
            </Link>
          </div>

          {/* Filters & Search */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search programs..."
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Status Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="relative">
                <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
                >
                  <option value="name">Name</option>
                  <option value="enrollments">Enrollments</option>
                  <option value="startDate">Start Date</option>
                  <option value="completion">Completion</option>
                </select>
              </div>
            </div>
          </div>

          {/* Programs List */}
          <div className="space-y-4">
            {programs.map((program) => (
              <div
                key={program.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Program Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            to={`/admin/programs/${program.id}`}
                            className="text-slate-900 hover:text-indigo-600 transition-colors"
                          >
                            {program.name}
                          </Link>
                          <span
                            className={`px-3 py-1 rounded-lg text-xs ${
                              program.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : program.status === 'draft'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {program.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                          <span>{program.type}</span>
                          <span>•</span>
                          <span>{program.level}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {program.startDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {program.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Progress */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 max-w-xs h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${program.completion}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-600">{program.completion}%</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-slate-900 text-2xl mb-1">{program.enrollments}</div>
                      <div className="text-slate-600 text-sm flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        Mentees
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-slate-900 text-2xl mb-1">{program.mentors}</div>
                      <div className="text-slate-600 text-sm">Mentors</div>
                    </div>

                    {/* Actions */}
                    <div className="relative group">
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <MoreVertical className="w-5 h-5 text-slate-600" />
                      </button>
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        <Link
                          to={`/admin/programs/${program.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700 first:rounded-t-xl"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </Link>
                        <Link
                          to={`/admin/programs/${program.id}/roadmap`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700"
                        >
                          <Edit className="w-4 h-4" />
                          Edit Roadmap
                        </Link>
                        <button className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-red-600 w-full last:rounded-b-xl">
                          <Trash2 className="w-4 h-4" />
                          Delete Program
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
