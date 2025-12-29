import { Navigation } from '@/components/shared/Navigation';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default function MentorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['mentor']}>
      <div className="min-h-screen bg-slate-50">
        <Navigation role="mentor" />
        <main className="lg:pl-64 pt-14 lg:pt-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
        </main>
      </div>
    </RoleGuard>
  );
}
