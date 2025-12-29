import React, { useState } from 'react';
import { useRouter, Link, useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import { 
  ArrowLeft, 
  Plus, 
  X, 
  Calendar,
  Clock,
  Tag,
  Layers,
  Save,
  Sparkles
} from 'lucide-react';

export default function ProgramCreate() {
  const navigate = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'bootcamp',
    duration: '',
    level: 'foundation',
    startDate: '',
    endDate: '',
    skillTags: [] as string[],
  });
  const [currentTag, setCurrentTag] = useState('');

  const addTag = () => {
    if (currentTag && !formData.skillTags.includes(currentTag)) {
      setFormData({ ...formData, skillTags: [...formData.skillTags, currentTag] });
      setCurrentTag('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, skillTags: formData.skillTags.filter(t => t !== tag) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Navigate to roadmap generator
    navigate('/admin/programs/1/roadmap');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="admin" />
      
      <div className="lg:pl-64">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
            <h1 className="text-slate-900 mb-2">Create New Program</h1>
            <p className="text-slate-600">Set up a new mentorship program with AI-powered roadmap</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
              {/* Program Name */}
              <div>
                <label className="block text-slate-900 mb-2">Program Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., Full Stack Development Bootcamp"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-900 mb-2">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  placeholder="Describe the program goals, target audience, and key outcomes..."
                  required
                />
              </div>

              {/* Type and Level */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-900 mb-2">Program Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="bootcamp">Bootcamp</option>
                    <option value="course">Course</option>
                    <option value="workshop">Workshop</option>
                    <option value="certification">Certification</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-900 mb-2">Level *</label>
                  <div className="relative">
                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="foundation">Foundation</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Duration and Dates */}
              <div className="grid sm:grid-cols-3 gap-6">
                <div>
                  <label className="block text-slate-900 mb-2">Duration (weeks) *</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="12"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-900 mb-2">Start Date *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-900 mb-2">End Date *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Skill Tags */}
              <div>
                <label className="block text-slate-900 mb-2">Skill Tags</label>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={currentTag}
                      onChange={(e) => setCurrentTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="e.g., React, Node.js, PostgreSQL"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Add
                  </button>
                </div>
                {formData.skillTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.skillTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-indigo-900"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Roadmap Notice */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-indigo-900 mb-1">AI-Powered Roadmap</h3>
                    <p className="text-indigo-700 text-sm">
                      After creating the program, our AI will generate a comprehensive learning roadmap 
                      with weekly tasks, objectives, and resources tailored to your specifications.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center gap-4">
              <button
                type="submit"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save & Generate Roadmap
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/dashboard')}
                className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
