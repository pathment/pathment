'use client';

import { useParams, useRouter } from 'next/navigation';
import { AssessmentDrawer } from '@/components/admin/AssessmentDrawer';

/**
 * One assessment editor: this URL opens the same drawer the Assessments list
 * and the intake use, so there is only ever one builder to keep right.
 */
export default function AssessmentBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const back = () => router.push('/admin/assessments');
  return <AssessmentDrawer open assessmentId={id} onClose={back} onDeleted={back} />;
}
