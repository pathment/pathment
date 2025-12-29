'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

export function RoleGuard({ children, allowedRoles, redirectTo = '/login' }: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push(redirectTo);
      } else if (!allowedRoles.includes(user.role)) {
        // Redirect to appropriate dashboard based on role
        const roleDashboard = `/${user.role}/dashboard`;
        router.push(roleDashboard);
      }
    }
  }, [user, isLoading, allowedRoles, redirectTo, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
