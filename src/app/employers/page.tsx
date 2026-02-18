"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useActionState, useEffect } from "react";

import { submitEmployerInterest } from "@/app/employers/actions";
import { SubmitButton } from "@/components/SubmitButton";

const employerInterestSchema = z.object({
  companyName: z.string().min(2, "Company name is required."),
  contactName: z.string().min(2, "Contact name is required."),
  email: z.string().email("Please enter a valid email address."),
  employeeCount: z.string().min(1, "Please estimate the number of employees."),
  message: z.string().optional(),
});

type EmployerInterestForm = z.infer<typeof employerInterestSchema>;

const initialState = {
  message: "",
  success: false,
};

export default function EmployersPage() {
  const [state, formAction] = useActionState(submitEmployerInterest, initialState);

  const form = useForm<EmployerInterestForm>({
    resolver: zodResolver(employerInterestSchema),
    defaultValues: {
      companyName: "",
      contactName: "",
      email: "",
      employeeCount: "",
      message: "",
    },
  });

  useEffect(() => {
    if (state.success) {
      form.reset();
    }
  }, [state.success, form]);

  return (
    <main className="auth-split">
      <section className="auth-left">
        <div className="auth-left-inner">
          <p className="eyebrow">
            <i className="bi bi-building me-2" />
            Employers & CSR partners
          </p>

          <h1 className="auth-title">
            Reduce absenteeism by helping shift-working employees{" "}
            <span>keep every shift covered.</span>
          </h1>

          <p className="auth-lead">
            Provide ShiftSitter access as a benefit for your workforce. We’ll capture your details to provision company-wide access and align on the rollout.
          </p>

          <ul className="auth-points">
            <li>
              <i className="bi bi-people-fill" /> Built for hospitals, plants, warehouses, and operations
            </li>
            <li>
              <i className="bi bi-shield-lock" /> Clear agreements & a verified-first approach
            </li>
            <li>
              <i className="bi bi-graph-up-arrow" /> Improve retention and reduce staffing gaps
            </li>
          </ul>
        </div>
      </section>

      <section className="auth-right">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Employer Interest Form</h2>
            <p className="muted">
              We’ll use this to follow up and prepare your company onboarding.
            </p>
          </div>

          <form action={formAction} className="form-stack">
            <div className="form-field">
              <label htmlFor="companyName">Company name</label>
              <input
                id="companyName"
                className="ss-input"
                {...form.register("companyName")}
                placeholder="Acme Manufacturing"
              />
              {form.formState.errors.companyName && (
                  <p className="q-error mt-2">{form.formState.errors.companyName.message}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="contactName">Contact name</label>
              <input
                id="contactName"
                className="ss-input"
                {...form.register("contactName")}
                placeholder="Alex Rivera"
              />
               {form.formState.errors.contactName && (
                  <p className="q-error mt-2">{form.formState.errors.contactName.message}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                className="ss-input"
                type="email"
                {...form.register("email")}
                placeholder="alex@acme.com"
              />
              {form.formState.errors.email && (
                  <p className="q-error mt-2">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="form-field">
                <label htmlFor="employeeCount">Number of Employees</label>
                 <input
                    id="employeeCount"
                    className="ss-input"
                    {...form.register("employeeCount")}
                    placeholder="e.g., 50-200"
                />
                {form.formState.errors.employeeCount && (
                    <p className="q-error mt-2">{form.formState.errors.employeeCount.message}</p>
                )}
            </div>

            <div className="form-field">
                <label htmlFor="message">Message (Optional)</label>
                <textarea
                    id="message"
                    className="ss-input"
                    {...form.register("message")}
                    rows={3}
                    placeholder="Tell us about your needs..."
                />
            </div>

            {state.message && (
              <div className={`auth-msg ${state.success ? '' : 'q-error'}`}>
                {state.message}
              </div>
            )}
            
            <SubmitButton
              className="ss-btn w-100 auth-primary"
              pendingText="Submitting..."
            >
              Submit Interest <i className="bi bi-send ms-2" />
            </SubmitButton>

          </form>
        </div>
      </section>
    </main>
  );
}
