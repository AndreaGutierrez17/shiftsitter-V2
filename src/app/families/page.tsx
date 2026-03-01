"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserProfile } from "@/lib/types";


type Mode = "login" | "signup";

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


export default function FamiliesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
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
      hasMinLen, hasUpper, hasLower, hasNumber, hasSpecial,
      isValid: hasMinLen && hasUpper && hasLower && hasNumber && hasSpecial,
    };
  }, [password]);

  useEffect(() => {
    if (!authLoading && user) {
        ensureFamilyDocAndRedirect(user.uid).catch((error: unknown) => {
          const firestoreError = error as { code?: string; message?: string };
          console.error("Failed to ensure user profile", error);
          if (firestoreError.code === "permission-denied") {
            setMsg("Firebase rejected the profile write (permission-denied). Check Firestore rules and try again.");
          } else {
            setMsg("We could not validate your profile in Firebase. Check rules/permissions and try again.");
          }
          signOut(auth).catch(() => {});
        });
    }
  }, [user, authLoading, router]);
  
  if (authLoading || user) {
     return (
        <div className="auth-shell">
            <div className="auth-card" style={{maxWidth: '400px'}}>
                 <div className="auth-card-head">
                    <h2>Authenticating</h2>
                    <p className="muted">Please wait while we check your session...</p>
                </div>
                <div className="auth-loader" />
            </div>
        </div>
    );
  }

  function passwordHelpText() {
    return "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character (e.g. @, /, $).";
  }

  async function ensureFamilyDocAndRedirect(uid: string) {
    const userDocRef = doc(db, "users", uid);
    const profileDocRef = doc(db, "profiles", uid);
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
        const newUserPayload = {
            uid: uid,
            id: uid,
            email: auth.currentUser?.email,
            photoURLs: auth.currentUser?.photoURL ? [auth.currentUser.photoURL] : [],
            name: auth.currentUser?.displayName || '',
            profileComplete: false,
            isActive: true,
            accountType: 'family',
            createdAt: serverTimestamp(),
        };
        await setDoc(userDocRef, newUserPayload, { merge: true });
        await setDoc(profileDocRef, {
          uid,
          role: 'family',
          displayName: auth.currentUser?.displayName || '',
          photoURL: auth.currentUser?.photoURL || null,
          photoURLs: auth.currentUser?.photoURL ? [auth.currentUser.photoURL] : [],
          onboardingComplete: false,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        router.push("/families/onboarding");
        return;
    }
    
    const data = docSnap.data() as UserProfile & {
      accountType?: string;
      profileComplete?: boolean;
      onboardingComplete?: boolean;
      state?: string;
      city?: string;
      zip?: string;
      location?: string;
    };
    if (data.accountType === 'employer') {
        router.push('/employers/dashboard');
        return;
    }

    await setDoc(profileDocRef, {
      uid,
      role: 'family',
      familyRole: data.role,
      displayName: data.name || auth.currentUser?.displayName || '',
      photoURL: data.photoURLs?.[0] || auth.currentUser?.photoURL || null,
      photoURLs: Array.isArray(data.photoURLs) ? data.photoURLs : (auth.currentUser?.photoURL ? [auth.currentUser.photoURL] : []),
      homeZip: data.zip || '',
      state: data.state || '',
      city: data.city || '',
      location: data.location || '',
      onboardingComplete: Boolean(data.onboardingComplete ?? data.profileComplete),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (!data.accountType) {
        await setDoc(
          userDocRef,
          {
            accountType: 'family',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
    }
    if (data.profileComplete) {
        router.push('/families/match');
    } else {
        router.push('/families/onboarding');
    }
  }

  async function signWithOAuth() {
    setMsg(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
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

  async function handleLogin() {
    setMsg(null);
    setBusy(true);
    try {
        if (!email || !password) {
            throw new Error("Please enter your email and password.");
        }
        await signInWithEmailAndPassword(auth, email, password);
    } catch(e: any) {
       const code = e?.code as string | undefined;
       if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setMsg("Invalid email or password. Please check your credentials or sign up.");
      } else if (code === "auth/user-not-found") {
        setMsg("No account found with this email. Try signing up.");
      } else {
        setMsg(e?.message ?? "We couldn’t complete your request. Please try again.");
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
        throw new Error("Please enter your email and password.");
      }
      if (!pwdRules.isValid) {
        throw new Error(passwordHelpText());
      }
      await createUserWithEmailAndPassword(auth, email, password);
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

  const onTabChange = (newMode: string) => {
    setMode(newMode as Mode);
    setMsg(null);
    setPassword('');
  }

  return (
    <>
      <main className="auth-split">
        <section className="auth-left">
        <div className="auth-left-inner">
          <p className="eyebrow">
            <i className="bi bi-people-fill me-2" />
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
            <li><i className="bi bi-shield-check" /> Verified-first approach</li>
            <li><i className="bi bi-calendar2-week" /> Built for nights, weekends, rotating shifts</li>
            <li><i className="bi bi-arrow-repeat" /> Parents supporting parents — with agreements</li>
          </ul>
        </div>
        </section>

        <section className="auth-right">
        <div className="auth-card">
          <Tabs value={mode} onValueChange={onTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
                <div className="auth-card-head">
                    <h2>Welcome back</h2>
                    <p className="muted">Sign in to continue your matching flow.</p>
                </div>
                <div className="form-field">
                    <label>Email</label>
                    <input id="login-email" type="email" className="ss-input" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                </div>
                <div className="form-field">
                    <label>Password</label>
                     <div className="password-wrap">
                        <input id="login-password" className="ss-input" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
                        <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} disabled={busy}><i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} /></button>
                    </div>
                </div>
                 {msg && <div className="auth-msg q-error">{msg}</div>}
                 <button type="button" className="ss-btn w-100 auth-primary" onClick={handleLogin} disabled={busy}>{busy ? "Please wait…" : "Sign In"}</button>
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
                 <div className="auth-card-head">
                    <h2>Create your account</h2>
                    <p className="muted">Use email/password or continue with a trusted provider.</p>
                 </div>
                 <div className="form-field">
                    <label>Email</label>
                    <input className="ss-input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                 </div>
                 <div className="form-field">
                    <label>Password</label>
                    <div className="password-wrap">
                        <input className="ss-input" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
                        <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} disabled={busy}><i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} /></button>
                    </div>
                    {password && (
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
                 {msg && <div className="auth-msg q-error">{msg}</div>}
                 <button type="button" className="ss-btn w-100 auth-primary" onClick={handleSignup} disabled={busy}>{busy ? "Please wait…" : "Create account"}</button>
            </TabsContent>
          </Tabs>

          <div className="divider"><span>or</span></div>
          
          <div className="oauth-row">
            <button type="button" className="oauth-btn" onClick={signWithOAuth} disabled={busy}><GoogleG /> Continue with Google</button>
          </div>
          
          <p className="auth-footnote">By continuing, you agree to ShiftSitter’s Terms & Privacy Policy.</p>
          {busy && <div className="auth-loader" />}
        </div>
        </section>
      </main>
    </>
  );
}

    
