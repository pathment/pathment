'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { workspacePath } from '@/lib/services/workspace-scope';

/** A mentee's discussions are listed in Messages; this keeps old links working. */
export default function MenteeDiscussionsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(workspacePath('/mentee/messages?tab=discussions'));
  }, [router]);
  return null;
}
