"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

type Mode = "signup" | "login";

type FamilyUserDoc = {
  uid: string;
  email: string | null;
  role: "family";
  onboardingCompleted: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export default function FamiliesPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signup");
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

  // ✅ Single source of truth: users/{uid}
  async function ensureFamilyDocAndRedirect(uid: string) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    // Si no existe el doc, lo creamos
    if (!snap.exists()) {
      const user = auth.currentUser;
      const payload: FamilyUserDoc = {
        uid,
        email: user?.email ?? null,
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

    // Si existe, pero no tiene role o onboarding, lo normalizamos
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

    // ✅ Redirect inteligente
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

      // Asegura doc + redirección
      await ensureFamilyDocAndRedirect(cred.user.uid);
    } catch (e: any) {
      const code = e?.code as string | undefined;

      if (code === "auth/popup-closed-by-user") {
        setMsg("Popup closed. Please try again.");
      } else if (code === "auth/account-exists-with-different-credential") {
        setMsg("This email is already linked to a different sign-in method.");
      } else {
        setMsg(e?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailAuth() {
    setMsg(null);
    setBusy(true);

    try {
      if (!email || !password) {
        setMsg("Please enter your email and password.");
        setBusy(false);
        return;
      }

      if (mode === "signup" && !pwdRules.isValid) {
        setMsg(passwordHelpText());
        setBusy(false);
        return;
      }

      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);

        // (Opcional) poner displayName básico para el user
        // puedes quitarlo si no lo quieres
        if (auth.currentUser && !auth.currentUser.displayName) {
          await updateProfile(auth.currentUser, { displayName: "Family" });
        }

        await ensureFamilyDocAndRedirect(cred.user.uid);
        return;
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await ensureFamilyDocAndRedirect(cred.user.uid);
        return;
      }
    } catch (e: any) {
      const code = e?.code as string | undefined;

      if (code === "auth/email-already-in-use") {
        setMsg("This email is already in use. Try logging in instead.");
      } else if (code === "auth/invalid-email") {
        setMsg("Please enter a valid email address.");
      } else if (code === "auth/weak-password") {
        setMsg(passwordHelpText());
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password"
      ) {
        setMsg("Invalid email or password.");
      } else if (code === "auth/user-not-found") {
        setMsg("No account found with this email.");
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
            Find trusted, reciprocal childcare that fits{" "}
            <span>real shift schedules.</span>
          </h1>

          <p className="auth-lead">
            Create your account, complete a short onboarding, then start swiping
            through compatible families — with clear match reasons, not guesswork.
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
            <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="muted">
              {mode === "signup"
                ? "Use email/password or continue with a trusted provider."
                : "Sign in to continue your matching flow."}
            </p>
          </div>

          <div className="oauth-row">
            <button
              type="button"
              className="oauth-btn"
              onClick={() => signWithOAuth("google")}
              disabled={busy}
            >
              <i className="bi bi-google" />
              Continue with Google
            </button>

            <button
              type="button"
              className="oauth-btn"
              onClick={() => signWithOAuth("facebook")}
              disabled={busy}
            >
              <i className="bi bi-facebook" />
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
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
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

            {mode === "signup" && (
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
            )}
          </div>

          {msg && <div className="auth-msg">{msg}</div>}

          <button
            type="button"
            className="ss-btn w-100 auth-primary"
            onClick={handleEmailAuth}
            disabled={busy}
          >
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            className="ss-btn-outline w-100 auth-secondary"
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setMsg(null);
              setPassword("");
            }}
            disabled={busy}
          >
            {mode === "signup" ? "I already have an account" : "Create a new account"}
          </button>

          <p className="auth-footnote">
            By continuing, you agree to ShiftSitter’s Terms & Privacy Policy.
          </p>
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
