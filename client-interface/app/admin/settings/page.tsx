'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { User, Bell, Shield, Loader2, Save, KeyRound, Palette, Lock } from 'lucide-react';
import { useAdminSettings } from '@/lib/hooks/admin';
import { PageHeader, TabBar } from '@/components/admin/ui';
import SecurityTab from '@/components/shared/SecurityTab';
import { LocationDetailsFields } from '@/components/settings/LocationDetailsFields';
import { ProfilePhotoField } from '@/components/settings/ProfilePhotoField';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import AIConnectionsTab from '@/components/settings/AIConnectionsTab';
import { NotificationPreferencesTab } from '@/components/settings/NotificationPreferencesTab';
import ReviewLockTab from '@/components/settings/ReviewLockTab';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'ai', label: 'AI Connections', icon: KeyRound },
  { id: 'review-lock', label: 'Review Lock', icon: Lock },
  { id: 'security', label: 'Security', icon: Shield },
];

export default function AdminSettings() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>}>
      <AdminSettingsInner />
    </Suspense>
  );
}

function AdminSettingsInner() {
  const [activeTab, setActiveTab] = useState('profile');
  const { loading, saving, profileData, setProfileData, handleProfileUpdate } = useAdminSettings();

  // Honor a `?tab=` deep-link (e.g. the "review unlock requested" notification
  // routes admins straight to Settings → Review Lock). useSearchParams is
  // reactive, so this also switches tabs when only the query changes while the
  // page is already mounted.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam && TABS.some((x) => x.id === tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Settings" subtitle="Manage your admin profile and preferences" />

      <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="p-8">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <ProfilePhotoField />
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

          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'notifications' && <NotificationPreferencesTab role="admin" />}
          {activeTab === 'ai' && <AIConnectionsTab />}
          {activeTab === 'review-lock' && <ReviewLockTab />}
          {activeTab === 'security' && <SecurityTab userRole="admin" showAuditLogs={true} />}
        </div>
      </div>
    </div>
  );
}
