"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await signOut(auth);
      } finally {
        router.replace("/families");
      }
    })();
  }, [router]);

  return (
    <main className="auth-shell">
      <div className="onb-card">
        <h1 className="match-title">Signing out…</h1>
        <p className="muted">Closing your session securely.</p>
        <div className="auth-loader" />
      </div>
    </main>
  );
}
