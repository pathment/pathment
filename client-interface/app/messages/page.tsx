'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';

export default function LegacyMessagesRedirectPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    const role = user?.role;
    if (!role || !['admin', 'mentor', 'mentee'].includes(role)) {
      return;
    }

    const query = searchParams.toString();
    const targetPath = `/${role}/messages${query ? `?${query}` : ''}`;

    // Prevent loops if the path is already correct.
    if (pathname !== targetPath) {
      router.replace(targetPath);
    }
  }, [pathname, router, searchParams, user?.role]);

  return null;
}
