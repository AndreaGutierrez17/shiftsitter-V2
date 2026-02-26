"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { NAV_LINKS } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    body: string;
    href: string | null;
    read?: boolean;
    readAt: unknown | null;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpenDesktop, setNotifOpenDesktop] = useState(false);
  const [notifOpenMobile, setNotifOpenMobile] = useState(false);

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

  const fetchNotifications = async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json() as { items?: Array<{ id: string; title: string; body: string; href: string | null; read?: boolean; readAt: unknown | null }>; unreadCount?: number };
      setNotifications(data.items || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // silent in header
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, readAt: {} } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const markAllNotificationsRead = async () => {
    if (!user || unreadCount === 0) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: n.readAt ?? {} })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const timer = window.setInterval(fetchNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [user, pathname]);

  useEffect(() => {
    if (notifOpenDesktop || notifOpenMobile) fetchNotifications();
  }, [notifOpenDesktop, notifOpenMobile]);

  return (
    <header className={`ss-header${isMenuOpen ? " ss-header-open" : ""}`}>
      <div className="ss-header-inner">
        <Link href={user ? "/families/match" : "/"} className="ss-brand" onClick={handleNavClick}>
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
          {user ? (
             <>
              <DropdownMenu
                open={notifOpenDesktop}
                onOpenChange={(open) => {
                  setNotifOpenDesktop(open);
                  if (open) setNotifOpenMobile(false);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button type="button" className="ss-btn-outline ss-nav-btn relative" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-[var(--radius)] p-1">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-primary disabled:opacity-50"
                      onClick={markAllNotificationsRead}
                      disabled={unreadCount === 0}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</div>
                  ) : (
                    notifications.slice(0, 8).map((notif) => (
                      <DropdownMenuItem
                        key={notif.id}
                        className={`items-start gap-2 p-3 ${(!notif.read && !notif.readAt) ? 'bg-accent/40' : ''}`}
                        onSelect={(e) => {
                          e.preventDefault();
                          void markNotificationRead(notif.id);
                          setNotifOpenDesktop(false);
                          if (notif.href) router.push(notif.href);
                        }}
                      >
                        <span className={`mt-1 h-2 w-2 rounded-full ${(!notif.read && !notif.readAt) ? 'bg-primary' : 'bg-muted'}`} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{notif.title}</div>
                          <div className="line-clamp-2 text-xs text-muted-foreground">{notif.body}</div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <button onClick={handleSignOut} className="ss-btn-outline ss-nav-btn">
                Log out
              </button>
             </>
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
             <>
              <DropdownMenu
                open={notifOpenMobile}
                onOpenChange={(open) => {
                  setNotifOpenMobile(open);
                  if (open) setNotifOpenDesktop(false);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button type="button" className="ss-btn-outline ss-nav-btn relative" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    <span>Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[92vw] max-w-80 rounded-[var(--radius)] p-1">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-primary disabled:opacity-50"
                      onClick={markAllNotificationsRead}
                      disabled={unreadCount === 0}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</div>
                  ) : (
                    notifications.slice(0, 8).map((notif) => (
                      <DropdownMenuItem
                        key={notif.id}
                        className={`items-start gap-2 p-3 ${(!notif.read && !notif.readAt) ? 'bg-accent/40' : ''}`}
                        onSelect={(e) => {
                          e.preventDefault();
                          void markNotificationRead(notif.id);
                          setNotifOpenMobile(false);
                          handleNavClick();
                          if (notif.href) router.push(notif.href);
                        }}
                      >
                        <span className={`mt-1 h-2 w-2 rounded-full ${(!notif.read && !notif.readAt) ? 'bg-primary' : 'bg-muted'}`} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{notif.title}</div>
                          <div className="line-clamp-2 text-xs text-muted-foreground">{notif.body}</div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <button onClick={() => { handleNavClick(); handleSignOut(); }} className="ss-btn-outline ss-nav-btn w-full">
                Log out
              </button>
             </>
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

