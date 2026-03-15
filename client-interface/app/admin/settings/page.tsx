'use client';

import { useState } from 'react';
import {
  User,
  Settings2,
  Bell,
  Shield,
  Users,
  Loader2,
  Save,
} from 'lucide-react';
import { useAdminSettings } from '@/lib/hooks/admin';
import { PageHeader, TabBar } from '@/components/admin/ui';
import SecurityTab from '@/components/shared/SecurityTab';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'system', label: 'System', icon: Settings2 },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

const NOTIFICATION_KEYS = [
  { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive notifications via email' },
  { key: 'enrollmentAlerts', label: 'Enrollment Alerts', description: 'Get notified of new enrollment requests' },
  { key: 'systemAlerts', label: 'System Alerts', description: 'Alerts about system issues or errors' },
  { key: 'weeklyReports', label: 'Weekly Reports', description: 'Receive weekly platform statistics' },
  { key: 'urgentIssues', label: 'Urgent Issues', description: 'Immediate alerts for critical issues' },
] as const;

function Toggle({
  checked,
  onChange,
  danger = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  const ring = danger ? 'peer-focus:ring-red-300' : 'peer-focus:ring-indigo-300';
  const bg = danger
    ? 'bg-red-200 peer-checked:bg-red-600'
    : 'bg-slate-200 peer-checked:bg-indigo-600';
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div
        className={`w-14 h-7 ${bg} peer-focus:outline-none peer-focus:ring-4 ${ring} rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all`}
      />
    </label>
  );
}

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const {
    loading,
    saving,
    profileData,
    systemSettings,
    userManagementSettings,
    notificationSettings,
    setProfileData,
    setSystemSettings,
    setUserManagementSettings,
    setNotificationSettings,
    handleProfileUpdate,
    handleSystemSettingsUpdate,
    handleUserManagementUpdate,
    handleNotificationUpdate,
  } = useAdminSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const SaveButton = ({ onClick, label = 'Save Changes' }: { onClick: () => void; label?: string }) => (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
    >
      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Admin Settings"
        subtitle="Manage system configuration and your admin profile"
      />

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
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

              <SaveButton onClick={handleProfileUpdate} />
            </div>
          )}

          {/* System Settings Tab */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">System Configuration</h2>
                <p className="text-slate-600">Configure platform-wide settings</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">Auto-Approve Enrollments</div>
                    <div className="text-sm text-slate-600">
                      Automatically approve mentee enrollment requests without manual review
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={systemSettings.autoApproveEnrollments}
                      onChange={(e) => setSystemSettings({ 
                        ...systemSettings, 
                        autoApproveEnrollments: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">Allow Self Registration</div>
                    <div className="text-sm text-slate-600">
                      Allow users to register without admin invitation
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={systemSettings.allowSelfRegistration}
                      onChange={(e) => setSystemSettings({ 
                        ...systemSettings, 
                        allowSelfRegistration: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-6 border border-red-200 bg-red-50 rounded-xl">
                  <div>
                    <div className="text-red-900 font-medium mb-1">Maintenance Mode</div>
                    <div className="text-sm text-red-700">
                      Disable platform access for maintenance (admin access only)
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={systemSettings.maintenanceMode}
                      onChange={(e) => setSystemSettings({ 
                        ...systemSettings, 
                        maintenanceMode: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-red-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-red-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">Require Email Verification</div>
                    <div className="text-sm text-slate-600">
                      Users must verify their email before accessing the platform
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={systemSettings.requireEmailVerification}
                      onChange={(e) => setSystemSettings({ 
                        ...systemSettings, 
                        requireEmailVerification: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="p-6 border border-slate-200 rounded-xl">
                  <div className="text-slate-900 font-medium mb-2">Max Programs Per Mentee</div>
                  <div className="text-sm text-slate-600 mb-4">
                    Maximum number of programs a mentee can enroll in simultaneously
                  </div>
                  <input
                    type="number"
                    value={systemSettings.maxProgramsPerMentee}
                    onChange={(e) => setSystemSettings({ 
                      ...systemSettings, 
                      maxProgramsPerMentee: Math.max(1, parseInt(e.target.value) || 1)
                    })}
                    min="1"
                    max="10"
                    className="w-32 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <SaveButton onClick={handleSystemSettingsUpdate} label="Save System Settings" />
            </div>
          )}

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">User Management Settings</h2>
                <p className="text-slate-600">Configure user and matching preferences</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">Allow Mentor Self-Assignment</div>
                    <div className="text-sm text-slate-600">
                      Mentors can assign themselves to program levels
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userManagementSettings.allowMentorSelfAssignment}
                      onChange={(e) => setUserManagementSettings({ 
                        ...userManagementSettings, 
                        allowMentorSelfAssignment: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">Require Mentor Approval</div>
                    <div className="text-sm text-slate-600">
                      Mentors must approve new mentor accounts
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userManagementSettings.requireMentorApproval}
                      onChange={(e) => setUserManagementSettings({ 
                        ...userManagementSettings, 
                        requireMentorApproval: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-6 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-slate-900 font-medium mb-1">AI Auto-Match Algorithm</div>
                    <div className="text-sm text-slate-600">
                      Use AI to automatically suggest mentor-mentee matches
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userManagementSettings.autoMatchAlgorithm}
                      onChange={(e) => setUserManagementSettings({ 
                        ...userManagementSettings, 
                        autoMatchAlgorithm: e.target.checked 
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="p-6 border border-slate-200 rounded-xl">
                  <div className="text-slate-900 font-medium mb-2">Minimum Mentor Experience (Years)</div>
                  <div className="text-sm text-slate-600 mb-4">
                    Minimum years of experience required to become a mentor
                  </div>
                  <input
                    type="number"
                    value={userManagementSettings.minMentorExperience}
                    onChange={(e) => setUserManagementSettings({ 
                      ...userManagementSettings, 
                      minMentorExperience: Math.max(0, parseInt(e.target.value) || 0)
                    })}
                    min="0"
                    max="20"
                    className="w-32 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <SaveButton onClick={handleUserManagementUpdate} label="Save User Management Settings" />
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-slate-900 mb-2">Admin Notification Preferences</h2>
                <p className="text-slate-600">Choose what admin notifications you want to receive</p>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive notifications via email' },
                  { key: 'enrollmentAlerts', label: 'Enrollment Alerts', description: 'Get notified of new enrollment requests' },
                  { key: 'systemAlerts', label: 'System Alerts', description: 'Alerts about system issues or errors' },
                  { key: 'weeklyReports', label: 'Weekly Reports', description: 'Receive weekly platform statistics' },
                  { key: 'urgentIssues', label: 'Urgent Issues', description: 'Immediate alerts for critical issues' }
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

              <SaveButton onClick={handleNotificationUpdate} label="Save Notification Settings" />
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <SecurityTab userRole="admin" showAuditLogs={true} />
          )}
        </div>
      </div>
    </div>
  );
}
