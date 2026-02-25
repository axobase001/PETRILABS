'use client';

import Link from 'next/link';
import { Dna, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ConnectButton } from './ConnectButton';

const navLinks = [
  { href: '/', label: 'Deploy' },
  { href: '/agents', label: 'My Agents' },
  { href: '/explore', label: 'Explore' },
  { href: '/docs', label: 'Docs' },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-dark-700 bg-dark-900/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="p-2 rounded-lg bg-primary-500/10 group-hover:bg-primary-500/20 transition-colors">
            <Dna className="w-6 h-6 text-primary-400" />
          </div>
          <span className="text-xl font-bold gradient-text">PETRILABS</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'text-gray-400 hover:text-white hover:bg-dark-800'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Connect Button */}
        <div className="hidden md:block">
          <ConnectButton />
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-dark-800 text-gray-400"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-dark-700 bg-dark-900">
          <nav className="container mx-auto px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="block px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-800 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-dark-700">
              <ConnectButton className="w-full" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
