import Link from 'next/link';

export default function EmployersLandingPage() {
  return (
    <main className="auth-split">
      <section className="auth-left">
        <div className="auth-left-inner">
          <p className="eyebrow">
            <i className="bi bi-building me-2" />
            B2B Access
          </p>
          <h1 className="auth-title">
            Employer access codes for shift-working teams <span>in one clean flow.</span>
          </h1>
          <p className="auth-lead">
            Employers generate and manage access codes. Employees redeem those codes to unlock the family onboarding flow and matching.
          </p>
          <ul className="auth-points">
            <li><i className="bi bi-ticket-perforated" /> Create and revoke access codes in real time</li>
            <li><i className="bi bi-people" /> Track which families redeemed each code</li>
            <li><i className="bi bi-shield-check" /> Keep employer and family access separated by role</li>
          </ul>
        </div>
      </section>

      <section className="auth-right">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Employer portal</h2>
            <p className="muted">Use the employer dashboard to manage code access for your workforce.</p>
          </div>
          <div className="grid gap-3">
            <Link href="/employers/login" className="ss-btn w-100 auth-primary text-center">
              Log in
            </Link>
            <Link href="/employers/login?mode=signup" className="ss-btn-outline w-100 text-center">
              Get access codes
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
