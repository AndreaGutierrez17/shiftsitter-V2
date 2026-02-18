"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { NAV_LINKS } from "@/lib/constants";

const publicNavLinks = [
  { href: "/", label: "Home" },
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#partners", label: "Partners" },
  { href: "/employers", label: "For employers" },
];


export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const router = useRouter();

  const navLinks = user ? NAV_LINKS : publicNavLinks;

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

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  }

  return (
    <header className={`ss-header${isMenuOpen ? " ss-header-open" : ""}`}>
      <div className="ss-header-inner">
        <Link href={user ? "/families/match" : "/"} className="ss-brand" onClick={handleNavClick}>
          <div className="ss-brand-logo">
            <img src="/logo.svg" alt="ShiftSitter logo" />
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
          {user ? (
             <button onClick={handleSignOut} className="ss-btn-outline ss-nav-btn">
              Log out
            </button>
          ) : (
            <>
              <Link href="/families" className="ss-btn-outline ss-nav-btn">
                Log in
              </Link>
              <Link href="/families" className="ss-btn ss-nav-btn">
                Get started
              </Link>
            </>
          )}
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
           {user ? (
             <button onClick={() => { handleNavClick(); handleSignOut(); }} className="ss-btn-outline ss-nav-btn w-full">
              Log out
            </button>
          ) : (
            <>
              <Link href="/families" className="ss-btn-outline ss-nav-btn" onClick={handleNavClick}>
                Log in
              </Link>
              <Link href="/families" className="ss-btn ss-nav-btn" onClick={handleNavClick}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

