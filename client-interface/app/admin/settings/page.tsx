'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { User, Bell, Shield, Loader2, Save, KeyRound, Palette, Lock, Building2, CreditCard, LayoutGrid, Cable } from 'lucide-react';
import { useAdminSettings } from '@/lib/hooks/admin';
import { useOrganization } from '@/lib/context/OrganizationContext';
import { PageHeader } from '@/components/admin/ui';
import SecurityTab from '@/components/shared/SecurityTab';
import { LocationDetailsFields } from '@/components/settings/LocationDetailsFields';
import { ProfilePhotoField } from '@/components/settings/ProfilePhotoField';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import AIConnectionsTab from '@/components/settings/AIConnectionsTab';
import { NotificationPreferencesTab } from '@/components/settings/NotificationPreferencesTab';
import AppsTab from '@/components/settings/AppsTab';
import IntegrationsTab from '@/components/settings/IntegrationsTab';
import ReviewLockTab from '@/components/settings/ReviewLockTab';
import { PhoneField } from '@/components/shared/PhoneField';
import { OrganizationSettingsTab } from '@/components/settings/OrganizationSettingsTab';
import { PlansSettingsTab } from '@/components/settings/PlansSettingsTab';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'plan', label: 'Plan & Usage', icon: CreditCard },
  { id: 'appearance', label: 'Display', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'ai', label: 'AI Connections', icon: KeyRound },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
  { id: 'integrations', label: 'Integrations', icon: Cable },
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
  // Honor a `?tab=` deep-link (e.g. the "review unlock requested" notification
  // routes admins straight to Settings → Review Lock).
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => tabParam && TABS.some((x) => x.id === tabParam) ? tabParam : 'profile');
  const { loading, saving, profileData, setProfileData, handleProfileUpdate } = useAdminSettings();
  // Apps are a workspace-admin surface (system.settings); the API enforces the same rule.
  const { overview } = useOrganization();
  // Apps and Integrations act for the whole workspace: organization managers only.
  const tabs = overview?.canManageOrganization === true ? TABS : TABS.filter((x) => x.id !== 'apps' && x.id !== 'integrations');

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

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col lg:items-stretch">
          {tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`inline-flex items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-medium ${activeTab === tab.id ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}><tab.icon className="h-4 w-4" />{tab.label}</button>)}
        </nav>

        <div className="rounded-3xl border border-border bg-card p-4 sm:p-8">
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
                  <PhoneField value={profileData.phone} onChange={(v) => setProfileData({ ...profileData, phone: v })} />
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
                  value={{ city: profileData.city, country: profileData.country, countryCode: profileData.countryCode, region: profileData.region, languages: profileData.languages, timezone: profileData.timezone }}
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
          {activeTab === 'organization' && <OrganizationSettingsTab />}
          {activeTab === 'plan' && <PlansSettingsTab />}
          {activeTab === 'notifications' && <NotificationPreferencesTab role="admin" />}
          {activeTab === 'ai' && <AIConnectionsTab />}
          {activeTab === 'apps' && tabs.some((x) => x.id === 'apps') && <AppsTab />}
          {activeTab === 'integrations' && tabs.some((x) => x.id === 'integrations') && <IntegrationsTab />}
          {activeTab === 'review-lock' && <ReviewLockTab />}
          {activeTab === 'security' && <SecurityTab userRole="admin" showAuditLogs={true} />}
        </div>
      </div>
    </div>
  );
}
