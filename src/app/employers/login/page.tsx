'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.1-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.4 35.7 26.8 36 24 36c-5.3 0-9.8-3.4-11.4-8.1l-6.6 5.1C9.3 39.7 16.1 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.3 5.3-6 6.6l6.3 5.2C39.6 36.2 44 30.7 44 24c0-1.1-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function EmployerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
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
    return { isValid: hasMinLen && hasUpper && hasLower && hasNumber && hasSpecial };
  }, [password]);

  useEffect(() => {
    if (loading || !user) return;

    void (async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.data() as { accountType?: string; role?: string } | undefined;
      if (data?.accountType === 'employer') {
        router.replace('/employers/dashboard');
        return;
      }
      if (data?.accountType === 'family' || ['parent', 'sitter', 'reciprocal'].includes(String(data?.role || ''))) {
        router.replace('/families/match');
        return;
      }
      router.replace('/account/setup');
    })();
  }, [loading, router, user]);

  const ensureUserShell = async (uid: string) => {
    await setDoc(
      doc(db, 'users', uid),
      {
        uid,
        id: uid,
        email: auth.currentUser?.email || null,
        name: auth.currentUser?.displayName || '',
        photoURLs: auth.currentUser?.photoURL ? [auth.currentUser.photoURL] : [],
        isActive: true,
        profileComplete: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const signWithGoogle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      if (auth.currentUser) {
        await ensureUserShell(auth.currentUser.uid);
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg(err.message || 'Could not continue with Google.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (auth.currentUser) {
        await ensureUserShell(auth.currentUser.uid);
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg(err.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!pwdRules.isValid) {
        throw new Error('Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.');
      }
      await createUserWithEmailAndPassword(auth, email, password);
      if (auth.currentUser) {
        await ensureUserShell(auth.currentUser.uid);
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg(err.message || 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || user) {
    return (
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: '420px' }}>
          <div className="auth-card-head">
            <h2>Checking employer access</h2>
            <p className="muted">Please wait...</p>
          </div>
          <div className="auth-loader" />
        </div>
      </main>
    );
  }

  return (
    <main className="auth-split">
      <section className="auth-left">
        <div className="auth-left-inner">
          <p className="eyebrow"><i className="bi bi-building me-2" />Employers</p>
          <h1 className="auth-title">Manage access for your workforce <span>without a separate admin stack.</span></h1>
          <p className="auth-lead">
            Sign in, complete your company profile, create access codes, and manage redemptions in one B2B flow.
          </p>
        </div>
      </section>
      <section className="auth-right">
        <div className="auth-card">
          <Tabs value={mode} onValueChange={(value) => { setMode(value as Mode); setMsg(null); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
              <div className="auth-card-head">
                <h2>Welcome back</h2>
                <p className="muted">Sign in to open the employer dashboard.</p>
              </div>
              <div className="form-field">
                <label>Email</label>
                <input className="ss-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
              </div>
              <div className="form-field">
                <label>Password</label>
                <div className="password-wrap">
                  <input className="ss-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
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
                <h2>Create employer access</h2>
                <p className="muted">This gives you access to company settings and code management.</p>
              </div>
              <div className="form-field">
                <label>Email</label>
                <input className="ss-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
              </div>
              <div className="form-field">
                <label>Password</label>
                <div className="password-wrap">
                  <input className="ss-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
                  <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} disabled={busy}>
                    <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>
              </div>
              {msg ? <div className="auth-msg q-error">{msg}</div> : null}
              <button type="button" className="ss-btn w-100 auth-primary" onClick={handleSignup} disabled={busy}>
                {busy ? 'Please wait...' : 'Create account'}
              </button>
            </TabsContent>
          </Tabs>
          <div className="divider"><span>or</span></div>
          <div className="oauth-row">
            <button type="button" className="oauth-btn" onClick={signWithGoogle} disabled={busy}>
              <GoogleG /> Continue with Google
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
