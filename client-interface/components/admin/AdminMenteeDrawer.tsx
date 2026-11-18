'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { AdminMenteeProfile } from '@/components/admin/AdminMenteeProfile';

/**
 * A mentee's admin profile in a side drawer — open on whatever screen is
 * deciding something about them, so the admin sees who they are (clan,
 * mentors, programmes, recent work) without leaving the decision.
 *
 * `footer` carries that screen's own actions (approve / deny a request).
 */
export function AdminMenteeDrawer({ menteeId, title, subtitle, footer, onClose }: {
  menteeId: string | null;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={!!menteeId}
      onClose={onClose}
      width="lg"
      title={title || 'Mentee'}
      subtitle={subtitle}
      footer={footer}
    >
      {menteeId && (
        <div className="space-y-4">
          <Link href={`/admin/mentees/${menteeId}`} target="_blank"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
            <ExternalLink className="w-3.5 h-3.5" />Open full profile
          </Link>
          <AdminMenteeProfile menteeId={menteeId} variant="drawer" />
        </div>
      )}
    </Drawer>
  );
}
