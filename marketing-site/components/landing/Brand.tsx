import Image from 'next/image';
import Link from 'next/link';

interface BrandProps {
  compact?: boolean;
  href?: string;
  inverse?: boolean;
}

export function Brand({ compact = false, href = '#', inverse = false }: BrandProps) {
  const height = compact ? 24 : 28;

  return (
    <Link href={href} aria-label="Pathment home" className="inline-flex min-w-0 items-center">
      <Image
        src={inverse ? '/logo-inverse.svg' : '/logo.svg'}
        alt="Pathment"
        width={Math.round(height * 5.17)}
        height={height}
        priority
        className="h-auto w-auto"
        style={{ height, width: 'auto' }}
      />
    </Link>
  );
}
