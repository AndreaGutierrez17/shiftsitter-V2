"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        
        router.replace("/families/onboarding");
      } else {

        router.replace("/families");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-head">
          <h1>Signing you in…</h1>
          <p className="muted">
            Just a moment while we securely complete authentication.
          </p>
        </div>

        <div className="auth-loader" aria-hidden="true" />
      </div>
    </main>
  );
}
