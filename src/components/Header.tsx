"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Bell, CheckCheck, ChevronDown, CircleHelp, LogOut, Settings, Shield, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPresenceHeartbeat } from "@/hooks/useUserPresenceHeartbeat";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { requestGuidedTourOpen } from "@/lib/guided-tour";
import { EMPLOYER_NAV_LINKS, NAV_LINKS } from "@/lib/constants";
import { enableWebPush, disableWebPush } from "@/lib/firebase/push";
import { useToast } from "@/hooks/use-toast";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
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
import { Switch } from "@/components/ui/switch";

const publicNavLinks = [
  { href: "/", label: "Home" },
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#partners", label: "Partners" },
  { href: "/employers", label: "For employers" },
];

const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "shiftsitter:last-activity-at";
const ADMIN_LINK_CACHE_KEY = "shiftsitter:is-admin-link";


export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
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
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [notifOpenDesktop, setNotifOpenDesktop] = useState(false);
  const [notifOpenMobile, setNotifOpenMobile] = useState(false);
  const [userMenuOpenDesktop, setUserMenuOpenDesktop] = useState(false);
  const [pushStatus, setPushStatus] = useState<"on" | "off" | "blocked">("off");
  const [isHandlingPush, setIsHandlingPush] = useState(false);
  const [accountType, setAccountType] = useState<"family" | "employer" | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const showAdminLink = Boolean(user && (isAdmin || pathname?.startsWith("/admin")));
  const showFamilyTourControls = Boolean(user && accountType !== "employer" && pathname?.startsWith("/families"));
  useUserPresenceHeartbeat(user?.uid);
  const { toast } = useToast();

  const navLinks = user ? (accountType === "employer" ? EMPLOYER_NAV_LINKS : NAV_LINKS) : publicNavLinks;

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setAccountType(null);
      setIsAdmin(false);
      setUserAvatarUrl("");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        if (!snap.exists()) {
          setUserAvatarUrl(typeof user.photoURL === "string" ? user.photoURL : "");
          setAccountType(null);
          return;
        }
        const data = snap.data() as { accountType?: string; role?: string; photoURL?: string; photoURLs?: unknown } | undefined;
        const possiblePhotos = Array.isArray(data?.photoURLs) ? data?.photoURLs : [];
        const nextPhoto =
          (typeof possiblePhotos[0] === "string" ? possiblePhotos[0] : "") ||
          (typeof data?.photoURL === "string" ? data?.photoURL : "") ||
          (typeof user.photoURL === "string" ? user.photoURL : "");
        setUserAvatarUrl(nextPhoto);
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
    let cancelled = false;

    if (authLoading) {
      return;
    }

    if (!user) {
      setIsAdmin(false);
      return;
    }

    try {
      if (window.localStorage.getItem(ADMIN_LINK_CACHE_KEY) === "1") {
        setIsAdmin(true);
      }
    } catch {
      // ignore storage issues
    }

    void (async () => {
      try {
        if (cancelled) return;
        const tokenResult = await user.getIdTokenResult();
        if (cancelled) return;
        const nextIsAdmin = tokenResult.claims?.role === "admin";
        setIsAdmin(nextIsAdmin);
        try {
          if (nextIsAdmin) window.localStorage.setItem(ADMIN_LINK_CACHE_KEY, "1");
          else window.localStorage.removeItem(ADMIN_LINK_CACHE_KEY);
        } catch {
          // ignore storage issues
        }
      } catch {
        if (!cancelled) setIsAdmin(Boolean(pathname?.startsWith("/admin")));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, pathname]);

  useEffect(() => {
    document.documentElement.style.overflowX = isMenuOpen ? "hidden" : "";
    document.body.style.overflowX = isMenuOpen ? "hidden" : "";

    return () => {
      document.documentElement.style.overflowX = "";
      document.body.style.overflowX = "";
    };
  }, [isMenuOpen]);

  const handleNavClick = () => setIsMenuOpen(false);

  const handleOpenTour = () => {
    requestGuidedTourOpen();
  };

  const handleSignOut = async () => {
    try {
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      window.localStorage.removeItem(ADMIN_LINK_CACHE_KEY);
    } catch {
      // ignore storage issues
    }
    await signOut(auth);
    router.push('/');
  };

  const userMenuName = user?.displayName || user?.email || "Account";
  const userMenuPhoto = userAvatarUrl || "";
  const userMenuInitial = userMenuName.trim().charAt(0).toUpperCase();

  const settingsHref = accountType === "employer" ? "/employers/settings" : "/families/profile/edit";

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
    if (!user || unreadCount === 0 || isMarkingAllRead) return;

    const unreadIds = notifications
      .filter((notification) => !isNotificationRead(notification))
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      setUnreadCount(0);
      return;
    }

    const previousNotifications = notifications;
    const optimisticNotifications = notifications.map((notification) =>
      unreadIds.includes(notification.id)
        ? { ...notification, read: true, readAt: new Date() }
        : notification
    );

    setIsMarkingAllRead(true);
    setNotifications(optimisticNotifications);
    setUnreadCount(0);

    try {
      const batch = writeBatch(db);
      unreadIds.forEach((id) => {
        batch.update(doc(db, "notifications", user.uid, "items", id), {
            read: true,
            readAt: serverTimestamp(),
          });
      });
      await batch.commit();
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousNotifications.filter((notification) => !isNotificationRead(notification)).length);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    const notificationsQuery = query(
      collection(db, "notifications", user.uid, "items"),
      orderBy("createdAt", "desc"),
      limit(24)
    );

    const loadNotifications = async () => {
      try {
        const snapshot = await getDocs(notificationsQuery);
        if (cancelled) return;

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
      } catch {
        if (!cancelled) {
          setNotifications([]);
          setUnreadCount(0);
        }
      }
    };

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let nextStatus: "on" | "off" | "blocked" = "off";
    if (Notification.permission === "denied") {
      nextStatus = "blocked";
    } else {
      let optedOut = false;
      try {
        optedOut = window.localStorage.getItem("shiftsitter:push-opt-out") === "1";
      } catch {
        optedOut = false;
      }
      nextStatus = Notification.permission === "granted" && !optedOut ? "on" : "off";
    }
    setPushStatus(nextStatus);
  }, [user]);

  const handleTogglePush = async (nextChecked: boolean) => {
    if (!user || isHandlingPush) return;
    setIsHandlingPush(true);
    try {
      if (nextChecked) {
        await enableWebPush(user.uid);
        setPushStatus("on");
        toast({
          title: "Notifications enabled",
          description: "Notifications are enabled on this device.",
        });
      } else {
        await disableWebPush(user.uid);
        setPushStatus("off");
        toast({
          title: "Notifications disabled",
          description: "Notifications are disabled on this device.",
        });
      }
    } catch (error: any) {
      const message = error?.message || "We couldn't update notifications.";
      toast({
        variant: "destructive",
        title: "Couldn't update",
        description: message,
      });
      if (Notification.permission === "denied") {
        setPushStatus("blocked");
      }
    } finally {
      setIsHandlingPush(false);
    }
  };

  return (
    <header
      className={`ss-header${isMenuOpen ? " ss-header-open" : ""}`}
      data-tour={showFamilyTourControls ? "families-nav" : undefined}
    >
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
                <>
                  {showFamilyTourControls ? (
                    <button
                    type="button"
                    className="ss-btn-outline ss-nav-btn"
                    onClick={handleOpenTour}
                    aria-label="Open guided tour"
                    title="Guided tour"
                  >
                    <CircleHelp className="h-4 w-4" />
                  </button>
                  ) : null}
                  <DropdownMenu
                    open={notifOpenDesktop}
                    onOpenChange={(open) => {
                      setNotifOpenDesktop(open);
                      if (open) {
                        setUserMenuOpenDesktop(false);
                      }
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
                          disabled={unreadCount === 0 || isMarkingAllRead}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          {isMarkingAllRead ? 'Marking...' : 'Mark all read'}
                        </button>
                      </DropdownMenuLabel>
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>Alerts</span>
                          {pushStatus === "on" ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              Enabled
                            </span>
                          ) : null}
                        </div>
                        <Switch
                          checked={pushStatus === "on"}
                          onCheckedChange={handleTogglePush}
                          disabled={isHandlingPush || pushStatus === "blocked"}
                        />
                      </div>
                      {pushStatus === "blocked" ? (
                        <div className="px-3 pb-2 text-[11px] text-muted-foreground">
                          Permission blocked in the browser.
                        </div>
                      ) : null}
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
                </>
              ) : null}
              <DropdownMenu
                open={userMenuOpenDesktop}
                onOpenChange={(open) => {
                  setUserMenuOpenDesktop(open);
                  if (open) setNotifOpenDesktop(false);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button type="button" className="ss-user-menu-btn" aria-label="Account menu">
                    <span className="ss-user-avatar">
                      {userMenuPhoto ? (
                        <img
                          src={userMenuPhoto}
                          alt="Profile photo"
                          onError={() => setUserAvatarUrl("")}
                        />
                      ) : (
                        userMenuInitial
                      )}
                    </span>
                    <span className="ss-user-menu-name">{userMenuName}</span>
                    <ChevronDown className="h-4 w-4 text-primary" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="ss-user-menu w-64">
                  {showAdminLink ? (
                    <>
                      <DropdownMenuLabel className="ss-user-menu-label">Admin panel</DropdownMenuLabel>
                      <DropdownMenuItem className="ss-user-menu-item" onSelect={() => router.push("/admin/dashboard")}>
                        <Shield className="h-4 w-4" />
                        <span>Admin</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="ss-user-menu-item" onSelect={() => router.push("/admin/verification")}>
                        <BadgeCheck className="h-4 w-4" />
                        <span>Verification</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  {accountType !== "employer" ? (
                    <DropdownMenuItem className="ss-user-menu-item" onSelect={() => router.push("/families/matches")}>
                      <Users className="h-4 w-4" />
                      <span>Shifters</span>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem className="ss-user-menu-item" onSelect={() => router.push(settingsHref)}>
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="ss-user-menu-item" onSelect={handleSignOut}>
                    <LogOut className="h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

        {user ? (
          <div className="ss-mobile-top-actions">
            <>
              {showFamilyTourControls ? (
                <button
                type="button"
                className="ss-btn-outline ss-nav-btn"
                onClick={handleOpenTour}
                aria-label="Open guided tour"
                title="Guided tour"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
              ) : null}
              {accountType !== "employer" ? (
                <DropdownMenu
                  open={notifOpenMobile}
                  onOpenChange={(open) => {
                    setNotifOpenMobile(open);
                    if (open) {
                      setNotifOpenDesktop(false);
                      setUserMenuOpenMobile(false);
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
                        disabled={unreadCount === 0 || isMarkingAllRead}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        {isMarkingAllRead ? 'Marking...' : 'Mark all read'}
                      </button>
                    </DropdownMenuLabel>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Alerts</span>
                        {pushStatus === "on" ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Enabled
                          </span>
                        ) : null}
                      </div>
                      <Switch
                        checked={pushStatus === "on"}
                        onCheckedChange={handleTogglePush}
                        disabled={isHandlingPush || pushStatus === "blocked"}
                      />
                    </div>
                    {pushStatus === "blocked" ? (
                      <div className="px-3 pb-2 text-[11px] text-muted-foreground">
                        Permission blocked in the browser.
                      </div>
                    ) : null}
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
              ) : null}
            </>
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
        {user ? (
          <div className="ss-mobile-section">
            <div className="ss-mobile-section-title">{userMenuName}</div>
          </div>
        ) : null}

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

        {user ? (
          <div className="ss-mobile-section">
            {accountType !== "employer" ? (
              <Link href="/families/matches" className="ss-mobile-link" onClick={handleNavClick}>
                Shifters
              </Link>
            ) : null}
            <Link href={settingsHref} className="ss-mobile-link" onClick={handleNavClick}>
              Settings
            </Link>
            <button
              type="button"
              className="ss-mobile-link ss-mobile-link-btn"
              onClick={() => { handleNavClick(); handleSignOut(); }}
            >
              Log out
            </button>
          </div>
        ) : null}

        {user && showAdminLink ? (
          <div className="ss-mobile-section">
            <div className="ss-mobile-section-subtitle">Admin panel</div>
            <Link href="/admin/dashboard" className="ss-mobile-link" onClick={handleNavClick}>
              Admin
            </Link>
            <Link href="/admin/verification" className="ss-mobile-link" onClick={handleNavClick}>
              Verification
            </Link>
          </div>
        ) : null}

        {user && showFamilyTourControls ? (
          <div className="ss-mobile-section">
            <button
              type="button"
              onClick={() => {
                handleNavClick();
                handleOpenTour();
              }}
              className="ss-btn-outline ss-nav-btn w-full"
            >
              Guided Tour
            </button>
          </div>
        ) : null}

        <div className="ss-mobile-actions">
          {user ? null : (
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

