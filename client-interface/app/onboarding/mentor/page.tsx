'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { ArrowRight, Loader2, Award, Briefcase, Globe, Github, Linkedin, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function MentorOnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    organization: '',
    yearsOfExperience: '',
    specialization: [] as string[],
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    maxMentees: '5',
    preferredMenteeLevel: [] as string[],
    bio: ''
  });

  const [specializationInput, setSpecializationInput] = useState('');

  const menteeLevels = ['beginner', 'intermediate', 'advanced', 'all'];

  const addSpecialization = () => {
    if (specializationInput.trim() && !formData.specialization.includes(specializationInput.trim())) {
      setFormData({ ...formData, specialization: [...formData.specialization, specializationInput.trim()] });
      setSpecializationInput('');
    }
  };

  const removeSpecialization = (spec: string) => {
    setFormData({
      ...formData,
      specialization: formData.specialization.filter(s => s !== spec)
    });
  };

  const toggleMenteeLevel = (level: string) => {
    if (formData.preferredMenteeLevel.includes(level)) {
      setFormData({
        ...formData,
        preferredMenteeLevel: formData.preferredMenteeLevel.filter(l => l !== level)
      });
    } else {
      setFormData({
        ...formData,
        preferredMenteeLevel: [...formData.preferredMenteeLevel, level]
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.specialization.length === 0) {
      toast.error('Please add at least one specialization');
      return;
    }

    if (formData.preferredMenteeLevel.length === 0) {
      toast.error('Please select at least one mentee level preference');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/profile/complete-mentor', {
        ...formData,
        yearsOfExperience: parseInt(formData.yearsOfExperience) || 0,
        maxMentees: parseInt(formData.maxMentees) || 5
      });
      toast.success('Profile saved — let\'s add your skills.');
      if (updateUser) updateUser({ ...user, onboardingStep: 1 });
      router.push('/onboarding/skills');
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Failed to complete profile'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 dark:from-brand-500/10 via-card to-brand-50 dark:to-transparent py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4">
            <Award className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-brand-900 mb-2">Complete Your Mentor Profile</h1>
          <p className="text-slate-600">Help mentees find and connect with you</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-8 h-2 bg-brand-600 rounded-full"></div>
            <div className="w-8 h-2 bg-slate-200 rounded-full"></div>
            <div className="w-8 h-2 bg-slate-200 rounded-full"></div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-card rounded-2xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                <Award className="inline w-5 h-5 mr-2" />
                Professional Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g., Senior Software Engineer"
              />
            </div>

            {/* Organization & Experience */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 font-medium mb-2">
                  <Briefcase className="inline w-5 h-5 mr-2" />
                  Organization
                </label>
                <input
                  type="text"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-2">
                  Years of Experience *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="5"
                />
              </div>
            </div>

            {/* Specialization */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                Specialization *
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={specializationInput}
                  onChange={(e) => setSpecializationInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialization())}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., Full-Stack Development, DevOps, Machine Learning"
                />
                <button
                  type="button"
                  onClick={addSpecialization}
                  className="px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.specialization.map((spec) => (
                  <span
                    key={spec}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 text-brand-700 rounded-lg"
                  >
                    {spec}
                    <button
                      type="button"
                      onClick={() => removeSpecialization(spec)}
                      className="text-brand-500 hover:text-brand-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                Professional Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Tell mentees about your experience, teaching philosophy, and what makes you a great mentor..."
              />
            </div>

            {/* Social Links */}
            <div className="space-y-3">
              <h3 className="text-slate-700 font-medium">Professional Links</h3>
              
              <div>
                <label className="block text-slate-600 text-sm mb-2">
                  <Linkedin className="inline w-4 h-4 mr-2" />
                  LinkedIn URL
                </label>
                <input
                  type="url"
                  value={formData.linkedinUrl}
                  onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://linkedin.com/in/yourprofile"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-2">
                  <Github className="inline w-4 h-4 mr-2" />
                  GitHub URL
                </label>
                <input
                  type="url"
                  value={formData.githubUrl}
                  onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://github.com/yourusername"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-2">
                  <Globe className="inline w-4 h-4 mr-2" />
                  Portfolio URL
                </label>
                <input
                  type="url"
                  value={formData.portfolioUrl}
                  onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://yourportfolio.com"
                />
              </div>
            </div>

            {/* Mentoring Preferences */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                <Users className="inline w-5 h-5 mr-2" />
                Maximum Mentees
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={formData.maxMentees}
                onChange={(e) => setFormData({ ...formData, maxMentees: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-slate-500 text-sm mt-1">How many mentees can you effectively guide at once?</p>
            </div>

            {/* Preferred Mentee Level */}
            <div>
              <label className="block text-slate-700 font-medium mb-3">
                Preferred Mentee Level *
              </label>
              <div className="grid grid-cols-2 gap-3">
                {menteeLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleMenteeLevel(level)}
                    className={`p-3 rounded-xl border-2 capitalize transition-all ${
                      formData.preferredMenteeLevel.includes(level)
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white py-4 rounded-xl transition-colors flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Continue to Skills
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
