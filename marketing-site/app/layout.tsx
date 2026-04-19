import type { Metadata } from 'next';
import { Manrope, Sora } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
});

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Pathment | AI Mentorship Platform for Industry Teams',
  description:
    'Pathment helps organizations build measurable mentorship programs with structured learning paths, smart matching, and real performance visibility.',
  metadataBase: new URL('https://pathment.me'),
  openGraph: {
    title: 'Pathment',
    description:
      'Deploy mentorship programs that improve retention, reduce training waste, and scale expert knowledge transfer.',
    url: 'https://pathment.me',
    siteName: 'Pathment',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pathment',
    description:
      'AI-powered mentorship platform for industry teams that need measurable skill growth.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${manrope.variable} ${sora.variable}`}>
        {children}
      </body>
    </html>
  );
}
