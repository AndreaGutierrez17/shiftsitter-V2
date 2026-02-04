"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { getOnboardingStatus } from "@/lib/firebase/profile";

export default function MatchGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      if (!user) {
        router.replace("/families");
        return;
      }

      const status = await getOnboardingStatus(user.uid);

      if (!alive) return;

      if (!status.onboardingCompleted) {
        router.replace("/families/onboarding");
        return;
      }

      setReady(true);
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <div className="auth-card-head">
            <h1>Loading matching…</h1>
            <p className="muted">Preparing your matches.</p>
          </div>
          <div className="auth-loader" />
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="match-title">Match feed goes here ✅</h1>
        <p className="muted">Next: swipe cards + Firestore writes.</p>
      </div>
    </main>
  );
}