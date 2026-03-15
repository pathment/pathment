'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { Shield, Loader2 } from 'lucide-react';
import Link from 'next/link';
import securityService, { TwoFactorStatus } from '@/lib/services/security-api';

export function UserProfileCard() {
  const { user, requiresTwoFactor } = useAuth();
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTwoFactorStatus = async () => {
      try {
        // Only fetch 2FA status if user is fully authenticated (not pending 2FA verification)
        if (user?.id && !requiresTwoFactor) {
          const status = await securityService.get2FAStatus();
          setTwoFactorStatus(status);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to load 2FA status:', error);
        setLoading(false);
      } finally {
        if (user?.id && !requiresTwoFactor) {
          setLoading(false);
        }
      }
    };

    if (user?.id) {
      loadTwoFactorStatus();
    }
  }, [user?.id, requiresTwoFactor]);

  if (!user) return null;

  return (
    <Link href={`/${user.role}/settings`}>
      <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group">
        {/* User Info */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user.firstName && user.lastName 
                ? `${user.firstName} ${user.lastName}`
                : user.email}
            </p>
            <p className="text-xs text-slate-600 truncate">{user.email}</p>
            <p className="text-xs text-slate-500 mt-1 capitalize">{user.role}</p>
          </div>
          
          {/* 2FA Badge */}
          {requiresTwoFactor ? (
            <div className="px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 flex items-center gap-1 bg-yellow-100 text-yellow-700">
              <Shield className="w-3 h-3" />
              2FA Required
            </div>
          ) : !loading && twoFactorStatus ? (
            <div className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 flex items-center gap-1 ${
              twoFactorStatus.enabled
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-200 text-slate-600'
            }`}>
              <Shield className="w-3 h-3" />
              {twoFactorStatus.enabled ? '2FA' : 'No 2FA'}
            </div>
          ) : (
            <div className="flex-shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            </div>
          )}
        </div>

        {/* Info Text */}
        <p className="text-xs text-slate-500 mt-2 group-hover:text-slate-600 transition-colors">
          Click to manage security settings
        </p>
      </div>
    </Link>
  );
}
