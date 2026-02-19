
import BootstrapAssets from "@/components/BootstrapAssets";

export default function HomePage() {
  return (
    <>
      <BootstrapAssets includeJs />
      <section className="hero-split">
        <img
          className="hero-split-media"
          src="/hero-main.jpeg"
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
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              data-bs-toggle="modal"
              data-bs-target="#privacyModal"
            >
              Privacy Policy
            </button>
            {" | "}
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              data-bs-toggle="modal"
              data-bs-target="#termsModal"
            >
              Terms &amp; Conditions
            </button>
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

          <div className="mb-2 footer-social">
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

          <div className="small">
            (c) {new Date().getFullYear()} ShiftSitter. All rights reserved.
          </div>
        </div>
      </footer>

      {/* =============== MODALS LEGALES =============== */}

      {/* Privacy Policy Modal */}
      <div
        className="modal fade"
        id="privacyModal"
        tabIndex={-1}
        aria-labelledby="privacyModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="privacyModalLabel">
                Privacy Policy — ShiftSitter
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body small">
              <p>
                <strong>Last updated:</strong> 02 Nov 2025
              </p>
              <p>
                ShiftSitter (“we”, “our”, “us”) collects and processes the
                information you submit through our Early Access form in order to
                contact you, evaluate your location for launch, and invite you
                to pilot programs.
              </p>
              <p>
                <strong>Information we collect:</strong> name, email, number of
                children, state/city, ages of children, childcare challenges,
                and your preference for Premium Founder Pass.
              </p>
              <p>
                <strong>How we use it:</strong> (a) to contact you about
                ShiftSitter, (b) to analyze demand per state/city, (c) to
                create anonymized metrics, and (d) to invite you to sponsor /
                CSR programs if you chose that path.
              </p>
              <p>
                <strong>Legal basis:</strong> your consent. You can withdraw
                consent anytime by emailing{" "}
                <a
                  href="mailto:shiftsittersocial406@gmail.com"
                  className="link-primary"
                >
                  shiftsittersocial406@gmail.com
                </a>
                .
              </p>
              <p>
                <strong>Retention:</strong> we keep your data only for as long as
                it is necessary to provide Early Access updates, pilots or
                sponsorship opportunities.
              </p>
              <p>
                <strong>Sharing:</strong> we do not sell your personal data. We
                may share it with trusted service providers (hosting,
                analytics, email delivery) strictly to operate ShiftSitter.
              </p>
              <p>
                <strong>Your rights:</strong> you may request access, correction
                or deletion of your data by contacting us.
              </p>
              <p>
                <strong>Children’s data:</strong> we do not collect data directly
                from children; we only register age ranges provided by
                parents/guardians for matching purposes.
              </p>
            </div>
            <div className="modal-footer">
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

      {/* Terms Modal */}
      <div
        className="modal fade"
        id="termsModal"
        tabIndex={-1}
        aria-labelledby="termsModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="termsModalLabel">
                Terms &amp; Conditions — ShiftSitter
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>

            <div className="modal-body small">
              <p>
                <strong>1. Purpose.</strong> This site is a pre-launch / Early
                Access experience for ShiftSitter. Features are subject to
                change.
              </p>
              <p>
                <strong>2. No childcare guarantee.</strong> Until launch,
                ShiftSitter does not guarantee matches, vetting or availability
                in your exact area.
              </p>
              <p>
                <strong>3. Accuracy of data.</strong> You are responsible for
                providing correct information in the form.
              </p>
              <p>
                <strong>4. Communications.</strong> By submitting the form you
                allow us to email you about product updates, pilots,
                sponsorships or premium plans.
              </p>
              <p>
                <strong>5. Intellectual property.</strong> All logos, branding,
                copy and layout on this site are property of ShiftSitter.
              </p>
              <p>
                <strong>6. Contact.</strong> For any question about these terms
                write to{" "}
                <a href="mailto:info@shiftsitter.com" className="link-primary">
                  info@shiftsitter.com
                </a>
                .
              </p>
            </div>

            <div className="modal-footer">
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

      <div
        className="modal fade"
        id="contactModal"
        tabIndex={-1}
        aria-labelledby="contactModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="contactModalLabel">
                Contact
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p className="text-muted-strong mb-2">
                Email us at{" "}
                <a className="contact-email" href="mailto:info@shiftsitter.com">
                  info@shiftsitter.com
                </a>
              </p>
            </div>
             <div className="modal-footer">
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

