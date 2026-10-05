import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DM_Mono } from 'next/font/google';
import './globals.css';

// self-hosted at build time; the map's text textures read the family back through --mono
const mono = DM_Mono({ weight:['400', '500'], subsets:['latin', 'latin-ext'], variable:'--font-dm-mono', display:'swap' });

export const metadata: Metadata = {
  title:'Factory Yard',
  description:'A live isometric seaside town: a factory, a warehouse and a shop on the main road, streets, houses and villas, hills behind and the sea in front.',
};

// the ◐ choice is remembered; apply it before the first paint so a reload doesn't flash the other theme
const THEME_KEY = 'factory-yard-theme';
const restoreTheme = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html:restoreTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
