import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Web3Provider } from '@/lib/wagmi';
import { Header } from '@/components/Header';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'PETRILABS - AI Agent Wild Deployment',
  description: 'Deploy autonomous AI agents with dynamic genomes on Base L2',
  keywords: ['AI', 'Agent', 'Blockchain', 'Base', 'Genome', 'Autonomous'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <Web3Provider>
          <div className="min-h-screen bg-dark-900">
            <Header />
            <main className="container mx-auto px-4 py-8">
              {children}
            </main>
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1a1a25',
                color: '#fff',
                border: '1px solid #2d2d3d',
              },
              success: {
                iconTheme: {
                  primary: '#22c55e',
                  secondary: '#1a1a25',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#1a1a25',
                },
              },
            }}
          />
        </Web3Provider>
      </body>
    </html>
  );
}
