import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CBAM X — Carbon Compliance Platform',
    template: '%s | CBAM X',
  },
  description: 'Enterprise CBAM compliance operating system.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
