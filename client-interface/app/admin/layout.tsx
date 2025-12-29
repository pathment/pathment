import { Navigation } from '@/components/shared/Navigation';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-background">
        <Navigation role="admin" />
        <main className="lg:pl-64">
          <div className="container py-6 lg:py-8">{children}</div>
        </main>
      </div>
    </RoleGuard>
  );
}
