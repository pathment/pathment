'use client';

import { useParams } from 'next/navigation';
import CertificateEditor from '@/components/admin/certificates/CertificateEditor';

export default function EditCertificatePage() {
  const params = useParams();
  const id = params.id as string;

  return <CertificateEditor templateId={id} />;
}
