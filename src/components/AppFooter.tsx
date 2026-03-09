'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppFooter() {
  const pathname = usePathname();

  if (pathname === '/') {
    return null;
  }

  return (
    <footer className="border-t border-border/70 bg-white/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-medium text-foreground">Support</p>
          <a href="mailto:info@shiftsitter.com" className="hover:text-primary">
            info@shiftsitter.com
          </a>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 text-foreground hover:text-primary">
          <img
            src="/logo-shiftsitter.png"
            alt="ShiftSitter logo"
            className="h-8 w-8 rounded-full object-cover"
          />
          <span>ShiftSitter</span>
        </Link>
      </div>
    </footer>
  );
}
