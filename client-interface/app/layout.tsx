import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';
import { QueryProvider } from '@/lib/context/QueryProvider';
import { AuthProvider } from '@/lib/context/AuthContext';
import { ThemeProvider } from '@/lib/context/ThemeContext';
import { ClanProvider } from '@/lib/context/ClanContext';
import { ConfirmProvider } from '@/lib/context/ConfirmContext';
import { Toaster } from '@/components/ui/sonner';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pathment - AI-Powered Mentorship Platform',
  description: 'Transform learning through AI-powered mentorship matching and personalized roadmaps',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <ClanProvider>
                <ConfirmProvider>
                  {children}
                  <Toaster />
                </ConfirmProvider>
              </ClanProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
