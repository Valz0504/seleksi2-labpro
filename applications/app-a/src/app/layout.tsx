import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'App A | SSO Labpro',
  description: 'Relying application A untuk demonstrasi Single Sign-On',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
