'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { workspacePath } from '@/lib/services/workspace-scope';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
  /** Also permit entry for org/program admin-tier users (scoped RBAC), even if
   *  they lack the `admin` capability. Used by the admin section layout. */
  permitAdminArea?: boolean;
  /**
   * Also permit a selection-pool candidate.
   *
   * `candidate` is not a portal role — a candidate works in the learner
   * workspace with their round as the scope — so they do not hold `mentee`
   * and would otherwise be bounced out of the section they belong in.
   */
  permitCandidates?: boolean;
}

export function RoleGuard({ children, allowedRoles, redirectTo = '/login', permitAdminArea = false, permitCandidates = false }: RoleGuardProps) {
  const { user, isLoading, availableRoles, activeRole, setActiveRole, refreshUser } = useAuth();
  const { canAccessAdmin, canAccessPools, loading: permsLoading } = usePermissions();
  const router = useRouter();
  // Whether we've already re-checked capabilities with the server this mount.
  const [recheckedCaps, setRecheckedCaps] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // A user may enter a section if any of their capabilities matches it (this is
  // what lets an admin who is also a mentee open the mentee section), OR - for
  // the admin section - if scoped RBAC grants them org/program admin access.
  const roleMatch = !!user && allowedRoles.some((r) => availableRoles.includes(r));
  // Pool reviewers/operators enter too; the nav and section gate then show them
  // Selection pools and nothing else.
  const adminAllowed = !!user && permitAdminArea && (canAccessAdmin || canAccessPools);
  const candidateAllowed = !!user && permitCandidates && Boolean(user.capabilities?.includes('candidate'));
  const permitted = roleMatch || adminAllowed || candidateAllowed;
  const sectionRole = allowedRoles[0];
  // For admin-area entry we must wait for the permission fetch before deciding.
  const awaitingPerms = !!user && !roleMatch && permitAdminArea && permsLoading;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push(workspacePath(redirectTo));
      return;
    }
    if (permitted) {
      // Keep the active-role view in sync (only when the user truly holds the role).
      if (roleMatch && sectionRole && activeRole !== sectionRole && availableRoles.includes(sectionRole)) {
        setActiveRole(sectionRole);
      }
      return;
    }
    if (awaitingPerms) return; // hold until canAccessAdmin resolves
    // Cached capabilities may be stale - refresh from the server once before redirecting.
    if (!recheckedCaps) {
      setVerifying(true);
      refreshUser().finally(() => { setRecheckedCaps(true); setVerifying(false); });
      return;
    }
    router.push(workspacePath(`/${activeRole || user.role}/dashboard`));
  }, [user, isLoading, permitted, awaitingPerms, recheckedCaps, sectionRole, activeRole, availableRoles, redirectTo, router, setActiveRole, refreshUser, roleMatch]);

  if (isLoading || verifying || awaitingPerms) {
    /*
     * The portal's colours come from `:root:has([data-<portal>-appearance])`,
     * and that element lives INSIDE this guard. Without the marker here, this
     * spinner drew in the default blue and then the page's own spinner in the
     * portal green: two loaders in two colours on every load. Carrying the
     * same marker makes this the same loader, in the same colour.
     */
    const appearance = { [`data-${sectionRole || 'mentee'}-appearance`]: '' };
    return (
      <div {...appearance} className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-label="Loading" />
      </div>
    );
  }

  if (!permitted) {
    return null;
  }

  return <>{children}</>;
}
