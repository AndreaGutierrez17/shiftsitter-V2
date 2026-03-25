"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const oobCode = searchParams.get("oobCode") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = useMemo(() => {
    return password.length >= 8 && password === confirm && !busy && Boolean(oobCode);
  }, [password, confirm, busy, oobCode]);

  const handleSubmit = async () => {
    setMsg(null);
    if (!oobCode) {
      setMsg("This reset link is missing or invalid.");
      return;
    }
    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMsg("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, password);
      setSuccess(true);
      setMsg("Your password has been updated. You can now sign in.");
    } catch (e: any) {
      const code = e?.code as string | undefined;
      if (code === "auth/invalid-action-code") {
        setMsg("This reset link is invalid or has expired.");
      } else if (code === "auth/expired-action-code") {
        setMsg("This reset link has expired. Please request a new one.");
      } else {
        setMsg(e?.message || "We could not reset your password. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: "420px" }}>
        <div className="auth-card-head">
          <h2>Reset your password</h2>
          <p className="muted">Create a new password for your account.</p>
        </div>

        <div className="form-field">
          <label>New password</label>
          <input
            type="password"
            className="ss-input"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy || success}
          />
        </div>

        <div className="form-field">
          <label>Confirm password</label>
          <input
            type="password"
            className="ss-input"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy || success}
          />
        </div>

        {msg ? <div className={`auth-msg ${success ? "q-success" : "q-error"}`}>{msg}</div> : null}

        <button
          type="button"
          className="ss-btn w-100 auth-primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {busy ? "Updating..." : "Update password"}
        </button>

        <button
          type="button"
          className="auth-forgot"
          onClick={() => router.push("/families")}
        >
          Back to sign in
        </button>
      </div>
    </main>
  );
}
