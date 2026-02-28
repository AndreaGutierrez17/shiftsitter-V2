'use client';

import { FormEvent, useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { useRequireRole } from '@/lib/auth/requireRole';

type EmployerDoc = {
  companyName?: string;
  companyEmail?: string;
  contactName?: string;
  companySize?: '1-50' | '51-200' | '201-1000' | '1000+';
  industries?: string[];
  locations?: Array<{ state: string; city: string }>;
};

type CompanySize = NonNullable<EmployerDoc['companySize']>;

type EmployerSettingsForm = {
  companyName: string;
  companyEmail: string;
  contactName: string;
  companySize: CompanySize;
  industriesText: string;
  state: string;
  city: string;
};

export default function EmployerSettingsPage() {
  const guard = useRequireRole('employer');
  const { user } = useAuth();
  const [form, setForm] = useState<EmployerSettingsForm>({
    companyName: '',
    companyEmail: '',
    contactName: '',
    companySize: '1-50',
    industriesText: '',
    state: '',
    city: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;

    void (async () => {
      try {
        const [employerSnap, userSnap] = await Promise.all([
          getDoc(doc(db, 'employers', user.uid)),
          getDoc(doc(db, 'users', user.uid)),
        ]);
        const employerData = employerSnap.exists() ? (employerSnap.data() as EmployerDoc) : {};
        const userData = userSnap.exists() ? (userSnap.data() as { email?: string; name?: string }) : {};
        const location = employerData.locations?.[0];
        setForm({
          companyName: employerData.companyName || '',
          companyEmail: employerData.companyEmail || userData.email || '',
          contactName: employerData.contactName || userData.name || '',
          companySize: employerData.companySize || '1-50',
          industriesText: Array.isArray(employerData.industries) ? employerData.industries.join(', ') : '',
          state: location?.state || '',
          city: location?.city || '',
        });
      } catch (loadError) {
        console.error('Could not load employer settings:', loadError);
        setError('Could not load company settings.');
      }
    })();
  }, [user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || saving) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const industries = form.industriesText
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      await Promise.all([
        setDoc(
          doc(db, 'employers', user.uid),
          {
            employerId: user.uid,
            companyName: form.companyName.trim(),
            companyEmail: form.companyEmail.trim(),
            contactName: form.contactName.trim(),
            companySize: form.companySize,
            industries,
            locations: form.state.trim() || form.city.trim() ? [{ state: form.state.trim(), city: form.city.trim() }] : [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        setDoc(
          doc(db, 'users', user.uid),
          {
            accountType: 'employer',
            email: form.companyEmail.trim(),
            name: form.contactName.trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      setSaved(true);
    } catch (saveError) {
      console.error('Could not save employer settings:', saveError);
      setError('Could not save company settings.');
    } finally {
      setSaving(false);
    }
  };

  if (guard.loading || guard.role !== 'employer') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="ss-page-shell">
      <div className="ss-page-inner">
        <Card className="ss-soft-card">
          <CardHeader>
            <CardTitle className="font-headline">Company Settings</CardTitle>
            <CardDescription>Maintain the basic employer profile used for access code management.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <div className="form-field">
                <label>Company name</label>
                <input className="ss-input" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} required />
              </div>
              <div className="form-field">
                <label>Company email</label>
                <input className="ss-input" type="email" value={form.companyEmail} onChange={(e) => setForm((prev) => ({ ...prev, companyEmail: e.target.value }))} required />
              </div>
              <div className="form-field">
                <label>Contact name</label>
                <input className="ss-input" value={form.contactName} onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))} required />
              </div>
              <div className="form-field">
                <label>Company size</label>
                <select className="ss-input" value={form.companySize} onChange={(e) => setForm((prev) => ({ ...prev, companySize: e.target.value as CompanySize }))}>
                  <option value="1-50">1-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-1000">201-1000</option>
                  <option value="1000+">1000+</option>
                </select>
              </div>
              <div className="form-field md:col-span-2">
                <label>Industries (comma separated)</label>
                <input className="ss-input" value={form.industriesText} onChange={(e) => setForm((prev) => ({ ...prev, industriesText: e.target.value }))} placeholder="Healthcare, Manufacturing" />
              </div>
              <div className="form-field">
                <label>Primary state</label>
                <input className="ss-input" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} placeholder="MD" />
              </div>
              <div className="form-field">
                <label>Primary city</label>
                <input className="ss-input" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Baltimore" />
              </div>
              {error ? <p className="md:col-span-2 text-sm text-destructive">{error}</p> : null}
              {saved ? <p className="md:col-span-2 text-sm text-emerald-600">Company settings saved.</p> : null}
              <div className="md:col-span-2">
                <Button type="submit" className="ss-pill-btn" disabled={saving}>
                  {saving ? 'Saving...' : 'Save settings'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
