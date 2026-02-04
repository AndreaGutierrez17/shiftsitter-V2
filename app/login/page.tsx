"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function routeAfterAuth(uid: string) {
    const ref = doc(db, "profiles", uid);
    const snap = await getDoc(ref);

    const onboardingCompleted = snap.exists()
      ? Boolean((snap.data() as any)?.onboardingCompleted)
      : false;

    router.replace(onboardingCompleted ? "/families/match" : "/families/onboarding");
  }

  function humanAuthError(code?: string) {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
        return "Invalid email or password.";
      case "auth/user-not-found":
        return "No account found with this email.";
      case "auth/invalid-email":
        return "Please enter a valid email.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      case "auth/popup-closed-by-user":
        return "Popup closed. Please try again.";
      default:
        return "We couldn’t sign you in. Please try again.";
    }
  }

  async function signWithOAuth(provider: "google" | "facebook") {
    setMsg(null);
    setBusy(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const selectedProvider =
        provider === "google" ? new GoogleAuthProvider() : new FacebookAuthProvider();

      const res = await signInWithPopup(auth, selectedProvider);
      await routeAfterAuth(res.user.uid);
    } catch (e: any) {
      setMsg(humanAuthError(e?.code));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setMsg(null);
    setBusy(true);

    try {
      if (!email || !password) {
        setMsg("Enter email and password.");
        return;
      }

      await setPersistence(auth, browserLocalPersistence);

      const res = await signInWithEmailAndPassword(auth, email.trim(), password);
      await routeAfterAuth(res.user.uid);
    } catch (e: any) {
      setMsg(humanAuthError(e?.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-split">
      <section className="auth-left">
        <div className="auth-left-inner">
          <p className="eyebrow">
            <i className="bi bi-stars me-2" />
            Welcome back
          </p>

          <h1 className="auth-title">
            Continue your <span>matching journey.</span>
          </h1>

          <p className="auth-lead">Log in and pick up right where you left off.</p>
        </div>
      </section>

      <section className="auth-right">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Log in</h2>
            <p className="muted">Sign in with email or a trusted provider.</p>
          </div>

          <div className="oauth-row">
            <button
              type="button"
              className="oauth-btn oauth-btn-google"
              onClick={() => signWithOAuth("google")}
              disabled={busy}
            >
              <span className="oauth-ico">
                <GoogleG />
              </span>
              Continue with Google
            </button>

            <button
              type="button"
              className="oauth-btn oauth-btn-facebook"
              onClick={() => signWithOAuth("facebook")}
              disabled={busy}
            >
              <span className="oauth-ico">
                <FacebookF />
              </span>
              Continue with Facebook
            </button>
          </div>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="form-field">
            <label>Email</label>
            <input
              className="ss-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="form-field">
            <label>Password</label>

            <div className="password-wrap">
              <input
                className="ss-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />

              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                disabled={busy}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
              </button>
            </div>
          </div>

          {msg && <div className="auth-msg">{msg}</div>}

          <button
            type="button"
            className="ss-btn w-100 auth-primary"
            onClick={handleLogin}
            disabled={busy}
          >
            {busy ? "Please wait…" : "Log in"}
          </button>

          <button
            type="button"
            className="ss-btn-outline w-100 auth-secondary"
            onClick={() => router.push("/signup")}
            disabled={busy}
          >
            Create new account
          </button>
        </div>
      </section>
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.1-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.4 35.7 26.8 36 24 36c-5.3 0-9.8-3.4-11.4-8.1l-6.6 5.1C9.3 39.7 16.1 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.3 5.3-6 6.6l6.3 5.2C39.6 36.2 44 30.7 44 24c0-1.1-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function FacebookF() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.095 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.035 1.792-4.714 4.533-4.714 1.312 0 2.686.236 2.686.236v2.98h-1.513c-1.49 0-1.953.93-1.953 1.887v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.095 24 18.1 24 12.073z"
      />
    </svg>
  );
}
