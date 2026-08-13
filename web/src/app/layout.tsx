import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Particles } from '@/components/ui/Particles';
import { FilmGrain } from '@/features/voice/components/ParticleOrb';
import { APP_NAME } from '@/lib/env';
import '@livekit/components-styles';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-var',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Voice AI`,
  description: 'An intelligent voice assistant.',
};

export const viewport: Viewport = {
  themeColor: '#05060a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        <div className="ambient-backdrop" />
        <Particles />
        <FilmGrain />
        {children}
      </body>
    </html>
  );
}
