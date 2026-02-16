'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import { DashboardStats } from '@/components/admin/dashboard/DashboardStats';
import { QuickActions } from '@/components/admin/dashboard/QuickActions';
import { RecentActivity } from '@/components/admin/dashboard/RecentActivity';
import { ProgramListCard } from '@/components/admin/programs/ProgramListCard';
import { adminApi } from '@/lib/services/admin-api';
import { toast } from 'sonner';

export default function AdminDashboardPage() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await adminApi.dashboard.getStats();
      setDashboardData(response);
    } catch (error: any) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error(error.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold mb-2">Admin Dashboard</h1>
          <p className="text-slate-600">Manage programs, mentors, and enrollments</p>
        </div>
        <Link href="/admin/programs/create">
          <button className="mt-4 sm:mt-0 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition-colors">
            <Plus className="w-5 h-5" />
            Create Program
          </button>
        </Link>
      </div>

      <DashboardStats stats={dashboardData?.stats} />
      
      <div className="grid lg:grid-cols-3 gap-8">
        <ProgramListCard programs={dashboardData?.recentPrograms} />
        
        <div className="space-y-6">
          <RecentActivity pendingMatches={dashboardData?.pendingMatches} />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
