'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login');
      } else {
        // Redirect based on role
        switch (user.role) {
          case 'admin':
            router.push('/admin/dashboard');
            break;
          case 'mentor':
            router.push('/mentor/dashboard');
            break;
          case 'mentee':
            router.push('/mentee/dashboard');
            break;
          default:
            router.push('/login');
        }
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
