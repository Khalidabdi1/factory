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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
