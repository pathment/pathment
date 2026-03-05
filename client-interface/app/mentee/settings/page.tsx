'use client';

import { 
  User, 
  GraduationCap, 
  Target, 
  Bell, 
  Shield,
  Loader2,
  Save
} from 'lucide-react';
import { useMenteeSettings } from '@/lib/hooks/mentee';
import { PageHeader, TabBar } from '@/components/admin/ui';
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
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const tabs: Tab[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'mentee', label: 'Learning Info', icon: GraduationCap },
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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Last Name</label>
                  <input
                    type="text"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Bio</label>
                <textarea
                  value={profileData.bio}
                  onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Tell us about yourself..."
                />
              </div>

              <button
                onClick={handleProfileUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
              </button>
            </div>
          )}

          {/* Mentee Info Tab */}
          {activeTab === 'mentee' && (
            <div className="space-y-6">
              <h2 className="text-slate-900">Learning Profile</h2>
              
              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Learning Goals</label>
                <textarea
                  value={menteeProfile.learningGoals}
                  onChange={(e) => setMenteeProfile({ ...menteeProfile, learningGoals: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="What do you want to achieve through this mentorship?"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-2 text-sm font-medium">Prior Experience</label>
                <textarea
                  value={menteeProfile.priorExperience}
                  onChange={(e) => setMenteeProfile({ ...menteeProfile, priorExperience: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., BS Computer Science"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Current Occupation</label>
                  <input
                    type="text"
                    value={menteeProfile.currentOccupation}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, currentOccupation: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Student, Junior Developer"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">LinkedIn URL</label>
                  <input
                    type="url"
                    value={menteeProfile.linkedinUrl}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, linkedinUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">GitHub URL</label>
                  <input
                    type="url"
                    value={menteeProfile.githubUrl}
                    onChange={(e) => setMenteeProfile({ ...menteeProfile, githubUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://github.com/..."
                  />
                </div>
              </div>

              <button
                onClick={handleMenteeProfileUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
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
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
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
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Preferences
              </button>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">Notification Preferences</h2>
                <p className="text-slate-600">Choose what notifications you want to receive</p>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive notifications via email' },
                  { key: 'taskReminders', label: 'Task Reminders', description: 'Get reminders for upcoming task deadlines' },
                  { key: 'mentorMessages', label: 'Mentor Messages', description: 'Notifications when your mentor sends messages' },
                  { key: 'programUpdates', label: 'Program Updates', description: 'Updates about your enrolled programs' },
                  { key: 'weeklyProgress', label: 'Weekly Progress Reports', description: 'Receive weekly summary of your progress' }
                ].map((notification) => (
                  <div key={notification.key} className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                    <div>
                      <div className="text-slate-900 font-medium mb-1">{notification.label}</div>
                      <div className="text-sm text-slate-600">{notification.description}</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings[notification.key as keyof typeof notificationSettings]}
                        onChange={(e) => setNotificationSettings({ 
                          ...notificationSettings, 
                          [notification.key]: e.target.checked 
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-1 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                ))}
              </div>

              <button
                onClick={handleNotificationUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Notification Settings
              </button>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">Security Settings</h2>
                <p className="text-slate-600">Manage your password and security preferences</p>
              </div>

              <div className="p-6 border border-slate-200 rounded-xl">
                <div className="text-slate-900 font-medium mb-2">Change Password</div>
                <div className="text-sm text-slate-600 mb-4">
                  Update your password to keep your account secure
                </div>
                <button className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors">
                  Change Password
                </button>
              </div>

              <div className="p-6 border border-slate-200 rounded-xl">
                <div className="text-slate-900 font-medium mb-2">Two-Factor Authentication</div>
                <div className="text-sm text-slate-600 mb-4">
                  Add an extra layer of security to your account
                </div>
                <button className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors">
                  Enable 2FA
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
