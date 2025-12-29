'use client';

import { DashboardStats } from '@/components/admin/dashboard/DashboardStats';
import { QuickActions } from '@/components/admin/dashboard/QuickActions';
import { RecentActivity } from '@/components/admin/dashboard/RecentActivity';
import { ProgramListCard } from '@/components/admin/programs/ProgramListCard';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage programs, enrollments, and mentor assignments
        </p>
      </div>

      <DashboardStats />
      
      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProgramListCard />
        <RecentActivity />
      </div>
    </div>
  );
}
