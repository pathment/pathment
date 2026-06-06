import { Navigation } from '@/components/shared/Navigation';
import { RoleGuard } from '@/components/shared/RoleGuard';
import { ActivityTrackerMount } from '@/components/shared/ActivityTrackerMount';
import { TimezoneSync } from '@/components/shared/TimezoneSync';
import { WalkthroughMount } from '@/components/onboarding/WalkthroughMount';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['admin']} permitAdminArea>
      <div className="min-h-screen bg-canvas">          <ActivityTrackerMount /><TimezoneSync /><WalkthroughMount role="admin" />        <Navigation role="admin" />
        <main className="lg:pl-64 pt-14 lg:pt-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
        </main>
      </div>
    </RoleGuard>
  );
}
