"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/lib/firebase/client";

type QuestionType = "single" | "multi" | "text" | "number" | "range";

type Question = {
  id: string;
  step: number;
  title: string;
  subtitle?: string;
  type: QuestionType;
  required?: boolean;
  options?: { value: string; label: string; icon?: string }[];
  min?: number;
  max?: number;
  placeholder?: string;
};

type Answers = Record<string, any>;

/** ============================
 *  QUESTIONS (tus mismas)
 *  ============================ */
const QUESTIONS: Question[] = [
  {
    id: "need_days",
    step: 1,
    title: "Let’s find out what you need",
    subtitle: "Which days do you typically need childcare?",
    type: "multi",
    required: true,
    options: [
      { value: "mon", label: "Mon", icon: "bi-calendar2" },
      { value: "tue", label: "Tue", icon: "bi-calendar2" },
      { value: "wed", label: "Wed", icon: "bi-calendar2" },
      { value: "thu", label: "Thu", icon: "bi-calendar2" },
      { value: "fri", label: "Fri", icon: "bi-calendar2" },
      { value: "sat", label: "Sat", icon: "bi-calendar2" },
      { value: "sun", label: "Sun", icon: "bi-calendar2" },
    ],
  },
  {
    id: "need_shifts",
    step: 1,
    title: "Which shift(s) do you need help with?",
    subtitle: "Select all that apply. This is a match core filter.",
    type: "multi",
    required: true,
    options: [
      { value: "early", label: "Early (4–8am)", icon: "bi-alarm" },
      { value: "day", label: "Day (8am–4pm)", icon: "bi-brightness-high" },
      { value: "evening", label: "Evening (4–10pm)", icon: "bi-sunset" },
      { value: "night", label: "Night (10pm–7am)", icon: "bi-moon-stars" },
    ],
  },

  {
    id: "need_duration",
    step: 2,
    title: "How many hours do you typically need on those days/blocks?",
    subtitle: "This influences reciprocity balance (not a hard filter).",
    type: "single",
    required: true,
    options: [
      { value: "1_4", label: "1–4 hours", icon: "bi-hourglass-split" },
      { value: "4_8", label: "4–8 hours", icon: "bi-hourglass" },
      { value: "8_12", label: "8–12 hours", icon: "bi-clock" },
      { value: "full_12", label: "Full shift (12 hours)", icon: "bi-clock-history" },
      { value: "12_plus", label: "More than 12 hours", icon: "bi-plus-circle" },
    ],
  },

  {
    id: "need_setting",
    step: 2,
    title: "Where do you prefer care to happen?",
    type: "single",
    required: true,
    options: [
      { value: "my_home", label: "My home", icon: "bi-house-heart" },
      { value: "their_home", label: "Their home", icon: "bi-house" },
      { value: "either", label: "Either is fine", icon: "bi-arrow-left-right" },
    ],
  },

  {
    id: "need_children_count",
    step: 3,
    title: "Your children",
    subtitle: "How many children need care?",
    type: "number",
    required: true,
    min: 1,
    max: 10,
  },
  {
    id: "need_children_ages",
    step: 3,
    title: "Age of each child",
    subtitle: "Comma-separated is fine.",
    type: "text",
    required: true,
    placeholder: "e.g. 2, 4, 7",
  },
  {
    id: "need_special_considerations_yesno",
    step: 3,
    title: "Any special considerations or specific needs?",
    subtitle: "Allergies, sensory needs, medical notes, routines, etc.",
    type: "single",
    required: true,
    options: [
      { value: "no", label: "No", icon: "bi-x-circle" },
      { value: "yes", label: "Yes", icon: "bi-check2-circle" },
    ],
  },
  {
    id: "need_special_considerations_text",
    step: 3,
    title: "Please describe the considerations (short)",
    subtitle: "Only visible if you selected “Yes”.",
    type: "text",
    required: false,
    placeholder: "Optional details…",
  },

  {
    id: "home_smokefree",
    step: 4,
    title: "Safety & home environment",
    subtitle: "Is your home smoke-free?",
    type: "single",
    required: true,
    options: [
      { value: "yes", label: "Yes", icon: "bi-shield-check" },
      { value: "no", label: "No", icon: "bi-shield-x" },
    ],
  },
  {
    id: "require_smokefree",
    step: 4,
    title: "Do you require your match’s home to be smoke-free?",
    type: "single",
    required: true,
    options: [
      { value: "yes", label: "Yes", icon: "bi-check2-circle" },
      { value: "no", label: "No", icon: "bi-dash-circle" },
    ],
  },
  {
    id: "pets_in_home",
    step: 4,
    title: "Pets in your home?",
    type: "single",
    required: true,
    options: [
      { value: "none", label: "None", icon: "bi-ban" },
      { value: "small", label: "Small", icon: "bi-emoji-smile" },
      { value: "big", label: "Big", icon: "bi-emoji-sunglasses" },
      { value: "multiple", label: "Multiple", icon: "bi-stars" },
    ],
  },
  {
    id: "ok_with_pets",
    step: 4,
    title: "Are you okay with your children being around pets?",
    type: "single",
    required: true,
    options: [
      { value: "yes", label: "Yes", icon: "bi-check2-circle" },
      { value: "no", label: "No", icon: "bi-x-circle" },
    ],
  },

  {
    id: "home_zip",
    step: 5,
    title: "Transport & distance",
    subtitle: "Home ZIP code",
    type: "text",
    required: true,
    placeholder: "e.g. 21201",
  },
  {
    id: "work_zip",
    step: 5,
    title: "Work ZIP code",
    subtitle: "Used only to support handoff preferences.",
    type: "text",
    required: true,
    placeholder: "e.g. 21202",
  },
  {
    id: "handoff_location",
    step: 5,
    title: "Where should the handoff normally happen?",
    type: "single",
    required: true,
    options: [
      { value: "my_home", label: "My home", icon: "bi-house" },
      { value: "their_home", label: "Their home", icon: "bi-house-heart" },
      { value: "my_work", label: "My workplace", icon: "bi-building" },
      { value: "their_work", label: "Their workplace", icon: "bi-briefcase" },
      { value: "flexible", label: "Flexible", icon: "bi-arrow-repeat" },
    ],
  },
  {
    id: "max_travel",
    step: 5,
    title: "How far are you willing to travel for a match?",
    type: "single",
    required: true,
    options: [
      { value: "5", label: "5 minutes", icon: "bi-geo" },
      { value: "10", label: "10 minutes", icon: "bi-geo" },
      { value: "15", label: "15 minutes", icon: "bi-geo" },
      { value: "20", label: "20 minutes", icon: "bi-geo" },
      { value: "30", label: "30 minutes", icon: "bi-geo" },
      { value: "30_plus", label: "More than 30 minutes", icon: "bi-geo-alt" },
    ],
  },

  {
    id: "extras_need",
    step: 6,
    title: "Optional care extras",
    subtitle: "Not hard filters — they contribute to compatibility scoring.",
    type: "multi",
    required: false,
    options: [
      { value: "light_cleaning", label: "Light cleaning", icon: "bi-sparkles" },
      { value: "laundry", label: "Laundry", icon: "bi-basket" },
      { value: "meal_prep", label: "Meal prep", icon: "bi-egg-fried" },
      { value: "groceries", label: "Groceries / Errands", icon: "bi-cart" },
      { value: "transportation", label: "Transportation", icon: "bi-car-front" },
      { value: "pet_help", label: "Pet help", icon: "bi-heart" },
    ],
  },

  {
    id: "give_days",
    step: 7,
    title: "Now let’s find out what you can offer in return",
    subtitle: "Which days can you provide care?",
    type: "multi",
    required: true,
    options: [
      { value: "mon", label: "Mon", icon: "bi-calendar2" },
      { value: "tue", label: "Tue", icon: "bi-calendar2" },
      { value: "wed", label: "Wed", icon: "bi-calendar2" },
      { value: "thu", label: "Thu", icon: "bi-calendar2" },
      { value: "fri", label: "Fri", icon: "bi-calendar2" },
      { value: "sat", label: "Sat", icon: "bi-calendar2" },
      { value: "sun", label: "Sun", icon: "bi-calendar2" },
    ],
  },
  {
    id: "give_shifts",
    step: 7,
    title: "Which shift(s) can you cover?",
    type: "multi",
    required: true,
    options: [
      { value: "early", label: "Early (4–8am)", icon: "bi-alarm" },
      { value: "day", label: "Day (8am–4pm)", icon: "bi-brightness-high" },
      { value: "evening", label: "Evening (4–10pm)", icon: "bi-sunset" },
      { value: "night", label: "Night (10pm–7am)", icon: "bi-moon-stars" },
    ],
  },
  {
    id: "give_hours_month",
    step: 8,
    title: "How many hours can you realistically give per month?",
    subtitle: "This is a reciprocity balance dimension.",
    type: "single",
    required: true,
    options: [
      { value: "0_4", label: "0–4", icon: "bi-hourglass" },
      { value: "4_8", label: "4–8", icon: "bi-hourglass-split" },
      { value: "8_12", label: "8–12", icon: "bi-clock" },
      { value: "12_plus", label: "12+", icon: "bi-plus-circle" },
    ],
  },

  {
    id: "give_setting",
    step: 8,
    title: "Where are you comfortable providing care?",
    type: "single",
    required: true,
    options: [
      { value: "my_home", label: "My home", icon: "bi-house-heart" },
      { value: "their_home", label: "Their home", icon: "bi-house" },
      { value: "either", label: "Either", icon: "bi-arrow-left-right" },
    ],
  },

  {
    id: "give_total_children_capacity",
    step: 9,
    title: "Your capacity",
    subtitle: "How many total children (including yours) are you comfortable supervising?",
    type: "single",
    required: true,
    options: [
      { value: "1", label: "1", icon: "bi-1-circle" },
      { value: "2", label: "2", icon: "bi-2-circle" },
      { value: "3", label: "3", icon: "bi-3-circle" },
      { value: "4_plus", label: "4+", icon: "bi-plus-circle" },
    ],
  },
  {
    id: "give_age_ranges",
    step: 9,
    title: "What age ranges are you comfortable caring for?",
    type: "multi",
    required: true,
    options: [
      { value: "0_11m", label: "0–11 months", icon: "bi-heart" },
      { value: "1_3", label: "1–3 years", icon: "bi-emoji-smile" },
      { value: "4_5", label: "4–5 years", icon: "bi-balloon" },
      { value: "6_11", label: "6–11 years", icon: "bi-controller" },
      { value: "12_plus", label: "12+", icon: "bi-lightning" },
    ],
  },

  {
    id: "give_special_needs_ok",
    step: 10,
    title: "Special requirements",
    subtitle: "Are you comfortable caring for children with special needs?",
    type: "single",
    required: true,
    options: [
      { value: "yes", label: "Yes", icon: "bi-check2-circle" },
      { value: "no", label: "No", icon: "bi-x-circle" },
    ],
  },
  {
    id: "give_vehicle",
    step: 10,
    title: "Do you have your own vehicle for pickups/drop-offs?",
    type: "single",
    required: true,
    options: [
      { value: "yes", label: "Yes", icon: "bi-car-front" },
      { value: "no", label: "No", icon: "bi-ban" },
    ],
  },

  {
    id: "extras_offer",
    step: 11,
    title: "Optional extras you’re willing to offer",
    subtitle: "Not hard filters — they contribute to compatibility scoring.",
    type: "multi",
    required: false,
    options: [
      { value: "light_cleaning", label: "Light cleaning", icon: "bi-sparkles" },
      { value: "laundry", label: "Laundry", icon: "bi-basket" },
      { value: "meal_prep", label: "Meal prep", icon: "bi-egg-fried" },
      { value: "groceries", label: "Groceries / Errands", icon: "bi-cart" },
      { value: "transportation", label: "Transportation", icon: "bi-car-front" },
      { value: "pet_help", label: "Pet help", icon: "bi-heart" },
    ],
  },
];

export default function QuestionsPage() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState<number>(1);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  const steps = useMemo(() => {
    const uniq = Array.from(new Set(QUESTIONS.map((q) => q.step))).sort((a, b) => a - b);
    return uniq.length ? uniq : [1];
  }, []);

  const lastStep = steps[steps.length - 1];

  const stepQuestions = useMemo(
    () => QUESTIONS.filter((q) => q.step === step),
    [step]
  );

  const shouldShowSpecialText = answers["need_special_considerations_yesno"] === "yes";

  // Auth boot + LOAD + GATE (si ya completó, NO vuelve aquí)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setSaveError(null);

      if (!user) {
        setUid(null);
        router.replace("/families");
        return;
      }

      setUid(user.uid);

      try {
        const ref = doc(db, "profiles", user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as any;

          // ✅ GATE: si ya completó onboarding, no lo dejes volver a preguntas
          if (data?.onboardingCompleted) {
            router.replace("/families/match");
            return;
          }

          const onboarding = data?.onboarding;

          if (onboarding?.answers && typeof onboarding.answers === "object") {
            setAnswers(onboarding.answers as Answers);
          }
          if (
            typeof onboarding?.step === "number" &&
            onboarding.step >= steps[0] &&
            onboarding.step <= lastStep
          ) {
            setStep(onboarding.step);
          } else {
            setStep(steps[0]);
          }
        } else {
          setStep(steps[0]);
        }

        setReady(true);
      } catch (e: any) {
        setSaveError(e?.message ?? "Could not load your onboarding data.");
        setReady(true);
      }
    });

    return () => unsub();
  }, [router, steps, lastStep]);

  const setValue = (id: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const missingRequiredForStep = (): string[] => {
    const qs = stepQuestions.filter((q) => {
      if (q.id === "need_special_considerations_text") return shouldShowSpecialText;
      return true;
    });

    const missing: string[] = [];

    for (const q of qs) {
      if (!q.required) continue;

      const v = answers[q.id];

      if (q.type === "multi") {
        if (!Array.isArray(v) || v.length === 0) missing.push(q.id);
        continue;
      }

      if (q.type === "text") {
        if (typeof v !== "string" || v.trim().length === 0) missing.push(q.id);
        continue;
      }

      if (q.type === "number") {
        if (typeof v !== "number" || Number.isNaN(v)) missing.push(q.id);
        continue;
      }

      if (v === undefined || v === null || v === "") missing.push(q.id);
    }

    return missing;
  };

  const persist = async (nextStep: number, completed?: boolean): Promise<boolean> => {
    if (!uid) return false;

    setSaving(true);
    setSaveError(null);

    try {
      const ref = doc(db, "profiles", uid);

      const payload: any = {
        onboarding: {
          answers,
          step: nextStep,
          lastSavedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      };

      if (typeof completed === "boolean") {
        payload.onboardingCompleted = completed;
      }

      await setDoc(ref, payload, { merge: true });

      setSaving(false);
      return true;
    } catch (e: any) {
      setSaving(false);
      setSaveError(e?.message ?? "Could not save. Please try again.");
      return false;
    }
  };

  const nextOrFinish = async () => {
    const missing = missingRequiredForStep();
    if (missing.length) {
      setSaveError("Please complete the required fields before continuing.");
      return;
    }

    if (step < lastStep) {
      const nextStep = Math.min(step + 1, lastStep);
      const ok = await persist(nextStep);
      if (!ok) return;
      setStep(nextStep);
      return;
    }

    // ✅ last step: final save + completed + redirect
    const ok = await persist(lastStep, true);
    if (ok) router.push("/families/match");
  };

  const prev = async () => {
    setSaveError(null);
    const prevStep = Math.max(step - 1, steps[0]);
    await persist(prevStep);
    setStep(prevStep);
  };

  const handleLogout = async () => {
    setSaveError(null);
    setLoggingOut(true);

    try {
      await signOut(auth);
      router.replace("/families");
    } catch (e: any) {
      setSaveError(e?.message ?? "Could not log out. Please try again.");
      setLoggingOut(false);
    }
  };

  if (!ready) {
    return (
      <main className="auth-shell">
        <div className="onb-card">
          <h1 className="match-title">Loading…</h1>
          <p className="muted">Preparing onboarding.</p>
          <div className="auth-loader" />
        </div>
      </main>
    );
  }

  const stepIndex = steps.indexOf(step);
  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <main className="onb-shell">
      <div className="onb-card">
        <div className="q-head">
          <div className="q-head-top">
            <div>
              <span className="onb-badge">
                <i className="bi bi-stars" />
                Needs + Values onboarding
              </span>

              <h1 style={{ marginTop: ".9rem" }}>
                Tell us what “covered” looks like for your family.
              </h1>

              <p className="muted" style={{ marginTop: ".35rem" }}>
                Step {stepIndex + 1} of {steps.length}
              </p>
            </div>

            {/* ✅ Logout más bonito + real */}
            <button
              type="button"
              className="q-logout"
              onClick={handleLogout}
              disabled={saving || loggingOut}
              title="Log out"
              aria-label="Log out"
            >
              {loggingOut ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Logging out…
                </>
              ) : (
                <>
                  <i className="bi bi-box-arrow-right" />
                  Log out
                </>
              )}
            </button>
          </div>

          <div className="q-progress" aria-label="Progress">
            <div className="q-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>

          {saveError ? <div className="q-error">{saveError}</div> : null}
        </div>

        <div className="q-stack">
          {stepQuestions
            .filter((q) => {
              if (q.id === "need_special_considerations_text") return shouldShowSpecialText;
              return true;
            })
            .map((q) => (
              <div className="q-card" key={q.id}>
                <div className="q-card-title">
                  <div>
                    <div className="q-title">
                      {q.title}{" "}
                      {q.required ? <span style={{ color: "#991b1b" }}>*</span> : null}
                    </div>
                    {q.subtitle ? <div className="q-sub muted">{q.subtitle}</div> : null}
                  </div>
                </div>

                {/* SINGLE */}
                {q.type === "single" && q.options?.length ? (
                  <div className="q-options">
                    {q.options.map((opt) => {
                      const active = answers[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`q-opt ${active ? "is-active" : ""}`}
                          onClick={() => setValue(q.id, opt.value)}
                          disabled={saving}
                        >
                          {opt.icon ? <i className={`bi ${opt.icon}`} /> : null}
                          <span>{opt.label}</span>
                          {active ? <i className="bi bi-check2-circle q-check" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* MULTI */}
                {q.type === "multi" && q.options?.length ? (
                  <div className="q-options">
                    {q.options.map((opt) => {
                      const current: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const active = current.includes(opt.value);

                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`q-opt ${active ? "is-active" : ""}`}
                          onClick={() => {
                            const nextArr = active
                              ? current.filter((v) => v !== opt.value)
                              : [...current, opt.value];
                            setValue(q.id, nextArr);
                          }}
                          disabled={saving}
                        >
                          {opt.icon ? <i className={`bi ${opt.icon}`} /> : null}
                          <span>{opt.label}</span>
                          {active ? <i className="bi bi-check2-circle q-check" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* TEXT */}
                {q.type === "text" ? (
                  <input
                    className="ss-input"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setValue(q.id, e.target.value)}
                    placeholder={q.placeholder ?? ""}
                    disabled={saving}
                  />
                ) : null}

                {/* NUMBER */}
                {q.type === "number" ? (
                  <input
                    className="ss-input"
                    style={{ maxWidth: 220 }}
                    type="number"
                    value={answers[q.id] ?? ""}
                    min={q.min}
                    max={q.max}
                    onChange={(e) => setValue(q.id, e.target.value === "" ? "" : Number(e.target.value))}
                    disabled={saving}
                  />
                ) : null}
              </div>
            ))}
        </div>

        <div className="q-actions">
          <button
            type="button"
            className="match-btn ghost"
            onClick={prev}
            disabled={step === steps[0] || saving}
          >
            <i className="bi bi-arrow-left" />
            Back
          </button>

          <button
            type="button"
            className="match-btn primary"
            onClick={nextOrFinish}
            disabled={saving}
          >
            {saving ? (
              <>
                <i className="bi bi-cloud-arrow-up" />
                Saving…
              </>
            ) : step === lastStep ? (
              <>
                Continue to matching <i className="bi bi-arrow-right" />
              </>
            ) : (
              <>
                Continue <i className="bi bi-arrow-right" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ✅ Estilos del botón logout (no rompe tu CSS actual) */}
      <style jsx>{`
        .q-logout {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: rgba(255, 255, 255, 0.7);
          color: #0f172a;
          font-weight: 600;
          font-size: 14px;
          transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .q-logout:hover:not(:disabled) {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.10);
        }
        .q-logout:active:not(:disabled) {
          transform: translateY(0px);
        }
        .q-logout:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(15, 23, 42, 0.22);
          border-top-color: rgba(15, 23, 42, 0.70);
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}