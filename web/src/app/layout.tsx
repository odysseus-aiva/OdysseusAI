import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { DevAnnotator } from '@/components/DevAnnotator';
import { APP_NAME } from '@/lib/env';
import '@livekit/components-styles';
import './globals.css';

/* Inter runs the entire UI. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

/* The display face, standing in for the proprietary Waldenburg 300. Reserved
   for the 48px voice-stage headline — the one product moment where the
   marketing idiom is quoted on purpose. Page titles are Inter 500. */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  weight: ['300', '400', '500'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-var',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Dhvani — intelligent voice agents for real conversations.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before paint — reads localStorage and sets data-theme on <html>
            so the correct theme is applied before React hydrates, preventing flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('odysseus-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}else if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}else if(!window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {/* The canvas is flat. The radial gradient wash, particle field and
              film grain that used to sit here are decoration this language
              does not have — neutral and high-contrast is rule 1. */}
          <div className="ambient-backdrop" />
          {children}
          <DevAnnotator />
        </ThemeProvider>
      </body>
    </html>
  );
}
