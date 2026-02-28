"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { EMPLOYER_NAV_LINKS, NAV_LINKS } from "@/lib/constants";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
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

const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "shiftsitter:last-activity-at";


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
  const [accountType, setAccountType] = useState<"family" | "employer" | null>(null);

  const navLinks = user ? (accountType === "employer" ? EMPLOYER_NAV_LINKS : NAV_LINKS) : publicNavLinks;

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setAccountType(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        if (!snap.exists()) {
          setAccountType(null);
          return;
        }
        const data = snap.data() as { accountType?: string; role?: string } | undefined;
        if (data?.accountType === "employer") {
          setAccountType("employer");
          return;
        }
        if (data?.accountType === "family" || ["parent", "sitter", "reciprocal"].includes(String(data?.role || ""))) {
          setAccountType("family");
          return;
        }
        setAccountType(null);
      } catch {
        setAccountType(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

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
    try {
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // ignore storage issues
    }
    await signOut(auth);
    router.push('/');
  };

  useEffect(() => {
    if (!user) return;

    let timeoutId: number | null = null;
    let lastPersistedAt = 0;

    const signOutForInactivity = async () => {
      try {
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      } catch {
        // ignore storage issues
      }
      await signOut(auth);
      router.push('/');
    };

    const scheduleFrom = (baseMs: number) => {
      if (timeoutId) window.clearTimeout(timeoutId);
      const remaining = Math.max(0, INACTIVITY_TIMEOUT_MS - (Date.now() - baseMs));
      timeoutId = window.setTimeout(() => {
        void signOutForInactivity();
      }, remaining);
    };

    const persistActivity = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPersistedAt < 60_000) {
        return;
      }
      lastPersistedAt = now;
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {
        // ignore storage issues
      }
      scheduleFrom(now);
    };

    try {
      const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
      const parsed = raw ? Number(raw) : NaN;
      const initialLastActivity = Number.isFinite(parsed) ? parsed : Date.now();

      if (Date.now() - initialLastActivity >= INACTIVITY_TIMEOUT_MS) {
        void signOutForInactivity();
        return;
      }

      lastPersistedAt = initialLastActivity;
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(initialLastActivity));
      scheduleFrom(initialLastActivity);
    } catch {
      persistActivity(true);
    }

    const onActivity = () => persistActivity();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        persistActivity(true);
      }
    };
    const onFocus = () => persistActivity(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY || !event.newValue) return;
      const next = Number(event.newValue);
      if (!Number.isFinite(next)) return;
      lastPersistedAt = next;
      scheduleFrom(next);
    };

    const events: Array<keyof WindowEventMap> = ["click", "keydown", "scroll", "mousemove", "touchstart"];
    events.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      events.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [router, user]);

  const isNotificationRead = (notification: { read?: boolean; readAt: unknown | null }) =>
    notification.read === true || Boolean(notification.readAt);

  const markNotificationRead = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "notifications", user.uid, "items", id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch {
      // silent
    }
  };

  const markAllNotificationsRead = async () => {
    if (!user || unreadCount === 0) return;
    try {
      const batch = writeBatch(db);
      notifications
        .filter((notification) => !isNotificationRead(notification))
        .forEach((notification) => {
          batch.update(doc(db, "notifications", user.uid, "items", notification.id), {
            read: true,
            readAt: serverTimestamp(),
          });
        });
      await batch.commit();
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const notificationsQuery = query(
      collection(db, "notifications", user.uid, "items"),
      orderBy("createdAt", "desc"),
      limit(24)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const nextNotifications = snapshot.docs.map((notificationDoc) => {
          const data = notificationDoc.data() as {
            title?: string;
            body?: string;
            href?: string | null;
            read?: boolean;
            readAt?: unknown | null;
          };

          return {
            id: notificationDoc.id,
            title: data.title || "Notification",
            body: data.body || "",
            href: data.href || null,
            read: data.read ?? false,
            readAt: data.readAt ?? null,
          };
        });

        setNotifications(nextNotifications);
        setUnreadCount(nextNotifications.filter((notification) => !isNotificationRead(notification)).length);
      },
      () => {
        setNotifications([]);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [user, pathname]);

  return (
    <header className={`ss-header${isMenuOpen ? " ss-header-open" : ""}`}>
      <div className="ss-header-inner">
        <Link href={user ? (accountType === "employer" ? "/employers/dashboard" : "/families/match") : "/"} className="ss-brand" onClick={handleNavClick}>
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
              {accountType !== "employer" ? (
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
                          className={`items-start gap-2 p-3 ${!isNotificationRead(notif) ? 'bg-accent/40' : ''}`}
                          onSelect={(e) => {
                            e.preventDefault();
                            void markNotificationRead(notif.id);
                            setNotifOpenDesktop(false);
                            if (notif.href) router.push(notif.href);
                          }}
                        >
                          <span className={`mt-1 h-2 w-2 rounded-full ${!isNotificationRead(notif) ? 'bg-primary' : 'bg-muted'}`} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{notif.title}</div>
                            <div className="line-clamp-2 text-xs text-muted-foreground">{notif.body}</div>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
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

        {user && accountType !== "employer" ? (
          <div className="ss-mobile-top-actions">
            <DropdownMenu
              open={notifOpenMobile}
              onOpenChange={(open) => {
                setNotifOpenMobile(open);
                if (open) {
                  setNotifOpenDesktop(false);
                  setIsMenuOpen(false);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <button type="button" className="ss-btn-outline ss-nav-btn relative ss-mobile-notif-btn" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-sm rounded-[var(--radius)] p-1">
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
                      className={`items-start gap-2 p-3 ${!isNotificationRead(notif) ? 'bg-accent/40' : ''}`}
                      onSelect={(e) => {
                        e.preventDefault();
                        void markNotificationRead(notif.id);
                        setNotifOpenMobile(false);
                        if (notif.href) router.push(notif.href);
                      }}
                    >
                      <span className={`mt-1 h-2 w-2 rounded-full ${!isNotificationRead(notif) ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{notif.title}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{notif.body}</div>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

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

