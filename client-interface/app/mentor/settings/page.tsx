'use client';

import { Loader2, Save, User, Mail, Phone, Briefcase, Users, Bell, Shield, CheckCircle2 } from 'lucide-react';
import { useMentorSettings } from '@/lib/hooks/mentor';

export default function MentorSettings() {
  const {
    loading,
    saving,
    activeTab,
    profileData,
    mentorProfile,
    availabilitySettings,
    notificationSettings,
    setActiveTab,
    setProfileData,
    setMentorProfile,
    setAvailabilitySettings,
    setNotificationSettings,
    handleProfileUpdate,
    handleMentorProfileUpdate,
    handleAvailabilityUpdate,
    handleNotificationUpdate,
  } = useMentorSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'mentor', label: 'Mentor Info', icon: Briefcase },
    { id: 'availability', label: 'Availability', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Settings</h1>
        <p className="text-slate-600">Manage your account preferences and mentor profile</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 font-medium'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
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

          {/* Mentor Info Tab */}
          {activeTab === 'mentor' && (
            <div className="space-y-6">
              <h2 className="text-slate-900">Mentor Profile</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Title</label>
                  <input
                    type="text"
                    value={mentorProfile.title}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, title: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Senior Software Engineer"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Organization</label>
                  <input
                    type="text"
                    value={mentorProfile.organization}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, organization: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Company name"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Years of Experience</label>
                  <input
                    type="number"
                    value={mentorProfile.yearsOfExperience}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, yearsOfExperience: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">LinkedIn URL</label>
                  <input
                    type="url"
                    value={mentorProfile.linkedinUrl}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, linkedinUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">GitHub URL</label>
                  <input
                    type="url"
                    value={mentorProfile.githubUrl}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, githubUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://github.com/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Portfolio URL</label>
                  <input
                    type="url"
                    value={mentorProfile.portfolioUrl}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, portfolioUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <button
                onClick={handleMentorProfileUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
              </button>
            </div>
          )}

          {/* Availability Tab */}
          {activeTab === 'availability' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">Mentorship Availability</h2>
                <p className="text-slate-600">Control when you&apos;re available to take on new mentees</p>
              </div>

              {/* Current Status Card */}
              <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">Current Status</div>
                    <div className="text-sm text-slate-600">
                      {availabilitySettings.currentMenteeCount} of {availabilitySettings.maxMentees} mentees
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-lg font-medium ${
                    availabilitySettings.isAcceptingMentees 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {availabilitySettings.isAcceptingMentees ? 'Available' : 'Unavailable'}
                  </div>
                </div>
                
                <div className="w-full bg-white rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ 
                      width: `${(availabilitySettings.currentMenteeCount / availabilitySettings.maxMentees) * 100}%` 
                    }}
                  />
                </div>
              </div>

              {/* Accepting Mentees Toggle */}
              <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                <div>
                  <div className="text-slate-900 font-medium mb-1">Accepting New Mentees</div>
                  <div className="text-sm text-slate-600">
                    Allow admins to assign you to new program levels and mentees
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={availabilitySettings.isAcceptingMentees}
                    onChange={(e) => setAvailabilitySettings({ 
                      ...availabilitySettings, 
                      isAcceptingMentees: e.target.checked 
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Max Mentees */}
              <div className="p-6 border border-slate-200 rounded-xl">
                <div className="text-slate-900 font-medium mb-2">Maximum Mentees</div>
                <div className="text-sm text-slate-600 mb-4">
                  Set the maximum number of mentees you can mentor simultaneously
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={availabilitySettings.maxMentees}
                    onChange={(e) => setAvailabilitySettings({ 
                      ...availabilitySettings, 
                      maxMentees: Math.max(1, parseInt(e.target.value) || 1)
                    })}
                    min="1"
                    max="50"
                    className="w-32 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-slate-600">mentees</span>
                </div>
              </div>

              <button
                onClick={handleAvailabilityUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Availability Settings
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
                  { key: 'taskReminders', label: 'Task Reminders', description: 'Get reminders for pending task reviews' },
                  { key: 'menteeMessages', label: 'Mentee Messages', description: 'Notifications when mentees send messages' },
                  { key: 'weeklyReports', label: 'Weekly Reports', description: 'Receive weekly summary of your mentorship activities' }
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
                      <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
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
