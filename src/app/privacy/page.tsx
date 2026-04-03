import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - ShiftSitter",
};

export default function PrivacyPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-12 text-foreground">
      <h1 className="text-3xl font-semibold">Privacy Policy - ShiftSitter</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 9, 2026</p>

      <p className="mt-6">
        ShiftSitter (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy. This policy
        explains what information we collect through our Early Access form, how we use it, and your rights regarding
        your personal data.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Information We Collect</h2>
      <p className="mt-2">
        When you submit our Early Access form, we collect the following: full name, email address, state and city,
        number of children and their ages, childcare challenges, and your interest in the Premium Founder Pass or
        sponsorship/CSR programs.
      </p>

      <h2 className="mt-8 text-xl font-semibold">How We Use Your Information</h2>
      <p className="mt-2">
        We use the information you provide to: contact you with updates about ShiftSitter; evaluate demand and plan our
        launch by location; generate anonymized aggregate metrics; and invite you to pilot programs, sponsorship
        opportunities, or premium plans based on your expressed preferences.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Legal Basis</h2>
      <p className="mt-2">
        We process your data based on your explicit consent. You may withdraw consent at any time by emailing{" "}
        <a href="mailto:info@shiftsitter.com" className="text-primary underline-offset-4 hover:underline">
          info@shiftsitter.com
        </a>
        , and we will stop contacting you and delete your data upon request.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Data Retention</h2>
      <p className="mt-2">
        We retain your data only for as long as necessary to provide Early Access updates, coordinate pilot
        participation, or facilitate sponsorship opportunities. Once those purposes are fulfilled or you withdraw
        consent, your data will be deleted.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Data Sharing</h2>
      <p className="mt-2">
        We do not sell, rent, or trade your personal data. We may share it solely with trusted third-party service
        providers (such as hosting, email delivery, and analytics platforms) strictly to operate ShiftSitter. These
        providers are contractually bound to handle your data securely and only for the purposes we specify.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Your Rights</h2>
      <p className="mt-2">
        You have the right to access, correct, or request deletion of your personal data at any time. To exercise these
        rights, contact us at{" "}
        <a href="mailto:info@shiftsitter.com" className="text-primary underline-offset-4 hover:underline">
          info@shiftsitter.com
        </a>
        .
      </p>

      <h2 className="mt-8 text-xl font-semibold">Children&apos;s Data</h2>
      <p className="mt-2">
        ShiftSitter does not collect personal data directly from children. We only record age ranges as voluntarily
        provided by parents or legal guardians, solely for the purpose of facilitating childcare matching.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Contact</h2>
      <p className="mt-2">
        For any privacy-related questions or concerns, please reach out to us at{" "}
        <a href="mailto:info@shiftsitter.com" className="text-primary underline-offset-4 hover:underline">
          info@shiftsitter.com
        </a>
        .
      </p>
    </section>
  );
}
