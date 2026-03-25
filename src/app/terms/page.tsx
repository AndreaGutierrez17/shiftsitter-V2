import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions - ShiftSitter",
};

export default function TermsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-12 text-foreground">
      <h1 className="text-3xl font-semibold">Terms &amp; Conditions - ShiftSitter</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 9, 2026</p>

      <p className="mt-6">
        Please read these Terms &amp; Conditions carefully before using this site. By accessing or submitting any form
        on this website, you agree to be bound by the following terms.
      </p>

      <ol className="mt-6 list-decimal pl-5">
        <li className="mt-4">
          <p className="font-semibold">Purpose</p>
          <p className="mt-1">
            This website represents a pre-launch, Early Access experience for ShiftSitter. The platform, features,
            pricing, and availability are subject to change without prior notice. Nothing on this site constitutes a
            final or binding service offering.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">No Guarantee of Childcare Matching</p>
          <p className="mt-1">
            ShiftSitter is not yet operational. Submitting your information does not guarantee a childcare match,
            background-vetted caregiver, or service availability in your specific area. All matching, vetting, and
            scheduling features are subject to formal launch and applicable local regulations.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Accuracy of Information</p>
          <p className="mt-1">
            You are solely responsible for ensuring that all information submitted through our forms is accurate,
            current, and complete. ShiftSitter is not liable for outcomes resulting from inaccurate or incomplete
            submissions.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Communications</p>
          <p className="mt-1">
            By submitting the Early Access form, you consent to receive email communications from ShiftSitter regarding
            product updates, pilot program invitations, sponsorship opportunities, and premium plan announcements. You
            may opt out at any time by emailing{" "}
            <a href="mailto:info@shiftsitter.com" className="text-primary underline-offset-4 hover:underline">
              info@shiftsitter.com
            </a>
            .
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Intellectual Property</p>
          <p className="mt-1">
            All content on this site - including but not limited to logos, branding, copy, imagery, and layout - is the
            exclusive property of ShiftSitter and may not be reproduced, distributed, or used without prior written
            permission.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Limitation of Liability</p>
          <p className="mt-1">
            ShiftSitter provides this site on an &quot;as is&quot; basis. We make no warranties, express or implied,
            regarding the accuracy, completeness, or fitness for purpose of any content. To the fullest extent
            permitted by law, ShiftSitter shall not be liable for any indirect, incidental, or consequential damages
            arising from your use of this site.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Governing Law</p>
          <p className="mt-1">
            These terms are governed by and construed in accordance with applicable law. Any disputes arising under
            these terms shall be resolved through good-faith negotiation or, if necessary, through the appropriate
            legal channels.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Changes to These Terms</p>
          <p className="mt-1">
            We reserve the right to update these Terms &amp; Conditions at any time. The &quot;Last updated&quot; date at
            the top of this page will reflect the most recent revision.
          </p>
        </li>
        <li className="mt-4">
          <p className="font-semibold">Contact</p>
          <p className="mt-1">
            For questions or concerns regarding these terms, please contact us at{" "}
            <a href="mailto:info@shiftsitter.com" className="text-primary underline-offset-4 hover:underline">
              info@shiftsitter.com
            </a>
            .
          </p>
        </li>
      </ol>
    </section>
  );
}
