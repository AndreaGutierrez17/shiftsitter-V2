"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from "firebase/auth";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

type FamilyUserDoc = {
  uid: string;
  email: string | null;
  role: "family";
  onboardingCompleted: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pwdRules = useMemo(() => {
    const hasMinLen = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    return {
      hasMinLen,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      isValid: hasMinLen && hasUpper && hasLower && hasNumber && hasSpecial,
    };
  }, [password]);

  function passwordHelpText() {
    return "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character (e.g. @, /, $).";
  }

  // ✅ Reutilizable: asegura doc y redirige bien
  async function ensureFamilyDocAndRedirect(uid: string) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      const payload: FamilyUserDoc = {
        uid,
        email: auth.currentUser?.email ?? null,
        role: "family",
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload, { merge: true });
      router.push("/families/onboarding");
      return;
    }

    const data = snap.data() as Partial<FamilyUserDoc> | undefined;

    const needsPatch =
      data?.role !== "family" || typeof data?.onboardingCompleted !== "boolean";

    if (needsPatch) {
      await setDoc(
        ref,
        {
          uid,
          email: auth.currentUser?.email ?? data?.email ?? null,
          role: "family",
          onboardingCompleted: data?.onboardingCompleted === true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (data?.onboardingCompleted === true) {
      router.push("/families/match");
    } else {
      router.push("/families/onboarding");
    }
  }

  async function signWithOAuth(provider: "google" | "facebook") {
    setMsg(null);
    setBusy(true);

    try {
      const selectedProvider =
        provider === "google"
          ? new GoogleAuthProvider()
          : new FacebookAuthProvider();

      const cred = await signInWithPopup(auth, selectedProvider);

      await ensureFamilyDocAndRedirect(cred.user.uid);
    } catch (e: any) {
      const code = e?.code as string | undefined;

      if (code === "auth/popup-closed-by-user") {
        setMsg("Popup closed. Please try again.");
      } else if (code === "auth/account-exists-with-different-credential") {
        setMsg("This email is already linked to a different sign-in method.");
      } else if (code === "auth/operation-not-allowed") {
        setMsg("Provider not enabled in Firebase Auth.");
      } else {
        setMsg(e?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup() {
    setMsg(null);
    setBusy(true);

    try {
      if (!email || !password) {
        setMsg("Please enter your email and password.");
        setBusy(false);
        return;
      }

      if (!pwdRules.isValid) {
        setMsg(passwordHelpText());
        setBusy(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await ensureFamilyDocAndRedirect(cred.user.uid);
    } catch (e: any) {
      const code = e?.code as string | undefined;

      if (code === "auth/email-already-in-use") {
        setMsg("This email is already in use. Try logging in instead.");
      } else if (code === "auth/invalid-email") {
        setMsg("Please enter a valid email address.");
      } else if (code === "auth/weak-password") {
        setMsg(passwordHelpText());
      } else {
        setMsg(e?.message ?? "We couldn’t complete your request. Please try again.");
      }
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
            For shift-working families
          </p>

          <h1 className="auth-title">
            Create your account to start{" "}
            <span>matching with compatible families.</span>
          </h1>

          <p className="auth-lead">
            Sign up, complete a short onboarding, then start swiping with clear match reasons — not guesswork.
          </p>

          <ul className="auth-points">
            <li>
              <i className="bi bi-shield-check" /> Verified-first approach
            </li>
            <li>
              <i className="bi bi-clock-history" /> Built for nights, weekends, rotating shifts
            </li>
            <li>
              <i className="bi bi-people" /> Parents supporting parents — with agreements
            </li>
          </ul>
        </div>
      </section>

      <section className="auth-right">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Create your account</h2>
            <p className="muted">Use email/password or continue with a trusted provider.</p>
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
                autoComplete="new-password"
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
                title={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
              </button>
            </div>

            <div className="pw-rules" aria-live="polite">
              <p className="pw-help">{passwordHelpText()}</p>

              <ul className="pw-list">
                <RuleItem ok={pwdRules.hasMinLen} text="At least 8 characters" />
                <RuleItem ok={pwdRules.hasUpper} text="One uppercase letter (A–Z)" />
                <RuleItem ok={pwdRules.hasLower} text="One lowercase letter (a–z)" />
                <RuleItem ok={pwdRules.hasNumber} text="One number (0–9)" />
                <RuleItem ok={pwdRules.hasSpecial} text="One special character (e.g. @ / $)" />
              </ul>
            </div>
          </div>

          {msg && <div className="auth-msg">{msg}</div>}

          <button
            type="button"
            className="ss-btn w-100 auth-primary"
            onClick={handleSignup}
            disabled={busy}
          >
            {busy ? "Please wait…" : "Create account"}
          </button>

          <button
            type="button"
            className="ss-btn-outline w-100 auth-secondary"
            onClick={() => router.push("/families")}
            disabled={busy}
          >
            I already have an account
          </button>

          <p className="auth-footnote">
            By continuing, you agree to ShiftSitter’s Terms & Privacy Policy.
          </p>

          {busy && <div className="auth-loader" />}
        </div>
      </section>
    </main>
  );
}

function RuleItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`pw-item ${ok ? "ok" : "bad"}`}>
      <i className={`bi ${ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}`} />
      <span>{text}</span>
    </li>
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
