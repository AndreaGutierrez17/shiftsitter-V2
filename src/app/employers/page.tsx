'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Mode = 'login' | 'signup';

function RuleItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`pw-item ${ok ? 'ok' : 'bad'}`}>
      <i className={`bi ${ok ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`} />
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

export default function EmployersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  useEffect(() => {
    if (!loading && user) {
      void ensureEmployerDocAndRedirect(user.uid);
    }
  }, [loading, user]);

  const ensureEmployerDocAndRedirect = async (uid: string) => {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const basePayload = {
      uid,
      id: uid,
      email: auth.currentUser?.email || null,
      name: auth.currentUser?.displayName || '',
      photoURLs: auth.currentUser?.photoURL ? [auth.currentUser.photoURL] : [],
      profileComplete: false,
      isActive: true,
      createdAt: serverTimestamp(),
      role: 'parent',
    };

    if (!snap.exists()) {
      await setDoc(userRef, basePayload, { merge: true });
      router.replace('/employers/onboarding');
      return;
    }

    const data = snap.data() as { onboardingCompleted?: boolean };
    if (data.onboardingCompleted === true) {
      router.replace('/families/match');
      return;
    }
    router.replace('/employers/onboarding');
  };

  function passwordHelpText() {
    return 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character (e.g. @, /, $).';
  }

  const signWithGoogle = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg(err.message || 'Could not continue with Google.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg(err.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    setMsg(null);
    setBusy(true);
    try {
      if (!pwdRules.isValid) {
        throw new Error(passwordHelpText());
      }
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg(err.message || 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  const onTabChange = (newMode: string) => {
    setMode(newMode as Mode);
    setMsg(null);
    setPassword('');
  };

  if (loading || user) {
    return (
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: '420px' }}>
          <div className="auth-card-head">
            <h2>Checking employer account</h2>
            <p className="muted">Please wait...</p>
          </div>
          <div className="auth-loader" />
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="auth-split">
        <section className="auth-left">
          <div className="auth-left-inner">
            <p className="eyebrow">
              <i className="bi bi-building me-2" />
              Employers
            </p>
            <h1 className="auth-title">
              Employer access for shift-working teams <span>in one flow.</span>
            </h1>
            <p className="auth-lead">
              Sign in first. If onboarding is incomplete, we send you to the employer questionnaire automatically.
            </p>
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
                  <p className="muted">Sign in to continue employer onboarding.</p>
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input
                    className="ss-input"
                    type="email"
                    autoComplete="email"
                    placeholder="work@company.com"
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
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} disabled={busy}>
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                    </button>
                  </div>
                </div>
                {msg ? <div className="auth-msg q-error">{msg}</div> : null}
                <button type="button" className="ss-btn w-100 auth-primary" onClick={handleLogin} disabled={busy}>
                  {busy ? 'Please wait...' : 'Sign In'}
                </button>
              </TabsContent>

              <TabsContent value="signup" className="pt-4">
                <div className="auth-card-head">
                  <h2>Create Employer Account</h2>
                  <p className="muted">After sign-in, onboarding will continue automatically.</p>
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input
                    className="ss-input"
                    type="email"
                    autoComplete="email"
                    placeholder="work@company.com"
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
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} disabled={busy}>
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                    </button>
                  </div>
                  {password ? (
                    <div className="pw-rules" aria-live="polite">
                      <p className="pw-help">{passwordHelpText()}</p>
                      <ul className="pw-list">
                        <RuleItem ok={pwdRules.hasMinLen} text="At least 8 characters" />
                        <RuleItem ok={pwdRules.hasUpper} text="One uppercase letter (A-Z)" />
                        <RuleItem ok={pwdRules.hasLower} text="One lowercase letter (a-z)" />
                        <RuleItem ok={pwdRules.hasNumber} text="One number (0-9)" />
                        <RuleItem ok={pwdRules.hasSpecial} text="One special character (e.g. @ / $)" />
                      </ul>
                    </div>
                  ) : null}
                </div>
                {msg ? <div className="auth-msg q-error">{msg}</div> : null}
                <button type="button" className="ss-btn w-100 auth-primary" onClick={handleSignup} disabled={busy}>
                  {busy ? 'Please wait...' : 'Create account'}
                </button>
              </TabsContent>
            </Tabs>

            <div className="divider">
              <span>or</span>
            </div>
            <div className="oauth-row">
              <button type="button" className="oauth-btn" onClick={signWithGoogle} disabled={busy}>
                <GoogleG /> Continue with Google
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
