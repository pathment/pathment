'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { ArrowRight, Loader2, GraduationCap, Briefcase, Target, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

export default function MenteeOnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    currentEducation: '',
    currentOccupation: '',
    learningGoals: [] as string[],
    interests: [] as string[],
    priorExperience: '',
    preferredLearningStyle: 'visual'
  });

  const [goalInput, setGoalInput] = useState('');
  const [interestInput, setInterestInput] = useState('');

  const learningStyles = [
    { value: 'visual', label: 'Visual', description: 'Learn through diagrams and videos' },
    { value: 'auditory', label: 'Auditory', description: 'Learn through listening' },
    { value: 'reading', label: 'Reading/Writing', description: 'Learn through reading and notes' },
    { value: 'kinesthetic', label: 'Hands-on', description: 'Learn by doing and practicing' }
  ];

  const addGoal = () => {
    if (goalInput.trim() && !formData.learningGoals.includes(goalInput.trim())) {
      setFormData({ ...formData, learningGoals: [...formData.learningGoals, goalInput.trim()] });
      setGoalInput('');
    }
  };

  const removeGoal = (goal: string) => {
    setFormData({
      ...formData,
      learningGoals: formData.learningGoals.filter(g => g !== goal)
    });
  };

  const addInterest = () => {
    if (interestInput.trim() && !formData.interests.includes(interestInput.trim())) {
      setFormData({ ...formData, interests: [...formData.interests, interestInput.trim()] });
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    setFormData({
      ...formData,
      interests: formData.interests.filter(i => i !== interest)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.learningGoals.length === 0) {
      toast.error('Please add at least one learning goal');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/profile/complete-mentee', formData);
      toast.success('Profile saved - let\'s add your skills.');
      if (updateUser) updateUser({ ...user, onboardingStep: 1 });
      router.push('/onboarding/skills');
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Could not save your profile'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas px-4 py-10 sm:py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">Mentee onboarding · Step 1 of 3</p>
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-4 shadow-sm shadow-brand-600/20">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Set up your learner profile</h1>
          <p className="text-muted-foreground">Share what you want to learn so your mentor can guide you well.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-8 h-1.5 bg-brand-600 rounded-full"></div>
            <div className="w-8 h-1.5 bg-border rounded-full"></div>
            <div className="w-8 h-1.5 bg-border rounded-full"></div>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current Education */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                <GraduationCap className="inline w-5 h-5 mr-2" />
                Current Education
              </label>
              <input
                type="text"
                value={formData.currentEducation}
                onChange={(e) => setFormData({ ...formData, currentEducation: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g., Bachelor's in Computer Science"
              />
            </div>

            {/* Current Occupation */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                <Briefcase className="inline w-5 h-5 mr-2" />
                Current Occupation
              </label>
              <input
                type="text"
                value={formData.currentOccupation}
                onChange={(e) => setFormData({ ...formData, currentOccupation: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g., Junior Developer, Student, Career Changer"
              />
            </div>

            {/* Learning Goals */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                <Target className="inline w-5 h-5 mr-2" />
                Learning Goals *
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addGoal())}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., Master React development"
                />
                <button
                  type="button"
                  onClick={addGoal}
                  className="px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.learningGoals.map((goal) => (
                  <span
                    key={goal}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200 rounded-lg"
                  >
                    {goal}
                    <button
                      type="button"
                      onClick={() => removeGoal(goal)}
                      className="text-brand-500 hover:text-brand-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                <Lightbulb className="inline w-5 h-5 mr-2" />
                Interests
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., Web Development, AI, Mobile Apps"
                />
                <button
                  type="button"
                  onClick={addInterest}
                  className="px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.interests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-700 rounded-lg"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => removeInterest(interest)}
                      className="text-purple-500 hover:text-purple-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Prior Experience */}
            <div>
              <label className="block text-slate-700 font-medium mb-2">
                Prior Experience
              </label>
              <textarea
                value={formData.priorExperience}
                onChange={(e) => setFormData({ ...formData, priorExperience: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Tell us about any relevant experience, projects, or courses you've completed..."
              />
            </div>

            {/* Preferred Learning Style */}
            <div>
              <label className="block text-slate-700 font-medium mb-3">
                Preferred Learning Style
              </label>
              <div className="grid grid-cols-2 gap-3">
                {learningStyles.map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, preferredLearningStyle: style.value })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      formData.preferredLearningStyle === style.value
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900">{style.label}</div>
                    <div className="text-sm text-slate-600 mt-1">{style.description}</div>
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
