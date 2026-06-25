import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';
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
  manifest: '/manifest.webmanifest',
  // app/icon.svg, app/icon.png, app/favicon.ico and app/apple-icon.png are
  // auto-detected by Next; this adds the explicit apple-touch fallback.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0066FF',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
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
      </body>
    </html>
  );
}
