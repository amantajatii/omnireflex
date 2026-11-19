import type { Metadata } from 'next';
import { Manrope, Newsreader, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import './frames.css';
const sans = Manrope({ subsets: ['latin'], variable: '--rx-font-sans' });
const serif = Newsreader({ subsets: ['latin'], variable: '--rx-font-serif' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--rx-font-mono' });
export const metadata: Metadata = {
  title: 'Reflex — Orders that fire on their own',
  description:
    'Reactive orders on Uniswap v4. Follow the full execution loop across Unichain, Base and Reactive Lasna.',
};
const theme = `try{var t=localStorage.getItem('reflex-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
