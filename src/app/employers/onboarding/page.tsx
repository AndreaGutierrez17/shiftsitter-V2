'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';

type EmployerAnswers = {
  companyName: string;
  contactName: string;
  teamSize: string;
  shiftType: string;
  notes: string;
};

function generateAccessCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export default function EmployersOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<EmployerAnswers>({
    companyName: '',
    contactName: '',
    teamSize: '',
    shiftType: '',
    notes: '',
  });

  const accessCode = useMemo(() => generateAccessCode(8), []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/employers');
      return;
    }

    const verifyStatus = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.data() as { onboardingCompleted?: boolean } | undefined;
      if (data?.onboardingCompleted) {
        router.replace('/families/match');
        return;
      }
      setReady(true);
    };

    void verifyStatus();
  }, [loading, router, user]);

  const onChange = (key: keyof EmployerAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    if (!answers.companyName.trim() || !answers.contactName.trim()) {
      setError('Company name and contact name are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          onboardingCompleted: true,
          accessCode,
          employerProfile: {
            companyName: answers.companyName.trim(),
            contactName: answers.contactName.trim(),
            teamSize: answers.teamSize.trim(),
            shiftType: answers.shiftType.trim(),
            notes: answers.notes.trim(),
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
      router.replace('/families/match');
    } catch (submitError: unknown) {
      const err = submitError as { message?: string };
      setError(err.message || 'Could not complete onboarding.');
      setSubmitting(false);
    }
  };

  if (loading || !ready) {
    return (
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: '480px' }}>
          <div className="auth-card-head">
            <h2>Loading employer onboarding</h2>
            <p className="muted">Please wait...</p>
          </div>
          <div className="auth-loader" />
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: '640px' }}>
        <div className="auth-card-head">
          <h2>Employer onboarding</h2>
          <p className="muted">Complete this once to unlock your employer access code.</p>
        </div>
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="form-field">
            <label>Company name</label>
            <input
              className="ss-input"
              value={answers.companyName}
              onChange={(e) => onChange('companyName', e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="form-field">
            <label>Contact name</label>
            <input
              className="ss-input"
              value={answers.contactName}
              onChange={(e) => onChange('contactName', e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="form-field">
            <label>Team size</label>
            <input
              className="ss-input"
              value={answers.teamSize}
              onChange={(e) => onChange('teamSize', e.target.value)}
              disabled={submitting}
              placeholder="e.g. 25-100"
            />
          </div>
          <div className="form-field">
            <label>Primary shift pattern</label>
            <input
              className="ss-input"
              value={answers.shiftType}
              onChange={(e) => onChange('shiftType', e.target.value)}
              disabled={submitting}
              placeholder="e.g. nights + weekends"
            />
          </div>
          <div className="form-field">
            <label>Notes (optional)</label>
            <textarea
              className="ss-input"
              rows={3}
              value={answers.notes}
              onChange={(e) => onChange('notes', e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="auth-msg">
            Access code to be assigned: <strong>{accessCode}</strong>
          </div>
          {error ? <div className="auth-msg q-error">{error}</div> : null}
          <button type="submit" className="ss-btn w-100 auth-primary" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Saving...' : 'Complete onboarding'}
          </button>
        </form>
      </div>
    </main>
  );
}
