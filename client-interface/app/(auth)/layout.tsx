import { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-primary/10 via-background to-secondary/10 p-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
