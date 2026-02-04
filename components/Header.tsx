"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#partners", label: "Partners" },
  { href: "/employers", label: "For employers" },
  { href: "/families", label: "For families" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.style.overflowX = isMenuOpen ? "hidden" : "";
    document.body.style.overflowX = isMenuOpen ? "hidden" : "";

    return () => {
      document.documentElement.style.overflowX = "";
      document.body.style.overflowX = "";
    };
  }, [isMenuOpen]);

  const handleNavClick = () => setIsMenuOpen(false);

  return (
    <header className={`ss-header${isMenuOpen ? " ss-header-open" : ""}`}>
      <div className="ss-header-inner">
        <Link href="/" className="ss-brand" onClick={handleNavClick}>
          <div className="ss-brand-logo">
            <img src="/logo-shiftsitter.png" alt="ShiftSitter logo" />
          </div>
          <span className="ss-brand-text">ShiftSitter</span>
        </Link>

        <nav className="ss-nav ss-nav-desktop">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="ss-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ss-header-actions ss-nav-desktop">
          <Link href="/login" className="ss-btn-outline ss-nav-btn">
            Log in
          </Link>
          <Link href="/signup" className="ss-btn ss-nav-btn">
            Get started
          </Link>
        </div>

        <button
          type="button"
          className={`ss-menu-toggle${isMenuOpen ? " is-open" : ""}`}
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={`ss-mobile-menu${isMenuOpen ? " is-open" : ""}`} role="navigation">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="ss-mobile-link"
            onClick={handleNavClick}
          >
            {link.label}
          </Link>
        ))}

        <div className="ss-mobile-actions">
          <Link href="/login" className="ss-btn-outline ss-nav-btn" onClick={handleNavClick}>
            Log in
          </Link>
          <Link href="/signup" className="ss-btn ss-nav-btn" onClick={handleNavClick}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
