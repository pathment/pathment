'use client';

import { Loader2, Save, User, Briefcase, Users, Bell, Shield, KeyRound, Sparkles, Palette } from 'lucide-react';
import { useMentorSettings } from '@/lib/hooks/mentor';
import { PageHeader, TabBar } from '@/components/admin/ui';
import SecurityTab from '@/components/shared/SecurityTab';
import AIConnectionsTab from '@/components/settings/AIConnectionsTab';
import { LocationDetailsFields } from '@/components/settings/LocationDetailsFields';
import { SkillsTab } from '@/components/settings/SkillsTab';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { NotificationPreferencesTab } from '@/components/settings/NotificationPreferencesTab';
import type { Tab } from '@/components/admin/ui';

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
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const tabs: Tab[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'mentor', label: 'Mentor Info', icon: Briefcase },
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'availability', label: 'Availability', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'ai', label: 'AI Connections', icon: KeyRound },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Settings"
        subtitle="Manage your account preferences and mentor profile"
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
            <SkillsTab blurb="Add the skills you bring as a mentor, with how strong you are at each. Mentees and admins see these on your profile." />
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && <AppearanceTab />}

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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g., Senior Software Engineer"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Organization</label>
                  <input
                    type="text"
                    value={mentorProfile.organization}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, organization: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Company name"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Years of Experience</label>
                  <input
                    type="number"
                    value={mentorProfile.yearsOfExperience}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, yearsOfExperience: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">LinkedIn URL</label>
                  <input
                    type="url"
                    value={mentorProfile.linkedinUrl}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, linkedinUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">GitHub URL</label>
                  <input
                    type="url"
                    value={mentorProfile.githubUrl}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, githubUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://github.com/..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2 text-sm font-medium">Portfolio URL</label>
                  <input
                    type="url"
                    value={mentorProfile.portfolioUrl}
                    onChange={(e) => setMentorProfile({ ...mentorProfile, portfolioUrl: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <button
                onClick={handleMentorProfileUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl transition-colors"
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
              <div className="p-6 bg-gradient-to-br from-brand-50 dark:from-brand-500/10 to-brand-50 dark:to-transparent rounded-xl border border-brand-100">
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
                
                <div className="w-full bg-card rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-brand-600 transition-all duration-300"
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
                  <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-card after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-brand-600"></div>
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
                    className="w-32 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-slate-600">mentees</span>
                </div>
              </div>

              <button
                onClick={handleAvailabilityUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Availability Settings
              </button>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && <NotificationPreferencesTab role="mentor" />}

          {/* Security Tab */}
          {activeTab === 'ai' && (
            <AIConnectionsTab />
          )}

          {activeTab === 'security' && (
            <SecurityTab userRole="mentor" showAuditLogs={false} />
          )}
        </div>
      </div>
    </div>
  );
}
