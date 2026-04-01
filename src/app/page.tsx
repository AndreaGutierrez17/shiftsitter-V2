
import BootstrapAssets from "@/components/BootstrapAssets";
import { headers } from "next/headers";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.shiftsitter.com/#organization",
      name: "ShiftSitter",
      url: "https://www.shiftsitter.com/",
      logo: "https://www.shiftsitter.com/logo-shiftsitter.png",
      sameAs: [
        "https://www.instagram.com/shiftsitterofficial?igsh=cm80MG83eDBtcjlw",
        "https://x.com/ShiftSitterHQ",
        "https://www.facebook.com/share/17kYbNJrEE/",
        "https://www.linkedin.com/company/shiftsitter/",
      ],
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "info@shiftsitter.com",
          availableLanguage: ["en", "es"],
        },
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://www.shiftsitter.com/#website",
      url: "https://www.shiftsitter.com/",
      name: "ShiftSitter",
      publisher: { "@id": "https://www.shiftsitter.com/#organization" },
      inLanguage: "en",
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.shiftsitter.com/#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "How does ShiftSitter work for shift-working families?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Families create profiles, complete verification, and match with nearby parents who share compatible schedules. The platform highlights shared needs and availability so families can set agreements and coordinate reciprocal care.",
          },
        },
        {
          "@type": "Question",
          name: "What do I need to sign up and get verified?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You can create a profile, add household details, and complete identity verification. Some communities may offer optional background checks to strengthen trust.",
          },
        },
        {
          "@type": "Question",
          name: "How are schedules and care swaps coordinated?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "ShiftSitter uses shared availability and a smart calendar to highlight overlaps, so families can propose and confirm care swaps in the app.",
          },
        },
        {
          "@type": "Question",
          name: "Is messaging and data secure?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The app provides secure in-app messaging so families can communicate without sharing personal contact details until they are ready.",
          },
        },
        {
          "@type": "Question",
          name: "Can employers support their teams with ShiftSitter?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Employers can partner with ShiftSitter to give shift-working teams an easier way to find trusted, local reciprocal care.",
          },
        },
      ],
    },
  ],
};

export default async function HomePage() {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    <>
      <BootstrapAssets includeJs />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="hero-split">
        <img
          className="hero-split-media"
          src="/hero-shiftsitter.jpeg"
          alt="A caregiver joyfully playing with a child in a bright, welcoming room"
        />

        <div className="hero-split-tint" />

        <div className="hero-split-inner">
          <div className="hero-split-card" id="how-it-works">
            <h1 className="hero-split-title">
              Find trusted, reciprocal childcare that fits{" "}
              <span>real shift schedules.</span>
            </h1>

            <p className="hero-split-copy">
              The modern solution for shift-working families. Match with
              verified parents nearby, build your trusted circle, and
              coordinate care without the cost.
            </p>

            <div className="hero-split-actions">
              <a href="/families" className="ss-btn hero-split-cta">
                Get started
              </a>
              <a href="#how" className="ss-btn-outline hero-split-cta-outline">
                Learn how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="py-5">
        <div className="container">
          <div className="row g-4 align-items-center">
            <div className="col-lg-6">
              <div className="card feature-card accent-2 p-4 h-100">
                <div className="text-center mb-3">
                  <span className="icon-badge-xl">
                    <i className="bi bi-heart-pulse-fill"></i>
                  </span>
                </div>
                <h3 className="text-center mb-3">How it Works</h3>
                <p className="mb-2 text-muted-strong text-center">
                  Build your profile, get verified, and start matching with
                  compatible families in your area. Our system highlights
                  shared needs and availability, making it easy to find your
                  village. Create agreements and schedule care swaps directly
                  on the platform.
                </p>
              </div>
            </div>

            <div className="col-lg-6">
              <img
                src="/ShiftSitter.jpeg"
                className="img-fluid rounded-4 shadow-soft"
                alt="Parents helping parents illustration"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-5">
        <div className="container">
          <h2 className="text-center mb-4 features-title">Features</h2>

          <div className="row g-4">
            <div className="col-md-4">
              <div className="card feature-card accent-1 p-4 h-100 text-center">
                <span className="icon-badge-xl mb-3">
                  <i className="bi bi-shield-check"></i>
                </span>
                <h5 className="feature-heading">Trusted &amp; Safe</h5>
                <p className="text-muted-strong mb-0">
                  Safety is our priority. We offer ID verification, background
                  check options, and secure in-app messaging to build trust
                  from day one.
                </p>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card feature-card accent-2 p-4 h-100 text-center">
                <span className="icon-badge-xl mb-3">
                  <i className="bi bi-calendar2-week"></i>
                </span>
                <h5 className="feature-heading">Schedule Sync</h5>
                <p className="text-muted-strong mb-0">
                  Our smart calendar helps you find overlapping availability.
                  Propose and accept shift swaps with ease, keeping everyone
                  in sync.
                </p>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card feature-card accent-3 p-4 h-100 text-center">
                <span className="icon-badge-xl mb-3">
                  <i className="bi bi-people"></i>
                </span>
                <h5 className="feature-heading">Local Reciprocity</h5>
                <p className="text-muted-strong mb-0">
                  Give care, get care. Our platform is built on the power of
                  community, connecting you with local families to trade care
                  without the financial burden.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="partners" className="py-5 section-deep">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-6">
              <div className="d-flex align-items-center mb-3">
                <img
                  src="/logo-shiftsitter.png"
                  alt="ShiftSitter logo"
                  className="me-2 partner-logo"
                />
                <h2 className="fw-800 m-0 text-accent">
                  A Community-First Approach
                </h2>
              </div>

              <p className="mb-1">
                <em>Support the people who support everyone else.</em>
              </p>
              <p className="mb-3">
                ShiftSitter is founded on the principle that it takes a village.
                We empower shift-working families by providing the tools to
                build trusted local networks for reciprocal childcare.
              </p>

              <ul className="list-unstyled small mb-3">
                <li className="feature-bullet">
                  <i className="bi bi-graph-up-arrow"></i>
                  <span>
                    Fostering economic resilience for families in demanding
                    professions.
                  </span>
                </li>
                <li className="feature-bullet">
                  <i className="bi bi-people-fill"></i>
                  <span>
                    Building stronger, more connected local communities.
                  </span>
                </li>
                <li className="feature-bullet">
                  <i className="bi bi-heart-pulse-fill"></i>
                  <span>
                    Reducing stress and improving work-life balance for parents.
                  </span>
                </li>
              </ul>
            </div>

            <div className="col-lg-6">
              <img
                src="/Employers%20supporting%20families.jpeg"
                alt="Employers supporting families"
                className="img-fluid rounded shadow-soft"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="py-5">
        <div className="container">
          <h2 className="text-center mb-4 features-title">FAQs</h2>
          <div className="accordion shadow-soft" id="faqAccordion">
            <div className="accordion-item">
              <h3 className="accordion-header" id="faqHeadingOne">
                <button
                  className="accordion-button"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#faqCollapseOne"
                  aria-expanded="true"
                  aria-controls="faqCollapseOne"
                >
                  How does ShiftSitter work for shift-working families?
                </button>
              </h3>
              <div
                id="faqCollapseOne"
                className="accordion-collapse collapse show"
                aria-labelledby="faqHeadingOne"
                data-bs-parent="#faqAccordion"
              >
                <div className="accordion-body text-muted-strong">
                  Families create profiles, complete verification, and match with nearby parents
                  who share compatible schedules. The platform highlights shared needs and
                  availability so families can set agreements and coordinate reciprocal care.
                </div>
              </div>
            </div>

            <div className="accordion-item">
              <h3 className="accordion-header" id="faqHeadingTwo">
                <button
                  className="accordion-button collapsed"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#faqCollapseTwo"
                  aria-expanded="false"
                  aria-controls="faqCollapseTwo"
                >
                  What do I need to sign up and get verified?
                </button>
              </h3>
              <div
                id="faqCollapseTwo"
                className="accordion-collapse collapse"
                aria-labelledby="faqHeadingTwo"
                data-bs-parent="#faqAccordion"
              >
                <div className="accordion-body text-muted-strong">
                  You can create a profile, add household details, and complete identity
                  verification. Some communities may offer optional background checks to strengthen
                  trust.
                </div>
              </div>
            </div>

            <div className="accordion-item">
              <h3 className="accordion-header" id="faqHeadingThree">
                <button
                  className="accordion-button collapsed"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#faqCollapseThree"
                  aria-expanded="false"
                  aria-controls="faqCollapseThree"
                >
                  How are schedules and care swaps coordinated?
                </button>
              </h3>
              <div
                id="faqCollapseThree"
                className="accordion-collapse collapse"
                aria-labelledby="faqHeadingThree"
                data-bs-parent="#faqAccordion"
              >
                <div className="accordion-body text-muted-strong">
                  ShiftSitter uses shared availability and a smart calendar to highlight overlaps,
                  so families can propose and confirm care swaps in the app.
                </div>
              </div>
            </div>

            <div className="accordion-item">
              <h3 className="accordion-header" id="faqHeadingFour">
                <button
                  className="accordion-button collapsed"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#faqCollapseFour"
                  aria-expanded="false"
                  aria-controls="faqCollapseFour"
                >
                  Is messaging and data secure?
                </button>
              </h3>
              <div
                id="faqCollapseFour"
                className="accordion-collapse collapse"
                aria-labelledby="faqHeadingFour"
                data-bs-parent="#faqAccordion"
              >
                <div className="accordion-body text-muted-strong">
                  The app provides secure in-app messaging so families can communicate without
                  sharing personal contact details until they are ready.
                </div>
              </div>
            </div>

            <div className="accordion-item">
              <h3 className="accordion-header" id="faqHeadingFive">
                <button
                  className="accordion-button collapsed"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#faqCollapseFive"
                  aria-expanded="false"
                  aria-controls="faqCollapseFive"
                >
                  Can employers support their teams with ShiftSitter?
                </button>
              </h3>
              <div
                id="faqCollapseFive"
                className="accordion-collapse collapse"
                aria-labelledby="faqHeadingFive"
                data-bs-parent="#faqAccordion"
              >
                <div className="accordion-body text-muted-strong">
                  Yes. Employers can partner with ShiftSitter to give shift-working teams an easier
                  way to find trusted, local reciprocal care.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer-ss py-4 border-top border-secondary-subtle text-center">
        <div className="container">
          <div className="mb-2">
            <img
              src="/logo-shiftsitter.png"
              alt="ShiftSitter"
              className="footer-logo me-2"
              style={{ height: "36px", verticalAlign: "middle" }}
            />
            <span className="fw-semibold">ShiftSitter</span>
          </div>

          <div className="mb-2 small">
            <a href="/privacy" className="btn btn-link btn-sm text-decoration-none">
              Privacy Policy
            </a>
            {" | "}
            <a href="/terms" className="btn btn-link btn-sm text-decoration-none">
              Terms &amp; Conditions
            </a>
            {" | "}
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              data-bs-toggle="modal"
              data-bs-target="#contactModal"
            >
              Contact
            </button>
          </div>

          <div className="mb-4 footer-social">
            <a
              href="https://www.instagram.com/shiftsitterofficial?igsh=cm80MG83eDBtcjlw"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
            >
              <i className="bi bi-instagram"></i>
            </a>
            <a
              href="https://x.com/ShiftSitterHQ"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
            >
              <i className="bi bi-twitter-x"></i>
            </a>
            <a
              href="https://www.facebook.com/share/17kYbNJrEE/"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
            >
              <i className="bi bi-facebook"></i>
            </a>
            <a
              href="https://www.linkedin.com/company/shiftsitter/"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
              aria-label="LinkedIn"
            >
              <i className="bi bi-linkedin"></i>
            </a>
          </div>

          <div className="small footer-meta">
            <div className="footer-support">
              <span className="footer-support-label">Support</span>
              <a className="footer-support-email" href="mailto:info@shiftsitter.com">
                info@shiftsitter.com
              </a>
            </div>
            <p className="footer-legal">
              (c) {new Date().getFullYear()} ShiftSitter. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <div
        className="modal fade ss-legal-modal"
        id="contactModal"
        tabIndex={-1}
        aria-labelledby="contactModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content ss-legal-modal-card">
            <div className="modal-header ss-legal-modal-header">
              <h5 className="modal-title ss-legal-modal-title" id="contactModalLabel">
                Contact
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body ss-legal-modal-body">
              <div className="ss-contact-card">
                <p className="text-muted-strong mb-2">
                  Email us at{" "}
                  <a className="contact-email ss-contact-link" href="mailto:info@shiftsitter.com">
                    info@shiftsitter.com
                  </a>
                </p>
                <p className="ss-contact-note">
                  Reach out for support, partnerships, or general product questions.
                </p>
              </div>
            </div>
             <div className="modal-footer ss-legal-modal-footer">
               <button
                type="button"
                className="ss-btn-outline"
                data-bs-dismiss="modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

