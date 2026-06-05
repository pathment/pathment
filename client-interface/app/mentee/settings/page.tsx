'use client';

import {
  User,
  Target,
  Bell,
  Shield,
  Loader2,
  Save,
  Sparkles,
  Palette
} from 'lucide-react';
import { useMenteeSettings } from '@/lib/hooks/mentee';
import { PageHeader, TabBar } from '@/components/admin/ui';
import SecurityTab from '@/components/shared/SecurityTab';
import { LocationDetailsFields } from '@/components/settings/LocationDetailsFields';
import { SkillsTab } from '@/components/settings/SkillsTab';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { NotificationPreferencesTab } from '@/components/settings/NotificationPreferencesTab';
import type { Tab } from '@/components/admin/ui';

export default function MenteeSettings() {
  const {
    loading,
    saving,
    activeTab,
    profileData,
    menteeProfile,
    learningPreferences,
    notificationSettings,
    setActiveTab,
    setProfileData,
    setMenteeProfile,
    setLearningPreferences,
    setNotificationSettings,
    handleProfileUpdate,
    handleMenteeProfileUpdate,
    handleLearningPreferencesUpdate,
    handleNotificationUpdate,
  } = useMenteeSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const tabs: Tab[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'preferences', label: 'Preferences', icon: Target },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Settings"
        subtitle="Manage your account preferences and learning profile"
      />

      {/* Tabs */}
      <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-2 overflow-x-auto">
          <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="p-8">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-slate-900">Personal Information</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">First Name</label>
                  <input
                    type="text"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Last Name</label>
                  <input
                    type="text"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Phone</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Bio</label>
                <textarea
                  value={profileData.bio}
                  onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="pt-6 border-t border-slate-100">
                <LocationDetailsFields
                  value={{ city: profileData.city, country: profileData.country, languages: profileData.languages, timezone: profileData.timezone }}
                  onChange={(patch) => setProfileData({ ...profileData, ...patch })}
                />
              </div>

              <button
                onClick={handleProfileUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
              </button>
            </div>
          )}

          {/* Skills Tab */}
          {activeTab === 'skills' && (
            <SkillsTab blurb="Add the skills you have or are building. Your mentor sees these to tailor support." />
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && <AppearanceTab />}

          {/* Learning profile — folded into the Profile tab (no separate tab) */}
          {activeTab === 'profile' && (
            <div className="space-y-6 pt-8 mt-8 border-t border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="text-slate-900">Learning profile</h2>
                <p className="text-slate-500 text-sm mt-1">Helps your mentor tailor support to your goals.</p>
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Learning Goals</label>
                <textarea
                  value={menteeProfile.learningGoals}
                  onChange={(e) => setMenteeProfile({ ...menteeProfile, learningGoals: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="What do you want to achieve through this mentorship?"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Prior Experience</label>
                <textarea
                  value={menteeProfile.priorExperience}
                  onChange={(e) => setMenteeProfile({ ...menteeProfile, priorExperience: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Describe your relevant experience..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Current Education</label>
                  <input
                    type="text"
                    value={menteeProfile.currentEducation}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, currentEducation: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g., BS Computer Science"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Current Occupation</label>
                  <input
                    type="text"
                    value={menteeProfile.currentOccupation}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, currentOccupation: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g., Student, Junior Developer"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">LinkedIn URL</label>
                  <input
                    type="url"
                    value={menteeProfile.linkedinUrl}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, linkedinUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">GitHub URL</label>
                  <input
                    type="url"
                    value={menteeProfile.githubUrl}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, githubUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://github.com/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Portfolio URL</label>
                  <input
                    type="url"
                    value={menteeProfile.portfolioUrl}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, portfolioUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <button
                onClick={handleMenteeProfileUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
              </button>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">Learning Preferences</h2>
                <p className="text-slate-600">Customize your learning experience</p>
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Preferred Learning Style</label>
                <select
                  value={learningPreferences.preferredLearningStyle}
                  onChange={(e) => setLearningPreferences({ ...learningPreferences, preferredLearningStyle: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="visual">Visual (Videos, diagrams)</option>
                  <option value="reading">Reading/Writing (Articles, notes)</option>
                  <option value="auditory">Auditory (Podcasts, discussions)</option>
                  <option value="kinesthetic">Hands-on (Projects, practice)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-3 text-sm font-medium">
                  Weekly Time Commitment: {learningPreferences.timeCommitment} hours
                </label>
                <input
                  type="range"
                  min="1"
                  max="40"
                  value={learningPreferences.timeCommitment}
                  onChange={(e) => setLearningPreferences({ 
                    ...learningPreferences, 
                    timeCommitment: parseInt(e.target.value) 
                  })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>1 hr</span>
                  <span>20 hrs</span>
                  <span>40 hrs</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Preferred Schedule</label>
                <select
                  value={learningPreferences.preferredSchedule}
                  onChange={(e) => setLearningPreferences({ ...learningPreferences, preferredSchedule: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="flexible">Flexible - I can adjust my schedule</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="weekends">Weekends only</option>
                  <option value="evenings">Evenings after work</option>
                </select>
              </div>

              <button
                onClick={handleLearningPreferencesUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Preferences
              </button>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && <NotificationPreferencesTab role="mentee" />}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <SecurityTab userRole="mentee" showAuditLogs={false} />
          )}
        </div>
      </div>
    </div>
  );
}
